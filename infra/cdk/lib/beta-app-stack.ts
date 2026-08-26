import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib"
import {
  type ISubnet,
  type IVpc,
  type SecurityGroup,
  type SubnetSelection,
} from "aws-cdk-lib/aws-ec2"
import {
  Capability,
  Cluster,
  ContainerImage,
  ContainerInsights,
  CpuArchitecture,
  FargateService,
  FargateTaskDefinition,
  LinuxParameters,
  LogDriver,
  OperatingSystemFamily,
  Secret as EcsSecret,
} from "aws-cdk-lib/aws-ecs"
import {
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam"
import type { Key } from "aws-cdk-lib/aws-kms"
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs"
import type { DatabaseInstance } from "aws-cdk-lib/aws-rds"
import type { Repository } from "aws-cdk-lib/aws-ecr"
import type { Bucket } from "aws-cdk-lib/aws-s3"
import type { Secret } from "aws-cdk-lib/aws-secretsmanager"
import { StringParameter } from "aws-cdk-lib/aws-ssm"
import type { Construct } from "constructs"
import { CLOUDFLARED_IMAGE } from "./app-stack.js"

export interface BetaAppStackProps extends StackProps {
  readonly envName: string
  readonly vpc: IVpc
  readonly publicSubnets: ISubnet[]
  readonly appSecurityGroup: SecurityGroup
  readonly database: DatabaseInstance
  readonly databaseSecret: Secret
  readonly documentsBucket: Bucket
  readonly documentsKey: Key
  readonly repository: Repository
  /** Public host of the beta portal (e.g. `beta.afframe.com`). */
  readonly domain: string
  /** Outbound email "From" address; must be on a Resend-verified domain. */
  readonly mailFromAddress: string
}

/**
 * Compute plane of the dedicated `beta` environment: ONE Fargate service, ONE
 * task, TWO containers.
 *
 *   - beta        : Next.js standalone, port 3000. Talks to RDS directly (no
 *                   pgbouncer — one task, trivial connection count) and runs
 *                   the Drizzle migrations from its own entrypoint.
 *   - cloudflared : sidecar holding beta's OWN tunnel (a separate Cloudflare
 *                   tunnel from the prod/staging ones), token read from an SSM
 *                   SecureString parameter.
 *
 * Absent by design (plan `.context/beta-afframe/30-plan-v3-beta-env.md` Part 1):
 * no pgbouncer, no cerbos, no openfga, no web/api/admin containers, and no
 * Security / Observability / Backup stacks.
 *
 * Migrations (plan Part 2 §3): the beta RDS sits in PRIVATE_ISOLATED subnets
 * behind a VPC with zero NAT gateways, so a GitHub runner cannot reach it and
 * prod's one-off-ECS-task bridge piggybacks a Backup stack beta does not have.
 * The app image's entrypoint therefore migrates before serving. desiredCount is
 * 1, so no two migration runs can race; a failing migration crash-loops the
 * task and the deploy workflow's smoke step catches it.
 */
export class BetaAppStack extends Stack {
  readonly cluster: Cluster
  readonly service: FargateService
  readonly appLogGroup: LogGroup
  readonly tunnelLogGroup: LogGroup

  constructor(scope: Construct, id: string, props: BetaAppStackProps) {
    super(scope, id, props)

    // `-c betaImageTag=<sha>` pins the deployed image; `-c imageTag=<sha>` is
    // the shared fallback the prod workflow also uses. "bootstrap" keeps the
    // first synth of an empty ECR valid.
    const imageTag =
      (this.node.tryGetContext("betaImageTag") as string | undefined) ??
      (this.node.tryGetContext("imageTag") as string | undefined) ??
      "bootstrap"

    // Cloudflare connector token for beta's OWN tunnel. Same convention as
    // prod (AppStack): a GitHub Actions secret is written to an SSM
    // SecureString by the deploy workflow, and ECS resolves it at task start
    // via the execution role's auto-granted ssm:GetParameters + kms:Decrypt.
    // The token never transits Vault — it is Cloudflare-issued and never
    // leaves the deploy boundary.
    const tunnelTokenParam =
      StringParameter.fromSecureStringParameterAttributes(
        this,
        "TunnelTokenParam",
        {
          parameterName: `/monorepo/${props.envName}/cloudflare-tunnel-token`,
        },
      )

    // Beta runs its OWN Better Auth instance with its own signing secret —
    // never the prod one (a shared secret would make prod sessions valid on
    // beta). Vault is the source of truth, mirrored into SSM by the VPS sync.
    const betterAuthSecretParam =
      StringParameter.fromSecureStringParameterAttributes(
        this,
        "BetterAuthSecretParam",
        {
          parameterName: `/monorepo/${props.envName}/better-auth-secret`,
        },
      )

    const resendApiKeyParam =
      StringParameter.fromSecureStringParameterAttributes(
        this,
        "ResendApiKeyParam",
        {
          parameterName: `/monorepo/${props.envName}/resend-api-key`,
        },
      )

    this.cluster = new Cluster(this, "Cluster", {
      vpc: props.vpc,
      clusterName: `monorepo-${props.envName}`,
      // Same cost call as prod: per-container Container Insights metrics bill
      // ~$5-9/mo per env and nothing here consumes them.
      containerInsightsV2: ContainerInsights.DISABLED,
    })

    const publicSubnetSelection: SubnetSelection = {
      subnets: props.publicSubnets,
    }

    const taskExecutionRole = new Role(this, "TaskExecutionRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy",
        ),
      ],
    })
    props.databaseSecret.grantRead(taskExecutionRole)

    const taskRole = new Role(this, "TaskRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Runtime IAM role for the beta portal container",
    })
    // Read + write + delete on the documents bucket. This deliberately
    // diverges from prod's no-Delete invariant: prod hands deletion to a
    // dedicated reaper Lambda in SecurityStack, which the beta env does not
    // instantiate, while the beta portal itself must purge an organization's
    // objects (including noncurrent versions) when an owner deletes the org
    // (plan Part 4, blocker B4-5).
    props.documentsBucket.grantReadWrite(taskRole)
    props.documentsKey.grantEncryptDecrypt(taskRole)
    props.databaseSecret.grantRead(taskRole)

    // ECS Exec (`aws ecs execute-command`) for operator DB access + log triage
    // on a wedged task. Channels are session-scoped, not resource-scoped, so
    // AWS requires `*`; the caller still needs `ecs:ExecuteCommand`.
    taskRole.addToPolicy(
      new PolicyStatement({
        sid: "EcsExecSsmMessagesChannels",
        actions: [
          "ssmmessages:CreateControlChannel",
          "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel",
          "ssmmessages:OpenDataChannel",
        ],
        resources: ["*"],
      }),
    )

    // 256 CPU / 512 MiB arm64 (~$6/mo). Two containers reserve 448 MiB of the
    // 512 MiB task limit. The plan's Part 1 envelope allows 1024 MiB — raise
    // `memoryLimitMiB` (a valid notch at cpu=256) if the app OOMs once real
    // pages render.
    const taskDef = new FargateTaskDefinition(this, "TaskDef", {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
      executionRole: taskExecutionRole,
      taskRole,
    })

    taskDef.addVolume({ name: "tmp" })

    // Fargate forbids adding capabilities, so "drop ALL" is the whole
    // privilege model: every container runs unprivileged with zero caps.
    const linuxParams = (paramsId: string) => {
      const params = new LinuxParameters(this, paramsId)
      params.dropCapabilities(Capability.ALL)
      return params
    }

    this.appLogGroup = new LogGroup(this, "BetaLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/beta`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    })
    this.tunnelLogGroup = new LogGroup(this, "TunnelLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/cloudflared`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    const publicOrigin = `https://${props.domain}`

    const appContainer = taskDef.addContainer("beta", {
      containerName: "beta",
      image: ContainerImage.fromEcrRepository(props.repository, imageTag),
      portMappings: [{ containerPort: 3000 }],
      essential: true,
      logging: LogDriver.awsLogs({
        streamPrefix: "beta",
        logGroup: this.appLogGroup,
      }),
      environment: {
        NODE_ENV: "production",
        APP_ENV: props.envName,
        PORT: "3000",
        APP_DOMAIN: props.domain,
        // Better Auth: cookie scope + the links inside setup / reset emails.
        BETTER_AUTH_URL: publicOrigin,
        NEXT_PUBLIC_BETTER_AUTH_URL: publicOrigin,
        BETTER_AUTH_TRUSTED_ORIGINS: publicOrigin,
        // NOTE: BETTER_AUTH_COOKIE_DOMAIN is deliberately NOT set. The main
        // app scopes its session cookie to `.afframe.com`, so a leading-dot
        // cookie here would entangle the two auth systems on the same apex.
        // Beta keeps a HOST-ONLY cookie plus its own cookie prefix (plan
        // Part 1 addendum + Part 4 blocker B4-2).
        EMAIL_FROM: props.mailFromAddress,
        EMAIL_TRANSPORT: "resend",
        // Direct RDS connection — no pgbouncer in this env.
        DB_HOST: props.database.dbInstanceEndpointAddress,
        DB_PORT: props.database.dbInstanceEndpointPort,
        DB_NAME: "beta",
        DOCUMENTS_BUCKET: props.documentsBucket.bucketName,
        DOCUMENTS_KMS_KEY_ID: props.documentsKey.keyArn,
        AWS_REGION: this.region,
      },
      secrets: {
        DB_USER: EcsSecret.fromSecretsManager(props.databaseSecret, "username"),
        DB_PASSWORD: EcsSecret.fromSecretsManager(
          props.databaseSecret,
          "password",
        ),
        BETTER_AUTH_SECRET: EcsSecret.fromSsmParameter(betterAuthSecretParam),
        RESEND_API_KEY: EcsSecret.fromSsmParameter(resendApiKeyParam),
      },
      // Compose DATABASE_URL at container start (prod pattern) so the password
      // never lands in a task-definition env var. Safe without urlencoding
      // because the secret is generated with `excludePunctuation: true`.
      //
      // CONTRACT for the `apps/beta` image: `/app/entrypoint.sh` must (1) apply
      // the Drizzle migrations against $DATABASE_URL, then (2) `HOSTNAME=0.0.0.0
      // exec node apps/beta/server.js`. HOSTNAME must be forced because the
      // Fargate runtime overrides it with the container hostname and the Next.js
      // standalone server would then not answer cloudflared on localhost:3000.
      entryPoint: ["/bin/sh", "-c"],
      command: [
        'export DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" && ' +
          "exec /app/entrypoint.sh",
      ],
      // Fargate ignores the Dockerfile HEALTHCHECK unless it is on the task
      // definition. `/healthz` is the same endpoint the deploy workflow's smoke
      // step curls. Node's http module is used (not wget) because wget exits 0
      // even on a 5xx body.
      healthCheck: {
        command: [
          "CMD-SHELL",
          "node -e \"require('http').get('http://127.0.0.1:3000/healthz',{timeout:2000},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1)).on('timeout',function(){this.destroy();process.exit(1)})\"",
        ],
        interval: Duration.seconds(5),
        timeout: Duration.seconds(3),
        retries: 9,
      },
      memoryReservationMiB: 320,
      linuxParameters: linuxParams("BetaLinuxParams"),
    })
    // Next.js standalone writes to /app/.next/cache, so the root filesystem
    // stays writable (same call as the prod web container); capDrop ALL is the
    // hardening that matters against miner payloads.
    appContainer.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })

    const tunnelContainer = taskDef.addContainer("cloudflared", {
      containerName: "cloudflared",
      image: ContainerImage.fromRegistry(CLOUDFLARED_IMAGE),
      // Non-essential: a flapping connector must not cycle the app container.
      essential: false,
      command: ["tunnel", "--no-autoupdate", "run"],
      logging: LogDriver.awsLogs({
        streamPrefix: "cloudflared",
        logGroup: this.tunnelLogGroup,
      }),
      secrets: {
        TUNNEL_TOKEN: EcsSecret.fromSsmParameter(tunnelTokenParam),
      },
      memoryReservationMiB: 128,
      readonlyRootFilesystem: true,
      linuxParameters: linuxParams("TunnelLinuxParams"),
    })
    tunnelContainer.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })

    this.service = new FargateService(this, "Service", {
      cluster: this.cluster,
      taskDefinition: taskDef,
      // Exactly one task: it is also what serializes the startup migrations.
      desiredCount: 1,
      assignPublicIp: true,
      vpcSubnets: publicSubnetSelection,
      securityGroups: [props.appSecurityGroup],
      enableExecuteCommand: true,
      // 100 keeps the running task alive until the replacement is healthy —
      // at desiredCount 1, 50% would briefly scale to zero and drop the tunnel.
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      // Cold pull of two arm64 images plus the startup migrations.
      healthCheckGracePeriod: Duration.seconds(180),
    })

    new CfnOutput(this, "BetaDomain", {
      value: props.domain,
      description:
        "Public hostname of the beta portal, served through this task's own Cloudflare Tunnel.",
    })
    new CfnOutput(this, "ClusterName", {
      value: this.cluster.clusterName,
      description: "ECS cluster name for diagnostics",
    })
    new CfnOutput(this, "TunnelTokenSsmParameterName", {
      value: tunnelTokenParam.parameterName,
      description:
        "SSM SecureString parameter the beta deploy workflow writes the Cloudflare Tunnel connector token to. The cloudflared sidecar reads it via EcsSecret.fromSsmParameter.",
    })
  }
}

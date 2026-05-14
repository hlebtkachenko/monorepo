import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib"
import {
  SubnetSelection,
  type ISubnet,
  type IVpc,
  type SecurityGroup,
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
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam"
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs"
import type { DatabaseInstance } from "aws-cdk-lib/aws-rds"
import type { Bucket } from "aws-cdk-lib/aws-s3"
import { Secret, type ISecret } from "aws-cdk-lib/aws-secretsmanager"
import type { Repository } from "aws-cdk-lib/aws-ecr"
import type { Construct } from "constructs"

export interface AppStackProps extends StackProps {
  readonly envName: string
  readonly vpc: IVpc
  readonly publicSubnets: ISubnet[]
  readonly appSecurityGroup: SecurityGroup
  readonly database: DatabaseInstance
  readonly databaseSecret: Secret
  readonly appBucket: Bucket
  readonly webRepository: Repository
  readonly apiRepository: Repository
  readonly domain: string
}

/**
 * Cloudflare-Tunnel-fronted ECS Fargate task (ADR 0008).
 *
 * One task per environment, three containers sharing a network namespace:
 *   - web         : Next.js, port 3000
 *   - api         : NestJS, port 3001
 *   - cloudflared : sidecar establishing outbound tunnel to Cloudflare edge
 *
 * Task lives in public subnet with assignPublicIp=true (one public IPv4 per
 * task ~= $3.65/mo). Security group denies all public ingress. cloudflared
 * pulls user traffic in via the tunnel, routes to localhost:3000 or :3001
 * based on path rules configured in Cloudflare's Zero Trust dashboard.
 *
 * Image tag passed via CDK context: `cdk deploy -c imageTag=<git-sha>`.
 * Defaults to "bootstrap" for the first deploy when ECR is still empty.
 *
 * Tunnel token lives in a Secrets Manager secret created by this stack.
 * The deploy workflow writes the actual token value (from the GitHub repo
 * secret) into the AWS secret before each deploy.
 */
export class AppStack extends Stack {
  readonly cluster: Cluster
  readonly service: FargateService
  readonly tunnelTokenSecret: ISecret
  readonly webLogGroup: LogGroup
  readonly apiLogGroup: LogGroup
  readonly tunnelLogGroup: LogGroup
  readonly pgbouncerLogGroup: LogGroup

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props)

    const imageTag =
      (this.node.tryGetContext("imageTag") as string | undefined) ?? "bootstrap"

    // Tunnel token secret is created + populated by the deploy workflow before
    // cdk deploy App-* runs (see .github/workflows/_deploy-aws.yml). CDK only
    // references it by name so the secret value lifecycle stays decoupled
    // from stack updates.
    this.tunnelTokenSecret = Secret.fromSecretNameV2(
      this,
      "TunnelTokenSecret",
      `monorepo-${props.envName}-cloudflare-tunnel-token`,
    )

    this.cluster = new Cluster(this, "Cluster", {
      vpc: props.vpc,
      clusterName: `monorepo-${props.envName}`,
      containerInsightsV2: ContainerInsights.ENABLED,
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
    this.tunnelTokenSecret.grantRead(taskExecutionRole)

    const taskRole = new Role(this, "TaskRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Runtime IAM role shared by web + api containers",
    })
    props.appBucket.grantReadWrite(taskRole)
    props.databaseSecret.grantRead(taskRole)

    const taskDef = new FargateTaskDefinition(this, "TaskDef", {
      cpu: 512,
      memoryLimitMiB: 2048,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
      executionRole: taskExecutionRole,
      taskRole,
    })

    // Shared ephemeral volume mounted at /tmp on every container so apps
    // still have a writable scratch directory after readonlyRootFilesystem
    // is set below. Fargate-managed - storage comes out of the task's
    // built-in 20 GiB ephemeral pool.
    taskDef.addVolume({ name: "tmp" })

    // Drop ALL Linux capabilities. Removes NET_ADMIN/SYS_ADMIN/etc. that
    // most cryptominer payloads need to operate.
    const linuxParams = (id: string) => {
      const params = new LinuxParameters(this, id)
      params.dropCapabilities(Capability.ALL)
      return params
    }

    this.webLogGroup = new LogGroup(this, "WebLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/web`,
      retention: RetentionDays.ONE_WEEK,
    })
    this.apiLogGroup = new LogGroup(this, "ApiLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/api`,
      retention: RetentionDays.ONE_WEEK,
    })
    this.tunnelLogGroup = new LogGroup(this, "TunnelLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/cloudflared`,
      retention: RetentionDays.ONE_WEEK,
    })
    this.pgbouncerLogGroup = new LogGroup(this, "PgBouncerLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/pgbouncer`,
      retention: RetentionDays.ONE_WEEK,
    })

    // Next.js standalone server writes to /app/.next/cache, which a readonly
    // rootfs blocks. Until a custom cacheHandler + Dockerfile copy is in
    // place, the web container keeps a writable root. capDrop ALL still
    // blocks crypto-miner payloads. Tmpfs mount is harmless extra capacity.
    const webContainer = taskDef.addContainer("web", {
      containerName: "web",
      image: ContainerImage.fromEcrRepository(props.webRepository, imageTag),
      portMappings: [{ containerPort: 3000 }],
      essential: true,
      logging: LogDriver.awsLogs({
        streamPrefix: "web",
        logGroup: this.webLogGroup,
      }),
      environment: {
        NODE_ENV: "production",
        APP_ENV: props.envName,
        PORT: "3000",
        APP_DOMAIN: props.domain,
      },
      memoryReservationMiB: 384,
      linuxParameters: linuxParams("WebLinuxParams"),
    })
    webContainer.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })

    const apiContainer = taskDef.addContainer("api", {
      containerName: "api",
      image: ContainerImage.fromEcrRepository(props.apiRepository, imageTag),
      portMappings: [{ containerPort: 3001 }],
      essential: true,
      logging: LogDriver.awsLogs({
        streamPrefix: "api",
        logGroup: this.apiLogGroup,
      }),
      environment: {
        NODE_ENV: "production",
        APP_ENV: props.envName,
        PORT: "3001",
        HOST: "0.0.0.0",
        // Connect through pgBouncer sidecar (localhost:6432, transaction mode).
        // pgBouncer forwards to props.database on :5432. Required for
        // ADR-0010 GUC contract (set_config is_local=true).
        DATABASE_HOST: "localhost",
        DATABASE_PORT: "6432",
        DATABASE_NAME: "monorepo",
        APP_BUCKET: props.appBucket.bucketName,
        APP_DOMAIN: props.domain,
      },
      secrets: {
        DATABASE_PASSWORD: EcsSecret.fromSecretsManager(
          props.databaseSecret,
          "password",
        ),
        DATABASE_USERNAME: EcsSecret.fromSecretsManager(
          props.databaseSecret,
          "username",
        ),
      },
      memoryReservationMiB: 512,
      readonlyRootFilesystem: true,
      linuxParameters: linuxParams("ApiLinuxParams"),
    })
    apiContainer.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })

    // pgBouncer sidecar (ADR-0017 E.2): in-task connection pool in
    // transaction mode. api connects to localhost:6432; pgBouncer
    // forwards to RDS on :5432 using the master credentials.
    //
    // edoburu/pgbouncer reads DATABASE_URL + POOL_MODE + AUTH_TYPE
    // env vars and generates /etc/pgbouncer/pgbouncer.ini at boot.
    // userlist.txt is auto-generated from the same DATABASE_URL.
    //
    // GUC contract is preserved because pool_mode=transaction means
    // each transaction holds a server connection from start to commit;
    // SET LOCAL bindings stay attached.
    //
    // Per-tenant role separation (ADR-0010 app_user) is a follow-up:
    // requires a separate Secrets Manager entry for app_user that the
    // migration runbook populates after the role exists. For now, the
    // sidecar uses master credentials (app_owner) which preserves
    // pooling semantics but skips the role split.
    const pgbouncerContainer = taskDef.addContainer("pgbouncer", {
      containerName: "pgbouncer",
      image: ContainerImage.fromRegistry("edoburu/pgbouncer:v1.25.1-p0"),
      essential: true,
      logging: LogDriver.awsLogs({
        streamPrefix: "pgbouncer",
        logGroup: this.pgbouncerLogGroup,
      }),
      environment: {
        POOL_MODE: "transaction",
        // Empty server_reset_query is the canary that detects accidental
        // GUC leakage in dev (ADR-0012). Same setting in prod.
        SERVER_RESET_QUERY: "",
        MAX_CLIENT_CONN: "100",
        DEFAULT_POOL_SIZE: "20",
        AUTH_TYPE: "scram-sha-256",
        DB_HOST: props.database.dbInstanceEndpointAddress,
        DB_PORT: props.database.dbInstanceEndpointPort,
        DB_NAME: "monorepo",
      },
      secrets: {
        DB_USER: EcsSecret.fromSecretsManager(props.databaseSecret, "username"),
        DB_PASSWORD: EcsSecret.fromSecretsManager(
          props.databaseSecret,
          "password",
        ),
      },
      memoryReservationMiB: 64,
      readonlyRootFilesystem: true,
      linuxParameters: linuxParams("PgBouncerLinuxParams"),
    })
    pgbouncerContainer.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })

    const tunnelContainer = taskDef.addContainer("cloudflared", {
      containerName: "cloudflared",
      image: ContainerImage.fromRegistry("cloudflare/cloudflared:2026.5.0"),
      essential: true,
      command: ["tunnel", "--no-autoupdate", "run"],
      logging: LogDriver.awsLogs({
        streamPrefix: "cloudflared",
        logGroup: this.tunnelLogGroup,
      }),
      secrets: {
        TUNNEL_TOKEN: EcsSecret.fromSecretsManager(this.tunnelTokenSecret),
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
      desiredCount: 1,
      assignPublicIp: true,
      vpcSubnets: publicSubnetSelection,
      securityGroups: [props.appSecurityGroup],
      enableExecuteCommand: false,
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: Duration.seconds(90),
    })

    new CfnOutput(this, "AppDomain", {
      value: props.domain,
      description:
        "Public hostname configured in Cloudflare Tunnel. Resolves via Cloudflare edge to the tunnel terminating inside this Fargate task.",
    })
    new CfnOutput(this, "ClusterName", {
      value: this.cluster.clusterName,
      description: "ECS cluster name for diagnostics",
    })
    new CfnOutput(this, "TunnelTokenSecretArn", {
      value: this.tunnelTokenSecret.secretArn,
      description:
        "Secrets Manager ARN where the deploy workflow writes the Cloudflare Tunnel connector token.",
    })
  }
}

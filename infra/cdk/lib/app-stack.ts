import * as path from "node:path"
import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib"
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets"
import {
  SubnetSelection,
  type ISubnet,
  type IVpc,
  type SecurityGroup,
} from "aws-cdk-lib/aws-ec2"
import {
  Capability,
  Cluster,
  ContainerDependencyCondition,
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
import { StringParameter } from "aws-cdk-lib/aws-ssm"
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
 * One task per environment, six containers sharing a network namespace:
 *   - web         : Next.js, port 3000
 *   - api         : NestJS, port 3001 (talks to localhost:6432 for db,
 *                   localhost:3593 for Cerbos L3, localhost:8080 for
 *                   OpenFGA L2; also hosts the pg-boss worker pool
 *                   which connects to RDS direct :5432 for advisory
 *                   locks + LISTEN/NOTIFY)
 *   - pgbouncer   : connection pool, listens on 127.0.0.1:6432, forwards
 *                   to RDS :5432 (ADR-0012 amendment 2026-05-14, E.2)
 *   - cerbos      : PDP sidecar, listens on 127.0.0.1:3593 gRPC. Policies
 *                   baked into the image via infra/cerbos/Dockerfile +
 *                   DockerImageAsset (ADR-0018 amendment 2026-05-14)
 *   - openfga     : ReBAC graph sidecar, listens on 127.0.0.1:8080 HTTP.
 *                   Datastore is the same RDS under `openfga` schema
 *                   (ADR-0018). store_id + model_id come from SSM,
 *                   populated by infra/openfga/bootstrap.mjs.
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
  readonly cerbosLogGroup: LogGroup
  readonly openfgaLogGroup: LogGroup

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
    this.cerbosLogGroup = new LogGroup(this, "CerbosLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/cerbos`,
      retention: RetentionDays.ONE_WEEK,
    })
    this.openfgaLogGroup = new LogGroup(this, "OpenfgaLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/openfga`,
      retention: RetentionDays.ONE_WEEK,
    })

    // OpenFGA store_id + model_id are identifiers, not secrets — kept in SSM
    // Parameter Store Standard tier (free). The operator populates them via
    // infra/openfga/bootstrap.mjs BEFORE the first cdk deploy of App-{env}.
    // CDK references existing parameters; it does NOT manage their values
    // (declarative ownership would clobber bootstrap-time writes on every
    // deploy).
    const openfgaStoreIdParam = StringParameter.fromStringParameterName(
      this,
      "OpenfgaStoreIdParam",
      `/monorepo/${props.envName}/openfga/store-id`,
    )
    const openfgaModelIdParam = StringParameter.fromStringParameterName(
      this,
      "OpenfgaModelIdParam",
      `/monorepo/${props.envName}/openfga/model-id`,
    )

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

    // api connects to pgBouncer sidecar (localhost:6432, transaction mode);
    // pgBouncer forwards to props.database on :5432. Required for ADR-0010
    // GUC contract (set_config is_local=true).
    //
    // @workspace/db reads only DATABASE_URL (packages/db/src/client.ts).
    // The URL is composed at container start by /bin/sh from DB_USER /
    // DB_PASSWORD (secrets) + DB_HOST / DB_PORT / DB_NAME (env). This avoids
    // a second Secrets Manager entry or a wrapper image just to inject one URL.
    //
    // SAFETY: DB_PASSWORD is shell-interpolated into the URL string without
    // URL-encoding. That is safe ONLY because data-stack.ts's RDS secret uses
    // `excludePunctuation: true`, so the password is alphanumeric — none of
    // the URL-reserved chars (@, :, /, ?, #, %) can appear. If that setting
    // changes, this expression must wrap the password in a urlencode call
    // (e.g., via `printf %s "$DB_PASSWORD" | jq -sRr @uri`).
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
        // pgbouncer-routed connection for app queries (RLS + GUC contract).
        DB_HOST: "localhost",
        DB_PORT: "6432",
        // Direct RDS for the pg-boss worker pool. pg-boss uses advisory
        // locks + LISTEN/NOTIFY which pgbouncer transaction mode breaks;
        // the worker MUST bypass pgbouncer.
        DB_DIRECT_HOST: props.database.dbInstanceEndpointAddress,
        DB_DIRECT_PORT: props.database.dbInstanceEndpointPort,
        DB_NAME: "monorepo",
        APP_BUCKET: props.appBucket.bucketName,
        APP_DOMAIN: props.domain,
        // L2 OpenFGA sidecar (HTTP). API URL is loopback inside the task.
        OPENFGA_API_URL: "http://localhost:8080",
      },
      secrets: {
        DB_USER: EcsSecret.fromSecretsManager(props.databaseSecret, "username"),
        DB_PASSWORD: EcsSecret.fromSecretsManager(
          props.databaseSecret,
          "password",
        ),
        // Identifiers from SSM populated by bootstrap.mjs. CDK fails at
        // synth/deploy time if the parameters don't exist — the operator
        // runbook (docs/runbooks/AWS-DEPLOY.md) creates them before the
        // first App-{env} deploy.
        OPENFGA_STORE_ID: EcsSecret.fromSsmParameter(openfgaStoreIdParam),
        OPENFGA_MODEL_ID: EcsSecret.fromSsmParameter(openfgaModelIdParam),
      },
      entryPoint: ["/bin/sh", "-c"],
      command: [
        'export DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" && ' +
          'export DATABASE_DIRECT_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_DIRECT_HOST}:${DB_DIRECT_PORT}/${DB_NAME}" && ' +
          "exec node dist/main.js",
      ],
      memoryReservationMiB: 512,
      readonlyRootFilesystem: true,
      linuxParameters: linuxParams("ApiLinuxParams"),
    })
    apiContainer.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })

    // pgBouncer sidecar (ADR-0012 amendment 2026-05-14, decision E.2):
    // in-task connection pool in transaction mode. api connects to
    // 127.0.0.1:6432; pgBouncer forwards to RDS on :5432 using master
    // credentials.
    //
    // edoburu/pgbouncer entrypoint requires DATABASE_URL (it parse_urls
    // the value into DB_USER/DB_PASSWORD/DB_HOST/DB_PORT/DB_NAME and writes
    // /etc/pgbouncer/{pgbouncer.ini,userlist.txt}). We compose the URL at
    // container start so the password stays in secrets, not env.
    //
    // GUC contract is preserved because pool_mode=transaction means each
    // transaction holds a server connection from start to commit; SET LOCAL
    // bindings stay attached for the full transaction and go out of scope
    // at COMMIT/ROLLBACK. server_reset_query (default DISCARD ALL) only
    // fires AFTER release — SET LOCAL has already cleared. See the env
    // block below for the deeper note on why we don't override the default.
    //
    // Volume `pgbouncerEtc` is a writable scratch over /etc/pgbouncer so
    // the entrypoint can materialize its generated config (required when
    // readonlyRootFilesystem=true blocks all other writes).
    //
    // Per-tenant role separation (ADR-0010 app_user) is a follow-up;
    // see docs/runbooks/AWS-DEPLOY.md "Follow-up: per-tenant role split".
    taskDef.addVolume({ name: "pgbouncerEtc" })

    // pgBouncer SCRAM hash is built by its entrypoint from the plaintext
    // password — the userlist.txt write itself doesn't depend on alpine
    // having any tool other than /bin/sh + awk + sed (all present).
    const pgbouncerContainer = taskDef.addContainer("pgbouncer", {
      containerName: "pgbouncer",
      image: ContainerImage.fromRegistry("edoburu/pgbouncer:v1.25.1-p0"),
      essential: true,
      logging: LogDriver.awsLogs({
        streamPrefix: "pgbouncer",
        logGroup: this.pgbouncerLogGroup,
      }),
      environment: {
        // Bind to loopback only — defense-in-depth even with appSecurityGroup
        // denying all public ingress (assignPublicIp=true).
        LISTEN_ADDR: "127.0.0.1",
        LISTEN_PORT: "6432",
        POOL_MODE: "transaction",
        // SERVER_RESET_QUERY intentionally not set. The edoburu entrypoint
        // uses ${SERVER_RESET_QUERY:+...} parameter expansion: empty/unset
        // OMITS the line, so pgBouncer falls back to its default DISCARD ALL.
        // That's fine: GUCs are scoped with SET LOCAL (per-transaction), so
        // they go out of scope at COMMIT/ROLLBACK before reset_query fires.
        // The ADR-0012 amendment GUC contract is preserved by transaction
        // pool_mode + SET LOCAL, not by suppressing reset_query.
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
      entryPoint: ["/bin/sh", "-c"],
      command: [
        'export DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" && exec /entrypoint.sh /usr/bin/pgbouncer /etc/pgbouncer/pgbouncer.ini',
      ],
      // Simple TCP probe — `nc` is on edoburu/pgbouncer (alpine busybox).
      // Drives apiContainer's addContainerDependencies HEALTHY gate below.
      healthCheck: {
        command: ["CMD-SHELL", "nc -z 127.0.0.1 6432 || exit 1"],
        interval: Duration.seconds(10),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(15),
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
    // Writable scratch over /etc/pgbouncer — edoburu entrypoint writes
    // pgbouncer.ini + userlist.txt here at boot. Fargate ephemeral storage.
    pgbouncerContainer.addMountPoints({
      containerPath: "/etc/pgbouncer",
      sourceVolume: "pgbouncerEtc",
      readOnly: false,
    })
    // api waits for pgbouncer healthcheck before starting. Without this,
    // api gets ECONNREFUSED for ~10-15 s at task boot until pgbouncer's
    // listener is up.
    apiContainer.addContainerDependencies({
      container: pgbouncerContainer,
      condition: ContainerDependencyCondition.HEALTHY,
    })

    // Cerbos PDP sidecar (ADR-0018 amendment 2026-05-14): L3 action-gate
    // engine. api calls localhost:3593 (gRPC). Policies + config baked into
    // the image via infra/cerbos/Dockerfile (FROM ghcr.io/cerbos/cerbos +
    // COPY policies + COPY config). DockerImageAsset hashes the build
    // context — any policy edit produces a new image tag automatically.
    //
    // Reason for sidecar over @cerbos/embedded: the WASM bundle is generated
    // by Cerbos's closed-source Rust transpiler and only available through
    // Cerbos Hub SaaS. We chose the OSS PDP server instead — same engine,
    // same CEL, ~0.5-1 ms localhost gRPC overhead (same order as OpenFGA).
    const cerbosPoliciesImage = new DockerImageAsset(this, "CerbosImage", {
      directory: path.join(__dirname, "..", "..", "cerbos"),
      // arm64 to match the runtimePlatform; cerbos publishes both arches.
      platform: Platform.LINUX_ARM64,
    })
    const cerbosContainer = taskDef.addContainer("cerbos", {
      containerName: "cerbos",
      image: ContainerImage.fromDockerImageAsset(cerbosPoliciesImage),
      essential: true,
      logging: LogDriver.awsLogs({
        streamPrefix: "cerbos",
        logGroup: this.cerbosLogGroup,
      }),
      // No env, no secrets — config is baked. CERBOS_NO_TELEMETRY=1 disables
      // upstream telemetry beacons (we run fully isolated; no outbound HTTP).
      environment: {
        CERBOS_NO_TELEMETRY: "1",
      },
      // Cerbos ships an in-binary healthcheck subcommand; no shell needed.
      healthCheck: {
        command: ["CMD", "/cerbos", "healthcheck", "--insecure"],
        interval: Duration.seconds(10),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(15),
      },
      memoryReservationMiB: 64,
      readonlyRootFilesystem: true,
      linuxParameters: linuxParams("CerbosLinuxParams"),
    })
    cerbosContainer.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })
    // api waits for cerbos HEALTHY too — symmetric with pgbouncer + openfga.
    apiContainer.addContainerDependencies({
      container: cerbosContainer,
      condition: ContainerDependencyCondition.HEALTHY,
    })

    // OpenFGA sidecar (ADR-0018 L2): ReBAC graph engine.
    //
    // Datastore = the same RDS, under schema `openfga`. Connects DIRECT
    // (port 5432, not via pgbouncer) — OpenFGA opens many concurrent
    // sessions and the pool semantics don't apply. Bootstrap
    // (CREATE SCHEMA openfga + openfga migrate + bootstrap.mjs) runs from
    // an operator workstation against a port-forwarded RDS BEFORE the
    // first cdk deploy App-{env}; see docs/runbooks/AWS-DEPLOY.md.
    //
    // openfga/openfga:v1.15.1 is a Chainguard distroless image — no
    // /bin/sh, no busybox. We pass URI + username/password as separate
    // env vars (OpenFGA's native config keys) instead of composing a URL
    // with a shell wrapper. The image's entrypoint is the `/openfga`
    // binary; we only set `command: ["run"]` to start the server.
    //
    // Healthcheck uses the in-image `grpc_health_probe` binary against
    // the gRPC port (:8081) — no shell needed.
    //
    // Hardening: capDrop ALL + readonlyRootFilesystem + /tmp ephemeral
    // mount (PR #77 pattern).
    const openfgaContainer = taskDef.addContainer("openfga", {
      containerName: "openfga",
      image: ContainerImage.fromRegistry("openfga/openfga:v1.15.1"),
      essential: true,
      logging: LogDriver.awsLogs({
        streamPrefix: "openfga",
        logGroup: this.openfgaLogGroup,
      }),
      environment: {
        OPENFGA_DATASTORE_ENGINE: "postgres",
        // Bind HTTP to loopback only; gRPC defaults to :8081 (used by
        // grpc_health_probe below + an internal admin path).
        OPENFGA_HTTP_ADDR: "127.0.0.1:8080",
        OPENFGA_LOG_FORMAT: "json",
        OPENFGA_LOG_LEVEL: "info",
        // OPENFGA_DATASTORE_URI carries host/port/db only — no creds.
        // OPENFGA_DATASTORE_USERNAME + PASSWORD env are merged in by the
        // server at boot. This avoids the closed entrypoint problem on
        // the distroless image.
        OPENFGA_DATASTORE_URI: `postgres://${props.database.dbInstanceEndpointAddress}:${props.database.dbInstanceEndpointPort}/monorepo?search_path=openfga&sslmode=require`,
      },
      secrets: {
        OPENFGA_DATASTORE_USERNAME: EcsSecret.fromSecretsManager(
          props.databaseSecret,
          "username",
        ),
        OPENFGA_DATASTORE_PASSWORD: EcsSecret.fromSecretsManager(
          props.databaseSecret,
          "password",
        ),
      },
      command: ["run"],
      healthCheck: {
        // grpc_health_probe is baked into the distroless image at
        // /usr/local/bin/grpc_health_probe (verified by extracting the
        // layers locally). Probes the openfga gRPC server.
        command: [
          "CMD",
          "/usr/local/bin/grpc_health_probe",
          "-addr=127.0.0.1:8081",
        ],
        interval: Duration.seconds(10),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(20),
      },
      memoryReservationMiB: 200,
      readonlyRootFilesystem: true,
      linuxParameters: linuxParams("OpenfgaLinuxParams"),
    })
    openfgaContainer.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })
    // api waits for openfga to be healthy too — the permissions-drain lane
    // and the L2 AuthGuard layer both fail fast if the sidecar isn't ready.
    apiContainer.addContainerDependencies({
      container: openfgaContainer,
      condition: ContainerDependencyCondition.HEALTHY,
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

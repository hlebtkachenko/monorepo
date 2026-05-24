import * as path from "node:path"
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib"
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
import {
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam"
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs"
import type { DatabaseInstance } from "aws-cdk-lib/aws-rds"
import type { Bucket } from "aws-cdk-lib/aws-s3"
import { Secret } from "aws-cdk-lib/aws-secretsmanager"
import { StringParameter } from "aws-cdk-lib/aws-ssm"
import type { Repository } from "aws-cdk-lib/aws-ecr"
import type { Construct } from "constructs"

export interface AppStackProps extends StackProps {
  readonly envName: string
  readonly vpc: IVpc
  readonly publicSubnets: ISubnet[]
  readonly appSecurityGroup: SecurityGroup
  readonly database: DatabaseInstance
  /**
   * RDS master credentials (`app_owner`, SUPERUSER on RDS). Used by:
   *   - the api container's `DATABASE_DIRECT_URL` (pg-boss advisory locks +
   *     LISTEN/NOTIFY need a session-state-stable, master-equivalent
   *     connection that pgbouncer transaction mode cannot provide);
   *   - the api container's `DATABASE_URL` to pgbouncer on :6432 (the API
   *     surface still drives DDL-adjacent work like extension probes during
   *     boot, and is the lowest-risk container to keep on master while the
   *     web + admin role split lands);
   *   - pgbouncer upstream connection #1 (`app_owner` entry of `DATABASE_URLS`);
   *   - the openfga sidecar (its built-in datastore migrations run as the
   *     master role over a direct :5432 connection).
   */
  readonly databaseSecret: Secret
  /**
   * RDS runtime credentials (`app_user`, LOGIN, RLS applies). Used by:
   *   - the web container's `DATABASE_URL` to pgbouncer on :6432;
   *   - the admin container's `DATABASE_URL` to pgbouncer on :6432;
   *   - pgbouncer upstream connection #2 (`app_user` entry of `DATABASE_URLS`).
   * RLS policies bite for every query that flows through these connections,
   * which is the production-correct posture. `withAdminBypass` still works
   * because migration 0002_auth.sql `GRANT app_admin TO app_user` makes
   * `SET LOCAL ROLE app_admin` reachable from inside an `app_user` session.
   */
  readonly appUserSecret: Secret
  readonly appBucket: Bucket
  readonly webRepository: Repository
  readonly apiRepository: Repository
  readonly adminRepository: Repository
  readonly domain: string
  readonly adminDomain: string
  /**
   * Outbound email "From" address. MUST be on a Resend-verified domain
   * (see `docs/runbooks/AWS-DEPLOY.md` "Email sender verification"). The
   * web + admin containers both send from this address. Defaults via the
   * `MAIL_FROM_ADDRESS` env var in `bin/app.ts`, with a hard fallback to
   * `no-reply@afframe.com` (the currently-verified parent domain).
   */
  readonly mailFromAddress: string
}

/**
 * Cloudflare-Tunnel-fronted ECS Fargate task (ADR 0008).
 *
 * One task per environment, seven containers sharing a network namespace:
 *   - web         : Next.js, port 3000
 *   - admin       : Next.js staff surface, port 3100, essential:false — a
 *                   crash-looping admin must not take down the task
 *   - api         : NestJS, port 3001 (talks to localhost:6432 for db,
 *                   localhost:3593 for Cerbos L3, localhost:8080 for
 *                   OpenFGA L2; also hosts the pg-boss worker pool
 *                   which connects to RDS direct :5432 for advisory
 *                   locks + LISTEN/NOTIFY). Also hosts the Scalar API
 *                   Reference at `/` — there is no separate docs site.
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

/**
 * Derive the leading-dot cookie domain that scopes the Better Auth
 * session across every subdomain of the apex (afframe.com — web, admin,
 * api). Strips the left-most label and prepends a `.` per RFC 6265.
 *
 *   app.afframe.com         -> .afframe.com
 *   app-staging.afframe.com -> .afframe.com
 *   admin.afframe.com       -> .afframe.com
 *   afframe.com             -> .afframe.com (already apex)
 *
 * Returns an empty string for a single-label host. An empty value makes
 * the consumer's optional block skip the cross-subdomain config — useful
 * when a deploy points at an internal host that isn't part of the apex.
 *
 * Exported for unit testing — see `tests/app-stack.test.ts`.
 */
export function deriveCookieDomain(host: string): string {
  const labels = host.split(".")
  if (labels.length < 2) return ""
  const apex = labels.slice(-2).join(".")
  return `.${apex}`
}

export class AppStack extends Stack {
  readonly cluster: Cluster
  readonly service: FargateService
  readonly webLogGroup: LogGroup
  readonly adminLogGroup: LogGroup
  readonly apiLogGroup: LogGroup
  readonly tunnelLogGroup: LogGroup
  readonly pgbouncerLogGroup: LogGroup
  readonly cerbosLogGroup: LogGroup
  readonly openfgaLogGroup: LogGroup

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props)

    // Global fallback tag. Each service can override via its own context
    // key (webImageTag / apiImageTag / adminImageTag) so the deploy workflow
    // can skip rebuilding a service whose dependencies didn't change AND
    // pin its container to the previously-deployed image — without forcing
    // the other services to use the stale tag.
    const imageTag =
      (this.node.tryGetContext("imageTag") as string | undefined) ?? "bootstrap"
    const perServiceTag = (key: string): string =>
      (this.node.tryGetContext(key) as string | undefined) ?? imageTag
    const webImageTag = perServiceTag("webImageTag")
    const apiImageTag = perServiceTag("apiImageTag")
    const adminImageTag = perServiceTag("adminImageTag")

    // Workflow-managed secrets — historically Secrets Manager, migrated to
    // SSM SecureString in M4 of the secrets-management plan (AFF-245).
    // Two channels feed `/monorepo/${env}/*`:
    //
    //   1. Vault → SSM sync (every 5 min, runs on the Hostinger VPS at
    //      /usr/local/sbin/vault-to-ssm-sync). Source of truth = Vault.
    //      Covers `better-auth-secret` + `resend-api-key`.
    //   2. Direct deploy-workflow GHA secret → SSM. Covers
    //      `cloudflare-tunnel-token` (a Cloudflare-issued connector token
    //      that never leaves the deploy boundary; not in Vault).
    //
    // ECS reads each one via EcsSecret.fromSsmParameter at task start;
    // the execution role's auto-granted ssm:GetParameters + kms:Decrypt
    // (on alias/aws/ssm) provide runtime access. `valueFrom` is the
    // parameter's full ARN — no name-vs-ARN-with-suffix mismatch class
    // exists for SSM (the resource ARN is the parameter name itself).
    //
    // Drift detection: `.github/workflows/secrets-drift.yml` runs daily
    // and fails on Vault ≠ SSM divergence (better-auth-secret + resend-api-key).
    //
    // See docs/plans/SECRETS-MIGRATION.md § M4.
    const tunnelTokenParam =
      StringParameter.fromSecureStringParameterAttributes(
        this,
        "TunnelTokenParam",
        {
          parameterName: `/monorepo/${props.envName}/cloudflare-tunnel-token`,
        },
      )

    // Map CDK envName -> auth_token env code (ADR-0022 §"Kind taxonomy").
    // Tokens carry this code in their checksum so a token minted in
    // staging cannot be replayed against production. Without this, the
    // runtime resolver in packages/auth/src/tokens/auth-token.ts falls
    // back to `NODE_ENV === 'production' ? 'prd' : 'dev'` — and every
    // container already sets `NODE_ENV: "production"` (Next.js prod
    // build requirement), so staging tokens would be stamped 'prd' and
    // the cross-env checksum gate would silently fail open.
    const authTokenEnv: "dev" | "stg" | "prd" =
      props.envName === "production"
        ? "prd"
        : props.envName === "staging"
          ? "stg"
          : "dev"

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
    props.appUserSecret.grantRead(taskExecutionRole)

    const taskRole = new Role(this, "TaskRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Runtime IAM role shared by web + api containers",
    })
    props.appBucket.grantReadWrite(taskRole)
    props.databaseSecret.grantRead(taskRole)
    props.appUserSecret.grantRead(taskRole)
    // openfga-bootstrap init container writes the store + model IDs to SSM
    // via PutParameter on /monorepo/${envName}/openfga/{store-id,model-id}.
    // Scoped to those two parameter ARNs — the api/web/admin containers
    // share this role but never touch SSM at runtime (they only read via
    // EcsSecret.fromSsmParameter, which goes through the execution role's
    // ssm:GetParameters, not this task role). Blast radius if compromised
    // == garbage SSM that gets overwritten on the next deploy.
    taskRole.addToPolicy(
      new PolicyStatement({
        actions: ["ssm:PutParameter"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/monorepo/${props.envName}/openfga/store-id`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/monorepo/${props.envName}/openfga/model-id`,
        ],
      }),
    )

    // ECS Exec (`aws ecs execute-command`) needs the task role to open the
    // SSM Session Manager control + data channels. Without it the exec
    // request fails at the agent with "execute command agent isn't running"
    // even when the service has `enableExecuteCommand: true`. Resource
    // is `*` — the channels are session-scoped, not resource-scoped, and
    // AWS docs explicitly recommend `Resource: "*"` here. Operator IAM
    // (caller side) still gates who can invoke exec at all.
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

    const taskDef = new FargateTaskDefinition(this, "TaskDef", {
      cpu: 512,
      // 2048: the 7 long-running containers reserve 1736 MiB total. Three
      // init containers (db-migrate 64, openfga-migrate 64,
      // openfga-bootstrap 128) push the boot-time peak to ~1992 MiB
      // before the inits exit — 56 MiB below the limit. Observed
      // MemoryUtilized peak ~327 MiB over the first 7 days of running
      // (admin/web mostly idle), so 2048 leaves ~310 MiB above the
      // steady-state reservation sum and ~6x headroom on observed usage.
      // Next valid notch at cpu=512 is 1024 (below reservations — would
      // force evictions) or 3072 (the prior setting, $3.50/mo more
      // gross at arm64). Re-check MemoryUtilized 24-48h after first
      // real traffic. CPU stays the watch item — see ADR-0008
      // amendment.
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
    // most cryptominer payloads need to operate. Fargate forbids
    // `addCapabilities` entirely (it rejected SETGID with "Invalid request:
    // SETGID is not allowed on Fargate"), so the only privilege model
    // available is "drop only" — every container here runs unprivileged with
    // ZERO capabilities, period.
    const linuxParams = (id: string) => {
      const params = new LinuxParameters(this, id)
      params.dropCapabilities(Capability.ALL)
      return params
    }

    // RETAIN log groups + generated secrets in production (rollback / forensics
    // must survive a deploy failure). DESTROY in staging so a failed deploy
    // does not orphan resources by their fixed names — the next deploy used
    // to fail at CREATE_FAILED ResourceAlreadyExists otherwise. Pattern
    // mirrors data-stack.ts.
    const ephemeralRemovalPolicy =
      props.envName === "production"
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY

    this.webLogGroup = new LogGroup(this, "WebLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/web`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: ephemeralRemovalPolicy,
    })
    this.adminLogGroup = new LogGroup(this, "AdminLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/admin`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: ephemeralRemovalPolicy,
    })
    this.apiLogGroup = new LogGroup(this, "ApiLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/api`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: ephemeralRemovalPolicy,
    })
    this.tunnelLogGroup = new LogGroup(this, "TunnelLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/cloudflared`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: ephemeralRemovalPolicy,
    })
    this.pgbouncerLogGroup = new LogGroup(this, "PgBouncerLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/pgbouncer`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: ephemeralRemovalPolicy,
    })
    this.cerbosLogGroup = new LogGroup(this, "CerbosLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/cerbos`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: ephemeralRemovalPolicy,
    })
    this.openfgaLogGroup = new LogGroup(this, "OpenfgaLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/openfga`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: ephemeralRemovalPolicy,
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

    // Better Auth signing secret — Vault is the source of truth; the VPS
    // sync (M4) mirrors it into SSM SecureString. Rotation = `vault kv put
    // platform/${env}/better-auth-secret value=…` on the operator laptop;
    // the next 5-min sync tick + the next ECS task restart picks it up.
    // SAFETY: lost secret invalidates every active session, so rotation is
    // a deliberate operator action, never automatic.
    const betterAuthSecretParam =
      StringParameter.fromSecureStringParameterAttributes(
        this,
        "BetterAuthSecretParam",
        {
          parameterName: `/monorepo/${props.envName}/better-auth-secret`,
        },
      )

    // Resend API key — Vault is source of truth; VPS sync mirrors to SSM.
    const resendApiKeyParam =
      StringParameter.fromSecureStringParameterAttributes(
        this,
        "ResendApiKeyParam",
        {
          parameterName: `/monorepo/${props.envName}/resend-api-key`,
        },
      )

    // EcsSecret.fromSsmParameter auto-grants ssm:GetParameters on the
    // parameter ARN + kms:Decrypt on alias/aws/ssm to the execution role.
    // No manual grantRead needed.

    // The web container speaks to the public origin via Cloudflare Tunnel.
    // `BETTER_AUTH_URL` MUST exactly match what users see in the browser —
    // the cookie scope + magic-link / password-reset / email-verification
    // URLs all derive from this value. Trusted origins includes both
    // protocols of every host the client may post from (the apex + the
    // tunnel hostname); add www / app aliases here if those are wired
    // in Cloudflare later.
    const publicOrigin = `https://${props.domain}`
    const trustedOrigins = [publicOrigin].join(",")

    // Next.js standalone server writes to /app/.next/cache, which a readonly
    // rootfs blocks. Until a custom cacheHandler + Dockerfile copy is in
    // place, the web container keeps a writable root. capDrop ALL still
    // blocks crypto-miner payloads. Tmpfs mount is harmless extra capacity.
    const webContainer = taskDef.addContainer("web", {
      containerName: "web",
      image: ContainerImage.fromEcrRepository(props.webRepository, webImageTag),
      portMappings: [{ containerPort: 3000 }],
      essential: true,
      logging: LogDriver.awsLogs({
        streamPrefix: "web",
        logGroup: this.webLogGroup,
      }),
      environment: {
        NODE_ENV: "production",
        APP_ENV: props.envName,
        AUTH_TOKEN_ENV: authTokenEnv,
        PORT: "3000",
        APP_DOMAIN: props.domain,
        // Better Auth: cookie scope + email link composition. resolveBaseURL
        // in packages/auth/src/server.ts throws in production if this is
        // missing, so a misconfigured deploy fails fast instead of silently
        // emitting localhost links into customer inboxes.
        BETTER_AUTH_URL: publicOrigin,
        // Same value, surfaced on the browser via NEXT_PUBLIC_*. The Better
        // Auth React client reads this to build its base URL.
        NEXT_PUBLIC_BETTER_AUTH_URL: publicOrigin,
        // CSV of origins allowed to call /api/auth/*. Add www / aliases here.
        BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins,
        // Cross-subdomain session cookie. Leading-dot domain so the
        // session is readable from `app.`, `admin.`, and `api.afframe.com`.
        // `packages/auth/src/server.ts` only enables the cross-subdomain
        // block when this var is non-empty (host-only cookie on localhost
        // dev). Derived from the two-level domain to stay correct on both
        // `app.afframe.com` and `app-staging.afframe.com`.
        BETTER_AUTH_COOKIE_DOMAIN: deriveCookieDomain(props.domain),
        // Outbound email from-address. Must be on a Resend/SES-verified
        // domain — otherwise the transport rejects the send.
        //
        // Why the parent `afframe.com` (not `${props.domain}`)? Resend's
        // verification is per-EXACT-domain — a verified `afframe.com` does
        // NOT auto-trust `app-staging.afframe.com` or `app.afframe.com` as
        // senders. Every per-env subdomain we want to send from would need
        // its own verification + DNS records. To unblock both envs on one
        // verified domain, we centralise on the parent. Per-env senders
        // (e.g. `no-reply-staging@…`) is a future tightening once the
        // subdomains are independently verified — DMARC posture improves
        // and inbox-side distinction becomes possible. Documented in
        // `docs/runbooks/AWS-DEPLOY.md` "Email sender verification".
        EMAIL_FROM: props.mailFromAddress,
        // Force the Resend transport. Without this, packages/email's
        // pickTransport() would also accept SES via AWS_REGION; in MVP we
        // want every deploy on the same provider until SES production
        // access is approved (docs/runbooks/AWS-DEPLOY.md step 8).
        EMAIL_TRANSPORT: "resend",
        // pgbouncer-routed DB connection — same loopback path the api uses.
        // packages/db reads only DATABASE_URL, composed by /bin/sh from
        // DB_USER/DB_PASSWORD secrets + DB_HOST/DB_PORT/DB_NAME env.
        DB_HOST: "localhost",
        DB_PORT: "6432",
        DB_NAME: "monorepo",
        // The packages/db startup probe asserts that app.app_user_role_name
        // is persisted on the connecting role (it underpins the last-owner
        // demotion trigger — ADR-0010). AWS RDS rejects the matching
        // `ALTER ROLE app_user SET app.app_user_role_name = …` because
        // custom-GUC ALTER requires true SUPERUSER (and `rds_superuser`
        // is not enough — AFF-150 §5). The production paths instead set
        // the GUC per-transaction via withAdminBypass / withOrganization
        // / withWorkspace (PR #142), so the missing role-default is
        // expected. Downgrade the probe's throw to a single one-time
        // warn here so the unhandled rejection does not surface as a
        // flash error overlay on the user's first cold-start render.
        // Local dev keeps the strict throw (this env var is unset there).
        DB_STARTUP_PROBE_LENIENT: "1",
        // Avatar upload + presigned-read chain in apps/web requires this. The
        // api container already has it (below); the web container's
        // /api/upload/avatar route and presignAvatarRead() call returned 500
        // without it. Task role already has grantReadWrite on the bucket.
        APP_BUCKET: props.appBucket.bucketName,
        // SDK fell back through the credential/region chain on Fargate today,
        // but wiring it explicitly removes that fragility.
        AWS_REGION: this.region,
      },
      secrets: {
        BETTER_AUTH_SECRET: EcsSecret.fromSsmParameter(betterAuthSecretParam),
        RESEND_API_KEY: EcsSecret.fromSsmParameter(resendApiKeyParam),
        // app_user (RLS-bound runtime role). pgbouncer accepts the `app_user`
        // entry from `DATABASE_URLS=` (see pgbouncerContainer below) and
        // forwards to RDS using the matching upstream credential. RLS
        // policies bite for every query that flows through this container.
        // withAdminBypass elevates to app_admin via `SET LOCAL ROLE` —
        // migration 0002_auth.sql `GRANT app_admin TO app_user` keeps that
        // path reachable from this connection.
        DB_USER: EcsSecret.fromSecretsManager(props.appUserSecret, "username"),
        DB_PASSWORD: EcsSecret.fromSecretsManager(
          props.appUserSecret,
          "password",
        ),
      },
      // Compose DATABASE_URL at container start (same pattern as api) so the
      // password never lands in an env var. SAFETY: app_user secret uses
      // `excludePunctuation: true` (data-stack.ts), so the password is
      // alphanumeric — no URL-reserved chars require encoding.
      //
      // HOSTNAME=0.0.0.0 must stay forced here for the same reason as the
      // Dockerfile CMD: Fargate/Docker runtime overrides ENV HOSTNAME with
      // the container's auto-assigned hostname, and Next.js standalone
      // server.js then binds to that non-loopback interface only — the
      // cloudflared sidecar reaching localhost:3000 would get ECONNREFUSED.
      entryPoint: ["/bin/sh", "-c"],
      command: [
        'export DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" && ' +
          "HOSTNAME=0.0.0.0 exec node apps/web/server.js",
      ],
      // Fargate ignores Dockerfile HEALTHCHECK unless it's set in the
      // task definition. Wiring this here makes Circuit Breaker (above)
      // observe real readiness, not just process-up, so a broken deploy
      // trips rollback fast instead of after the gracePeriod elapses.
      //
      // Healthcheck uses Node's built-in http module (zero dep, always in
      // the image) so the probe explicitly fails on any non-2xx status.
      // The previous `wget -q -O- … || exit 1` exited 0 even on HTTP 503
      // because wget retrieved the error body successfully — verified
      // live in run 26195661343 where the broken /api/version task served
      // 503 to users while ECS reported it healthy. Node check returns
      // exit 1 unless statusCode === 200.
      //
      // Timings tightened from 30s→10s interval + 20s→15s startPeriod so
      // ECS sees HEALTHY at ~25s instead of ~110s. Next.js standalone
      // server boots in <5s; /api/version is a cheap JSON return — three
      // 10s-interval probes still gives ~30s before declaring unhealthy.
      // healthCheckGracePeriod (180s, see service config below) keeps
      // a wide safety margin over the new convergence time.
      healthCheck: {
        command: [
          "CMD-SHELL",
          "node -e \"require('http').get('http://127.0.0.1:3000/api/version',{timeout:2000},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1)).on('timeout',function(){this.destroy();process.exit(1)})\"",
        ],
        interval: Duration.seconds(10),
        timeout: Duration.seconds(3),
        retries: 3,
        startPeriod: Duration.seconds(15),
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
      image: ContainerImage.fromEcrRepository(props.apiRepository, apiImageTag),
      portMappings: [{ containerPort: 3001 }],
      essential: true,
      logging: LogDriver.awsLogs({
        streamPrefix: "api",
        logGroup: this.apiLogGroup,
      }),
      environment: {
        NODE_ENV: "production",
        APP_ENV: props.envName,
        AUTH_TOKEN_ENV: authTokenEnv,
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
        // Public origin of the API host for this environment. Consumed by
        // `apps/api/src/editor.ts` to redirect `/editor` to the editor
        // pre-filled with the right spec URL (so staging `/editor` opens
        // the staging spec, not prod). Derived from envName by convention:
        // production -> `api.afframe.com`, anything else -> the matching
        // staging host. Override via `bin/app.ts` if the convention breaks.
        PUBLIC_API_URL:
          props.envName === "production"
            ? "https://api.afframe.com"
            : "https://api-staging.afframe.com",
        // L2 OpenFGA sidecar (HTTP). API URL is loopback inside the task.
        OPENFGA_API_URL: "http://localhost:8080",
        // Email — same Resend transport + parent-domain sender as web/admin.
        // V1Module's FeedbackController dispatches to support+feedback@ via
        // packages/email; without these vars pickTransport() returns the
        // ConsoleTransport and every send is silently logged to CloudWatch.
        AWS_REGION: this.region,
        EMAIL_FROM: props.mailFromAddress,
        EMAIL_TRANSPORT: "resend",
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
        RESEND_API_KEY: EcsSecret.fromSsmParameter(resendApiKeyParam),
      },
      entryPoint: ["/bin/sh", "-c"],
      command: [
        'export DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" && ' +
          'export DATABASE_DIRECT_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_DIRECT_HOST}:${DB_DIRECT_PORT}/${DB_NAME}" && ' +
          "exec node dist/main.js",
      ],
      // Fargate ignores Dockerfile HEALTHCHECK — same rationale as the web
      // container above. Without an explicit task-def probe a WEDGED api
      // (process up, requests deadlocked) is invisible to Circuit Breaker;
      // ECS only replaces on process exit. Smoke catches it post-deploy
      // via /api/auth/get-session, but in steady state the api could drop
      // traffic until some other timer fires.
      healthCheck: {
        command: [
          "CMD-SHELL",
          "node -e \"require('http').get('http://127.0.0.1:3001/api/health',{timeout:2000},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1)).on('timeout',function(){this.destroy();process.exit(1)})\"",
        ],
        interval: Duration.seconds(10),
        timeout: Duration.seconds(3),
        retries: 3,
        startPeriod: Duration.seconds(15),
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

    // admin container — the staff/dev surface (apps/admin), a separate
    // Next.js standalone server on port 3100. essential:false so a
    // crash-looping admin does NOT fail the whole task (web + api stay up).
    //
    // It runs its own Better Auth wiring under the admin origin, but the
    // session cookie scope is `.afframe.com` (set via
    // `BETTER_AUTH_COOKIE_DOMAIN: deriveCookieDomain(props.adminDomain)`
    // below), so an operator signed into `app.afframe.com` carries the
    // session here automatically. Same shared signing secrets as web
    // (sessions/tokens must verify across both). Access is gated solely
    // in-app by the ADMIN_WORKSPACE_ALLOWLIST check
    // (apps/admin/app/(gated)/layout.tsx) — no Cloudflare Access.
    //
    // adminOrigin is an explicit per-env host (ADMIN_DOMAIN), NOT derived
    // from props.domain: production admin is admin.afframe.com while web is
    // app.afframe.com, so the two domains do not share a stem. The operator
    // points the matching Cloudflare Tunnel hostname at :3100.
    const adminOrigin = `https://${props.adminDomain}`
    const adminContainer = taskDef.addContainer("admin", {
      containerName: "admin",
      image: ContainerImage.fromEcrRepository(
        props.adminRepository,
        adminImageTag,
      ),
      portMappings: [{ containerPort: 3100 }],
      essential: false,
      logging: LogDriver.awsLogs({
        streamPrefix: "admin",
        logGroup: this.adminLogGroup,
      }),
      environment: {
        NODE_ENV: "production",
        APP_ENV: props.envName,
        AUTH_TOKEN_ENV: authTokenEnv,
        PORT: "3100",
        BETTER_AUTH_URL: adminOrigin,
        BETTER_AUTH_TRUSTED_ORIGINS: adminOrigin,
        // Same cross-subdomain cookie domain as the web container so an
        // operator signed into `app.afframe.com` carries the session to
        // `admin.afframe.com`. See web container comment above.
        BETTER_AUTH_COOKIE_DOMAIN: deriveCookieDomain(props.adminDomain),
        // Comma-separated workspace ids whose members may sign into admin.
        // Empty => nobody is authorized (the gate fails closed). Changing
        // staff access is a redeploy. Sourced from the deploy environment.
        ADMIN_WORKSPACE_ALLOWLIST: process.env.ADMIN_WORKSPACE_ALLOWLIST ?? "",
        DB_HOST: "localhost",
        DB_PORT: "6432",
        DB_NAME: "monorepo",
        // Admin connects as app_user (same as web — see DataStackProps
        // doc) so the packages/db startup probe applies. Use the lenient
        // mode for the same reason as web: AWS RDS rejects `ALTER ROLE
        // SET app.app_user_role_name`, so the missing role-default is
        // expected and downstream per-transaction SET LOCAL carries the
        // contract. See the long note in the web container env above.
        DB_STARTUP_PROBE_LENIENT: "1",
        // Admin doesn't upload avatars today, but staff user-management views
        // call presignAvatarRead() to render user profile photos. Wire it now
        // so the next admin feature doesn't trip the same 500 the web app hit.
        APP_BUCKET: props.appBucket.bucketName,
        AWS_REGION: this.region,
        // See the long note in the web container above re. Resend per-domain
        // verification. Admin sends from the same parent address.
        EMAIL_FROM: props.mailFromAddress,
        EMAIL_TRANSPORT: "resend",
      },
      secrets: {
        // Shared with web: sessions must verify across both apps.
        BETTER_AUTH_SECRET: EcsSecret.fromSsmParameter(betterAuthSecretParam),
        // forgot/reset-password send mail via Resend.
        RESEND_API_KEY: EcsSecret.fromSsmParameter(resendApiKeyParam),
        // app_user (RLS-bound runtime role). Same role as web — admin's
        // staff queries are equally RLS-scoped. Any admin operation that
        // legitimately needs to read across tenants funnels through
        // withAdminBypass (`SET LOCAL ROLE app_admin`).
        DB_USER: EcsSecret.fromSecretsManager(props.appUserSecret, "username"),
        DB_PASSWORD: EcsSecret.fromSecretsManager(
          props.appUserSecret,
          "password",
        ),
      },
      // Same DATABASE_URL shell-compose + forced HOSTNAME as the web
      // container — see that block for the safety note on the unencoded
      // password (app_user secret uses excludePunctuation: true).
      entryPoint: ["/bin/sh", "-c"],
      command: [
        'export DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" && ' +
          "HOSTNAME=0.0.0.0 exec node apps/admin/server.js",
      ],
      // Mirror of the web healthCheck — see that block for rationale + the
      // wget-vs-node story. Admin uses port 3100 and exposes /api/health
      // (no /api/version).
      healthCheck: {
        command: [
          "CMD-SHELL",
          "node -e \"require('http').get('http://127.0.0.1:3100/api/health',{timeout:2000},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1)).on('timeout',function(){this.destroy();process.exit(1)})\"",
        ],
        interval: Duration.seconds(10),
        timeout: Duration.seconds(3),
        retries: 3,
        startPeriod: Duration.seconds(15),
      },
      memoryReservationMiB: 384,
      linuxParameters: linuxParams("AdminLinuxParams"),
    })
    adminContainer.addMountPoints({
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
    // Per-tenant role separation (ADR-0010 app_user) is a follow-up;
    // see docs/runbooks/AWS-DEPLOY.md "Follow-up: per-tenant role split".
    //
    // pgbouncer container hardening note (2026-05-17): readonlyRootFilesystem
    // is intentionally OFF and the previous /etc/pgbouncer scratch volume is
    // removed. The chain of prior attempts was:
    //   1. readonlyRootFilesystem=true + scratch volume @ /etc/pgbouncer →
    //      entrypoint as the image's non-root postgres user couldn't write
    //      userlist.txt because the empty ECS scratch volume mounted as
    //      root:root.
    //   2. user:"0" added (PR #102) → entrypoint could write, but pgbouncer
    //      reads `user = postgres` from its own auto-generated ini and tries
    //      to setgroups(2)+setuid(2) to drop privileges → FATAL.
    //   3. linuxParameters.addCapabilities([SETGID, SETUID]) (PR #114) →
    //      Fargate refuses any cap-add: "Invalid request: SETGID is not
    //      allowed on Fargate".
    // The platform-correct unwind is: trust the image's own hardening
    // (non-root postgres user + capDrop ALL still in place + appSecurityGroup
    // denies all ingress except loopback). Writable rootfs is a small price
    // and only this one sidecar pays it.

    // pgBouncer SCRAM hash is built by its entrypoint from the plaintext
    // password — the userlist.txt write itself doesn't depend on alpine
    // having any tool other than /bin/sh + awk + sed (all present).
    //
    // Dual-user composition (ADR-0010 role split, audit #4 fix):
    // `DATABASE_URLS=postgres://app_owner:...,postgres://app_user:...`
    // (plural). The edoburu entrypoint's `parse_urls` loop walks the
    // comma-separated value and writes BOTH credentials into
    // /etc/pgbouncer/userlist.txt + emits matching `[databases]` entries.
    // Result: a single pgbouncer task serves both upstream identities
    // (api stays on app_owner; web + admin connect as app_user with RLS
    // applying). Both upstream URLs target the same RDS host:port:db, so
    // there is no second pool to manage. See
    // `docs/runbooks/AWS-DEPLOY.md` "Follow-up: per-tenant role split"
    // for the operator rotation procedure and the
    // post-deploy `GRANT app_admin TO app_owner` revert.
    const pgbouncerContainer = taskDef.addContainer("pgbouncer", {
      containerName: "pgbouncer",
      image: ContainerImage.fromRegistry("edoburu/pgbouncer:v1.25.1-p0"),
      // Runs as the image's default user (postgres). Privilege-drop happens
      // inside the container before pgbouncer starts; no Linux capabilities
      // are required because no caller starts as root in our task.
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
        // RDS forces SSL (rds.force_ssl). The pgBouncer server-side
        // connection must use TLS or RDS rejects it ("no pg_hba.conf
        // entry ... no encryption"). edoburu maps this to server_tls_sslmode.
        SERVER_TLS_SSLMODE: "require",
      },
      secrets: {
        // app_owner — upstream connection #1 (api container authenticates
        // to pgbouncer as this role, and pg-boss's DATABASE_DIRECT_URL also
        // uses these creds direct to RDS :5432).
        DB_OWNER_USER: EcsSecret.fromSecretsManager(
          props.databaseSecret,
          "username",
        ),
        DB_OWNER_PASSWORD: EcsSecret.fromSecretsManager(
          props.databaseSecret,
          "password",
        ),
        // app_user — upstream connection #2 (web + admin containers
        // authenticate to pgbouncer as this role; RLS applies on RDS).
        DB_USER_USER: EcsSecret.fromSecretsManager(
          props.appUserSecret,
          "username",
        ),
        DB_USER_PASSWORD: EcsSecret.fromSecretsManager(
          props.appUserSecret,
          "password",
        ),
      },
      entryPoint: ["/bin/sh", "-c"],
      // DATABASE_URLS (plural) — comma-separated list. The edoburu
      // entrypoint parses each URL and emits matching userlist.txt +
      // [databases] entries. Both URLs MUST target the same DB_HOST:DB_PORT/
      // DB_NAME so pgbouncer holds one pool against one RDS endpoint.
      //
      // SAFETY: both secrets use excludePunctuation: true (data-stack.ts),
      // so passwords are alphanumeric and shell-interpolation into the URL
      // is safe without urlencoding.
      command: [
        'export DATABASE_URLS="postgres://${DB_OWNER_USER}:${DB_OWNER_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME},postgres://${DB_USER_USER}:${DB_USER_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" && exec /entrypoint.sh /usr/bin/pgbouncer /etc/pgbouncer/pgbouncer.ini',
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
      // readonlyRootFilesystem intentionally NOT set (defaults to false). See
      // the long note above the container block for why this one sidecar
      // diverges from the others. The image owns /etc/pgbouncer (postgres-
      // owned) and the entrypoint needs to write pgbouncer.ini + userlist.txt
      // there at boot.
      linuxParameters: linuxParams("PgBouncerLinuxParams"),
    })
    pgbouncerContainer.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })
    // api waits for pgbouncer healthcheck before starting. Without this,
    // api gets ECONNREFUSED for ~10-15 s at task boot until pgbouncer's
    // listener is up.
    apiContainer.addContainerDependencies({
      container: pgbouncerContainer,
      condition: ContainerDependencyCondition.HEALTHY,
    })
    // admin reaches the DB through pgbouncer too (the workspace-allowlist
    // gate query) — wait for the pool to be healthy before it starts.
    adminContainer.addContainerDependencies({
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
      // Non-essential: a flapping tunnel connector must not cycle the whole
      // task. ECS still restarts it; its exit will not kill web/api/db.
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

    // ─── Bootstrap init containers ───────────────────────────────────────
    //
    // First-deploy of a fresh environment needs three DB bootstrap steps
    // (per docs/runbooks/AWS-DEPLOY.md):
    //
    //   1. Apply Drizzle migrations (creates app_user role + all tables)
    //   2. ALTER ROLE app_user PASSWORD <from-appUserSecret>
    //   3. CREATE SCHEMA openfga + run `openfga migrate` (goose schema)
    //
    // Before this, operators ran them manually via a bastion. That works
    // once per env then forgotten — and production first-deploy hit it
    // because nothing automated the bootstrap. The init containers below
    // run on every cold start; idempotent steps no-op after first success.
    //
    // ECS dependsOn ensures essential containers wait until these exit
    // SUCCESS (exit code 0). On unexpected failure, the whole task fails
    // → Circuit Breaker rolls back the deploy (deferred to G5's contract).

    const dbMigrateImage = new DockerImageAsset(this, "DbMigrateImage", {
      // Context is repo root so the Dockerfile can COPY
      // packages/db/migrations + infra/scripts/apply-migrations-init.sh.
      directory: path.join(__dirname, "..", "..", ".."),
      file: "infra/Dockerfile.migrate",
      platform: Platform.LINUX_ARM64,
    })

    const dbMigrateLogGroup = new LogGroup(this, "DbMigrateLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/db-migrate`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    const dbMigrateContainer = taskDef.addContainer("db-migrate", {
      containerName: "db-migrate",
      image: ContainerImage.fromDockerImageAsset(dbMigrateImage),
      // essential: false + ECS dependsOn SUCCESS → task waits for clean
      // exit before starting other containers, but a failure here does
      // surface (Circuit Breaker treats unhealthy deployment as failure).
      essential: false,
      // First-deploy migration set against a cold RDS can exceed the
      // default 3min startTimeout (DB warmup + N migrations × ~2-3s).
      // Lift to 10min so dependsOn-SUCCESS doesn't trip prematurely.
      startTimeout: Duration.minutes(10),
      logging: LogDriver.awsLogs({
        streamPrefix: "db-migrate",
        logGroup: dbMigrateLogGroup,
      }),
      environment: {
        DB_HOST: props.database.dbInstanceEndpointAddress,
        DB_PORT: props.database.dbInstanceEndpointPort,
        DB_NAME: "monorepo",
      },
      secrets: {
        DB_ADMIN_USER: EcsSecret.fromSecretsManager(
          props.databaseSecret,
          "username",
        ),
        DB_ADMIN_PASSWORD: EcsSecret.fromSecretsManager(
          props.databaseSecret,
          "password",
        ),
        APP_USER_PASSWORD: EcsSecret.fromSecretsManager(
          props.appUserSecret,
          "password",
        ),
      },
      memoryReservationMiB: 64,
      readonlyRootFilesystem: true,
      linuxParameters: linuxParams("DbMigrateLinuxParams"),
    })
    dbMigrateContainer.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })

    const openfgaMigrateLogGroup = new LogGroup(this, "OpenfgaMigrateLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/openfga-migrate`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    const openfgaMigrateContainer = taskDef.addContainer("openfga-migrate", {
      containerName: "openfga-migrate",
      image: ContainerImage.fromRegistry("openfga/openfga:v1.15.1"),
      essential: false,
      // Goose migration applier; first-deploy can take a few minutes
      // against a cold RDS. Match db-migrate's timeout.
      startTimeout: Duration.minutes(10),
      command: ["migrate"],
      logging: LogDriver.awsLogs({
        streamPrefix: "openfga-migrate",
        logGroup: openfgaMigrateLogGroup,
      }),
      environment: {
        OPENFGA_DATASTORE_ENGINE: "postgres",
        OPENFGA_DATASTORE_URI: `postgres://${props.database.dbInstanceEndpointAddress}:${props.database.dbInstanceEndpointPort}/monorepo?search_path=openfga&sslmode=require`,
        OPENFGA_LOG_FORMAT: "json",
      },
      secrets: {
        // openfga migrate runs as the admin (app_owner) since it needs
        // DDL inside the openfga schema. Different from the runtime
        // openfga container which can use a less-privileged role
        // (we still use admin there for now — refine later).
        OPENFGA_DATASTORE_USERNAME: EcsSecret.fromSecretsManager(
          props.databaseSecret,
          "username",
        ),
        OPENFGA_DATASTORE_PASSWORD: EcsSecret.fromSecretsManager(
          props.databaseSecret,
          "password",
        ),
      },
      memoryReservationMiB: 64,
      readonlyRootFilesystem: true,
      linuxParameters: linuxParams("OpenfgaMigrateLinuxParams"),
    })
    openfgaMigrateContainer.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })

    // openfga-migrate depends on db-migrate (needs the openfga schema
    // created by step #3 of apply-migrations-init.sh).
    openfgaMigrateContainer.addContainerDependencies({
      container: dbMigrateContainer,
      condition: ContainerDependencyCondition.SUCCESS,
    })

    // openfga-bootstrap (init container): creates/reuses the OpenFGA store,
    // writes the authorization model, and PutParameter's the resulting
    // store-id + model-id to SSM. Replaces the manual bastion bootstrap
    // step the runbook used to require — every env (including DR / new
    // tenant infra) gets bootstrapped automatically on first deploy.
    //
    // Runs AFTER openfga-migrate so the openfga schema goose tables exist.
    // The container image bundles the openfga binary + node + bootstrap.mjs;
    // the init script boots openfga locally on 127.0.0.1:8080, polls
    // /healthz, runs the bootstrap, writes SSM, then exits.
    //
    // Idempotent: store reused by name across re-runs; model_id is
    // rewritten with same DSL content; SSM overwritten. api reads SSM at
    // every cold start so it always picks up the latest model_id.
    const openfgaBootstrapImage = new DockerImageAsset(
      this,
      "OpenfgaBootstrapImage",
      {
        directory: path.join(__dirname, "..", "..", ".."),
        file: "infra/Dockerfile.openfga-bootstrap",
        platform: Platform.LINUX_ARM64,
      },
    )

    const openfgaBootstrapLogGroup = new LogGroup(
      this,
      "OpenfgaBootstrapLogs",
      {
        logGroupName: `/ecs/monorepo-${props.envName}/openfga-bootstrap`,
        retention: RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      },
    )

    const openfgaBootstrapContainer = taskDef.addContainer(
      "openfga-bootstrap",
      {
        containerName: "openfga-bootstrap",
        image: ContainerImage.fromDockerImageAsset(openfgaBootstrapImage),
        essential: false,
        // First-deploy bootstrap against a cold openfga schema + SSM writes
        // can take ~10-15s. Lift the timeout in line with the other inits so
        // dependsOn-SUCCESS doesn't trip on slow boots.
        startTimeout: Duration.minutes(5),
        logging: LogDriver.awsLogs({
          streamPrefix: "openfga-bootstrap",
          logGroup: openfgaBootstrapLogGroup,
        }),
        environment: {
          MONOREPO_ENV: props.envName,
          AWS_REGION: this.region,
          DB_HOST: props.database.dbInstanceEndpointAddress,
          DB_PORT: props.database.dbInstanceEndpointPort,
          DB_NAME: "monorepo",
        },
        secrets: {
          DB_ADMIN_USER: EcsSecret.fromSecretsManager(
            props.databaseSecret,
            "username",
          ),
          DB_ADMIN_PASSWORD: EcsSecret.fromSecretsManager(
            props.databaseSecret,
            "password",
          ),
        },
        memoryReservationMiB: 128,
        readonlyRootFilesystem: true,
        linuxParameters: linuxParams("OpenfgaBootstrapLinuxParams"),
      },
    )
    openfgaBootstrapContainer.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })

    // openfga-bootstrap must run AFTER openfga-migrate so the openfga
    // schema's goose tables (store, authorization_model, tuple, ...) exist.
    openfgaBootstrapContainer.addContainerDependencies({
      container: openfgaMigrateContainer,
      condition: ContainerDependencyCondition.SUCCESS,
    })

    // Essential-container dependsOn wiring. Three init containers run in
    // a strict chain: db-migrate → openfga-migrate → openfga-bootstrap.
    // Essentials wait on the appropriate prefix:
    //   - All essentials need db-migrate (creates app_user role, schemas).
    //   - openfga + api need openfga-migrate (goose schema tables exist).
    //   - api alone needs openfga-bootstrap (its SSM-sourced OPENFGA_STORE_ID
    //     + OPENFGA_MODEL_ID must resolve to the freshly-written values,
    //     not the previous deploy's snapshot or the seed placeholders).
    const allEssentials = [
      pgbouncerContainer,
      cerbosContainer,
      openfgaContainer,
      apiContainer,
      webContainer,
      adminContainer,
    ]
    for (const c of allEssentials) {
      c.addContainerDependencies({
        container: dbMigrateContainer,
        condition: ContainerDependencyCondition.SUCCESS,
      })
    }
    for (const c of [openfgaContainer, apiContainer]) {
      c.addContainerDependencies({
        container: openfgaMigrateContainer,
        condition: ContainerDependencyCondition.SUCCESS,
      })
    }
    apiContainer.addContainerDependencies({
      container: openfgaBootstrapContainer,
      condition: ContainerDependencyCondition.SUCCESS,
    })

    this.service = new FargateService(this, "Service", {
      cluster: this.cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: true,
      vpcSubnets: publicSubnetSelection,
      securityGroups: [props.appSecurityGroup],
      // ECS Exec opens a session-managed shell into a running container
      // for ops (psql against staging RDS, log triage on a wedged task,
      // ad-hoc debugging). Requires the matching `ssmmessages:*` grant on
      // the taskRole (above) and the operator IAM caller's
      // `ecs:ExecuteCommand`. Bears no audit cost beyond CloudTrail. Kept
      // ON in both envs — the gain in incident response time outweighs
      // the unmeasurable hardening loss (any caller who can exec already
      // has admin via the deploy role).
      enableExecuteCommand: true,
      // 100 prevents the only running task from being stopped before the
      // replacement is healthy — desiredCount=1 with 50% means ECS can
      // scale to 0 momentarily, causing a Cloudflare-Tunnel outage window.
      // Matches AWS re:Post zero-downtime guidance.
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      // Symmetric across envs: staging dogfoods the rollback path so any
      // regression in the auto-rollback flow surfaces before prod hits it.
      // Past failure forensics show ECS Circuit Breaker as 5/20 of recent
      // staging fails — exercising the rollback there is the goal, not
      // a hindrance.
      circuitBreaker: { rollback: true },
      // 180s: cold-start budget. Cold pull of six arm64 images + chained
      // sidecar HEALTHY gates measured ~150s worst case. 180s gives ~20%
      // headroom; the previous 300s over-budgeted and added 2 min to every
      // failure-rollback cycle.
      healthCheckGracePeriod: Duration.seconds(180),
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
    new CfnOutput(this, "TunnelTokenSsmParameterName", {
      value: tunnelTokenParam.parameterName,
      description:
        "SSM SecureString parameter where the deploy workflow writes the Cloudflare Tunnel connector token (M4). The cloudflared sidecar reads this via EcsSecret.fromSsmParameter.",
    })
  }
}

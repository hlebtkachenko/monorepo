import { Match, Template } from "aws-cdk-lib/assertions"
import { describe, expect, it } from "vitest"
import { buildTestApp } from "./helper.js"

describe("AppStack Fargate hardening", () => {
  const { appStack } = buildTestApp()
  const template = Template.fromStack(appStack)

  it("task definition has the shared tmp volume", () => {
    template.hasResourceProperties("AWS::ECS::TaskDefinition", {
      Volumes: Match.arrayWith([Match.objectLike({ Name: "tmp" })]),
    })
  })

  it("all 9 containers drop ALL Linux capabilities", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = taskDef?.Properties?.ContainerDefinitions ?? []
    expect(containers.length).toBe(9)
    for (const container of containers as Array<{
      LinuxParameters?: { Capabilities?: { Drop?: string[] } }
      Name?: string
    }>) {
      const drop = container.LinuxParameters?.Capabilities?.Drop ?? []
      expect(drop).toContain("ALL")
    }
  })

  it("api + cloudflared + cerbos + openfga have readonlyRootFilesystem=true (pgbouncer excluded by design)", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = (taskDef?.Properties?.ContainerDefinitions ??
      []) as Array<{
      Name?: string
      ReadonlyRootFilesystem?: boolean
    }>
    const byName = Object.fromEntries(containers.map((c) => [c.Name, c]))
    expect(byName["api"]?.ReadonlyRootFilesystem).toBe(true)
    expect(byName["cloudflared"]?.ReadonlyRootFilesystem).toBe(true)
    expect(byName["cerbos"]?.ReadonlyRootFilesystem).toBe(true)
    expect(byName["openfga"]?.ReadonlyRootFilesystem).toBe(true)
    // pgbouncer's edoburu entrypoint writes pgbouncer.ini + userlist.txt to
    // /etc/pgbouncer at boot; the image owns that dir and a Fargate-locked
    // capDrop ALL + non-root user keep the container hardened without a
    // read-only rootfs. See the long note in app-stack.ts above the
    // pgbouncer container block for the full history.
    expect(byName["pgbouncer"]?.ReadonlyRootFilesystem).toBeFalsy()
  })

  it("openfga sidecar is present with postgres datastore + HTTP loopback bind", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = (taskDef?.Properties?.ContainerDefinitions ??
      []) as Array<{
      Name?: string
      Environment?: Array<{ Name?: string; Value?: string }>
      Image?: string
    }>
    const fga = containers.find((c) => c.Name === "openfga")
    expect(fga).toBeDefined()
    expect(fga?.Image).toContain("openfga/openfga:v1.15.1")
    const envByName = Object.fromEntries(
      (fga?.Environment ?? []).map((e) => [e.Name, e.Value]),
    )
    expect(envByName["OPENFGA_DATASTORE_ENGINE"]).toBe("postgres")
    // Bind to loopback only — defense-in-depth.
    expect(envByName["OPENFGA_HTTP_ADDR"]).toBe("127.0.0.1:8080")
  })

  it("api receives OPENFGA_API_URL + SSM-backed store/model ids", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = (taskDef?.Properties?.ContainerDefinitions ??
      []) as Array<{
      Name?: string
      Environment?: Array<{ Name?: string; Value?: string }>
      Secrets?: Array<{ Name?: string; ValueFrom?: unknown }>
    }>
    const api = containers.find((c) => c.Name === "api")
    const envByName = Object.fromEntries(
      (api?.Environment ?? []).map((e) => [e.Name, e.Value]),
    )
    expect(envByName["OPENFGA_API_URL"]).toBe("http://localhost:8080")
    const secretNames = (api?.Secrets ?? []).map((s) => s.Name)
    expect(secretNames).toContain("OPENFGA_STORE_ID")
    expect(secretNames).toContain("OPENFGA_MODEL_ID")
  })

  it("cerbos sidecar is present with telemetry disabled", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = (taskDef?.Properties?.ContainerDefinitions ??
      []) as Array<{
      Name?: string
      Environment?: Array<{ Name?: string; Value?: string }>
    }>
    const cerbos = containers.find((c) => c.Name === "cerbos")
    expect(cerbos).toBeDefined()
    const envByName = Object.fromEntries(
      (cerbos?.Environment ?? []).map((e) => [e.Name, e.Value]),
    )
    expect(envByName["CERBOS_NO_TELEMETRY"]).toBe("1")
  })

  it("web container has BETTER_AUTH_URL + trusted origins matching public domain", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = (taskDef?.Properties?.ContainerDefinitions ??
      []) as Array<{
      Name?: string
      Environment?: Array<{ Name?: string; Value?: string }>
      Secrets?: Array<{ Name?: string; ValueFrom?: unknown }>
    }>
    const web = containers.find((c) => c.Name === "web")
    expect(web).toBeDefined()
    const envByName = Object.fromEntries(
      (web?.Environment ?? []).map((e) => [e.Name, e.Value]),
    )
    // BETTER_AUTH_URL must be the HTTPS origin matching props.domain so the
    // resolveBaseURL() guard in packages/auth/src/server.ts is happy and
    // every magic-link / password-reset / invite email points at the
    // real public hostname (not localhost or the Fargate task IP).
    expect(envByName["BETTER_AUTH_URL"]).toBe("https://test.example.com")
    expect(envByName["NEXT_PUBLIC_BETTER_AUTH_URL"]).toBe(
      "https://test.example.com",
    )
    expect(envByName["BETTER_AUTH_TRUSTED_ORIGINS"]).toContain(
      "https://test.example.com",
    )
    expect(envByName["EMAIL_FROM"]).toBe("no-reply@mail.example.org")
    expect(envByName["EMAIL_TRANSPORT"]).toBe("resend")
    // Hard-coded loopback path to the pgBouncer sidecar — same pattern as api.
    expect(envByName["DB_HOST"]).toBe("localhost")
    expect(envByName["DB_PORT"]).toBe("6432")
    expect(envByName["DB_NAME"]).toBe("monorepo")
    // Lenient probe is mandatory on RDS-backed deploys — the GUC cannot
    // be persisted on the role via ALTER ROLE SET (AFF-150 §5), so the
    // probe would otherwise throw an unhandled rejection on every cold
    // start and surface as a flash error overlay. Per-transaction SET
    // LOCAL (PR #142) is the actual enforcement. Both web + admin
    // connect as app_user and must carry this flag.
    expect(envByName["DB_STARTUP_PROBE_LENIENT"]).toBe("1")
    // AUTH_TOKEN_ENV must be explicitly mapped from envName so the
    // resolveAuthTokenEnv() fallback (NODE_ENV='production' -> 'prd')
    // does not stamp staging tokens with the production checksum code.
    // TEST_ENV_NAME == "test" falls through the map to "dev".
    expect(envByName["AUTH_TOKEN_ENV"]).toBe("dev")
    // Secrets reach the container via Secrets Manager; the names match
    // what packages/auth + packages/email read.
    const secretNames = (web?.Secrets ?? []).map((s) => s.Name)
    expect(secretNames).toContain("BETTER_AUTH_SECRET")
    expect(secretNames).toContain("RESEND_API_KEY")
    expect(secretNames).not.toContain("APP_TOKEN_SECRET")
    expect(secretNames).toContain("DB_USER")
    expect(secretNames).toContain("DB_PASSWORD")
  })

  it("AUTH_TOKEN_ENV is explicitly set on web + admin + api so staging tokens are not stamped 'prd'", () => {
    // resolveAuthTokenEnv() falls back to NODE_ENV==='production' ? 'prd'
    // : 'dev' when AUTH_TOKEN_ENV is unset. Every Fargate container sets
    // NODE_ENV='production' (Next.js prod build), so without an explicit
    // AUTH_TOKEN_ENV value staging would mint tokens carrying the 'prd'
    // checksum code — opening a cross-env replay channel. ADR-0022 §"Kind
    // taxonomy" requires the env code to be bound to the deploy env.
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = (taskDef?.Properties?.ContainerDefinitions ??
      []) as Array<{
      Name?: string
      Environment?: Array<{ Name?: string; Value?: string }>
    }>
    for (const name of ["web", "admin", "api"]) {
      const c = containers.find((x) => x.Name === name)
      expect(c, `container ${name} missing`).toBeDefined()
      const envByName = Object.fromEntries(
        (c?.Environment ?? []).map((e) => [e.Name, e.Value]),
      )
      // TEST_ENV_NAME == "test" falls through the envName->code map to "dev".
      expect(envByName["AUTH_TOKEN_ENV"]).toBe("dev")
    }
  })

  it("admin container BETTER_AUTH_URL is the explicit adminDomain, not derived from the web domain", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = (taskDef?.Properties?.ContainerDefinitions ??
      []) as Array<{
      Name?: string
      Environment?: Array<{ Name?: string; Value?: string }>
    }>
    const admin = containers.find((c) => c.Name === "admin")
    expect(admin).toBeDefined()
    const envByName = Object.fromEntries(
      (admin?.Environment ?? []).map((e) => [e.Name, e.Value]),
    )
    // adminDomain is its own per-env value (ADMIN_DOMAIN), independent of
    // the web domain — production admin is admin.afframe.com while web is
    // app.afframe.com. The admin host-scoped session cookie + every
    // forgot/reset email link derive from this exact origin.
    expect(envByName["BETTER_AUTH_URL"]).toBe(
      "https://admin-console.example.net",
    )
    expect(envByName["BETTER_AUTH_TRUSTED_ORIGINS"]).toBe(
      "https://admin-console.example.net",
    )
    // Must NOT contain the web domain — guards against a regression to the
    // old `admin.${props.domain}` derivation.
    expect(envByName["BETTER_AUTH_URL"]).not.toContain("test.example.com")
    // Admin connects as app_user too and needs the lenient startup-probe
    // mode — RDS rejects ALTER ROLE SET for custom GUCs (AFF-150 §5).
    expect(envByName["DB_STARTUP_PROBE_LENIENT"]).toBe("1")
  })

  it("references the 4 workflow-managed secrets by FULL ARN (with random suffix)", () => {
    // All four secrets are workflow-managed (fromSecretCompleteArn imports),
    // so none of them materialize as CDK Secret resources in this template.
    // The workflow's "Ensure workflow-managed Secrets Manager secrets" step
    // creates them with the chosen value, captures the AWS-assigned full
    // ARN (with random 6-char suffix), and passes each ARN to CDK via
    // --context. App-stack.ts then imports each one via
    // Secret.fromSecretCompleteArn so the task def `valueFrom` and the
    // IAM grantRead policy resource share one exact ARN — no wildcards,
    // no bare-name auth quirks.
    template.resourceCountIs("AWS::SecretsManager::Secret", 0)

    // Container `valueFrom` must use the full ARN, not the bare name. We
    // assert the suffix (last segment after the last "-") is present and
    // 6+ chars — that is the AWS-assigned random suffix. The bare-name
    // form was the failure mode: ECS task GetSecretValue against bare ARN
    // returned AccessDenied even with a `name*` wildcard policy.
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = (taskDef?.Properties?.ContainerDefinitions ??
      []) as Array<{
      Name?: string
      Secrets?: Array<{ Name?: string; ValueFrom?: string }>
    }>
    const web = containers.find((c) => c.Name === "web")
    const valueFromByName = Object.fromEntries(
      (web?.Secrets ?? []).map((s) => [s.Name, s.ValueFrom ?? ""]),
    )
    for (const key of ["BETTER_AUTH_SECRET", "RESEND_API_KEY"]) {
      const arn = valueFromByName[key] ?? ""
      expect(arn).toMatch(/^arn:aws:secretsmanager:/)
      // Suffix segment after the last "-" must be 6+ alnum (the AWS random
      // suffix). The bare-name form would not have any suffix.
      const tail = arn.split(":secret:")[1] ?? ""
      expect(tail).toMatch(/-[A-Za-z0-9]{6,}$/)
    }

    // TaskExecutionRole's DefaultPolicy grants GetSecretValue. The policy
    // Resource list now contains exact full ARNs (no `name*` wildcard,
    // no `name-??????` wildcard).
    const policies = template.findResources("AWS::IAM::Policy", {
      Properties: {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(["secretsmanager:GetSecretValue"]),
            }),
          ]),
        }),
      },
    })
    expect(Object.keys(policies).length).toBeGreaterThan(0)
  })

  it("api connects to pgbouncer sidecar on localhost:6432", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = (taskDef?.Properties?.ContainerDefinitions ??
      []) as Array<{
      Name?: string
      Environment?: Array<{ Name?: string; Value?: string }>
      Command?: string[]
    }>
    const api = containers.find((c) => c.Name === "api")
    const envByName = Object.fromEntries(
      (api?.Environment ?? []).map((e) => [e.Name, e.Value]),
    )
    expect(envByName["DB_HOST"]).toBe("localhost")
    expect(envByName["DB_PORT"]).toBe("6432")
    expect(envByName["DB_NAME"]).toBe("monorepo")
    // DATABASE_URL is composed at container start by /bin/sh — the api
    // entrypoint must reference DB_HOST/DB_PORT in the command string.
    expect(api?.Command?.[0]).toContain("DATABASE_URL=")
    expect(api?.Command?.[0]).toContain("${DB_HOST}")
  })

  it("pgbouncer has GUC-preserving transaction-mode config", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = (taskDef?.Properties?.ContainerDefinitions ??
      []) as Array<{
      Name?: string
      Environment?: Array<{ Name?: string; Value?: string }>
    }>
    const pg = containers.find((c) => c.Name === "pgbouncer")
    const envByName = Object.fromEntries(
      (pg?.Environment ?? []).map((e) => [e.Name, e.Value]),
    )
    // These settings preserve the GUC contract (ADR-0012 amendment).
    // transaction pool_mode keeps SET LOCAL bindings attached for the full
    // transaction. SERVER_RESET_QUERY is intentionally absent (empty value
    // is OMITTED by the edoburu entrypoint's ${VAR:+...} expansion); the
    // pgBouncer default DISCARD ALL is fine because SET LOCAL is already
    // out of scope at COMMIT.
    expect(envByName["POOL_MODE"]).toBe("transaction")
    expect(envByName["SERVER_RESET_QUERY"]).toBeUndefined()
    expect(envByName["AUTH_TYPE"]).toBe("scram-sha-256")
    // Listening on :6432 (not the image default :5432) + loopback only.
    expect(envByName["LISTEN_PORT"]).toBe("6432")
    expect(envByName["LISTEN_ADDR"]).toBe("127.0.0.1")
  })

  it("pgbouncer composes DATABASE_URLS (plural) from app_owner + app_user secrets", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = (taskDef?.Properties?.ContainerDefinitions ??
      []) as Array<{
      Name?: string
      Command?: string[]
      Secrets?: Array<{ Name?: string; ValueFrom?: unknown }>
    }>
    const pg = containers.find((c) => c.Name === "pgbouncer")
    expect(pg).toBeDefined()

    // The edoburu entrypoint reads DATABASE_URLS (plural, comma-separated)
    // and writes BOTH credentials into userlist.txt. ADR-0010 role split:
    // app_owner serves api (pg-boss needs master), app_user serves web +
    // admin (RLS bites).
    const cmd = pg?.Command?.[0] ?? ""
    expect(cmd).toContain("DATABASE_URLS=")
    expect(cmd).toContain("${DB_OWNER_USER}")
    expect(cmd).toContain("${DB_OWNER_PASSWORD}")
    expect(cmd).toContain("${DB_USER_USER}")
    expect(cmd).toContain("${DB_USER_PASSWORD}")
    // Same RDS host:port:db for both upstream URLs (one pool, one endpoint).
    const urlMatches = cmd.match(/postgres:\/\/[^,"]+/g) ?? []
    expect(urlMatches.length).toBe(2)
    for (const url of urlMatches) {
      expect(url).toContain("${DB_HOST}")
      expect(url).toContain("${DB_PORT}")
      expect(url).toContain("${DB_NAME}")
    }

    // Both credential pairs must reach the container as secrets, not env.
    const secretNames = (pg?.Secrets ?? []).map((s) => s.Name)
    expect(secretNames).toContain("DB_OWNER_USER")
    expect(secretNames).toContain("DB_OWNER_PASSWORD")
    expect(secretNames).toContain("DB_USER_USER")
    expect(secretNames).toContain("DB_USER_PASSWORD")
  })

  it("web + admin authenticate to pgbouncer via the app_user secret; api stays on app_owner", () => {
    // Different upstream Secrets Manager ARNs MUST flow into each container.
    // The exact ARN values aren't asserted (CDK references are CFN tokens
    // resolved at synth time) — we assert that web + admin point at the
    // SAME source ARN, and that ARN is DIFFERENT from api's source ARN.
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = (taskDef?.Properties?.ContainerDefinitions ??
      []) as Array<{
      Name?: string
      Secrets?: Array<{ Name?: string; ValueFrom?: unknown }>
    }>
    type SecretRef = { Name?: string; ValueFrom?: unknown }
    type ContainerWithSecrets = { Name?: string; Secrets?: SecretRef[] }
    const byName: Record<string, ContainerWithSecrets | undefined> =
      Object.fromEntries(containers.map((c) => [c.Name ?? "", c]))

    // Helper: extract the secret-resource portion of a ValueFrom Fn::Join
    // (the CDK token shape is { "Fn::Join": [":", [arnPrefix, secretArnLogicalRef, ...]] }).
    // We stringify the whole structure and compare; structural equality is
    // enough because EcsSecret.fromSecretsManager produces the SAME shape
    // for the same source Secret.
    const dbUserValueFrom = (name: string): string => {
      const c = byName[name]
      const secret = (c?.Secrets ?? []).find(
        (s: SecretRef) => s.Name === "DB_USER",
      )
      return JSON.stringify(secret?.ValueFrom ?? null)
    }
    const dbPasswordValueFrom = (name: string): string => {
      const c = byName[name]
      const secret = (c?.Secrets ?? []).find(
        (s: SecretRef) => s.Name === "DB_PASSWORD",
      )
      return JSON.stringify(secret?.ValueFrom ?? null)
    }

    // web + admin reference the SAME secret (appUserSecret).
    expect(dbUserValueFrom("web")).toBe(dbUserValueFrom("admin"))
    expect(dbPasswordValueFrom("web")).toBe(dbPasswordValueFrom("admin"))
    // api references a DIFFERENT secret (databaseSecret / app_owner) so
    // pg-boss + DATABASE_DIRECT_URL keep their master-grade connection.
    expect(dbUserValueFrom("api")).not.toBe(dbUserValueFrom("web"))
    expect(dbPasswordValueFrom("api")).not.toBe(dbPasswordValueFrom("web"))
  })

  it("pgbouncer relies on image-owned /etc/pgbouncer (no scratch volume, no /etc mount)", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | {
          Properties?: {
            ContainerDefinitions?: unknown[]
            Volumes?: Array<{ Name?: string }>
          }
        }
      | undefined
    const volumes = taskDef?.Properties?.Volumes ?? []
    // The previous design mounted an empty ECS scratch volume named
    // "pgbouncerEtc" over /etc/pgbouncer; that re-owned the dir to root,
    // which forced user:"0" on the container, which then required CAP_SETGID
    // for pgbouncer's drop-privilege step — and Fargate refuses any
    // cap-add. The volume is now gone; the image's own /etc/pgbouncer
    // (postgres-owned) is used directly.
    expect(
      volumes.some((v: { Name?: string }) => v.Name === "pgbouncerEtc"),
    ).toBe(false)
    const containers = (taskDef?.Properties?.ContainerDefinitions ??
      []) as Array<{
      Name?: string
      MountPoints?: Array<{
        ContainerPath?: string
        SourceVolume?: string
        ReadOnly?: boolean
      }>
    }>
    const pg = containers.find((c) => c.Name === "pgbouncer")
    const etcMount = pg?.MountPoints?.find(
      (m) => m.ContainerPath === "/etc/pgbouncer",
    )
    expect(etcMount).toBeUndefined()
  })

  it("every container mounts the shared tmp volume at /tmp", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = (taskDef?.Properties?.ContainerDefinitions ??
      []) as Array<{
      Name?: string
      MountPoints?: Array<{
        ContainerPath?: string
        SourceVolume?: string
      }>
    }>
    expect(containers.length).toBe(9)
    for (const container of containers) {
      const tmpMount = container.MountPoints?.find(
        (m) => m.ContainerPath === "/tmp",
      )
      expect(tmpMount).toBeDefined()
      expect(tmpMount?.SourceVolume).toBe("tmp")
    }
  })
})

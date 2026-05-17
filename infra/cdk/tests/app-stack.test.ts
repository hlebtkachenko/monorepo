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

  it("all 7 containers drop ALL Linux capabilities", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = taskDef?.Properties?.ContainerDefinitions ?? []
    expect(containers.length).toBe(7)
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
    expect(envByName["EMAIL_FROM"]).toBe("no-reply@test.example.com")
    expect(envByName["EMAIL_TRANSPORT"]).toBe("resend")
    // Hard-coded loopback path to the pgBouncer sidecar — same pattern as api.
    expect(envByName["DB_HOST"]).toBe("localhost")
    expect(envByName["DB_PORT"]).toBe("6432")
    expect(envByName["DB_NAME"]).toBe("monorepo")
    // Secrets reach the container via Secrets Manager; the names match
    // what packages/auth + packages/email read.
    const secretNames = (web?.Secrets ?? []).map((s) => s.Name)
    expect(secretNames).toContain("BETTER_AUTH_SECRET")
    expect(secretNames).toContain("APP_TOKEN_SECRET")
    expect(secretNames).toContain("RESEND_API_KEY")
    expect(secretNames).toContain("DB_USER")
    expect(secretNames).toContain("DB_PASSWORD")
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
  })

  it("creates CDK-generated Better Auth + app token secrets", () => {
    // Two CDK-managed Secrets live in the AppStack itself:
    //   - monorepo-{env}-better-auth-secret (BetterAuthSecret construct)
    //   - monorepo-{env}-app-token-secret   (AppTokenSecret construct)
    // The Cloudflare Tunnel + Resend secrets are fromSecretNameV2 imports;
    // they don't materialize as CDK resources in this template.
    template.resourceCountIs("AWS::SecretsManager::Secret", 2)
    template.hasResourceProperties("AWS::SecretsManager::Secret", {
      Name: "monorepo-test-better-auth-secret",
    })
    template.hasResourceProperties("AWS::SecretsManager::Secret", {
      Name: "monorepo-test-app-token-secret",
    })
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
    expect(containers.length).toBe(7)
    for (const container of containers) {
      const tmpMount = container.MountPoints?.find(
        (m) => m.ContainerPath === "/tmp",
      )
      expect(tmpMount).toBeDefined()
      expect(tmpMount?.SourceVolume).toBe("tmp")
    }
  })
})

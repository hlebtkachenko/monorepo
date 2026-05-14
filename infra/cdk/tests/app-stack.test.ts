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

  it("all 6 containers drop ALL Linux capabilities", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = taskDef?.Properties?.ContainerDefinitions ?? []
    expect(containers.length).toBe(6)
    for (const container of containers as Array<{
      LinuxParameters?: { Capabilities?: { Drop?: string[] } }
      Name?: string
    }>) {
      const drop = container.LinuxParameters?.Capabilities?.Drop ?? []
      expect(drop).toContain("ALL")
    }
  })

  it("api + cloudflared + pgbouncer + cerbos + openfga have readonlyRootFilesystem=true", () => {
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
    expect(byName["pgbouncer"]?.ReadonlyRootFilesystem).toBe(true)
    expect(byName["cerbos"]?.ReadonlyRootFilesystem).toBe(true)
    expect(byName["openfga"]?.ReadonlyRootFilesystem).toBe(true)
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

  it("pgbouncer has writable /etc/pgbouncer volume for generated config", () => {
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
    expect(
      volumes.some((v: { Name?: string }) => v.Name === "pgbouncerEtc"),
    ).toBe(true)
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
    expect(etcMount).toBeDefined()
    expect(etcMount?.SourceVolume).toBe("pgbouncerEtc")
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
    expect(containers.length).toBe(6)
    for (const container of containers) {
      const tmpMount = container.MountPoints?.find(
        (m) => m.ContainerPath === "/tmp",
      )
      expect(tmpMount).toBeDefined()
      expect(tmpMount?.SourceVolume).toBe("tmp")
    }
  })
})

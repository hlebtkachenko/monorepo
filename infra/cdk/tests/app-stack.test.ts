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

  it("all 4 containers drop ALL Linux capabilities", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | { Properties?: { ContainerDefinitions?: unknown[] } }
      | undefined
    const containers = taskDef?.Properties?.ContainerDefinitions ?? []
    expect(containers.length).toBe(4)
    for (const container of containers as Array<{
      LinuxParameters?: { Capabilities?: { Drop?: string[] } }
      Name?: string
    }>) {
      const drop = container.LinuxParameters?.Capabilities?.Drop ?? []
      expect(drop).toContain("ALL")
    }
  })

  it("api + cloudflared + pgbouncer have readonlyRootFilesystem=true", () => {
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
    // These three settings break tenant isolation if regressed (ADR-0012 amendment).
    expect(envByName["POOL_MODE"]).toBe("transaction")
    expect(envByName["SERVER_RESET_QUERY"]).toBe("")
    expect(envByName["AUTH_TYPE"]).toBe("scram-sha-256")
    // Listening on :6432 (not the image default :5432) + loopback only.
    expect(envByName["LISTEN_PORT"]).toBe("6432")
    expect(envByName["LISTEN_ADDR"]).toBe("127.0.0.1")
  })

  it("pgbouncer has writable /etc/pgbouncer volume for generated config", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const taskDef = Object.values(taskDefs)[0] as
      | {
          Properties?: { ContainerDefinitions?: unknown[] }
          Volumes?: Array<{ Name?: string }>
        }
      | undefined
    const volumes = taskDef?.Properties?.Volumes ?? []
    expect(volumes.some((v) => v.Name === "pgbouncerEtc")).toBe(true)
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
    expect(containers.length).toBe(4)
    for (const container of containers) {
      const tmpMount = container.MountPoints?.find(
        (m) => m.ContainerPath === "/tmp",
      )
      expect(tmpMount).toBeDefined()
      expect(tmpMount?.SourceVolume).toBe("tmp")
    }
  })
})

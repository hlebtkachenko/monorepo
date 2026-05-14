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
    }>
    const api = containers.find((c) => c.Name === "api")
    const envByName = Object.fromEntries(
      (api?.Environment ?? []).map((e) => [e.Name, e.Value]),
    )
    expect(envByName["DATABASE_HOST"]).toBe("localhost")
    expect(envByName["DATABASE_PORT"]).toBe("6432")
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

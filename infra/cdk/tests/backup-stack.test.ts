import { Match, Template } from "aws-cdk-lib/assertions"
import { describe, expect, it } from "vitest"
import { buildTestApp } from "./helper.js"

describe("BackupStack", () => {
  const { backup } = buildTestApp()
  const template = Template.fromStack(backup)

  it("creates a backup S3 bucket with versioning + BlockPublicAccess", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      VersioningConfiguration: { Status: "Enabled" },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    })
  })

  it("backup bucket lifecycle tiers IA -> Glacier -> DeepArchive", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      LifecycleConfiguration: Match.objectLike({
        Rules: Match.arrayWith([
          Match.objectLike({
            Transitions: Match.arrayWith([
              Match.objectLike({
                StorageClass: "STANDARD_IA",
                TransitionInDays: 30,
              }),
              Match.objectLike({
                StorageClass: "GLACIER",
                TransitionInDays: 90,
              }),
              Match.objectLike({
                StorageClass: "DEEP_ARCHIVE",
                TransitionInDays: 365,
              }),
            ]),
          }),
        ]),
      }),
    })
  })

  it("creates a Fargate task definition for the backup job", () => {
    template.hasResourceProperties("AWS::ECS::TaskDefinition", {
      RequiresCompatibilities: Match.arrayWith(["FARGATE"]),
      Cpu: "512",
      Memory: "1024",
      RuntimePlatform: Match.objectLike({
        CpuArchitecture: "ARM64",
        OperatingSystemFamily: "LINUX",
      }),
    })
  })

  it("creates an EventBridge rule scheduled at 03:00 UTC", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      Name: "monorepo-test-backup-daily",
      ScheduleExpression: "cron(0 3 * * ? *)",
    })
  })

  it("grants the task role S3 PUT on the backup bucket", () => {
    const policies = template.findResources("AWS::IAM::Policy")
    let foundPut = false
    for (const policy of Object.values(policies) as Array<{
      Properties?: { PolicyDocument?: { Statement?: unknown[] } }
    }>) {
      const stmts = policy.Properties?.PolicyDocument?.Statement ?? []
      for (const stmt of stmts as Array<{
        Action?: string | string[]
        Effect?: string
      }>) {
        if (stmt.Effect !== "Allow") continue
        const actions = Array.isArray(stmt.Action)
          ? stmt.Action
          : stmt.Action
            ? [stmt.Action]
            : []
        if (actions.some((a) => a === "s3:PutObject")) {
          foundPut = true
        }
      }
    }
    expect(foundPut).toBe(true)
  })

  it("backup task container hardening: capDrop ALL + readonlyRootFilesystem", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const defs = Object.values(taskDefs) as Array<{
      Properties?: { ContainerDefinitions?: unknown[] }
    }>
    expect(defs.length).toBeGreaterThan(0)
    let hardened = false
    for (const def of defs) {
      for (const container of def.Properties?.ContainerDefinitions ?? []) {
        const c = container as {
          Name?: string
          ReadonlyRootFilesystem?: boolean
          LinuxParameters?: { Capabilities?: { Drop?: string[] } }
        }
        if (c.Name !== "backup") continue
        expect(c.ReadonlyRootFilesystem).toBe(true)
        expect(c.LinuxParameters?.Capabilities?.Drop).toEqual(["ALL"])
        hardened = true
      }
    }
    expect(hardened).toBe(true)
  })
})

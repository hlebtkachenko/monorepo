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

  it("backup task container hardening: capDrop ALL + readonlyRootFilesystem + /tmp mount", () => {
    const taskDefs = template.findResources("AWS::ECS::TaskDefinition")
    const defs = Object.values(taskDefs) as Array<{
      Properties?: {
        ContainerDefinitions?: unknown[]
        Volumes?: Array<{ Name?: string }>
      }
    }>
    expect(defs.length).toBeGreaterThan(0)
    let hardened = false
    for (const def of defs) {
      const volumes = def.Properties?.Volumes ?? []
      expect(volumes.some((v) => v.Name === "tmp")).toBe(true)
      for (const container of def.Properties?.ContainerDefinitions ?? []) {
        const c = container as {
          Name?: string
          ReadonlyRootFilesystem?: boolean
          LinuxParameters?: { Capabilities?: { Drop?: string[] } }
          MountPoints?: Array<{
            ContainerPath?: string
            SourceVolume?: string
            ReadOnly?: boolean
          }>
        }
        if (c.Name !== "backup") continue
        expect(c.ReadonlyRootFilesystem).toBe(true)
        expect(c.LinuxParameters?.Capabilities?.Drop).toEqual(["ALL"])
        const tmpMount = c.MountPoints?.find((m) => m.ContainerPath === "/tmp")
        expect(tmpMount).toBeDefined()
        expect(tmpMount?.SourceVolume).toBe("tmp")
        hardened = true
      }
    }
    expect(hardened).toBe(true)
  })

  it("backup bucket has SSE + enforceSSL applied", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketEncryption: Match.objectLike({
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
            ServerSideEncryptionByDefault: Match.objectLike({
              SSEAlgorithm: "AES256",
            }),
          }),
        ]),
      }),
    })
    // enforceSSL renders as a bucket policy with a deny statement on
    // aws:SecureTransport=false. Assert by inspecting bucket policies.
    const policies = template.findResources("AWS::S3::BucketPolicy")
    const denied = Object.values(policies).some((policy) => {
      const stmts =
        (
          policy as {
            Properties?: { PolicyDocument?: { Statement?: unknown[] } }
          }
        ).Properties?.PolicyDocument?.Statement ?? []
      return (stmts as Array<{ Effect?: string; Condition?: unknown }>).some(
        (s) =>
          s.Effect === "Deny" &&
          JSON.stringify(s.Condition ?? {}).includes("aws:SecureTransport"),
      )
    })
    expect(denied).toBe(true)
  })

  it("task role policy contains no s3:DeleteObject* (audit retention)", () => {
    const policies = template.findResources("AWS::IAM::Policy")
    for (const policy of Object.values(policies) as Array<{
      Properties?: { PolicyDocument?: { Statement?: unknown[] } }
    }>) {
      const stmts = policy.Properties?.PolicyDocument?.Statement ?? []
      for (const stmt of stmts as Array<{ Action?: string | string[] }>) {
        const actions = Array.isArray(stmt.Action)
          ? stmt.Action
          : stmt.Action
            ? [stmt.Action]
            : []
        for (const action of actions) {
          // No statement on the task role should grant Delete on S3.
          // The lifecycle policy is the only path that removes objects.
          expect(action).not.toMatch(/^s3:DeleteObject/i)
        }
      }
    }
  })

  it("publishes stack outputs for the monthly drill workflow", () => {
    template.hasOutput("BackupTaskDefinitionArn", {})
    template.hasOutput("BackupClusterName", {})
    template.hasOutput("BackupBucketName", {})
  })
})

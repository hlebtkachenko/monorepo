import { Template } from "aws-cdk-lib/assertions"
import { describe, expect, it } from "vitest"
import { buildTestApp } from "./helper.js"

describe("ObservabilityStack", () => {
  const { observability } = buildTestApp()
  const template = Template.fromStack(observability)

  it("does NOT subscribe an email directly to BillingTopic (workflow-managed)", () => {
    // PII guard: the operator email address must NOT appear in the CFN
    // template. The deploy workflow subscribes the address out-of-band
    // via `aws sns subscribe --protocol email`. Any AWS::SNS::Subscription
    // with Protocol=email in this template would re-introduce the leak.
    template.resourceCountIs("AWS::SNS::Subscription", 0)
  })

  it("exports the BillingTopic ARN so the workflow can subscribe the email out-of-band", () => {
    template.hasOutput("BillingTopicArn", {})
  })

  it("has the 5 attack-vector alarms", () => {
    // fargate-network-out-high was removed with Container Insights (AFF cost
    // review 2026-05-31); the DataTransfer cost budget guards egress now.
    const expectedNames = [
      "monorepo-test-rds-network-out-high",
      "monorepo-test-s3-put-rate-high",
      "monorepo-test-s3-bucket-size-high",
      "monorepo-test-cwlogs-ingest-high",
      "monorepo-test-ecr-pull-anomaly",
    ]
    for (const name of expectedNames) {
      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmName: name,
      })
    }
    // The removed alarm must be gone.
    const all = template.findResources("AWS::CloudWatch::Alarm")
    const names = Object.values(all).map(
      (a) =>
        (a as { Properties?: { AlarmName?: string } }).Properties?.AlarmName,
    )
    expect(names).not.toContain("monorepo-test-fargate-network-out-high")
  })

  it("has the 2 manual Fargate critical alarms wired to 2 SNS topics", () => {
    const alarms = template.findResources("AWS::CloudWatch::Alarm")
    const cpu = Object.values(alarms).find(
      (a) =>
        (a as { Properties?: { AlarmName?: string } }).Properties?.AlarmName ===
        "monorepo-test-fargate-cpu-critical",
    ) as { Properties?: { AlarmActions?: unknown[] } } | undefined
    const mem = Object.values(alarms).find(
      (a) =>
        (a as { Properties?: { AlarmName?: string } }).Properties?.AlarmName ===
        "monorepo-test-fargate-memory-critical",
    ) as { Properties?: { AlarmActions?: unknown[] } } | undefined

    expect(cpu?.Properties?.AlarmActions?.length).toBe(2)
    expect(mem?.Properties?.AlarmActions?.length).toBe(2)
  })

  it("has the vault-ssm-sync-stale liveness alarm on the Monorepo/VaultSync metric, SNS-only", () => {
    // Fires when the VPS secret-mirror loop stops emitting SyncSuccess for
    // 15 min. SNS only (1 action) — a dead sync must not trip the
    // kill-switch and stop a running service.
    const alarms = template.findResources("AWS::CloudWatch::Alarm")
    const stale = Object.values(alarms).find(
      (a) =>
        (a as { Properties?: { AlarmName?: string } }).Properties?.AlarmName ===
        "monorepo-test-vault-ssm-sync-stale",
    ) as
      | {
          Properties?: {
            Namespace?: string
            MetricName?: string
            TreatMissingData?: string
            AlarmActions?: unknown[]
          }
        }
      | undefined

    expect(stale?.Properties?.Namespace).toBe("Monorepo/VaultSync")
    expect(stale?.Properties?.MetricName).toBe("SyncSuccess")
    expect(stale?.Properties?.TreatMissingData).toBe("breaching")
    expect(stale?.Properties?.AlarmActions?.length).toBe(1)
  })

  it("has at least 7 alarms total (5 attack + 2 critical + monitoring facade)", () => {
    const all = template.findResources("AWS::CloudWatch::Alarm")
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(7)
  })

  it("leaves no alarm without an AlarmAction (every alarm must notify someone)", () => {
    // Found live 2026-06-11: the facade-generated Warning/Critical alarms
    // (Service-CPU/Memory-Warning, Postgres-CPU-*, Postgres FreeStorage)
    // rendered with NO AlarmActions — billed $0.10/mo each, never paged.
    // The facade's alarmFactoryDefaults.action (SnsAlarmActionStrategy →
    // BillingTopic) fixes that; this invariant keeps any future alarm —
    // facade or manual — from shipping actionless.
    const all = template.findResources("AWS::CloudWatch::Alarm")
    for (const [logicalId, alarm] of Object.entries(all)) {
      const props = (
        alarm as {
          Properties?: { AlarmName?: string; AlarmActions?: unknown[] }
        }
      ).Properties
      expect(
        props?.AlarmActions?.length ?? 0,
        `${props?.AlarmName ?? logicalId} has no AlarmActions`,
      ).toBeGreaterThanOrEqual(1)
    }
  })

  it("wires the facade-generated warning alarms to the BillingTopic", () => {
    const all = template.findResources("AWS::CloudWatch::Alarm")
    const facadeAlarms = Object.values(all).filter((a) => {
      const name = (a as { Properties?: { AlarmName?: string } }).Properties
        ?.AlarmName
      // Facade names use TitleCase segments (e.g. monorepo-test-Service-CPU-Usage-Warning),
      // manual alarms are all-lowercase.
      return name?.startsWith("monorepo-test-") && /[A-Z]/.test(name.slice(14))
    }) as { Properties?: { AlarmActions?: { Ref?: string }[] } }[]

    // monitorSimpleFargateService (CPU+Memory Warning) + monitorRdsInstance
    // (CPU Warning+Critical, FreeStorage Warning) = 5 facade alarms.
    expect(facadeAlarms.length).toBe(5)
    for (const alarm of facadeAlarms) {
      const actions = alarm.Properties?.AlarmActions ?? []
      expect(actions.length).toBe(1)
      expect(actions[0]?.Ref).toMatch(/^BillingTopic/)
    }
  })
})

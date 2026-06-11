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
    // Composite-input alarms are the documented exception: the backup-freshness
    // stale-metric + db-running probe carry no direct action — they feed the
    // `-backup-freshness-stale` CompositeAlarm, which carries the action. The
    // composite pages; gating it on the db-running probe stops a cold-paused
    // env (RDS stopped) from false-paging.
    const COMPOSITE_INPUTS = new Set([
      "monorepo-test-backup-freshness-stale-metric",
      "monorepo-test-db-running-probe",
    ])
    const all = template.findResources("AWS::CloudWatch::Alarm")
    for (const [logicalId, alarm] of Object.entries(all)) {
      const props = (
        alarm as {
          Properties?: { AlarmName?: string; AlarmActions?: unknown[] }
        }
      ).Properties
      if (props?.AlarmName && COMPOSITE_INPUTS.has(props.AlarmName)) continue
      expect(
        props?.AlarmActions?.length ?? 0,
        `${props?.AlarmName ?? logicalId} has no AlarmActions`,
      ).toBeGreaterThanOrEqual(1)
    }
    // The composite itself must still notify.
    const composites = template.findResources("AWS::CloudWatch::CompositeAlarm")
    for (const [logicalId, alarm] of Object.entries(composites)) {
      const props = (
        alarm as {
          Properties?: { AlarmName?: string; AlarmActions?: unknown[] }
        }
      ).Properties
      expect(
        props?.AlarmActions?.length ?? 0,
        `${props?.AlarmName ?? logicalId} composite has no AlarmActions`,
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

  it("has the app-health + power-aware backup-freshness alarms (OBS-06 + INF-11)", () => {
    for (const name of [
      "monorepo-test-rds-connections-high",
      "monorepo-test-web-server-errors-high",
      "monorepo-test-api-server-errors-high",
    ]) {
      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmName: name,
      })
    }
    // Backup freshness is power-aware (INF-11): the stale-metric child still
    // treats MISSING data as breaching (a silent pipeline emits no log events
    // at all), but it only pages when ANDed with the db-running probe in a
    // composite alarm — so a deliberately cold-paused env (RDS stopped, no
    // backups by design) does not false-page.
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      AlarmName: "monorepo-test-backup-freshness-stale-metric",
      TreatMissingData: "breaching",
      ComparisonOperator: "LessThanThreshold",
    })
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      AlarmName: "monorepo-test-db-running-probe",
      TreatMissingData: "notBreaching",
    })
    template.hasResourceProperties("AWS::CloudWatch::CompositeAlarm", {
      AlarmName: "monorepo-test-backup-freshness-stale",
    })
  })

  it("cwlogs-ingest sums all 7 service log groups (INF-8)", () => {
    const alarms = template.findResources("AWS::CloudWatch::Alarm")
    const ingest = Object.values(alarms).find(
      (a) =>
        (a as { Properties?: { AlarmName?: string } }).Properties?.AlarmName ===
        "monorepo-test-cwlogs-ingest-high",
    ) as { Properties?: { Metrics?: unknown[] } } | undefined
    const serialized = JSON.stringify(ingest?.Properties?.Metrics ?? [])
    expect(serialized).toContain(
      "web + api + tunnel + admin + pgbouncer + cerbos + openfga",
    )
  })

  it("ecr-pull-anomaly includes the admin repo (INF-9)", () => {
    const alarms = template.findResources("AWS::CloudWatch::Alarm")
    const pulls = Object.values(alarms).find(
      (a) =>
        (a as { Properties?: { AlarmName?: string } }).Properties?.AlarmName ===
        "monorepo-test-ecr-pull-anomaly",
    ) as { Properties?: { Metrics?: unknown[] } } | undefined
    const serialized = JSON.stringify(pulls?.Properties?.Metrics ?? [])
    expect(serialized).toContain("web + api + admin")
  })

  it("ECS task-stopped EventBridge rule filters to crash reasons only (OBS-06a)", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      Name: "monorepo-test-ecs-task-stopped",
      EventPattern: {
        source: ["aws.ecs"],
        "detail-type": ["ECS Task State Change"],
        detail: {
          lastStatus: ["STOPPED"],
          stoppedReason: [
            { prefix: "Essential container" },
            { prefix: "Task failed container health checks" },
          ],
        },
      },
    })
  })

  it("creates the 2 server-error metric filters (OBS-06c)", () => {
    template.resourceCountIs("AWS::Logs::MetricFilter", 2)
  })
})

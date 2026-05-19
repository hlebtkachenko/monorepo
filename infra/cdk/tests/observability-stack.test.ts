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

  it("has the 6 attack-vector alarms", () => {
    const expectedNames = [
      "monorepo-test-fargate-network-out-high",
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

  it("has at least 8 alarms total (6 attack + 2 critical + monitoring facade)", () => {
    const all = template.findResources("AWS::CloudWatch::Alarm")
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(8)
  })
})

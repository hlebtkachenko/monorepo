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

  it("has at least 7 alarms total (5 attack + 2 critical + monitoring facade)", () => {
    const all = template.findResources("AWS::CloudWatch::Alarm")
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(7)
  })
})

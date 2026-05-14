import { Template } from "aws-cdk-lib/assertions"
import { describe, it } from "vitest"
import { buildTestApp, TEST_ALERT_EMAIL } from "./helper.js"

describe("BillingAlarmsStack", () => {
  const { billingAlarms } = buildTestApp()
  const template = Template.fromStack(billingAlarms)

  it("has $40 warning and $80 critical alarms", () => {
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      AlarmName: "monorepo-test-billing-warning-40usd",
      Threshold: 40,
    })
    template.hasResourceProperties("AWS::CloudWatch::Alarm", {
      AlarmName: "monorepo-test-billing-critical-80usd",
      Threshold: 80,
    })
  })

  it("subscribes the alert email to the regional billing topic", () => {
    template.hasResourceProperties("AWS::SNS::Subscription", {
      Protocol: "email",
      Endpoint: TEST_ALERT_EMAIL,
    })
  })
})

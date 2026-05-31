import { App } from "aws-cdk-lib"
import { Match, Template } from "aws-cdk-lib/assertions"
import { describe, it } from "vitest"
import { AuditStack } from "../lib/audit-stack.js"
import { TEST_ACCOUNT, TEST_REGION } from "./helper.js"

describe("AuditStack (account-global)", () => {
  const app = new App()
  const stack = new AuditStack(app, "Audit", {
    env: { account: TEST_ACCOUNT, region: TEST_REGION },
  })
  const template = Template.fromStack(stack)

  it("creates exactly one CloudTrail trail with file validation + management events", () => {
    template.resourceCountIs("AWS::CloudTrail::Trail", 1)
    template.hasResourceProperties("AWS::CloudTrail::Trail", {
      TrailName: "monorepo-account-management",
      EnableLogFileValidation: true,
      IsMultiRegionTrail: false,
      IncludeGlobalServiceEvents: true,
    })
  })

  it("audit bucket blocks public access + has a 90-day lifecycle", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      LifecycleConfiguration: Match.objectLike({
        Rules: Match.arrayWith([Match.objectLike({ ExpirationInDays: 90 })]),
      }),
    })
  })

  it("retains the audit bucket on stack delete", () => {
    template.hasResource("AWS::S3::Bucket", {
      DeletionPolicy: "Retain",
    })
  })
})

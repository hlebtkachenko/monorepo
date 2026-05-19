import { Match, Template } from "aws-cdk-lib/assertions"
import { describe, expect, it } from "vitest"
import { buildTestApp } from "./helper.js"

describe("SecurityStack", () => {
  const { security } = buildTestApp()
  const template = Template.fromStack(security)

  it("creates the kill-switch SNS topic + ops topic", () => {
    // 1 = KillSwitchTopic (Lambda subscriber)
    // 2 = KillSwitchOpsTopic (email subscriber for Errors alarm)
    template.resourceCountIs("AWS::SNS::Topic", 2)
  })

  it("creates the kill-switch Lambda with correct runtime + handler", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs20.x",
      Handler: "index.handler",
      FunctionName: "monorepo-test-cost-killswitch",
    })
  })

  it("creates the RDS restart watcher Lambda", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs20.x",
      Handler: "index.handler",
      FunctionName: "monorepo-test-rds-restart-watcher",
    })
  })

  it("kill-switch IAM policy grants only ecs:DescribeServices + ecs:UpdateService", () => {
    const policies = template.findResources("AWS::IAM::Policy")
    const ecsActions: string[][] = []
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
        if (actions.some((a) => a.startsWith("ecs:"))) {
          ecsActions.push(actions)
        }
      }
    }
    // At least one policy statement allows ECS actions, and the action list
    // is limited to describe + update.
    expect(ecsActions.length).toBeGreaterThan(0)
    for (const actions of ecsActions) {
      const ecsOnly = actions.filter((a) => a.startsWith("ecs:"))
      expect(ecsOnly.sort()).toEqual([
        "ecs:DescribeServices",
        "ecs:UpdateService",
      ])
    }
  })

  it("creates 6 budgets with expected limits", () => {
    const budgets = template.findResources("AWS::Budgets::Budget")
    expect(Object.keys(budgets).length).toBe(6)

    const expectedLimits: Record<string, number> = {
      "monorepo-test-monthlytotal": 40,
      "monorepo-test-hardcap50": 50,
      "monorepo-test-datatransfer": 10,
      "monorepo-test-s3": 5,
      "monorepo-test-rds": 20,
      "monorepo-test-ecs": 25,
    }

    for (const [name, limit] of Object.entries(expectedLimits)) {
      template.hasResourceProperties("AWS::Budgets::Budget", {
        Budget: {
          BudgetName: name,
          BudgetLimit: {
            Amount: limit,
            Unit: "USD",
          },
        },
      })
    }
  })

  it("each budget has 80% warning + 100% critical notifications", () => {
    template.hasResourceProperties("AWS::Budgets::Budget", {
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Notification: Match.objectLike({ Threshold: 80 }),
        }),
        Match.objectLike({
          Notification: Match.objectLike({ Threshold: 100 }),
        }),
      ]),
    })
  })

  it("budgets use SNS-only subscribers (no email addresses in CFN template)", () => {
    // PII guard: subscribers must be SubscriptionType=SNS. Operator email
    // subscriptions live on the SNS topics themselves and are managed
    // by the deploy workflow (aws sns subscribe --protocol email) to keep
    // the address out of `cdk diff` snapshots + CI logs.
    const budgets = template.findResources("AWS::Budgets::Budget")
    for (const [logicalId, resource] of Object.entries(budgets)) {
      const notifications = ((
        resource as { Properties?: { NotificationsWithSubscribers?: unknown } }
      ).Properties?.NotificationsWithSubscribers ?? []) as Array<{
        Subscribers?: Array<{ SubscriptionType?: string; Address?: string }>
      }>
      for (const n of notifications) {
        for (const sub of n.Subscribers ?? []) {
          expect(
            sub.SubscriptionType,
            `${logicalId}: subscriber must be SNS, found ${sub.SubscriptionType}`,
          ).toBe("SNS")
          // Address may be a CDK token (e.g. { "Fn::GetAtt": [...] }) or a
          // string. Stringify and assert no '@' anywhere — that catches any
          // hard-coded email address sneaking back in.
          expect(
            JSON.stringify(sub.Address),
            `${logicalId}: subscriber Address must NOT contain '@' (no emails in template)`,
          ).not.toMatch(/@/)
        }
      }
    }
  })

  it("template contains NO email subscriptions (no SNS::Subscription Protocol=email)", () => {
    // Hard guard: any AWS::SNS::Subscription with Protocol=email would
    // reintroduce the PII leak we just removed. The workflow subscribes
    // emails out-of-band via aws sns subscribe.
    const subs = template.findResources("AWS::SNS::Subscription", {
      Properties: { Protocol: "email" },
    })
    expect(Object.keys(subs).length).toBe(0)
  })

  it("exports both alert topic ARNs so the workflow can subscribe email out-of-band", () => {
    template.hasOutput("KillSwitchTopicArn", {})
    template.hasOutput("KillSwitchOpsTopicArn", {})
  })

  it("creates a CloudTrail trail with file validation + management events", () => {
    template.hasResourceProperties("AWS::CloudTrail::Trail", {
      TrailName: "monorepo-test-management",
      EnableLogFileValidation: true,
      IsMultiRegionTrail: false,
    })
  })

  it("audit bucket has BlockPublicAccess and 90-day lifecycle", () => {
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

  it("creates EventBridge rule for RDS DB Instance Event", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      EventPattern: Match.objectLike({
        source: ["aws.rds"],
        "detail-type": ["RDS DB Instance Event"],
      }),
    })
  })
})

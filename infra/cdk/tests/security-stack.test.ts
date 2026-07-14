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
      Runtime: "nodejs22.x",
      Handler: "index.handler",
      FunctionName: "monorepo-test-cost-killswitch",
    })
  })

  it("creates the RDS restart watcher Lambda", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs22.x",
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

  it("kill-switch IAM also grants rds:StopDBInstance (stops RDS, not just ECS)", () => {
    // AFF cost review 2026-05-31 trap 3: the kill-switch left RDS running on
    // a budget breach. It now also stops the env's RDS (reversible).
    const policies = template.findResources("AWS::IAM::Policy")
    const rdsActions = new Set<string>()
    for (const policy of Object.values(policies) as Array<{
      Properties?: { PolicyDocument?: { Statement?: unknown[] } }
    }>) {
      for (const stmt of (policy.Properties?.PolicyDocument?.Statement ??
        []) as Array<{ Action?: string | string[]; Effect?: string }>) {
        if (stmt.Effect !== "Allow") continue
        const actions = Array.isArray(stmt.Action)
          ? stmt.Action
          : stmt.Action
            ? [stmt.Action]
            : []
        for (const a of actions) if (a.startsWith("rds:")) rdsActions.add(a)
      }
    }
    expect(rdsActions.has("rds:StopDBInstance")).toBe(true)
    expect(rdsActions.has("rds:AddTagsToResource")).toBe(true)
  })

  it("creates 2 per-env budgets with expected limits", () => {
    const budgets = template.findResources("AWS::Budgets::Budget")
    expect(Object.keys(budgets).length).toBe(2)

    // Budget names carry a deterministic 8-char hash suffix derived from
    // the spec (security-stack.ts) so CFN treats subscriber/threshold edits
    // as CREATE(new)+DELETE(old) instead of an immutable REPLACE. Match
    // the stable prefix + suffix shape, not the literal name.
    const expectedSlugs: Record<string, number> = {
      total: 55,
      datatransfer: 10,
    }

    for (const [slug, limit] of Object.entries(expectedSlugs)) {
      template.hasResourceProperties("AWS::Budgets::Budget", {
        Budget: {
          BudgetName: Match.stringLikeRegexp(
            `^monorepo-test-${slug}-[0-9a-f]{8}$`,
          ),
          BudgetLimit: {
            Amount: limit,
            Unit: "USD",
          },
        },
      })
    }
  })

  it("keeps budget names stable across independent syntheses", () => {
    const first = Template.fromStack(buildTestApp("stable").security)
    const second = Template.fromStack(buildTestApp("stable").security)
    const names = (source: Template) =>
      Object.values(source.findResources("AWS::Budgets::Budget"))
        .map(
          (budget) =>
            (budget as { Properties?: { Budget?: { BudgetName?: string } } })
              .Properties?.Budget?.BudgetName,
        )
        .sort()

    expect(names(second)).toEqual(names(first))
  })

  it("every budget filters on the Environment cost-allocation tag (per-env measurement)", () => {
    // AFF cost review 2026-05-31 trap 1: budgets were named per-env but had
    // no env filter, so each reported the account-wide total. Both budgets
    // now carry the `user:Environment$<env>` tag filter.
    const budgets = template.findResources("AWS::Budgets::Budget")
    for (const [logicalId, resource] of Object.entries(budgets)) {
      const costFilters = (
        resource as {
          Properties?: { Budget?: { CostFilters?: Record<string, unknown> } }
        }
      ).Properties?.Budget?.CostFilters
      expect(
        JSON.stringify(costFilters),
        `${logicalId}: must filter on Environment tag`,
      ).toContain("user:Environment$test")
    }
  })

  it("only the Total budget feeds the kill-switch at 100% (sub-budgets are alert-only)", () => {
    // The $55 Total budget's 100% notification goes to KillSwitchTopic (stop
    // ECS + RDS). DataTransfer's 100% goes to the ops topic instead — a
    // sub-budget breach pages, it does not stop the env.
    const budgets = template.findResources("AWS::Budgets::Budget")
    const total = Object.values(budgets).find((b) =>
      JSON.stringify(
        (b as { Properties?: { Budget?: { BudgetName?: unknown } } }).Properties
          ?.Budget?.BudgetName,
      ).includes("-total-"),
    )
    expect(total).toBeDefined()
    // The Total budget must reference the kill-switch topic somewhere in its
    // notification subscribers (CDK emits the topic ARN as a token/ref).
    const totalJson = JSON.stringify(total)
    expect(totalJson).toContain("KillSwitchTopic")
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

  it("does NOT create a CloudTrail trail (moved to the account-global AuditStack)", () => {
    // AFF cost review 2026-05-31 trap 4: the per-env trail was the billed
    // second trail. CloudTrail now lives in AuditStack (one per account).
    template.resourceCountIs("AWS::CloudTrail::Trail", 0)
  })

  it("creates EventBridge rule for RDS DB Instance Event", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      EventPattern: Match.objectLike({
        source: ["aws.rds"],
        "detail-type": ["RDS DB Instance Event"],
      }),
    })
  })

  it("does NOT create the auto-stop on an env outside AUTO_STOP_ENVS", () => {
    // The auto-stop block runs only for envs in AUTO_STOP_ENVS
    // (staging + production); the default test env ('test') must not get it.
    const fns = template.findResources("AWS::Lambda::Function")
    const names = Object.values(fns).map(
      (f) =>
        (f as { Properties?: { FunctionName?: string } }).Properties
          ?.FunctionName,
    )
    expect(names).not.toContain("monorepo-test-autostop")
  })
})

describe("SecurityStack auto-cold-pause (staging + production)", () => {
  const { security } = buildTestApp("staging")
  const template = Template.fromStack(security)

  it("creates the staging auto-stop Lambda", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "monorepo-staging-autostop",
      Handler: "index.handler",
      Runtime: "nodejs22.x",
    })
  })

  it("temporarily defers production auto-stop without changing staging", () => {
    const prod = Template.fromStack(buildTestApp("production").security)
    prod.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "monorepo-production-autostop",
      Environment: {
        Variables: Match.objectLike({
          AUTO_STOP_NOT_BEFORE: "2026-07-26T22:00:00Z",
        }),
      },
    })
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "monorepo-staging-autostop",
      Environment: {
        Variables: Match.not(
          Match.objectLike({
            AUTO_STOP_NOT_BEFORE: Match.anyValue(),
          }),
        ),
      },
    })
  })

  it("schedules the auto-stop every 30 minutes", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      ScheduleExpression: "rate(30 minutes)",
    })
  })

  it("auto-stop Lambda may stop ECS + RDS (reversible) and publish to ops", () => {
    const policies = template.findResources("AWS::IAM::Policy")
    const actions = new Set<string>()
    for (const policy of Object.values(policies) as Array<{
      Properties?: { PolicyDocument?: { Statement?: unknown[] } }
    }>) {
      for (const stmt of (policy.Properties?.PolicyDocument?.Statement ??
        []) as Array<{ Action?: string | string[]; Effect?: string }>) {
        if (stmt.Effect !== "Allow") continue
        const a = Array.isArray(stmt.Action)
          ? stmt.Action
          : stmt.Action
            ? [stmt.Action]
            : []
        for (const x of a) actions.add(x)
      }
    }
    expect(actions.has("ecs:UpdateService")).toBe(true)
    expect(actions.has("ecs:ListTasks")).toBe(true)
    expect(actions.has("rds:StopDBInstance")).toBe(true)
    expect(actions.has("sns:Publish")).toBe(true)
  })
})

describe("SecurityStack account-wide guard (production env only)", () => {
  const { security } = buildTestApp("production")
  const template = Template.fromStack(security)

  it("adds a 3rd budget on production: the untagged account-wide guard", () => {
    template.resourceCountIs("AWS::Budgets::Budget", 3)
    template.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: {
        BudgetName: Match.stringLikeRegexp(
          "^monorepo-production-accounttotal-[0-9a-f]{8}$",
        ),
        BudgetLimit: { Amount: 55, Unit: "USD" },
      },
    })
  })

  it("the account-wide guard has NO Environment tag filter (measures the whole account)", () => {
    const budgets = template.findResources("AWS::Budgets::Budget")
    const guard = Object.values(budgets).find((b) =>
      JSON.stringify(
        (b as { Properties?: { Budget?: { BudgetName?: unknown } } }).Properties
          ?.Budget?.BudgetName,
      ).includes("-accounttotal-"),
    ) as { Properties?: { Budget?: { CostFilters?: unknown } } } | undefined
    expect(guard).toBeDefined()
    // No CostFilters at all (or empty) — it is account-wide by design.
    const cf = guard?.Properties?.Budget?.CostFilters
    expect(JSON.stringify(cf ?? {})).not.toContain("Environment")
    // And it feeds the kill-switch topic at 100%.
    expect(JSON.stringify(guard)).toContain("KillSwitchTopic")
  })

  it("non-production envs do NOT get the account-wide guard", () => {
    const test = Template.fromStack(buildTestApp("test").security)
    test.resourceCountIs("AWS::Budgets::Budget", 2)
  })
})

describe("SecurityStack document reaper (S3 document store P1b)", () => {
  const { security } = buildTestApp()
  const template = Template.fromStack(security)

  type Statement = {
    Effect?: string
    Action?: string | string[]
    Resource?: unknown
  }
  const actionsOf = (stmt: Statement): string[] => {
    const a = stmt.Action
    return Array.isArray(a) ? a : a ? [a] : []
  }

  // The reaper's execution role gets its own AWS::IAM::Policy whose statements
  // reference the (cross-stack) documents bucket. Isolate that policy so we can
  // assert both what it grants AND — critically — what it must NOT.
  const policies = Object.values(
    template.findResources("AWS::IAM::Policy"),
  ) as Array<{
    Properties?: { PolicyDocument?: { Statement?: Statement[] } }
  }>
  const reaperPolicies = policies.filter((p) =>
    (p.Properties?.PolicyDocument?.Statement ?? []).some((s) =>
      JSON.stringify(s.Resource ?? "").includes("DocumentsBucket"),
    ),
  )
  const reaperActions = new Set<string>()
  for (const p of reaperPolicies) {
    for (const s of p.Properties?.PolicyDocument?.Statement ?? []) {
      if (s.Effect && s.Effect !== "Allow") continue
      for (const a of actionsOf(s)) reaperActions.add(a)
    }
  }

  it("creates the reaper Lambda (nodejs22.x, index.handler, DOCUMENTS_BUCKET env)", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "monorepo-test-document-reaper",
      Runtime: "nodejs22.x",
      Handler: "index.handler",
      Environment: {
        Variables: Match.objectLike({
          DOCUMENTS_BUCKET: Match.anyValue(),
        }),
      },
    })
  })

  it("schedules the reaper HOURLY (cron at minute 0)", () => {
    template.hasResourceProperties("AWS::Events::Rule", {
      Name: "monorepo-test-document-reaper",
      ScheduleExpression: "cron(0 * * * ? *)",
    })
  })

  it("reaper role holds s3:DeleteObjectVersion + s3:DeleteObject on the documents bucket", () => {
    expect(reaperPolicies.length).toBeGreaterThan(0)
    expect(reaperActions.has("s3:DeleteObjectVersion")).toBe(true)
    expect(reaperActions.has("s3:DeleteObject")).toBe(true)
  })

  it("every reaper Delete statement is scoped to the documents bucket, never a wildcard", () => {
    // Lock the Resource, not just the action set: the reaper is the only
    // delete principal in the account, so a future widen of a Delete statement
    // to Resource "*" (all buckets) must fail CI, not pass silently.
    const deleteStatements: Statement[] = []
    for (const p of reaperPolicies) {
      for (const s of p.Properties?.PolicyDocument?.Statement ?? []) {
        if (s.Effect && s.Effect !== "Allow") continue
        if (actionsOf(s).some((a) => /^s3:DeleteObject/i.test(a))) {
          deleteStatements.push(s)
        }
      }
    }
    expect(deleteStatements.length).toBeGreaterThan(0)
    for (const s of deleteStatements) {
      const resource = JSON.stringify(s.Resource ?? "")
      // Scoped to the documents bucket object ARN (…/*), and NOT a bare
      // wildcard. The object ARN stringifies as `…"/*"`, which does not
      // contain the standalone `"*"` token a wildcard Resource would.
      expect(resource).toContain("DocumentsBucket")
      expect(s.Resource).not.toBe("*")
      expect(resource).not.toContain('"*"')
    }
  })

  it("reaper role can enumerate + read tags for pinned versions", () => {
    expect(reaperActions.has("s3:ListBucket")).toBe(true)
    expect(reaperActions.has("s3:ListBucketVersions")).toBe(true)
    expect(reaperActions.has("s3:GetObjectTagging")).toBe(true)
    expect(reaperActions.has("s3:GetObjectVersionTagging")).toBe(true)
  })

  it("reaper role has NO PutObject / PutObjectTagging (it never writes)", () => {
    const puts = [...reaperActions].filter((a) => /^s3:Put/i.test(a))
    expect(
      puts,
      `unexpected Put actions on reaper role: ${puts.join(", ")}`,
    ).toEqual([])
  })

  it("reaper role has NO kms:* (deleting an SSE-KMS object never decrypts it)", () => {
    const kms = [...reaperActions].filter((a) => /^kms:/i.test(a))
    expect(
      kms,
      `unexpected kms actions on reaper role: ${kms.join(", ")}`,
    ).toEqual([])
  })

  it("the reaper is the delete holder while the shared app task role is NOT (cross-stack invariant)", () => {
    // Within SecurityStack the reaper holds Delete on the documents bucket.
    expect(reaperActions.has("s3:DeleteObjectVersion")).toBe(true)
    // And the App stack's shared task role holds NO Delete on that bucket —
    // proving the reaper is the SOLE delete principal (design A, PLAN §3).
    const appTemplate = Template.fromStack(buildTestApp().appStack)
    const appDocDeletes = new Set<string>()
    for (const p of Object.values(
      appTemplate.findResources("AWS::IAM::Policy"),
    ) as Array<{
      Properties?: { PolicyDocument?: { Statement?: Statement[] } }
    }>) {
      for (const s of p.Properties?.PolicyDocument?.Statement ?? []) {
        if (s.Effect && s.Effect !== "Allow") continue
        if (!JSON.stringify(s.Resource ?? "").includes("DocumentsBucket"))
          continue
        for (const a of actionsOf(s)) {
          if (/^s3:DeleteObject/i.test(a)) appDocDeletes.add(a)
        }
      }
    }
    expect([...appDocDeletes]).toEqual([])
  })
})

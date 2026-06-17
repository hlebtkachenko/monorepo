import { createHash } from "node:crypto"
import * as path from "node:path"
import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib"
import { CfnBudget } from "aws-cdk-lib/aws-budgets"
import {
  Alarm,
  ComparisonOperator,
  Metric,
  TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch"
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions"
import { Rule, Schedule } from "aws-cdk-lib/aws-events"
import { LambdaFunction as LambdaTarget } from "aws-cdk-lib/aws-events-targets"
import { Effect, PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam"
import {
  Code,
  Function as LambdaFunction,
  Runtime,
} from "aws-cdk-lib/aws-lambda"
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs"
import { Topic } from "aws-cdk-lib/aws-sns"
import { LambdaSubscription } from "aws-cdk-lib/aws-sns-subscriptions"
import { Queue } from "aws-cdk-lib/aws-sqs"
import type { Construct } from "constructs"
import type { AppStack } from "./app-stack.js"
import type { DataStack } from "./data-stack.js"

export interface SecurityStackProps extends StackProps {
  readonly envName: string
  readonly appStack: AppStack
  readonly dataStack: DataStack
}

// Operator email subscriptions to the alert SNS topics are managed by the
// deploy workflow (aws sns subscribe with ::add-mask:: on the value), NOT
// from CDK. Putting the address into the CfnBudget / SNS Subscription
// template renders it as plaintext in the CFN template that any account
// reader (cdk diff, GetTemplate) can fetch. PII out of templates =
// out of GH Action logs, out of `cdk diff` snapshots, out of cross-acct
// audit logs that surface the change set.

interface BudgetSpec {
  readonly id: string
  readonly limitUsd: number
  readonly costFilters?: Record<string, string[]>
  // When true, the 100% notification publishes to the kill-switch topic
  // (stops this env's ECS + RDS). When false/undefined, 100% is email-only
  // — a service sub-budget breaching must NOT stop the env on its own.
  readonly killSwitch?: boolean
}

/**
 * SecurityStack owns the cost kill-switch:
 *
 *   killSwitchTopic (SNS) ─► killSwitchFn (Lambda) ─► ecs:UpdateService(0)
 *
 * The 5 critical+attack-vector alarms in ObservabilityStack publish to this
 * topic (in addition to BillingTopic for email). AWS Budgets Actions
 * (commit 4) also publish here for budget-driven cost cap.
 *
 * Lambda permissions are scoped to the single ECS service/cluster pair -
 * no wildcards. Re-enable manually: `aws ecs update-service --desired-count 1`.
 * See docs/runbooks/COST-INCIDENT.md.
 */
export class SecurityStack extends Stack {
  readonly killSwitchTopic: Topic
  readonly killSwitchOpsTopic: Topic
  readonly killSwitchFn: LambdaFunction

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props)

    this.killSwitchTopic = new Topic(this, "KillSwitchTopic", {
      displayName: `monorepo-${props.envName} cost kill-switch`,
    })

    const killSwitchLogGroup = new LogGroup(this, "KillSwitchLogs", {
      logGroupName: `/aws/lambda/monorepo-${props.envName}-cost-killswitch`,
      retention: RetentionDays.ONE_MONTH,
    })

    // Allowlist of CW alarm names that may trigger ECS stop. Mirrors the
    // alarmName fields in observability-stack.ts; keep this list in sync
    // when adding or renaming alarms. Substring matching used to be the
    // handler default — exact-match via env-injected allowlist closes a
    // name-collision risk.
    const killSwitchAlarmNames = [
      `monorepo-${props.envName}-fargate-cpu-critical`,
      `monorepo-${props.envName}-fargate-memory-critical`,
      // fargate-network-out-high removed with Container Insights (AFF cost
      // review 2026-05-31) — its metric no longer publishes. Egress runaway
      // is capped by the DataTransfer + Total cost budgets instead.
      `monorepo-${props.envName}-s3-put-rate-high`,
      `monorepo-${props.envName}-cwlogs-ingest-high`,
    ]

    this.killSwitchFn = new LambdaFunction(this, "KillSwitchFn", {
      functionName: `monorepo-${props.envName}-cost-killswitch`,
      runtime: Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: Code.fromAsset(path.join(__dirname, "lambda", "killswitch")),
      timeout: Duration.seconds(30),
      memorySize: 256,
      // Concurrency is intentionally NOT reserved. AWS holds an account-
      // wide floor of 10 unreserved executions; any reservation > 0
      // drops the unreserved pool below 10 on a fresh account and CFN
      // rejects with "decreases UnreservedConcurrentExecution below its
      // minimum value of [10]" — see ADR-0016 Amendment (2026-05-17).
      // Correctness still holds: the handler is idempotent (desiredCount=0
      // is a no-op the second time), the SNS subscription has a DLQ, and
      // KillSwitchErrorsAlarm pages on failure. Restore the reservation
      // when an account quota increase makes a measured race worth
      // re-pinning.
      logGroup: killSwitchLogGroup,
      environment: {
        CLUSTER_NAME: props.appStack.cluster.clusterName,
        SERVICE_NAME: props.appStack.service.serviceName,
        EXPECTED_TOPIC_ARN: this.killSwitchTopic.topicArn,
        KILL_SWITCH_ALARM_NAMES: killSwitchAlarmNames.join(","),
        // The kill-switch stops RDS in addition to ECS (AFF cost review
        // 2026-05-31, trap 3). Optional: when unset the handler stops ECS
        // only and skips the RDS step.
        RDS_INSTANCE_IDENTIFIER: props.dataStack.database.instanceIdentifier,
      },
      description:
        "Sets ECS desiredCount=0 on receipt of an alarm or budget action SNS message",
    })

    const clusterArn = `arn:aws:ecs:${this.region}:${this.account}:cluster/${props.appStack.cluster.clusterName}`
    const serviceArn = `arn:aws:ecs:${this.region}:${this.account}:service/${props.appStack.cluster.clusterName}/${props.appStack.service.serviceName}`

    this.killSwitchFn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ecs:DescribeServices", "ecs:UpdateService"],
        resources: [serviceArn],
        conditions: {
          ArnEquals: {
            "ecs:cluster": clusterArn,
          },
        },
      }),
    )

    // The kill-switch also stops RDS, not just ECS (AFF cost review
    // 2026-05-31, trap 3 — the old kill-switch left ~$16/mo/env of RDS
    // running on a budget breach). Stopping the DB is fully reversible
    // (`aws rds start-db-instance`), so it is safe to automate. Tagging
    // cost-stop-requested=true hands off to the RdsRestartWatcher below,
    // which re-stops the instance after AWS's ~7-day forced restart.
    // DescribeDBInstances has no resource-level form (must be "*");
    // StopDBInstance + AddTagsToResource are scoped to this env's single DB.
    const killSwitchDbArn = `arn:aws:rds:${this.region}:${this.account}:db:${props.dataStack.database.instanceIdentifier}`
    this.killSwitchFn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["rds:DescribeDBInstances"],
        resources: ["*"],
      }),
    )
    this.killSwitchFn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["rds:StopDBInstance", "rds:AddTagsToResource"],
        resources: [killSwitchDbArn],
      }),
    )

    // Dead-letter queue for messages the Lambda fails to process even
    // after retries. Without a DLQ a failing handler silently drops
    // alarms, which is exactly the alarm-on-the-alarm-handler bug we
    // need to avoid for cost runaway.
    const killSwitchDlq = new Queue(this, "KillSwitchDlq", {
      queueName: `monorepo-${props.envName}-cost-killswitch-dlq`,
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    })

    this.killSwitchTopic.addSubscription(
      new LambdaSubscription(this.killSwitchFn, {
        deadLetterQueue: killSwitchDlq,
      }),
    )

    // Dedicated ops topic for ALL operator-facing email alerts:
    //   - kill-switch Lambda failures (via KillSwitchErrorsAlarm below)
    //   - every AWS Budget threshold breach (via the SNS subscribers on the
    //     CfnBudget blocks further down; both 80% and 100% notify here)
    //
    // Why not subscribe budgets to killSwitchTopic itself? That topic's
    // only Lambda subscriber kills the ECS service on receipt, and the
    // Lambda's allowlist rejects unrecognized alarm names — so a budget
    // breach delivered there would be logged as "unknown-alarm" and
    // dropped instead of stopping spend. Ops topic stays alert-only.
    //
    // The email subscription itself is managed OUT-OF-BAND by the deploy
    // workflow (aws sns subscribe --protocol email, with ::add-mask:: on
    // the address). Keeping the address out of CDK keeps it out of the
    // CFN template, out of `cdk diff` output, and out of CI logs.
    this.killSwitchOpsTopic = new Topic(this, "KillSwitchOpsTopic", {
      displayName: `monorepo-${props.envName} ops alerts`,
    })

    // Allow AWS Budgets in this account to publish to the ops topic too.
    // Mirrors the killSwitchTopic grant below — both topics receive
    // budget notifications (ops gets every threshold; kill-switch gets
    // 100% only).
    this.killSwitchOpsTopic.addToResourcePolicy(
      new PolicyStatement({
        sid: "AllowBudgetsToPublishOps",
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal("budgets.amazonaws.com")],
        actions: ["sns:Publish"],
        resources: [this.killSwitchOpsTopic.topicArn],
        conditions: {
          StringEquals: { "aws:SourceAccount": this.account },
        },
      }),
    )

    // Errors alarm on the killswitch Lambda itself. If the killswitch
    // throws or times out, the operator gets paged on the ops topic
    // (which has an email subscriber) instead of the alarm fire
    // disappearing silently.
    const killSwitchErrorsAlarm = new Alarm(this, "KillSwitchErrorsAlarm", {
      alarmName: `monorepo-${props.envName}-cost-killswitch-errors`,
      alarmDescription:
        "Cost kill-switch Lambda failed; manual ECS stop may be required.",
      metric: new Metric({
        namespace: "AWS/Lambda",
        metricName: "Errors",
        dimensionsMap: {
          FunctionName: this.killSwitchFn.functionName,
        },
        period: Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })
    killSwitchErrorsAlarm.addAlarmAction(new SnsAction(this.killSwitchOpsTopic))

    // Allow AWS Budgets in this account to publish breach notifications to
    // the kill-switch topic. Scoped with aws:SourceAccount so a different
    // account's Budget service cannot publish here. CloudWatch alarm
    // SnsAction grants are added automatically by CDK when alarms subscribe.
    //
    // Earlier revisions added a DenyExternalPublish statement keyed on
    // aws:PrincipalAccount. That key is not populated for service
    // principals, so the Deny fired against legit CloudWatch + Budgets
    // publishes (missing-key + StringNotEquals = condition true => deny).
    // Default SNS topic policy already requires explicit Allow grants
    // for non-owner principals, so the Deny was redundant.
    this.killSwitchTopic.addToResourcePolicy(
      new PolicyStatement({
        sid: "AllowBudgetsToPublish",
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal("budgets.amazonaws.com")],
        actions: ["sns:Publish"],
        resources: [this.killSwitchTopic.topicArn],
        conditions: {
          StringEquals: {
            "aws:SourceAccount": this.account,
          },
        },
      }),
    )

    // ----- AWS Budgets (per-env, tag-filtered) -----
    //
    // AFF cost review 2026-05-31 fixed two defects here:
    //
    //   Trap 1 — the old budgets were NAMED per-env but carried no env cost
    //   filter, so `monorepo-staging-*` and `monorepo-production-*` both
    //   reported the SAME account-wide total. Every budget below now filters
    //   on the `Environment` cost-allocation tag (applied to every resource
    //   in bin/app.ts: `Tags.of(app).add("Environment", env)`), so each env's
    //   budgets measure ONLY that env's spend.
    //
    //   Trap 2 — the kill-switch fired at $40, below the ~$46/mo it costs to
    //   run a single env at zero clients, so it stopped production every
    //   month. The Total cap is now $55, above the steady-state floor with
    //   headroom for ~10 clients, below a runaway.
    //
    // PREREQUISITE (manual, one-time): the `Environment` tag must be ACTIVATED
    // as a cost-allocation tag in Billing → Cost allocation tags before these
    // filters resolve to real spend (AWS takes ~24h to backfill). Until then
    // a tag-filtered budget reads $0 and will NOT cap. Activate the tag first;
    // see docs/runbooks/STAGING.md + AWS-SETUP.md.
    //
    // Two budgets per env:
    //   - Total       $55, killSwitch=true. 80% → ops email; 100% → stop
    //                 this env's ECS + RDS. This is the dollar cap.
    //   - DataTransfer $10, alert-only. Guards egress runaway (it replaces
    //                 the removed Container-Insights fargate-egress alarm).
    //
    // First 2 budgets per account are free; beyond that ~$0.02/day each.
    //
    // NOTE: AWS Budgets Actions (auto-attach IAM-deny, RUN_SSM_DOCUMENTS,
    // APPLY_SCP) are intentionally deferred. They require an execution role
    // with high blast-radius permissions; first-7-day requiresApproval mode
    // is also an operational lift. The SNS->Lambda->stop path is the cap.
    const envTagFilter = { TagKeyValue: [`user:Environment$${props.envName}`] }
    const budgets: BudgetSpec[] = [
      {
        id: "Total",
        limitUsd: 55,
        killSwitch: true,
        costFilters: envTagFilter,
      },
      {
        id: "DataTransfer",
        limitUsd: 10,
        costFilters: {
          ...envTagFilter,
          Service: ["AWS Data Transfer"],
        },
      },
    ]

    // Production also carries an account-WIDE guard: an untagged $55 total
    // that caps the whole account (no Environment filter), strictly tighter
    // than the sum of the per-env caps. It feeds the kill-switch — production
    // is the always-on env, so an account-wide overrun stops production.
    // Lives on production only (staging is ephemeral / auto-stopped). This
    // codifies the CLI stop-gap budget `monorepo-account-total-guard-temp`
    // created during the AFF cost review 2026-05-31, replacing the drift with
    // a managed resource. Delete the CLI budget once this has deployed.
    if (props.envName === "production") {
      budgets.push({ id: "AccountTotal", limitUsd: 55, killSwitch: true })
    }

    for (const spec of budgets) {
      const notificationsWithSubscribers = [
        // 80% threshold: ops topic only (email out-of-band).
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 80,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [
            {
              subscriptionType: "SNS",
              address: this.killSwitchOpsTopic.topicArn,
            },
          ],
        },
        // 100% threshold. For the Total budget (killSwitch=true) this goes
        // to the kill-switch topic → stop ECS + RDS. For alert-only budgets
        // (DataTransfer) it goes to the ops topic instead — a sub-budget
        // breach must page, not stop the env. AWS Budgets caps subscribers
        // per notification at 1 SNS + 10 EMAIL, so exactly one SNS address
        // here (verified deploy run 26127290021). For the kill-switch path,
        // operator visibility on 100% is preserved via three other paths:
        //   1. ECS desiredCount drops 1→0 when kill-switch fires →
        //      CloudWatch alarm on RunningCount → email via BillingTopic.
        //   2. killSwitchErrorsAlarm fires email on ops topic if the
        //      kill-switch Lambda itself errors (so a silent failure of
        //      the kill-switch handler still pages).
        //   3. 80% threshold (above) already publishes to ops topic, so
        //      a runaway budget surfaces in the operator inbox before
        //      it reaches 100%.
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 100,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [
            {
              subscriptionType: "SNS",
              address: spec.killSwitch
                ? this.killSwitchTopic.topicArn
                : this.killSwitchOpsTopic.topicArn,
            },
          ],
        },
      ]
      // Deterministic 8-char suffix derived from the cost filters +
      // notifications shape. AWS::Budgets is immutable on most attributes
      // (subscriber adds, threshold changes, costFilter edits) and any
      // such change forces a REPLACE that fails because the old budget
      // name still exists. By baking the spec into the budget name we get
      // CFN to CREATE(new) + DELETE(old) cleanly on any meaningful change,
      // and noop-rename otherwise. Lets us delete the 200-line REPLACE
      // migration block from the deploy workflow.
      const suffix = createHash("sha256")
        .update(
          JSON.stringify({
            costFilters: spec.costFilters,
            notifications: notificationsWithSubscribers,
            limitUsd: spec.limitUsd,
          }),
        )
        .digest("hex")
        .slice(0, 8)
      new CfnBudget(this, `Budget${spec.id}`, {
        budget: {
          budgetName: `monorepo-${props.envName}-${spec.id.toLowerCase()}-${suffix}`,
          budgetType: "COST",
          timeUnit: "MONTHLY",
          budgetLimit: {
            amount: spec.limitUsd,
            unit: "USD",
          },
          costFilters: spec.costFilters,
          costTypes: {
            includeCredit: false,
            includeRefund: false,
            includeDiscount: true,
            includeSubscription: true,
            includeOtherSubscription: true,
            includeSupport: true,
            includeTax: true,
            includeUpfront: true,
            useAmortized: false,
            useBlended: false,
          },
        },
        notificationsWithSubscribers,
      })
    }

    // Stack outputs so the deploy workflow can subscribe the operator
    // email to both alert topics out-of-band (aws sns subscribe --protocol
    // email). Keeping the email out of CDK keeps it out of the template +
    // CI logs. Workflow looks these up via `aws cloudformation describe-stacks`.
    new CfnOutput(this, "KillSwitchTopicArn", {
      value: this.killSwitchTopic.topicArn,
      description:
        "SNS topic for the cost kill-switch. Lambda subscriber stops ECS on receipt. Budget 100% breaches publish here.",
      exportName: `Security-${props.envName}-KillSwitchTopicArn`,
    })
    new CfnOutput(this, "KillSwitchOpsTopicArn", {
      value: this.killSwitchOpsTopic.topicArn,
      description:
        "SNS topic for operator email alerts (kill-switch Lambda failures, all budget threshold breaches). Email subscriber is workflow-managed.",
      exportName: `Security-${props.envName}-KillSwitchOpsTopicArn`,
    })

    // ----- CloudTrail -----
    //
    // MOVED to the account-global AuditStack (AFF cost review 2026-05-31,
    // trap 4). The first management-events trail in an account is free; a
    // per-env trail meant the second one billed. One account trail
    // (`cdk deploy Audit`) now covers every env. See lib/audit-stack.ts.

    // ----- RDS auto-restart watcher -----
    //
    // AWS forcibly starts a stopped RDS instance after ~7 days. When the
    // kill-switch or an operator intentionally stopped it (signaled via the
    // `cost-stop-requested=true` tag on the DB), this Lambda re-stops on
    // the start event. Without the tag, the Lambda no-ops.
    const dbInstanceId = props.dataStack.database.instanceIdentifier
    const dbArn = `arn:aws:rds:${this.region}:${this.account}:db:${dbInstanceId}`

    const rdsWatcherLogGroup = new LogGroup(this, "RdsRestartWatcherLogs", {
      logGroupName: `/aws/lambda/monorepo-${props.envName}-rds-restart-watcher`,
      retention: RetentionDays.ONE_MONTH,
    })

    const rdsRestartWatcherFn = new LambdaFunction(
      this,
      "RdsRestartWatcherFn",
      {
        functionName: `monorepo-${props.envName}-rds-restart-watcher`,
        runtime: Runtime.NODEJS_22_X,
        handler: "index.handler",
        code: Code.fromAsset(
          path.join(__dirname, "lambda", "rds-restart-watcher"),
        ),
        timeout: Duration.seconds(30),
        memorySize: 256,
        logGroup: rdsWatcherLogGroup,
        environment: {
          DB_INSTANCE_IDENTIFIER: dbInstanceId,
        },
        description:
          "Re-stops the RDS instance after AWS's 7-day forced restart when tagged cost-stop-requested=true",
      },
    )

    rdsRestartWatcherFn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["rds:DescribeDBInstances", "rds:ListTagsForResource"],
        resources: ["*"],
      }),
    )
    rdsRestartWatcherFn.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["rds:StopDBInstance"],
        resources: [dbArn],
      }),
    )

    new Rule(this, "RdsRestartRule", {
      ruleName: `monorepo-${props.envName}-rds-restart-watch`,
      description:
        "Trigger the RDS auto-restart watcher on any RDS DB Instance Event",
      eventPattern: {
        source: ["aws.rds"],
        detailType: ["RDS DB Instance Event"],
      },
      targets: [new LambdaTarget(rdsRestartWatcherFn)],
    })

    // ----- Env auto-cold-pause (max-uptime TTL) -----
    //
    // A 30-min EventBridge schedule COLD-pauses the env (ECS desiredCount=0 +
    // RDS stop + cost-stop-requested tag) once its oldest running task has been
    // up past MAX_UPTIME_HOURS (5h) — the backstop for "I'll shut it down
    // later" that never happens (AFF cost review 2026-05-31). It is a
    // max-uptime TTL, NOT request-level idle detection (traffic dies at
    // Cloudflare; ECS has no cheap request signal). A still-needed session is
    // just resumed via the Env Power workflow (one command). See
    // docs/runbooks/ENV-POWER.md.
    //
    // ┌─ PRODUCTION IS A PRE-v1 EXCEPTION. Prod has 0 paying users today, so
    // │  auto-cold-pausing it after 5h is acceptable cost control. WHEN v1
    // │  SHIPS AND REAL USERS ONBOARD, REMOVE "production" FROM AUTO_STOP_ENVS
    // │  BELOW — a mid-use 5h cold-start (~8 min) in a paying user's face is
    // │  unacceptable. Prod must then run 24/7, or on pre-scheduled closed
    // └─ windows (a fixed-hours cron Rule), never an uptime TTL.
    //    See docs/runbooks/ENV-POWER.md § "Production after v1".
    const AUTO_STOP_ENVS = ["staging", "production"]
    if (AUTO_STOP_ENVS.includes(props.envName)) {
      // SSM SecureString holding a Cloudflare API token (Zone:Read + Workers
      // Routes:Edit). Account-level, so one param is shared by both env stacks.
      // Populate it (Vault → SSM sync, or `aws ssm put-parameter`) to enable
      // the auto-pause sleeping-page binding; until then the lambda no-ops it.
      const cfRoutesTokenParamName = "/monorepo/shared/cloudflare-routes-token"

      const autoStopLogGroup = new LogGroup(this, "AutoStopLogs", {
        logGroupName: `/aws/lambda/monorepo-${props.envName}-autostop`,
        retention: RetentionDays.ONE_MONTH,
      })

      const autoStopFn = new LambdaFunction(this, "AutoStopFn", {
        functionName: `monorepo-${props.envName}-autostop`,
        runtime: Runtime.NODEJS_22_X,
        handler: "index.handler",
        code: Code.fromAsset(path.join(__dirname, "lambda", "autostop")),
        timeout: Duration.seconds(30),
        memorySize: 256,
        logGroup: autoStopLogGroup,
        environment: {
          CLUSTER_NAME: props.appStack.cluster.clusterName,
          SERVICE_NAME: props.appStack.service.serviceName,
          MAX_UPTIME_HOURS: "5",
          RDS_INSTANCE_IDENTIFIER: dbInstanceId,
          OPS_TOPIC_ARN: this.killSwitchOpsTopic.topicArn,
          // Bind the afframe-sleeping Worker on auto-pause (best-effort).
          // No-ops until the SSM token below is populated.
          ENV_NAME: props.envName,
          CF_ROUTES_TOKEN_PARAM: cfRoutesTokenParamName,
          CF_ZONE_NAME: "afframe.com",
          SLEEPING_SCRIPT_NAME: "afframe-sleeping",
        },
        description:
          "Cold-pauses the env (ECS desiredCount=0 + RDS) once its task exceeds the max-uptime TTL.",
      })

      // Scale-to-zero on this env's service only.
      autoStopFn.addToRolePolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["ecs:DescribeServices", "ecs:UpdateService"],
          resources: [serviceArn],
          conditions: { ArnEquals: { "ecs:cluster": clusterArn } },
        }),
      )
      // ListTasks/DescribeTasks (read task ages) — gated by the cluster
      // condition key; these actions have no useful ARN-level resource form.
      autoStopFn.addToRolePolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["ecs:ListTasks", "ecs:DescribeTasks"],
          resources: ["*"],
          conditions: { ArnEquals: { "ecs:cluster": clusterArn } },
        }),
      )
      // RDS stop — same scoped DB ARN the kill-switch + watcher use.
      autoStopFn.addToRolePolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["rds:DescribeDBInstances"],
          resources: ["*"],
        }),
      )
      autoStopFn.addToRolePolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["rds:StopDBInstance", "rds:AddTagsToResource"],
          resources: [dbArn],
        }),
      )
      // Read the Cloudflare routes token (SSM SecureString) to bind the
      // sleeping page on auto-pause. Scoped to the single param; kms:Decrypt is
      // gated to SSM-originated calls only.
      autoStopFn.addToRolePolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["ssm:GetParameter"],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter${cfRoutesTokenParamName}`,
          ],
        }),
      )
      autoStopFn.addToRolePolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["kms:Decrypt"],
          resources: ["*"],
          conditions: {
            StringEquals: {
              "kms:ViaService": `ssm.${this.region}.amazonaws.com`,
            },
          },
        }),
      )
      this.killSwitchOpsTopic.grantPublish(autoStopFn)

      new Rule(this, "AutoStopSchedule", {
        ruleName: `monorepo-${props.envName}-autostop`,
        description:
          "Every 30 min: cold-pause this env if its running task exceeds the uptime TTL",
        schedule: Schedule.rate(Duration.minutes(30)),
        targets: [new LambdaTarget(autoStopFn)],
      })
    }
  }
}

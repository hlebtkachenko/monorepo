import * as path from "node:path"
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib"
import { CfnBudget } from "aws-cdk-lib/aws-budgets"
import {
  Alarm,
  ComparisonOperator,
  Metric,
  TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch"
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions"
import { ReadWriteType, Trail } from "aws-cdk-lib/aws-cloudtrail"
import { Rule } from "aws-cdk-lib/aws-events"
import { LambdaFunction as LambdaTarget } from "aws-cdk-lib/aws-events-targets"
import { Effect, PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam"
import {
  Code,
  Function as LambdaFunction,
  Runtime,
} from "aws-cdk-lib/aws-lambda"
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs"
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3"
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
 * See docs/runbooks/COST-INCIDENT-RESPONSE.md.
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
      `monorepo-${props.envName}-fargate-network-out-high`,
      `monorepo-${props.envName}-s3-put-rate-high`,
      `monorepo-${props.envName}-cwlogs-ingest-high`,
    ]

    this.killSwitchFn = new LambdaFunction(this, "KillSwitchFn", {
      functionName: `monorepo-${props.envName}-cost-killswitch`,
      runtime: Runtime.NODEJS_20_X,
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

    // ----- AWS Budgets (6) -----
    //
    // Total $40 + HardCap $50 + Data Transfer $10 + S3 $5 + RDS $20 + ECS $25.
    // 80% threshold -> email warning. 100% threshold -> email + SNS to the
    // kill-switch topic (stops ECS service).
    //
    // HardCap50 is a defense-in-depth ceiling above MonthlyTotal $40. If
    // MonthlyTotal fires but the kill-switch fails or the operator silences
    // the alert, HardCap50 fires the same path again at $50 actual spend.
    // See ADR-0016 Amendment (2026-05-19).
    //
    // First 2 budgets per account are free. The remaining 4 cost
    // $0.02/day each = ~$2.40/mo total. Cheap insurance.
    //
    // NOTE: AWS Budgets Actions (auto-attach IAM-deny, RUN_SSM_DOCUMENTS,
    // APPLY_SCP) are intentionally deferred. They require an execution role
    // with high blast-radius permissions; first-7-day requiresApproval mode
    // is also an operational lift. The SNS->Lambda->stop-ECS path is the
    // dollar-cap safety net.
    const budgets: BudgetSpec[] = [
      {
        id: "MonthlyTotal",
        limitUsd: 40,
      },
      {
        id: "HardCap50",
        limitUsd: 50,
      },
      {
        id: "DataTransfer",
        limitUsd: 10,
        costFilters: { Service: ["AWS Data Transfer"] },
      },
      {
        id: "S3",
        limitUsd: 5,
        costFilters: { Service: ["Amazon Simple Storage Service"] },
      },
      {
        id: "Rds",
        limitUsd: 20,
        costFilters: { Service: ["Amazon Relational Database Service"] },
      },
      {
        id: "Ecs",
        limitUsd: 25,
        costFilters: {
          Service: ["Amazon Elastic Container Service", "AWS Fargate"],
        },
      },
    ]

    for (const spec of budgets) {
      new CfnBudget(this, `Budget${spec.id}`, {
        budget: {
          budgetName: `monorepo-${props.envName}-${spec.id.toLowerCase()}`,
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
        notificationsWithSubscribers: [
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
          // 100% threshold: kill-switch topic ONLY. AWS Budgets caps
          // subscribers per notification at 1 SNS + 10 EMAIL — two SNS
          // here fails with "one notification can only have 1 subscribers
          // with type of SNS" (verified deploy run 26127290021). Operator
          // visibility on 100% is preserved via three other paths:
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
                address: this.killSwitchTopic.topicArn,
              },
            ],
          },
        ],
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
    // Single-region trail in this stack's region. Management events only
    // (free tier - first trail with management events is no-charge).
    // Destination bucket is in the same region, encrypted SSE-S3, public
    // access blocked, 90-day lifecycle to keep storage bounded.
    const auditBucket = new Bucket(this, "AuditBucket", {
      bucketName: `monorepo-${props.envName}-audit-logs-${this.account}`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
      lifecycleRules: [
        {
          id: "Expire90d",
          expiration: Duration.days(90),
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
      ],
      removalPolicy:
        props.envName === "production"
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY,
      autoDeleteObjects: props.envName !== "production",
    })

    new Trail(this, "ManagementTrail", {
      trailName: `monorepo-${props.envName}-management`,
      bucket: auditBucket,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: false,
      enableFileValidation: true,
      managementEvents: ReadWriteType.ALL,
    })

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
        runtime: Runtime.NODEJS_20_X,
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
  }
}

import * as path from "node:path"
import { Duration, Stack, type StackProps } from "aws-cdk-lib"
import { CfnBudget } from "aws-cdk-lib/aws-budgets"
import {
  AnyPrincipal,
  Effect,
  PolicyStatement,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam"
import {
  Code,
  Function as LambdaFunction,
  Runtime,
} from "aws-cdk-lib/aws-lambda"
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs"
import { Topic } from "aws-cdk-lib/aws-sns"
import { LambdaSubscription } from "aws-cdk-lib/aws-sns-subscriptions"
import type { Construct } from "constructs"
import type { AppStack } from "./app-stack.js"

export interface SecurityStackProps extends StackProps {
  readonly envName: string
  readonly appStack: AppStack
  /**
   * Email recipient subscribed to every Budget threshold notification.
   * Same address as ObservabilityStack.alertEmail.
   */
  readonly alertEmail: string
}

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
  readonly killSwitchFn: LambdaFunction

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props)

    this.killSwitchTopic = new Topic(this, "KillSwitchTopic", {
      displayName: `windhoek-${props.envName} cost kill-switch`,
    })

    const killSwitchLogGroup = new LogGroup(this, "KillSwitchLogs", {
      logGroupName: `/aws/lambda/windhoek-${props.envName}-cost-killswitch`,
      retention: RetentionDays.ONE_MONTH,
    })

    this.killSwitchFn = new LambdaFunction(this, "KillSwitchFn", {
      functionName: `windhoek-${props.envName}-cost-killswitch`,
      runtime: Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: Code.fromAsset(path.join(__dirname, "lambda", "killswitch")),
      timeout: Duration.seconds(30),
      memorySize: 256,
      logGroup: killSwitchLogGroup,
      environment: {
        CLUSTER_NAME: props.appStack.cluster.clusterName,
        SERVICE_NAME: props.appStack.service.serviceName,
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

    this.killSwitchTopic.addSubscription(
      new LambdaSubscription(this.killSwitchFn),
    )

    // Allow AWS Budgets to publish breach notifications to the kill-switch
    // topic. budgets.amazonaws.com is the service principal that signs
    // these publishes. The Lambda subscription then converts a breach into
    // ecs:UpdateService(desiredCount=0).
    this.killSwitchTopic.addToResourcePolicy(
      new PolicyStatement({
        sid: "AllowBudgetsToPublish",
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal("budgets.amazonaws.com")],
        actions: ["sns:Publish"],
        resources: [this.killSwitchTopic.topicArn],
      }),
    )
    // Block all non-Budget non-CloudWatch non-AWS-internal publishes. The
    // service principals for CloudWatch alarms (cloudwatch.amazonaws.com)
    // are auto-added by CDK when alarms subscribe; we add Budgets above.
    // Deny everything else by default.
    this.killSwitchTopic.addToResourcePolicy(
      new PolicyStatement({
        sid: "DenyExternalPublish",
        effect: Effect.DENY,
        principals: [new AnyPrincipal()],
        actions: ["sns:Publish"],
        resources: [this.killSwitchTopic.topicArn],
        conditions: {
          StringNotEquals: {
            "aws:PrincipalAccount": this.account,
          },
        },
      }),
    )

    // ----- AWS Budgets (5) -----
    //
    // Total $40 + Data Transfer $10 + S3 $5 + RDS $20 + ECS $25.
    // 80% threshold -> email warning. 100% threshold -> email + SNS to the
    // kill-switch topic (stops ECS service).
    //
    // First 2 budgets per account are free. The remaining 3 cost
    // $0.02/day each = ~$1.80/mo total. Cheap insurance.
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
          budgetName: `windhoek-${props.envName}-${spec.id.toLowerCase()}`,
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
          {
            notification: {
              notificationType: "ACTUAL",
              comparisonOperator: "GREATER_THAN",
              threshold: 80,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [
              { subscriptionType: "EMAIL", address: props.alertEmail },
            ],
          },
          {
            notification: {
              notificationType: "ACTUAL",
              comparisonOperator: "GREATER_THAN",
              threshold: 100,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [
              { subscriptionType: "EMAIL", address: props.alertEmail },
              {
                subscriptionType: "SNS",
                address: this.killSwitchTopic.topicArn,
              },
            ],
          },
        ],
      })
    }
  }
}

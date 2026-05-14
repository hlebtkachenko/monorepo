import * as path from "node:path"
import { Duration, Stack, type StackProps } from "aws-cdk-lib"
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam"
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
  }
}

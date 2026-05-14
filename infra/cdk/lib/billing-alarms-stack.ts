import { Duration, Stack, type StackProps } from "aws-cdk-lib"
import { Alarm, ComparisonOperator, Metric } from "aws-cdk-lib/aws-cloudwatch"
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions"
import { Topic } from "aws-cdk-lib/aws-sns"
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions"
import type { Construct } from "constructs"

export interface BillingAlarmsStackProps extends StackProps {
  readonly envName: string
  readonly alertEmail: string
}

/**
 * AWS publishes the `EstimatedCharges` metric only to us-east-1, so any
 * alarm that reads it must live in us-east-1. This stack holds the two
 * billing-dollar alarms ($40 warning, $80 critical) plus a regional SNS
 * topic with email subscription. The main ObservabilityStack keeps a
 * separate eu-central-1 topic for ECS/RDS alarms.
 *
 * Email recipient must click the confirmation link AWS sends after the
 * first deploy before alerts arrive.
 */
export class BillingAlarmsStack extends Stack {
  readonly billingTopic: Topic

  constructor(scope: Construct, id: string, props: BillingAlarmsStackProps) {
    super(scope, id, props)

    this.billingTopic = new Topic(this, "BillingTopic", {
      displayName: `monorepo-${props.envName} billing-dollar alerts`,
    })

    this.billingTopic.addSubscription(new EmailSubscription(props.alertEmail))

    const billingMetric = new Metric({
      metricName: "EstimatedCharges",
      namespace: "AWS/Billing",
      statistic: "Maximum",
      dimensionsMap: { Currency: "USD" },
      period: Duration.hours(9),
    })

    const warning = new Alarm(this, "BillingWarning", {
      alarmName: `monorepo-${props.envName}-billing-warning-40usd`,
      alarmDescription:
        "Monthly estimated AWS charges reached $40 USD (Budget 1 warning threshold)",
      metric: billingMetric,
      threshold: 40,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    })
    warning.addAlarmAction(new SnsAction(this.billingTopic))

    const critical = new Alarm(this, "BillingCritical", {
      alarmName: `monorepo-${props.envName}-billing-critical-80usd`,
      alarmDescription:
        "Monthly estimated AWS charges reached $80 USD (Budget 1 critical threshold)",
      metric: billingMetric,
      threshold: 80,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    })
    critical.addAlarmAction(new SnsAction(this.billingTopic))
  }
}

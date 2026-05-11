import { Duration, Stack, type StackProps } from "aws-cdk-lib"
import { Alarm, ComparisonOperator, Metric } from "aws-cdk-lib/aws-cloudwatch"
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions"
import { Topic } from "aws-cdk-lib/aws-sns"
import { MonitoringFacade } from "cdk-monitoring-constructs"
import type { Construct } from "constructs"
import type { AppStack } from "./app-stack.js"
import type { DataStack } from "./data-stack.js"

export interface ObservabilityStackProps extends StackProps {
  readonly envName: string
  readonly appStack: AppStack
  readonly dataStack: DataStack
}

export class ObservabilityStack extends Stack {
  readonly billingTopic: Topic

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props)

    const monitoring = new MonitoringFacade(this, "MonitoringFacade", {
      alarmFactoryDefaults: {
        actionsEnabled: true,
        alarmNamePrefix: `windhoek-${props.envName}`,
      },
    })

    monitoring.monitorSimpleFargateService({
      fargateService: props.appStack.service,
      addCpuUsageAlarm: {
        Warning: { maxUsagePercent: 80 },
        Critical: { maxUsagePercent: 95 },
      },
      addMemoryUsageAlarm: {
        Warning: { maxUsagePercent: 80 },
        Critical: { maxUsagePercent: 95 },
      },
    })

    monitoring.monitorRdsInstance({
      instance: props.dataStack.database,
      addCpuUsageAlarm: {
        Warning: { maxUsagePercent: 80 },
        Critical: { maxUsagePercent: 95 },
      },
      addFreeStorageSpaceAlarm: {
        Warning: { minCount: 5_000_000_000 },
      },
    })

    this.billingTopic = new Topic(this, "BillingTopic", {
      displayName: `windhoek-${props.envName} billing alerts`,
    })

    const billingMetric = new Metric({
      metricName: "EstimatedCharges",
      namespace: "AWS/Billing",
      statistic: "Maximum",
      dimensionsMap: { Currency: "USD" },
      period: Duration.hours(9),
      region: "us-east-1",
    })

    const billingAlarm = new Alarm(this, "BillingAlarm", {
      alarmName: `windhoek-${props.envName}-billing-25usd`,
      alarmDescription: "Monthly estimated AWS charges reached $25 USD",
      metric: billingMetric,
      threshold: 25,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    })

    billingAlarm.addAlarmAction(new SnsAction(this.billingTopic))
  }
}

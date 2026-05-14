import { Stack, type StackProps } from "aws-cdk-lib"
import { Topic } from "aws-cdk-lib/aws-sns"
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions"
import { MonitoringFacade } from "cdk-monitoring-constructs"
import type { Construct } from "constructs"
import type { AppStack } from "./app-stack.js"
import type { DataStack } from "./data-stack.js"

export interface ObservabilityStackProps extends StackProps {
  readonly envName: string
  readonly appStack: AppStack
  readonly dataStack: DataStack
  /**
   * Email address that receives all CloudWatch alarm notifications produced
   * by this stack. Subscription is "Pending" until the recipient clicks the
   * AWS confirmation link after first deploy. See ADR 0016.
   */
  readonly alertEmail: string
}

/**
 * Regional alarms (ECS, RDS, CloudWatch Logs, ECR, S3) wired to a single
 * BillingTopic. Warning at 70% surfaces problems early enough to act; the
 * 95% Critical threshold leaves room for the SecurityStack kill-switch.
 *
 * Pure billing-dollar alarms ($40/$80) live in BillingAlarmsStack
 * (us-east-1, where AWS publishes EstimatedCharges).
 */
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
        Warning: { maxUsagePercent: 70 },
        Critical: { maxUsagePercent: 95 },
      },
      addMemoryUsageAlarm: {
        Warning: { maxUsagePercent: 70 },
        Critical: { maxUsagePercent: 95 },
      },
    })

    monitoring.monitorRdsInstance({
      instance: props.dataStack.database,
      addCpuUsageAlarm: {
        Warning: { maxUsagePercent: 70 },
        Critical: { maxUsagePercent: 95 },
      },
      addFreeStorageSpaceAlarm: {
        Warning: { minCount: 5_000_000_000 },
      },
    })

    this.billingTopic = new Topic(this, "BillingTopic", {
      displayName: `windhoek-${props.envName} regional alerts`,
    })

    this.billingTopic.addSubscription(new EmailSubscription(props.alertEmail))
  }
}

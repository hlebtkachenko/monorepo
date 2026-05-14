import { Duration, Stack, type StackProps } from "aws-cdk-lib"
import {
  Alarm,
  ComparisonOperator,
  MathExpression,
  Metric,
  Stats,
  TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch"
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions"
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
  /**
   * Kill-switch SNS topic from SecurityStack. The 5 critical alarms publish
   * to BOTH this topic (which fans out to the kill-switch Lambda) and the
   * regional BillingTopic (which fans out to email).
   */
  readonly killSwitchTopic: Topic
}

/**
 * Regional alarms (ECS, RDS, CloudWatch Logs, ECR, S3) wired to a single
 * BillingTopic. Warning at 70% surfaces problems early enough to act; the
 * 95% Critical threshold leaves room for the SecurityStack kill-switch.
 *
 * Pure billing-dollar alarms ($40/$80) live in BillingAlarmsStack
 * (us-east-1, where AWS publishes EstimatedCharges).
 *
 * Six attack-vector alarms cover cost-runaway signals: Fargate egress, RDS
 * egress, S3 PUT rate + bucket size, CloudWatch Logs ingestion, ECR pull
 * anomaly. See ADR 0016 for thresholds and rationale.
 */
export class ObservabilityStack extends Stack {
  readonly billingTopic: Topic
  readonly criticalAlarms: {
    readonly fargateCpu: Alarm
    readonly fargateMemory: Alarm
  }
  readonly attackVectorAlarms: {
    readonly fargateNetworkOut: Alarm
    readonly rdsNetworkOut: Alarm
    readonly s3PutRate: Alarm
    readonly s3BucketSize: Alarm
    readonly cwLogsIngest: Alarm
    readonly ecrPullAnomaly: Alarm
  }

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props)

    const monitoring = new MonitoringFacade(this, "MonitoringFacade", {
      alarmFactoryDefaults: {
        actionsEnabled: true,
        alarmNamePrefix: `monorepo-${props.envName}`,
      },
    })

    // Warning thresholds only via the facade; we own the Critical alarms
    // manually so SecurityStack can subscribe its kill-switch to them.
    monitoring.monitorSimpleFargateService({
      fargateService: props.appStack.service,
      addCpuUsageAlarm: {
        Warning: { maxUsagePercent: 70 },
      },
      addMemoryUsageAlarm: {
        Warning: { maxUsagePercent: 70 },
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
      displayName: `monorepo-${props.envName} regional alerts`,
    })

    this.billingTopic.addSubscription(new EmailSubscription(props.alertEmail))

    const snsAction = new SnsAction(this.billingTopic)
    const killSwitchAction = new SnsAction(props.killSwitchTopic)
    const clusterName = props.appStack.cluster.clusterName
    const serviceName = props.appStack.service.serviceName

    // Manual Fargate Critical alarms (95%). Each gets the kill-switch action
    // so SecurityStack stops the service on sustained breach. Email arrives
    // too (kill-switch Lambda also logs to CloudWatch for audit).
    const fargateCpuCritical = new Alarm(this, "FargateCpuCritical", {
      alarmName: `monorepo-${props.envName}-fargate-cpu-critical`,
      alarmDescription:
        "Fargate CPUUtilization >= 95% for 2x5min. Kill-switch stops the service.",
      metric: new Metric({
        namespace: "AWS/ECS",
        metricName: "CPUUtilization",
        dimensionsMap: {
          ClusterName: clusterName,
          ServiceName: serviceName,
        },
        statistic: Stats.AVERAGE,
        period: Duration.minutes(5),
      }),
      threshold: 95,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })
    fargateCpuCritical.addAlarmAction(snsAction)
    fargateCpuCritical.addAlarmAction(killSwitchAction)

    const fargateMemoryCritical = new Alarm(this, "FargateMemoryCritical", {
      alarmName: `monorepo-${props.envName}-fargate-memory-critical`,
      alarmDescription:
        "Fargate MemoryUtilization >= 95% for 2x5min. Kill-switch stops the service.",
      metric: new Metric({
        namespace: "AWS/ECS",
        metricName: "MemoryUtilization",
        dimensionsMap: {
          ClusterName: clusterName,
          ServiceName: serviceName,
        },
        statistic: Stats.AVERAGE,
        period: Duration.minutes(5),
      }),
      threshold: 95,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })
    fargateMemoryCritical.addAlarmAction(snsAction)
    fargateMemoryCritical.addAlarmAction(killSwitchAction)

    this.criticalAlarms = {
      fargateCpu: fargateCpuCritical,
      fargateMemory: fargateMemoryCritical,
    }

    // 1) Fargate egress: 5 GB sustained over 1h. Container Insights v2
    // publishes per-service network bytes to ECS/ContainerInsights.
    const fargateNetworkOut = new Alarm(this, "FargateNetworkOutHigh", {
      alarmName: `monorepo-${props.envName}-fargate-network-out-high`,
      alarmDescription:
        "Fargate NetworkBytesOut > 5 GB in 1h. Possible data exfil or runaway egress.",
      metric: new Metric({
        namespace: "ECS/ContainerInsights",
        metricName: "NetworkTxBytes",
        dimensionsMap: {
          ClusterName: clusterName,
          ServiceName: serviceName,
        },
        statistic: Stats.SUM,
        period: Duration.hours(1),
      }),
      threshold: 5 * 1024 * 1024 * 1024,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })
    fargateNetworkOut.addAlarmAction(snsAction)
    fargateNetworkOut.addAlarmAction(killSwitchAction)

    // 2) RDS egress: alarm-only (Lambda kill-switch must NOT auto-stop a
    // live DB session - aborting mid-query can corrupt state).
    const rdsNetworkOut = new Alarm(this, "RdsNetworkOutHigh", {
      alarmName: `monorepo-${props.envName}-rds-network-out-high`,
      alarmDescription:
        "RDS NetworkTransmitThroughput > 50 MB/s sustained over 5min. Possible bulk data dump.",
      metric: new Metric({
        namespace: "AWS/RDS",
        metricName: "NetworkTransmitThroughput",
        dimensionsMap: {
          DBInstanceIdentifier: props.dataStack.database.instanceIdentifier,
        },
        statistic: Stats.AVERAGE,
        period: Duration.minutes(5),
      }),
      threshold: 50 * 1024 * 1024,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })
    rdsNetworkOut.addAlarmAction(snsAction)

    // 3) S3 PUT rate: 10k requests/h. Requires RequestMetrics enabled on the
    // bucket (DataStack.appBucket.addMetric).
    const bucketName = props.dataStack.appBucket.bucketName
    const s3PutRate = new Alarm(this, "S3PutRateHigh", {
      alarmName: `monorepo-${props.envName}-s3-put-rate-high`,
      alarmDescription:
        "S3 PutRequests > 10k in 1h. Possible bulk-write attack against the app bucket.",
      metric: new Metric({
        namespace: "AWS/S3",
        metricName: "PutRequests",
        dimensionsMap: {
          BucketName: bucketName,
          FilterId: "EntireBucket",
        },
        statistic: Stats.SUM,
        period: Duration.hours(1),
      }),
      threshold: 10_000,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })
    s3PutRate.addAlarmAction(snsAction)
    s3PutRate.addAlarmAction(killSwitchAction)

    // 4) S3 bucket size: 5 GB. BucketSizeBytes ships daily for free.
    const s3BucketSize = new Alarm(this, "S3BucketSizeHigh", {
      alarmName: `monorepo-${props.envName}-s3-bucket-size-high`,
      alarmDescription:
        "S3 BucketSizeBytes > 5 GB. Possible storage flood (uploads designed to inflate the bill).",
      metric: new Metric({
        namespace: "AWS/S3",
        metricName: "BucketSizeBytes",
        dimensionsMap: {
          BucketName: bucketName,
          StorageType: "StandardStorage",
        },
        statistic: Stats.MAXIMUM,
        period: Duration.days(1),
      }),
      threshold: 5 * 1024 * 1024 * 1024,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })
    s3BucketSize.addAlarmAction(snsAction)

    // 5) CloudWatch Logs ingestion: 1 GB/h summed across web, api,
    // cloudflared log groups. Log ingestion is $0.50/GB - a runaway loop
    // can torch tens of dollars per hour.
    const ingestMetric = (id: string, logGroupName: string) =>
      new Metric({
        namespace: "AWS/Logs",
        metricName: "IncomingBytes",
        dimensionsMap: { LogGroupName: logGroupName },
        statistic: Stats.SUM,
        period: Duration.hours(1),
        label: id,
      })

    const cwLogsIngest = new Alarm(this, "CwLogsIngestHigh", {
      alarmName: `monorepo-${props.envName}-cwlogs-ingest-high`,
      alarmDescription:
        "CloudWatch Logs incoming bytes > 1 GB in 1h across web, api, cloudflared. Possible log-flood.",
      metric: new MathExpression({
        expression: "web + api + tunnel",
        usingMetrics: {
          web: ingestMetric("web", props.appStack.webLogGroup.logGroupName),
          api: ingestMetric("api", props.appStack.apiLogGroup.logGroupName),
          tunnel: ingestMetric(
            "tunnel",
            props.appStack.tunnelLogGroup.logGroupName,
          ),
        },
        period: Duration.hours(1),
      }),
      threshold: 1024 * 1024 * 1024,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })
    cwLogsIngest.addAlarmAction(snsAction)
    cwLogsIngest.addAlarmAction(killSwitchAction)

    // 6) ECR pull anomaly: 50 pulls/h across both repos summed. ECR pulls
    // outside our deploy cadence (a few times a day) signal compromise of
    // the pull-side IAM role.
    const pullMetric = (id: string, repoName: string) =>
      new Metric({
        namespace: "AWS/ECR",
        metricName: "RepositoryPullCount",
        dimensionsMap: { RepositoryName: repoName },
        statistic: Stats.SUM,
        period: Duration.hours(1),
        label: id,
      })

    const ecrPullAnomaly = new Alarm(this, "EcrPullAnomalyHigh", {
      alarmName: `monorepo-${props.envName}-ecr-pull-anomaly`,
      alarmDescription:
        "ECR pulls > 50 in 1h across web+api repos. Possible compromised pull credentials.",
      metric: new MathExpression({
        expression: "web + api",
        usingMetrics: {
          web: pullMetric("web", props.dataStack.webRepository.repositoryName),
          api: pullMetric("api", props.dataStack.apiRepository.repositoryName),
        },
        period: Duration.hours(1),
      }),
      threshold: 50,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })
    ecrPullAnomaly.addAlarmAction(snsAction)

    this.attackVectorAlarms = {
      fargateNetworkOut,
      rdsNetworkOut,
      s3PutRate,
      s3BucketSize,
      cwLogsIngest,
      ecrPullAnomaly,
    }
  }
}

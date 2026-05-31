import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib"
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
import {
  DefaultDashboardFactory,
  MonitoringFacade,
} from "cdk-monitoring-constructs"
import type { Construct } from "constructs"
import type { AppStack } from "./app-stack.js"
import type { DataStack } from "./data-stack.js"

export interface ObservabilityStackProps extends StackProps {
  readonly envName: string
  readonly appStack: AppStack
  readonly dataStack: DataStack
  /**
   * Kill-switch SNS topic from SecurityStack. The 5 critical alarms publish
   * to BOTH this topic (which fans out to the kill-switch Lambda) and the
   * regional BillingTopic (which the deploy workflow subscribes the
   * operator email to, out-of-band — see ADR 0016 + SecurityStack note on
   * the same pattern for the ops topic).
   */
  readonly killSwitchTopic: Topic
}

/**
 * Regional alarms (ECS, RDS, CloudWatch Logs, ECR, S3) wired to a single
 * BillingTopic. Warning at 70% surfaces problems early enough to act; the
 * 95% Critical threshold leaves room for the SecurityStack kill-switch.
 *
 * Dollar-cap protection is handled by the SecurityStack AWS Budgets (the
 * MonthlyTotal $40 budget at 100% feeds the kill-switch).
 *
 * Five attack-vector alarms cover cost-runaway signals: RDS egress, S3 PUT
 * rate + bucket size, CloudWatch Logs ingestion, ECR pull anomaly. (The
 * Fargate egress alarm was removed together with Container Insights — its
 * ECS/ContainerInsights NetworkTxBytes metric no longer publishes; the
 * DataTransfer cost budget now guards egress runaway. AFF cost review
 * 2026-05-31.) See ADR 0016 for thresholds and rationale.
 */
export class ObservabilityStack extends Stack {
  readonly billingTopic: Topic
  readonly criticalAlarms: {
    readonly fargateCpu: Alarm
    readonly fargateMemory: Alarm
  }
  readonly attackVectorAlarms: {
    readonly rdsNetworkOut: Alarm
    readonly s3PutRate: Alarm
    readonly s3BucketSize: Alarm
    readonly cwLogsIngest: Alarm
    readonly ecrPullAnomaly: Alarm
  }

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props)

    // CloudWatch Dashboard names are account-global (per-region). The
    // facade's default DashboardFactory uses the construct id ("MonitoringFacade")
    // as the dashboard name, which collides across env stacks. Inject an
    // env-prefixed factory so staging + production own distinct dashboards.
    const monitoring = new MonitoringFacade(this, "MonitoringFacade", {
      alarmFactoryDefaults: {
        actionsEnabled: true,
        alarmNamePrefix: `monorepo-${props.envName}`,
      },
      dashboardFactory: new DefaultDashboardFactory(this, "Dashboards", {
        dashboardNamePrefix: `monorepo-${props.envName}`,
      }),
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

    // Email subscriber is workflow-managed (`aws sns subscribe --protocol
    // email`, with ::add-mask:: on the address). Keeping the email out
    // of the CDK template keeps it out of `cdk diff` output + CI logs.
    // Workflow finds this topic via the BillingTopicArn CfnOutput below.

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

    // Fargate egress alarm REMOVED (AFF cost review 2026-05-31). It read
    // ECS/ContainerInsights NetworkTxBytes, which only publishes while
    // Container Insights is enabled — and Container Insights was disabled to
    // cut ~$5-9/mo per env. Egress runaway is still capped: the DataTransfer
    // cost budget ($10) + the $55 Total budget → kill-switch catch a data
    // exfil / runaway-egress event as a dollar signal. The bytes alarm was a
    // faster early-warning, not the actual cap; dropping it loses no
    // protection that the cost budgets do not already provide.

    // RDS egress: alarm-only (Lambda kill-switch must NOT auto-stop a
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

    // 2) S3 PUT rate: 10k requests/h. Requires RequestMetrics enabled on the
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

    // 3) S3 bucket size: 5 GB. BucketSizeBytes ships daily for free.
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

    // 4) CloudWatch Logs ingestion: 1 GB/h summed across web, api,
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

    // 5) ECR pull anomaly: 50 pulls/h across both repos summed. ECR pulls
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
      rdsNetworkOut,
      s3PutRate,
      s3BucketSize,
      cwLogsIngest,
      ecrPullAnomaly,
    }

    // Workflow uses this output to look up the topic and subscribe the
    // operator email via `aws sns subscribe --protocol email`. See the
    // matching pattern in SecurityStack (KillSwitchOpsTopic).
    new CfnOutput(this, "BillingTopicArn", {
      value: this.billingTopic.topicArn,
      description:
        "SNS topic for regional CloudWatch alarms. Email subscriber is workflow-managed (out-of-band of CDK to keep the address out of the template).",
      exportName: `Observability-${props.envName}-BillingTopicArn`,
    })
  }
}

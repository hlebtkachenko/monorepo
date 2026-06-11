import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib"
import {
  Alarm,
  AlarmRule,
  AlarmState,
  ComparisonOperator,
  CompositeAlarm,
  MathExpression,
  Metric,
  Stats,
  TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch"
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions"
import { EventField, Rule, RuleTargetInput } from "aws-cdk-lib/aws-events"
import { SnsTopic } from "aws-cdk-lib/aws-events-targets"
import { FilterPattern, MetricFilter } from "aws-cdk-lib/aws-logs"
import { Topic } from "aws-cdk-lib/aws-sns"
import {
  DefaultDashboardFactory,
  MonitoringFacade,
  SnsAlarmActionStrategy,
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

    // Created before the MonitoringFacade because the facade's default alarm
    // action publishes here.
    this.billingTopic = new Topic(this, "BillingTopic", {
      displayName: `monorepo-${props.envName} regional alerts`,
    })

    // Email subscriber is workflow-managed (`aws sns subscribe --protocol
    // email`, with ::add-mask:: on the address). Keeping the email out
    // of the CDK template keeps it out of `cdk diff` output + CI logs.
    // Workflow finds this topic via the BillingTopicArn CfnOutput below.

    // CloudWatch Dashboard names are account-global (per-region). The
    // facade's default DashboardFactory uses the construct id ("MonitoringFacade")
    // as the dashboard name, which collides across env stacks. Inject an
    // env-prefixed factory so staging + production own distinct dashboards.
    //
    // `action` wires every facade-generated alarm (Service-CPU/Memory-Warning,
    // Postgres-CPU-Warning/Critical, Postgres FreeStorage Warning) to the
    // BillingTopic. Without it the facade renders alarms with NO AlarmActions
    // — they bill $0.10/mo each and never notify anyone (found live
    // 2026-06-11: 10 actionless alarms across both envs).
    const monitoring = new MonitoringFacade(this, "MonitoringFacade", {
      alarmFactoryDefaults: {
        actionsEnabled: true,
        alarmNamePrefix: `monorepo-${props.envName}`,
        action: new SnsAlarmActionStrategy({ onAlarmTopic: this.billingTopic }),
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

    // 4) CloudWatch Logs ingestion: 1 GB/h summed across ALL seven service
    // log groups. Log ingestion is $0.50/GB - a runaway loop can torch tens
    // of dollars per hour. admin/pgbouncer/cerbos/openfga were originally
    // excluded (INF-8) — a log-flood there billed identically but was only
    // caught by the slower dollar budget.
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
        "CloudWatch Logs incoming bytes > 1 GB in 1h across web, api, admin, cloudflared, pgbouncer, cerbos, openfga. Possible log-flood.",
      metric: new MathExpression({
        expression: "web + api + tunnel + admin + pgbouncer + cerbos + openfga",
        usingMetrics: {
          web: ingestMetric("web", props.appStack.webLogGroup.logGroupName),
          api: ingestMetric("api", props.appStack.apiLogGroup.logGroupName),
          tunnel: ingestMetric(
            "tunnel",
            props.appStack.tunnelLogGroup.logGroupName,
          ),
          admin: ingestMetric(
            "admin",
            props.appStack.adminLogGroup.logGroupName,
          ),
          pgbouncer: ingestMetric(
            "pgbouncer",
            props.appStack.pgbouncerLogGroup.logGroupName,
          ),
          cerbos: ingestMetric(
            "cerbos",
            props.appStack.cerbosLogGroup.logGroupName,
          ),
          openfga: ingestMetric(
            "openfga",
            props.appStack.openfgaLogGroup.logGroupName,
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

    // 5) ECR pull anomaly: 50 pulls/h across all three app repos summed.
    // ECR pulls outside our deploy cadence (a few times a day) signal
    // compromise of the pull-side IAM role. The admin repo was originally
    // missing from the expression (INF-9).
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
        "ECR pulls > 50 in 1h across web+api+admin repos. Possible compromised pull credentials.",
      metric: new MathExpression({
        expression: "web + api + admin",
        usingMetrics: {
          web: pullMetric("web", props.dataStack.webRepository.repositoryName),
          api: pullMetric("api", props.dataStack.apiRepository.repositoryName),
          admin: pullMetric(
            "admin",
            props.dataStack.adminRepository.repositoryName,
          ),
        },
        period: Duration.hours(1),
      }),
      threshold: 50,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })
    ecrPullAnomaly.addAlarmAction(snsAction)

    // 6) Vault→SSM sync liveness. The VPS sync timer emits a SyncSuccess
    // datapoint (Env dimension) on each clean pass, every 5 min. No
    // datapoint for 15 min (3 missing periods, treated as breaching) means
    // the secret-mirror loop is dead — SSM SecureStrings would silently
    // drift from Vault and ECS could boot with stale secrets. SNS only, not
    // the kill-switch: a dead sync must never stop a running service.
    const vaultSyncStale = new Alarm(this, "VaultSsmSyncStale", {
      alarmName: `monorepo-${props.envName}-vault-ssm-sync-stale`,
      alarmDescription:
        "No Vault→SSM sync-success datapoint for 15 min. The VPS secret-mirror loop is down; SSM SecureStrings may be drifting from Vault.",
      metric: new Metric({
        namespace: "Monorepo/VaultSync",
        metricName: "SyncSuccess",
        dimensionsMap: { Env: props.envName },
        statistic: Stats.SUM,
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 3,
      datapointsToAlarm: 3,
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.BREACHING,
    })
    vaultSyncStale.addAlarmAction(snsAction)

    this.attackVectorAlarms = {
      rdsNetworkOut,
      s3PutRate,
      s3BucketSize,
      cwLogsIngest,
      ecrPullAnomaly,
    }

    // ----- Application-health alarms (OBS-06) -----
    //
    // Everything above is cost/resource protection; nothing told an operator
    // "the app is down / erroring". These four signals close that gap. All
    // are alert-only (BillingTopic → email + the bot's /sns subscription in
    // production) — none feed the kill-switch.

    // a) ECS task stopped unexpectedly. Without Container Insights there is
    // no RunningTaskCount metric, so use the free EventBridge Task State
    // Change stream instead. Scoped to the app service's task group and to
    // stop reasons that mean "crash" (essential container exit, failed
    // health checks) — deliberate scale-to-zero (auto-pause, kill-switch,
    // deploys) stops tasks with "Scaling activity initiated by …" and stays
    // quiet. The message is shaped like a CloudWatch alarm JSON so the bot's
    // /sns route renders it as a first-class alarm with a stable dedup
    // fingerprint (apps/bot/src/sns.ts parses Message for AlarmName).
    new Rule(this, "EcsTaskStoppedRule", {
      ruleName: `monorepo-${props.envName}-ecs-task-stopped`,
      description:
        "App task stopped because an essential container exited or failed health checks",
      eventPattern: {
        source: ["aws.ecs"],
        detailType: ["ECS Task State Change"],
        detail: {
          clusterArn: [props.appStack.cluster.clusterArn],
          lastStatus: ["STOPPED"],
          group: [`service:${serviceName}`],
          stoppedReason: [
            { prefix: "Essential container" },
            { prefix: "Task failed container health checks" },
          ],
        },
      },
      targets: [
        new SnsTopic(this.billingTopic, {
          message: RuleTargetInput.fromObject({
            AlarmName: `monorepo-${props.envName}-ecs-task-stopped`,
            NewStateValue: "ALARM",
            NewStateReason: `App task stopped: ${EventField.fromPath(
              "$.detail.stoppedReason",
            )} (task ${EventField.fromPath("$.detail.taskArn")})`,
          }),
        }),
      ],
    })

    // b) RDS connection pressure. db.t4g.micro tops out at ~110 connections
    // (RDS LEAST(DBInstanceClassMemory/9531392, 5000) formula); steady state
    // through pgbouncer is ~20 server connections. 50 sustained for 15 min
    // means pooling broke (DB-02 regression, direct-connection leak) or the
    // instance is undersized — page before max_connections errors start.
    const rdsConnectionsHigh = new Alarm(this, "RdsConnectionsHigh", {
      alarmName: `monorepo-${props.envName}-rds-connections-high`,
      alarmDescription:
        "RDS DatabaseConnections >= 50 for 3x5min (t4g.micro max ~110, pgbouncer steady ~20). Pooling regression or undersized instance.",
      metric: new Metric({
        namespace: "AWS/RDS",
        metricName: "DatabaseConnections",
        dimensionsMap: {
          DBInstanceIdentifier: props.dataStack.database.instanceIdentifier,
        },
        statistic: Stats.AVERAGE,
        period: Duration.minutes(5),
      }),
      threshold: 50,
      evaluationPeriods: 3,
      datapointsToAlarm: 3,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })
    rdsConnectionsHigh.addAlarmAction(snsAction)

    // c) Server-error log-metric filters on web + api. Logs are unstructured
    // text (CloudWatch-MVP posture, OBS-08 accepted), so these are term
    // filters, not status-code parsers: the api's Nest ConsoleLogger stamps
    // " ERROR " on error-level lines (DomainExceptionFilter logs every
    // unhandled 5xx); the web filter matches the stable token emitted by
    // apps/web/instrumentation.ts onRequestError plus bare console stack
    // headers. Thresholds are deliberately modest — tune after launch.
    const errorMetric = (
      id: string,
      logGroup: typeof props.appStack.webLogGroup,
      metricName: string,
      pattern: ReturnType<typeof FilterPattern.anyTerm>,
    ) =>
      new MetricFilter(this, id, {
        logGroup,
        metricNamespace: `monorepo/${props.envName}`,
        metricName,
        filterPattern: pattern,
        metricValue: "1",
      }).metric({ statistic: Stats.SUM, period: Duration.minutes(5) })

    const webServerErrors = new Alarm(this, "WebServerErrorsHigh", {
      alarmName: `monorepo-${props.envName}-web-server-errors-high`,
      alarmDescription:
        "apps/web server-side errors >= 5 in 5 min (instrumentation.ts onRequestError token + console error headers).",
      metric: errorMetric(
        "WebServerErrorsFilter",
        props.appStack.webLogGroup,
        "WebServerErrors",
        FilterPattern.anyTerm("[web-server-error]", "Error:"),
      ),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })
    webServerErrors.addAlarmAction(snsAction)

    const apiServerErrors = new Alarm(this, "ApiServerErrorsHigh", {
      alarmName: `monorepo-${props.envName}-api-server-errors-high`,
      alarmDescription:
        "apps/api error-level log lines >= 5 in 5 min (Nest ConsoleLogger ERROR token; DomainExceptionFilter logs every unhandled 5xx).",
      metric: errorMetric(
        "ApiServerErrorsFilter",
        props.appStack.apiLogGroup,
        "ApiServerErrors",
        FilterPattern.anyTerm("ERROR"),
      ),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })
    apiServerErrors.addAlarmAction(snsAction)

    // ----- Backup freshness (INF-11) -----
    //
    // The nightly 03:00 UTC backup task is the only thing writing to its log
    // group, so "no IncomingBytes for two consecutive 12h buckets" == "no
    // backup ran in the last day". Buckets align to 00:00/12:00 UTC; the
    // 03:00 run lands in the 00–12 bucket every day, so a missed night
    // alarms within ~21–33h of the last successful run. TreatMissingData
    // BREACHING is the point: a silent pipeline (no log events at all) is
    // exactly the failure this guards.
    //
    // Power-aware: a deliberately cold-paused env (RDS stopped, backup task
    // idle, no backups by design) would otherwise leave this in permanent
    // ALARM. So the stale-metric alarm below is gated by a "DB is running"
    // probe through a composite alarm — only the composite pages, and only
    // when backups are stale WHILE the database is actually running (a real
    // wedged-pipeline incident). A stopped DB leaves the probe OK, so the
    // composite stays OK and never pages on a paused env.
    //
    // The backup log-group name is the BackupStack convention
    // (`/ecs/monorepo-<env>/backup`, backup-stack.ts) referenced by name to
    // avoid an Observability→Backup stack dependency cycle (BackupStack is
    // instantiated after this stack in bin/app.ts).
    const backupStale = new Alarm(this, "BackupFreshnessStaleMetric", {
      alarmName: `monorepo-${props.envName}-backup-freshness-stale-metric`,
      alarmDescription:
        "No log activity from the nightly backup task for ~24h+. Gated by the db-running probe via the backup-freshness composite alarm.",
      metric: new Metric({
        namespace: "AWS/Logs",
        metricName: "IncomingBytes",
        dimensionsMap: {
          LogGroupName: `/ecs/monorepo-${props.envName}/backup`,
        },
        statistic: Stats.SUM,
        period: Duration.hours(12),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.BREACHING,
    })

    // "DB is running" probe. RDS emits CPUUtilization every minute while up
    // and nothing while stopped, so SAMPLE_COUNT >= 1 over a 12h bucket means
    // "the database ran during this window". NOT_BREACHING on missing data so
    // a stopped (cold-paused) DB resolves to OK = not running.
    const dbRunning = new Alarm(this, "BackupFreshnessDbRunning", {
      alarmName: `monorepo-${props.envName}-db-running-probe`,
      alarmDescription:
        "Helper for the backup-freshness composite: ALARM = the RDS instance is emitting metrics (running). Gates the backup alarm so a cold-paused env does not page.",
      metric: new Metric({
        namespace: "AWS/RDS",
        metricName: "CPUUtilization",
        dimensionsMap: {
          DBInstanceIdentifier: props.dataStack.database.instanceIdentifier,
        },
        statistic: Stats.SAMPLE_COUNT,
        period: Duration.hours(12),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      datapointsToAlarm: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    })

    // Pages only when backups are stale AND the DB is running. The two child
    // alarms carry no action by design — the composite is what notifies.
    const backupFreshness = new CompositeAlarm(this, "BackupFreshnessStale", {
      compositeAlarmName: `monorepo-${props.envName}-backup-freshness-stale`,
      alarmDescription:
        "Backups are stale or the pipeline is wedged WHILE the database is running — verify the S3 backups bucket. Suppressed while the env is cold-paused (RDS stopped).",
      alarmRule: AlarmRule.allOf(
        AlarmRule.fromAlarm(backupStale, AlarmState.ALARM),
        AlarmRule.fromAlarm(dbRunning, AlarmState.ALARM),
      ),
    })
    backupFreshness.addAlarmAction(snsAction)

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

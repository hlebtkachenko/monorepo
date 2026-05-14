import * as path from "node:path"
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib"
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets"
import { Schedule } from "aws-cdk-lib/aws-applicationautoscaling"
import {
  Capability,
  ContainerImage,
  CpuArchitecture,
  FargateTaskDefinition,
  LinuxParameters,
  LogDriver,
  OperatingSystemFamily,
  Secret as EcsSecret,
} from "aws-cdk-lib/aws-ecs"
import { Rule } from "aws-cdk-lib/aws-events"
import { EcsTask } from "aws-cdk-lib/aws-events-targets"
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam"
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs"
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  ObjectOwnership,
  StorageClass,
} from "aws-cdk-lib/aws-s3"
import { SubnetType, type SecurityGroup } from "aws-cdk-lib/aws-ec2"
import type { Construct } from "constructs"
import type { AppStack } from "./app-stack.js"
import type { DataStack } from "./data-stack.js"

export interface BackupStackProps extends StackProps {
  readonly envName: string
  readonly appStack: AppStack
  readonly dataStack: DataStack
  /**
   * Same SG the api/web tasks use. The backup task lives in public subnets
   * (egress-only) and reuses this SG so RDS ingress rules already allow it
   * to reach Postgres on port 5432.
   */
  readonly appSecurityGroup: SecurityGroup
}

/**
 * Daily Postgres backup pipeline (ADR-0015 / E.5).
 *
 *   EventBridge cron (03:00 UTC) -> ECS Scheduled Task (Fargate on-demand)
 *     -> pg_dumpall globals + pg_dump -Fc + per-org NDJSON
 *     -> s3://monorepo-{env}-backups (versioned, lifecycle to Glacier
 *        Deep Archive at 365d, no auto-expire)
 *
 * The backup task reuses the AppStack ECS cluster, AppStack VPC (public
 * subnets so it can reach S3 + RDS without a NAT-GW), and DataStack RDS
 * secret. The task image is built from infra/Dockerfile.backup
 * (postgres-client + aws-cli + zstd, scripts baked in).
 *
 * Container is hardened per PR #77 / ADR-0011: capDrop ALL +
 * readonlyRootFilesystem + /tmp ephemeral mount.
 *
 * Stack outputs (so backup-restore-monthly.yml + restore-drill can find
 * the live identifiers without grep-by-prefix guessing):
 *   - BackupTaskDefinitionArn — pin the active task definition revision
 *   - BackupClusterName       — cluster the EventBridge target runs in
 *   - BackupBucketName        — S3 bucket the restore drill pulls from
 *
 * Budget: lifecycle drops to DeepArchive at 365d (~$0.99/TB/mo);
 * Fargate on-demand ~5 min/day * 0.5 vCPU ≈ $0.10/mo. Total < $2/mo.
 */
export class BackupStack extends Stack {
  readonly backupBucket: Bucket
  readonly taskDefinition: FargateTaskDefinition
  readonly schedule: Rule

  constructor(scope: Construct, id: string, props: BackupStackProps) {
    super(scope, id, props)

    this.backupBucket = new Bucket(this, "BackupBucket", {
      bucketName: `monorepo-${props.envName}-backups-${this.account}`,
      encryption: BucketEncryption.S3_MANAGED,
      bucketKeyEnabled: true,
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      lifecycleRules: [
        {
          // Tiered storage on current versions: hot for 30 d, IA, then
          // Glacier, then Deep Archive at 365 d. No auto-expire - audit
          // retention is the whole point of off-instance backups.
          id: "TierToDeepArchive",
          transitions: [
            {
              storageClass: StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30),
            },
            {
              storageClass: StorageClass.GLACIER,
              transitionAfter: Duration.days(90),
            },
            {
              storageClass: StorageClass.DEEP_ARCHIVE,
              transitionAfter: Duration.days(365),
            },
          ],
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
        {
          // Noncurrent versions DO get expired - keep storage bounded but
          // generous (365 d) so an operator has a full year window to recover
          // a clobbered object before it leaves the bucket.
          id: "ExpireNoncurrentVersionsAfter1y",
          noncurrentVersionExpiration: Duration.days(365),
        },
      ],
      // Backups must survive a stack destroy in production. Lower environments
      // can be torn down on cdk destroy.
      removalPolicy:
        props.envName === "production"
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY,
      autoDeleteObjects: props.envName !== "production",
    })

    const taskLogGroup = new LogGroup(this, "BackupLogs", {
      logGroupName: `/ecs/monorepo-${props.envName}/backup`,
      retention: RetentionDays.ONE_MONTH,
    })

    const taskExecutionRole = new Role(this, "TaskExecutionRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy",
        ),
      ],
    })
    props.dataStack.databaseSecret.grantRead(taskExecutionRole)

    const taskRole = new Role(this, "TaskRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Runtime role for the nightly backup task",
    })
    // S3 PUT only (PutObject + multipart Abort). grantPut emits exactly
    // s3:PutObject* + s3:Abort* — what aws-cli needs for chunked uploads
    // and nothing more. grantWrite would also include s3:DeleteObject*
    // which contradicts the audit-retention design: the lifecycle policy
    // is the only path that removes objects. (Versioning means a Delete
    // would only write a delete marker, but excluding it is defense in
    // depth.) Negative-assertion test guards against future regressions.
    this.backupBucket.grantPut(taskRole)
    // RDS secret is wired below via container `secrets:`. The ECS task
    // execution role (taskExecutionRole) already has secretsmanager:Get
    // for that secret; the task role does NOT need it (the secret is
    // injected as env at task start, not read by app code).

    this.taskDefinition = new FargateTaskDefinition(this, "BackupTaskDef", {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
      executionRole: taskExecutionRole,
      taskRole,
    })

    this.taskDefinition.addVolume({ name: "tmp" })

    const linuxParams = new LinuxParameters(this, "BackupLinuxParams")
    linuxParams.dropCapabilities(Capability.ALL)

    const backupImage = new DockerImageAsset(this, "BackupImage", {
      // Context is the repo root (infra/cdk/lib/ -> ../../.. -> repo root)
      // so the Dockerfile can COPY infra/scripts/*.
      directory: path.join(__dirname, "..", "..", ".."),
      file: "infra/Dockerfile.backup",
      platform: Platform.LINUX_ARM64,
    })

    const dbHost = props.dataStack.database.dbInstanceEndpointAddress
    const dbPort = props.dataStack.database.dbInstanceEndpointPort

    const container = this.taskDefinition.addContainer("backup", {
      containerName: "backup",
      image: ContainerImage.fromDockerImageAsset(backupImage),
      essential: true,
      logging: LogDriver.awsLogs({
        streamPrefix: "backup",
        logGroup: taskLogGroup,
      }),
      environment: {
        APP_S3_BUCKET: this.backupBucket.bucketName,
        APP_S3_REGION: this.region,
        DB_HOST: dbHost,
        DB_PORT: dbPort,
        DB_NAME: "monorepo",
      },
      secrets: {
        DB_USER: EcsSecret.fromSecretsManager(
          props.dataStack.databaseSecret,
          "username",
        ),
        DB_PASSWORD: EcsSecret.fromSecretsManager(
          props.dataStack.databaseSecret,
          "password",
        ),
      },
      // The Dockerfile entrypoint is /usr/local/bin/pg-dump-nightly. We need
      // DATABASE_DIRECT_URL composed at task start, so override the entry
      // point with /bin/sh -c. SAFETY: password is alphanumeric per
      // data-stack.ts excludePunctuation:true; no URL-encoding required.
      entryPoint: ["/bin/sh", "-c"],
      command: [
        'export DATABASE_DIRECT_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" && exec /usr/local/bin/pg-dump-nightly',
      ],
      readonlyRootFilesystem: true,
      linuxParameters: linuxParams,
    })
    container.addMountPoints({
      containerPath: "/tmp",
      sourceVolume: "tmp",
      readOnly: false,
    })

    // Schedule: 03:00 UTC daily. EventBridge cron is in UTC.
    this.schedule = new Rule(this, "DailySchedule", {
      ruleName: `monorepo-${props.envName}-backup-daily`,
      description: "Nightly Postgres backup at 03:00 UTC",
      schedule: Schedule.cron({ minute: "0", hour: "3" }),
    })

    this.schedule.addTarget(
      new EcsTask({
        cluster: props.appStack.cluster,
        taskDefinition: this.taskDefinition,
        // EcsTask validates subnetSelection.subnetType against assignPublicIp
        // and rejects mixed subnets+subnetType selectors. SubnetType.PUBLIC
        // is enough; the cluster's VPC has exactly the two public subnets
        // defined in NetworkStack and CDK resolves them at synth time.
        subnetSelection: {
          subnetType: SubnetType.PUBLIC,
        },
        assignPublicIp: true,
        securityGroups: [props.appSecurityGroup],
        taskCount: 1,
      }),
    )

    // Outputs consumed by .github/workflows/backup-restore-monthly.yml.
    // The workflow used to derive these via family-prefix grep + tag
    // filter; both were brittle (CDK logical-id mangling). Stack outputs
    // give the workflow a stable contract.
    new CfnOutput(this, "BackupTaskDefinitionArn", {
      value: this.taskDefinition.taskDefinitionArn,
      description: "Active task definition ARN for the nightly backup task",
      exportName: `Backup-${props.envName}-TaskDefinitionArn`,
    })
    new CfnOutput(this, "BackupClusterName", {
      value: props.appStack.cluster.clusterName,
      description: "ECS cluster name the backup schedule targets",
      exportName: `Backup-${props.envName}-ClusterName`,
    })
    new CfnOutput(this, "BackupBucketName", {
      value: this.backupBucket.bucketName,
      description: "S3 bucket holding nightly Postgres dumps",
      exportName: `Backup-${props.envName}-BucketName`,
    })
  }
}

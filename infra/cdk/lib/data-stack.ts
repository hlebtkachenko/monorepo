import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib"
import {
  Peer,
  Port,
  SecurityGroup,
  SubnetSelection,
  type ISubnet,
  type IVpc,
} from "aws-cdk-lib/aws-ec2"
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
  StorageType,
} from "aws-cdk-lib/aws-rds"
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  ObjectOwnership,
} from "aws-cdk-lib/aws-s3"
import { Secret } from "aws-cdk-lib/aws-secretsmanager"
import { InstanceClass, InstanceSize, InstanceType } from "aws-cdk-lib/aws-ec2"
import { Repository, TagMutability, TagStatus } from "aws-cdk-lib/aws-ecr"
import type { Construct } from "constructs"

export interface DataStackProps extends StackProps {
  readonly envName: string
  readonly vpc: IVpc
  readonly dataSubnets: ISubnet[]
  readonly appSecurityGroupId: string
}

/**
 * RDS Postgres 18 single-AZ + S3 app bucket + Secrets Manager. AWS-managed KMS
 * (skip customer CMK at MVP per advisor - saves ~$6/mo). No RDS Proxy at MVP
 * (1-3 Fargate tasks × 10 conns < 85 max_connections). Object Lock NOT enabled
 * - turn it on later via a dedicated audit bucket when retention compliance
 * becomes load-bearing.
 *
 * Two distinct Secrets Manager secrets live here:
 *
 *   - `databaseSecret`   master credentials (`app_owner`, SUPERUSER on RDS).
 *                        Used by the migration runner, the backup task, the
 *                        api container (pg-boss needs SUPERUSER-equivalent
 *                        for advisory locks + LISTEN/NOTIFY direct on :5432),
 *                        and pgbouncer's upstream connection #1.
 *   - `appUserSecret`    runtime tenant role (`app_user`, LOGIN, RLS applies).
 *                        Used by web + admin containers when they authenticate
 *                        to pgbouncer on :6432, and by pgbouncer's upstream
 *                        connection #2 (so a single pgbouncer task serves both
 *                        users via `DATABASE_URLS=...,...`). The password is
 *                        rotated by recreating this Secret resource and
 *                        applying the matching `ALTER ROLE ... PASSWORD` via
 *                        the operator bastion runbook.
 *
 * This is the role split required by ADR-0010 — runtime traffic must run as
 * `app_user` so FORCE RLS bites; `app_owner` (SUPERUSER on RDS) bypasses RLS
 * implicitly and previously left every tenant query in production unguarded.
 */
export class DataStack extends Stack {
  readonly database: DatabaseInstance
  readonly databaseSecret: Secret
  readonly appUserSecret: Secret
  readonly appBucket: Bucket
  readonly webRepository: Repository
  readonly apiRepository: Repository
  readonly adminRepository: Repository

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props)

    this.webRepository = new Repository(this, "WebRepo", {
      repositoryName: `monorepo-${props.envName}-web`,
      imageTagMutability: TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      lifecycleRules: [
        {
          description:
            "Expire untagged images after 1 day (catches dangling build cache)",
          tagStatus: TagStatus.UNTAGGED,
          maxImageAge: Duration.days(1),
        },
        {
          description: "Retain last 10 tagged images",
          tagStatus: TagStatus.ANY,
          maxImageCount: 10,
        },
      ],
      removalPolicy:
        props.envName === "production"
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY,
      emptyOnDelete: props.envName !== "production",
    })

    this.apiRepository = new Repository(this, "ApiRepo", {
      repositoryName: `monorepo-${props.envName}-api`,
      imageTagMutability: TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      lifecycleRules: [
        {
          description:
            "Expire untagged images after 1 day (catches dangling build cache)",
          tagStatus: TagStatus.UNTAGGED,
          maxImageAge: Duration.days(1),
        },
        {
          description: "Retain last 10 tagged images",
          tagStatus: TagStatus.ANY,
          maxImageCount: 10,
        },
      ],
      removalPolicy:
        props.envName === "production"
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY,
      emptyOnDelete: props.envName !== "production",
    })

    this.adminRepository = new Repository(this, "AdminRepo", {
      repositoryName: `monorepo-${props.envName}-admin`,
      imageTagMutability: TagMutability.IMMUTABLE,
      imageScanOnPush: true,
      lifecycleRules: [
        {
          description:
            "Expire untagged images after 1 day (catches dangling build cache)",
          tagStatus: TagStatus.UNTAGGED,
          maxImageAge: Duration.days(1),
        },
        {
          description: "Retain last 10 tagged images",
          tagStatus: TagStatus.ANY,
          maxImageCount: 10,
        },
      ],
      removalPolicy:
        props.envName === "production"
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY,
      emptyOnDelete: props.envName !== "production",
    })

    const dbSecurityGroup = new SecurityGroup(this, "DbSg", {
      vpc: props.vpc,
      description: "RDS Postgres security group - only inbound from app SG",
      allowAllOutbound: false,
    })

    dbSecurityGroup.addIngressRule(
      Peer.securityGroupId(props.appSecurityGroupId),
      Port.tcp(5432),
      "Allow Postgres from ECS app tasks only",
    )

    this.databaseSecret = new Secret(this, "DbSecret", {
      description: `${props.envName} RDS Postgres master credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "app_owner" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 32,
      },
    })

    // `app_user` runtime credentials. The role itself is created by migration
    // `packages/db/migrations/0002_auth.sql` (CREATE ROLE app_user LOGIN
    // PASSWORD 'dev_user'). The operator runbook
    // (docs/runbooks/AWS-DEPLOY.md "Follow-up: per-tenant role split") rotates
    // RDS to this password via `ALTER ROLE app_user PASSWORD '<from-secret>'`
    // on the bastion before flipping traffic over. CDK ONLY creates the
    // secret value; it does not run that ALTER ROLE because RDS is private
    // and no bootstrap container exists yet.
    //
    // excludePunctuation: true matches `databaseSecret` so the password is
    // alphanumeric — it is shell-interpolated into a `postgres://` URL inside
    // the pgbouncer container's `command:` without urlencoding (same safety
    // note as the other DB secrets here).
    this.appUserSecret = new Secret(this, "AppUserSecret", {
      description: `${props.envName} RDS Postgres runtime credentials (app_user role, RLS applies)`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "app_user" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 32,
      },
    })

    const dataSubnetSelection: SubnetSelection = {
      subnets: props.dataSubnets,
    }

    this.database = new DatabaseInstance(this, "Postgres", {
      vpc: props.vpc,
      vpcSubnets: dataSubnetSelection,
      securityGroups: [dbSecurityGroup],
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.VER_18_1,
      }),
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
      allocatedStorage: 20,
      maxAllocatedStorage: 40,
      storageType: StorageType.GP3,
      multiAz: false,
      publiclyAccessible: false,
      storageEncrypted: true,
      credentials: Credentials.fromSecret(this.databaseSecret),
      backupRetention: Duration.days(7),
      deletionProtection: props.envName === "production",
      removalPolicy:
        props.envName === "production"
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY,
      databaseName: "monorepo",
      enablePerformanceInsights: false,
      autoMinorVersionUpgrade: true,
      copyTagsToSnapshot: true,
    })

    this.appBucket = new Bucket(this, "AppBucket", {
      bucketName: `monorepo-${props.envName}-app-${this.account}`,
      encryption: BucketEncryption.S3_MANAGED,
      bucketKeyEnabled: true,
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: "ExpireNoncurrentVersions",
          noncurrentVersionExpiration: Duration.days(30),
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
      ],
      removalPolicy:
        props.envName === "production"
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY,
      autoDeleteObjects: props.envName !== "production",
    })

    // CloudWatch S3 request metrics. Enables AllRequests/PutRequests metrics
    // (the bucket-size + object-count metrics ship for free). Needed by the
    // s3-put-rate-high alarm in ObservabilityStack. First 1M requests/month
    // are free, then $1 per million.
    this.appBucket.addMetric({ id: "EntireBucket" })
  }
}

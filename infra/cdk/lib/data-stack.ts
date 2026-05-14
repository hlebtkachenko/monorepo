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
 */
export class DataStack extends Stack {
  readonly database: DatabaseInstance
  readonly databaseSecret: Secret
  readonly appBucket: Bucket
  readonly webRepository: Repository
  readonly apiRepository: Repository

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

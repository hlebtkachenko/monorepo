import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib"
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  Peer,
  Port,
  SecurityGroup,
  type ISubnet,
  type IVpc,
  type SubnetSelection,
} from "aws-cdk-lib/aws-ec2"
import { Repository, TagMutability, TagStatus } from "aws-cdk-lib/aws-ecr"
import { Key } from "aws-cdk-lib/aws-kms"
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
import type { Construct } from "constructs"

export interface BetaDataStackProps extends StackProps {
  readonly envName: string
  readonly vpc: IVpc
  readonly dataSubnets: ISubnet[]
  readonly appSecurityGroupId: string
}

/**
 * Data plane of the dedicated `beta` environment (the beta.afframe.com client
 * portal). Deliberately a slim sibling of `DataStack`, not a reuse of it: the
 * beta env runs ONE app container, so the seven-container prod topology's
 * fixtures (dual-user RLS role split, pgbouncer credentials, OpenFGA schema,
 * app/avatar bucket, three ECR repos) have no consumer here.
 *
 * Contents:
 *   - RDS Postgres, t4g.micro / 20 GB gp3 / single-AZ / private, 7-day
 *     automated backups. ONE credentials secret: beta has no RLS
 *     (`.context/beta-afframe/30-plan-v3-beta-env.md` Part 4 — the DB boundary
 *     is the outer wall, the `requireScope` seam the inner one), so there is
 *     no `app_user` runtime role to split off.
 *   - One ECR repository for the beta app image.
 *   - One private, CMK-encrypted, versioned documents bucket. No CORS block:
 *     uploads and downloads stream through the app's own routes, the browser
 *     never talks to S3 directly (Part 4 "no presigned URLs").
 *
 * Removal policies are the non-production ones (DESTROY / emptyOnDelete /
 * autoDeleteObjects, no deletion protection) so the env stays disposable while
 * it is a demo surface. Durability at MVP = RDS automated backups + S3
 * versioning; hardening (Backup stack, retention) is revisited at gate B6
 * (pre-client-access) per plan Part 1.
 */
export class BetaDataStack extends Stack {
  readonly database: DatabaseInstance
  readonly databaseSecret: Secret
  readonly documentsBucket: Bucket
  readonly documentsKey: Key
  readonly repository: Repository

  constructor(scope: Construct, id: string, props: BetaDataStackProps) {
    super(scope, id, props)

    // `monorepo-<env>-<service>` — same convention as the web/api/admin repos
    // in DataStack, with `beta` as the service. The beta deploy role is scoped
    // to `monorepo-beta-*`, so the name must stay under that prefix.
    this.repository = new Repository(this, "BetaRepo", {
      repositoryName: `monorepo-${props.envName}-beta`,
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
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    })

    const dbSecurityGroup = new SecurityGroup(this, "DbSg", {
      vpc: props.vpc,
      description:
        "Beta RDS Postgres security group - only inbound from app SG",
      allowAllOutbound: false,
    })

    dbSecurityGroup.addIngressRule(
      Peer.securityGroupId(props.appSecurityGroupId),
      Port.tcp(5432),
      "Allow Postgres from the beta ECS task only",
    )

    // Single role for the whole beta app: it runs migrations at container
    // start and serves traffic on the same connection string.
    //
    // excludePunctuation: true is load-bearing — BetaAppStack composes the
    // `postgres://` URL in /bin/sh without urlencoding, exactly like the prod
    // containers do. An alphanumeric password contains none of the
    // URL-reserved characters.
    this.databaseSecret = new Secret(this, "DbSecret", {
      description: `${props.envName} RDS Postgres credentials (beta portal)`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "beta_owner" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 32,
      },
    })

    const dataSubnetSelection: SubnetSelection = {
      subnets: props.dataSubnets,
    }

    // PRIVATE_ISOLATED subnets + publiclyAccessible false: nothing outside the
    // VPC reaches this instance, which is why migrations run in the app
    // container's entrypoint rather than from a GitHub runner (plan Part 2 §3).
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
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
      databaseName: "beta",
      enablePerformanceInsights: false,
      autoMinorVersionUpgrade: true,
      copyTagsToSnapshot: true,
    })

    // Dedicated CMK, rotation ON (S3 keeps the encrypting key version per
    // object, so rotation is transparent for long-lived documents).
    this.documentsKey = new Key(this, "DocumentsKey", {
      alias: `alias/monorepo-${props.envName}-documents`,
      description:
        "Default-encryption CMK for the beta portal documents bucket. Key rotation ON.",
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    this.documentsBucket = new Bucket(this, "DocumentsBucket", {
      bucketName: `monorepo-${props.envName}-documents-${this.account}`,
      encryption: BucketEncryption.KMS,
      encryptionKey: this.documentsKey,
      bucketKeyEnabled: true,
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      lifecycleRules: [
        {
          id: "NativeCleanup",
          abortIncompleteMultipartUploadAfter: Duration.days(7),
          noncurrentVersionExpiration: Duration.days(30),
          expiredObjectDeleteMarker: true,
        },
      ],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    new CfnOutput(this, "EcrRepositoryName", {
      value: this.repository.repositoryName,
      description:
        "ECR repository the beta deploy workflow pushes the app image to.",
    })
    new CfnOutput(this, "DocumentsBucketName", {
      value: this.documentsBucket.bucketName,
      description: "Private documents bucket for the beta portal.",
    })
  }
}

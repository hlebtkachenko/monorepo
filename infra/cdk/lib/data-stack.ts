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
  HttpMethods,
  ObjectOwnership,
  StorageClass,
} from "aws-cdk-lib/aws-s3"
import { AnyPrincipal, Effect, PolicyStatement } from "aws-cdk-lib/aws-iam"
import { Key } from "aws-cdk-lib/aws-kms"
import { Secret } from "aws-cdk-lib/aws-secretsmanager"
import { InstanceClass, InstanceSize, InstanceType } from "aws-cdk-lib/aws-ec2"
import { Repository, TagMutability, TagStatus } from "aws-cdk-lib/aws-ecr"
import type { Construct } from "constructs"

export interface DataStackProps extends StackProps {
  readonly envName: string
  readonly vpc: IVpc
  readonly dataSubnets: ISubnet[]
  readonly appSecurityGroupId: string
  /**
   * The public web app origin host for this env (e.g. `app.afframe.com` /
   * `app-staging.afframe.com`, sourced from the `APP_DOMAIN` env in
   * `bin/app.ts`). Used to scope the `documentsBucket` CORS `AllowedOrigins`
   * to the exact deployed origin — browser presigned-POST uploads and
   * presigned-GET (pdf.js Range) previews come from this origin.
   */
  readonly domain: string
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
  readonly documentsBucket: Bucket
  readonly documentsKey: Key
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
    // (docs/runbooks/AWS-SETUP.md "Follow-up: per-tenant role split") rotates
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

    // ---- Documents store -----------------------------------------------
    //
    // A dedicated, CMK-encrypted, private WORKING store for uploaded source
    // documents (invoices, receipts, ISDOC/Pohoda XML). Separate blast
    // radius from `appBucket` (avatars + app assets). Design A — NO Object
    // Lock: this is a working store, not the statutory archive of record,
    // so tamper/wipe protection comes from IAM (the app/Brain task role holds
    // no Delete) + versioning + a single dedicated runtime reaper principal,
    // never from WORM locking. Non-production CDK teardown is the exception.
    // The reaper Lambda + its EventBridge schedule live in
    // SecurityStack. See ADR-0031.

    // Dedicated CMK. Rotation ON — transparent to S3, which retains the
    // encrypting key-version per object and auto-selects it on decrypt, so
    // rotation is safe for long-lived objects (ADR-0031). RETAIN in prod: the
    // objects are undecryptable without this key, so a stray `cdk destroy`
    // must never schedule it for deletion.
    this.documentsKey = new Key(this, "DocumentsKey", {
      alias: `alias/monorepo-${props.envName}-documents`,
      description:
        "Default-encryption CMK for the documents bucket (source-document working store). Key rotation ON. Browser presigned-POST uploads carry NO SSE headers and rely on this being the bucket DEFAULT encryption key.",
      enableKeyRotation: true,
      removalPolicy:
        props.envName === "production"
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY,
    })

    this.documentsBucket = new Bucket(this, "DocumentsBucket", {
      bucketName: `monorepo-${props.envName}-documents-${this.account}`,
      // CMK as the bucket DEFAULT encryption + bucketKeyEnabled. CRITICAL:
      // a browser presigned POST upload carries NO x-amz-server-side-
      // encryption* headers, so the object MUST still land encrypted via the
      // bucket default. bucketKeyEnabled collapses per-object KMS calls to a
      // per-bucket data key (load-bearing for cost at scale; ADR-0031).
      encryption: BucketEncryption.KMS,
      encryptionKey: this.documentsKey,
      bucketKeyEnabled: true,
      versioned: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      cors: [
        {
          allowedMethods: [HttpMethods.GET, HttpMethods.HEAD, HttpMethods.POST],
          // Exact deployed web origin only (prod app.afframe.com / staging
          // app-staging.afframe.com). Dev uses minio, NOT this bucket, so no
          // localhost entry. CORS is not a security boundary — bucket policy
          // + BlockPublicAccess still govern (ADR-0031).
          allowedOrigins: [`https://${props.domain}`],
          // Range: pdf.js issues lazy Range GETs while the user scrolls — a
          // Range request header makes the GET non-simple, so the browser
          // preflights OPTIONS and AllowedHeaders MUST cover `Range` or the
          // preflight 403s. Content-Type + x-amz-* (incl.
          // x-amz-checksum-sha256): presigned-POST upload preflight (ADR-0031).
          allowedHeaders: ["Range", "Content-Type", "x-amz-*"],
          // Response headers the viewer JS reads off the Range response.
          exposedHeaders: [
            "Content-Range",
            "Content-Length",
            "Accept-Ranges",
            "ETag",
          ],
          // Cache the preflight so pdf.js Range scrolling does not re-OPTIONS
          // every chunk.
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          // Intelligent-Tiering, AUTOMATIC tiers only. PUT objects straight
          // into IT (day-0 transition). The automatic tiers (Frequent →
          // Infrequent @30d idle → Archive-Instant @90d idle) are all
          // millisecond-retrieval with no retrieval fee. We deliberately do
          // NOT opt into the async Archive / Deep Archive tiers (retrieval
          // latency): that would require an `intelligentTieringConfigurations`
          // entry with archiveAccessTierTime / deepArchiveAccessTierTime set,
          // which we omit entirely, so no async tier is ever enabled. ADR-0031.
          //
          // Size filter: only objects ≥ 128 KiB transition, matching S3's IT
          // auto-tiering eligibility floor. S3 never auto-tiers a sub-128 KiB
          // object, so transitioning one is pure cost — a day-0 lifecycle
          // transition request (~$0.01/1k) for zero tiering benefit. A receipt
          // / ISDOC-XML store is mostly sub-128 KiB; the filter keeps that bulk
          // in Standard (same storage price) and lets IT work only on the large
          // PDF tail where it pays off. See ADR-0031's cost basis.
          //
          // `objectSizeGreaterThan` is STRICT `>`, so use `128*1024 - 1` to
          // include an exactly-128 KiB object (which IS IT-eligible) rather
          // than `128*1024`, which would exclude it.
          id: "IntelligentTiering",
          objectSizeGreaterThan: 128 * 1024 - 1,
          transitions: [
            {
              storageClass: StorageClass.INTELLIGENT_TIERING,
              transitionAfter: Duration.days(0),
            },
          ],
        },
        {
          // Native lifecycle — creation-date-measurable ONLY. S3 lifecycle
          // measures `Days` from object creation, NOT from tag-set time, so
          // the tag-age delete window (orphan 1h / untagged 24h / deleted 60d)
          // CANNOT be expressed here; it is driven by the reaper principal in
          // SecurityStack. This rule keeps only what lifecycle can measure.
          // See ADR-0031.
          id: "NativeCleanup",
          abortIncompleteMultipartUploadAfter: Duration.days(7),
          noncurrentVersionExpiration: Duration.days(30),
          expiredObjectDeleteMarker: true,
        },
      ],
      removalPolicy:
        props.envName === "production"
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY,
      autoDeleteObjects: props.envName !== "production",
    })

    // Bucket-policy hardening (in addition to enforceSSL's non-TLS deny).
    //
    // FOOTGUN (ADR-0031): a browser presigned POST omits the SSE headers and
    // must still succeed via the bucket DEFAULT encryption above. So the deny
    // must reject ONLY puts that EXPLICITLY set a wrong key/algorithm, never
    // header-omitted puts. The `Null: "false"` guard means "this condition
    // key IS present in the request"; combined with StringNotEquals, the deny
    // fires only when the header is present AND wrong. A header-omitted put
    // (key null → `Null: "false"` is false) is NOT denied and lands
    // correctly-encrypted under the bucket default. Without the Null guard,
    // StringNotEquals alone is vacuously true for a missing key and would
    // brick every browser upload.

    // Deny a PutObject that names a KMS key that is not our CMK.
    this.documentsBucket.addToResourcePolicy(
      new PolicyStatement({
        sid: "DenyPutWithNonCmkKmsKey",
        effect: Effect.DENY,
        principals: [new AnyPrincipal()],
        actions: ["s3:PutObject"],
        resources: [this.documentsBucket.arnForObjects("*")],
        conditions: {
          StringNotEquals: {
            "s3:x-amz-server-side-encryption-aws-kms-key-id":
              this.documentsKey.keyArn,
          },
          Null: {
            "s3:x-amz-server-side-encryption-aws-kms-key-id": "false",
          },
        },
      }),
    )

    // Deny a PutObject that names an encryption algorithm other than SSE-KMS
    // (e.g. an explicit AES256 SSE-S3 downgrade). Header-omitted puts still
    // pass (same Null guard) and inherit the CMK default.
    this.documentsBucket.addToResourcePolicy(
      new PolicyStatement({
        sid: "DenyPutWithNonKmsAlgorithm",
        effect: Effect.DENY,
        principals: [new AnyPrincipal()],
        actions: ["s3:PutObject"],
        resources: [this.documentsBucket.arnForObjects("*")],
        conditions: {
          StringNotEquals: {
            "s3:x-amz-server-side-encryption": "aws:kms",
          },
          Null: {
            "s3:x-amz-server-side-encryption": "false",
          },
        },
      }),
    )

    // Deny an SSE-C put (customer-provided key). SSE-C sets its own header
    // (x-amz-server-side-encryption-customer-algorithm) and sets NEITHER of
    // the two headers denied above, so it would otherwise slip past both and
    // land under a key the app cannot read (self-DoS). Same Null guard: a
    // header-omitted put is untouched and inherits the CMK default. Any put
    // that DOES set the SSE-C algorithm header is denied outright.
    this.documentsBucket.addToResourcePolicy(
      new PolicyStatement({
        sid: "DenyPutWithCustomerProvidedKey",
        effect: Effect.DENY,
        principals: [new AnyPrincipal()],
        actions: ["s3:PutObject"],
        resources: [this.documentsBucket.arnForObjects("*")],
        conditions: {
          Null: {
            "s3:x-amz-server-side-encryption-customer-algorithm": "false",
          },
        },
      }),
    )

    // Enable request metrics (PutRequests/AllRequests) for the documents
    // put-rate anti-flood alarm in ObservabilityStack. Same pattern + cost
    // note as appBucket above.
    this.documentsBucket.addMetric({ id: "EntireBucket" })
  }
}

import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib"
import { ReadWriteType, Trail } from "aws-cdk-lib/aws-cloudtrail"
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3"
import type { Construct } from "constructs"

/**
 * Account-global audit stack. ONE CloudTrail for the whole account.
 *
 * Replaces the previous per-env trails (AFF cost review 2026-05-31, trap 4):
 * AWS gives the FIRST management-events trail in an account for free; every
 * additional trail bills. The old design created `monorepo-staging-management`
 * + `monorepo-production-management`, so the second one was charged. One
 * account trail captures management events for every env at no charge.
 *
 * Management events only, single-region (includeGlobalServiceEvents=true still
 * captures IAM/STS/etc.), file validation on, 90-day bucket lifecycle.
 *
 * Deploy ONCE, manually: `cdk deploy Audit` — same pattern as
 * SecretsBootstrap. NOT wired into the per-env deploy workflow (it spans
 * envs, and the env workflows must not be able to re-deploy or destroy it).
 *
 * SEQUENCING: deploy this BEFORE redeploying the per-env Security stacks that
 * drop their own trails, so there is no audit gap (a brief two-trail overlap
 * is harmless; a gap is not).
 */
export class AuditStack extends Stack {
  readonly auditBucket: Bucket

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props)

    this.auditBucket = new Bucket(this, "AuditBucket", {
      bucketName: `monorepo-account-audit-logs-${this.account}`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
      lifecycleRules: [
        {
          id: "Expire90d",
          expiration: Duration.days(90),
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
      ],
      // The account audit log survives a stack destroy — never autodelete it.
      removalPolicy: RemovalPolicy.RETAIN,
    })

    new Trail(this, "ManagementTrail", {
      trailName: "monorepo-account-management",
      bucket: this.auditBucket,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: false,
      enableFileValidation: true,
      managementEvents: ReadWriteType.ALL,
    })
  }
}

import { Match, Template } from "aws-cdk-lib/assertions"
import { describe, expect, it } from "vitest"
import { buildTestApp } from "./helper.js"

const DOCUMENTS_BUCKET_NAME = "monorepo-test-documents-123456789012"

type Statement = {
  Effect?: string
  Action?: string | string[]
  Resource?: unknown
  Condition?: unknown
}

function actionsOf(stmt: Statement): string[] {
  const a = stmt.Action
  return Array.isArray(a) ? a : a ? [a] : []
}

function allStatements(policies: Record<string, unknown>): Statement[] {
  const out: Statement[] = []
  for (const policy of Object.values(policies) as Array<{
    Properties?: { PolicyDocument?: { Statement?: Statement[] } }
  }>) {
    for (const stmt of policy.Properties?.PolicyDocument?.Statement ?? []) {
      out.push(stmt)
    }
  }
  return out
}

describe("DocumentsBucket — DataStack shape (S3 document store P1a)", () => {
  const { data } = buildTestApp()
  const template = Template.fromStack(data)

  it("exposes documentsBucket + documentsKey on the stack instance", () => {
    expect(data.documentsBucket).toBeDefined()
    expect(data.documentsKey).toBeDefined()
    // Distinct from the app bucket (separate blast radius).
    expect(data.documentsBucket).not.toBe(data.appBucket)
  })

  it("creates a dedicated CMK with key rotation ON", () => {
    template.hasResourceProperties("AWS::KMS::Key", {
      EnableKeyRotation: true,
      Description: Match.stringLikeRegexp("documents bucket"),
    })
  })

  it("bucket default encryption is the CMK with bucketKeyEnabled (browser POST lands encrypted)", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: DOCUMENTS_BUCKET_NAME,
      BucketEncryption: Match.objectLike({
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
            BucketKeyEnabled: true,
            ServerSideEncryptionByDefault: Match.objectLike({
              SSEAlgorithm: "aws:kms",
              KMSMasterKeyID: Match.anyValue(),
            }),
          }),
        ]),
      }),
    })
  })

  it("is versioned, BlockPublicAccess ALL, BucketOwnerEnforced", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: DOCUMENTS_BUCKET_NAME,
      VersioningConfiguration: { Status: "Enabled" },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      OwnershipControls: {
        Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }],
      },
    })
  })

  it("has NO Object Lock (design A — working store, not statutory archive)", () => {
    const buckets = template.findResources("AWS::S3::Bucket")
    const doc = Object.values(buckets).find(
      (b) =>
        (b as { Properties?: { BucketName?: string } }).Properties
          ?.BucketName === DOCUMENTS_BUCKET_NAME,
    ) as { Properties?: Record<string, unknown> } | undefined
    expect(doc).toBeDefined()
    expect(doc?.Properties?.ObjectLockEnabled).toBeUndefined()
    expect(doc?.Properties?.ObjectLockConfiguration).toBeUndefined()
  })

  it("puts ≥128KiB objects into Intelligent-Tiering at day 0 with NO async archive tiers", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: DOCUMENTS_BUCKET_NAME,
      LifecycleConfiguration: Match.objectLike({
        Rules: Match.arrayWith([
          Match.objectLike({
            Id: "IntelligentTiering",
            // S2: only the ≥128KiB tail transitions. Sub-128KiB objects never
            // auto-tier, so transitioning them is pure lifecycle-request cost.
            // `128*1024 - 1` (strict >) so an exactly-128KiB object is included.
            ObjectSizeGreaterThan: 128 * 1024 - 1,
            Transitions: Match.arrayWith([
              Match.objectLike({
                StorageClass: "INTELLIGENT_TIERING",
                TransitionInDays: 0,
              }),
            ]),
          }),
        ]),
      }),
    })
    // The async Archive / Deep-Archive tiers are opt-in ONLY via a bucket
    // IntelligentTieringConfigurations block. We never add one, so it must be
    // absent — proving only the automatic (instant) tiers are in play.
    const buckets = template.findResources("AWS::S3::Bucket")
    const doc = Object.values(buckets).find(
      (b) =>
        (b as { Properties?: { BucketName?: string } }).Properties
          ?.BucketName === DOCUMENTS_BUCKET_NAME,
    ) as { Properties?: Record<string, unknown> } | undefined
    expect(doc?.Properties?.IntelligentTieringConfigurations).toBeUndefined()
  })

  it("native lifecycle: abort multipart 7d, noncurrent 30d, expired-delete-marker cleanup, NO tag-age rule", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: DOCUMENTS_BUCKET_NAME,
      LifecycleConfiguration: Match.objectLike({
        Rules: Match.arrayWith([
          Match.objectLike({
            Id: "NativeCleanup",
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
            NoncurrentVersionExpiration: { NoncurrentDays: 30 },
            ExpiredObjectDeleteMarker: true,
          }),
        ]),
      }),
    })
    // No current-version Expiration anywhere (the reaper owns tag-age delete).
    const buckets = template.findResources("AWS::S3::Bucket")
    const doc = Object.values(buckets).find(
      (b) =>
        (b as { Properties?: { BucketName?: string } }).Properties
          ?.BucketName === DOCUMENTS_BUCKET_NAME,
    ) as
      | {
          Properties?: {
            LifecycleConfiguration?: { Rules?: Array<Record<string, unknown>> }
          }
        }
      | undefined
    const rules = doc?.Properties?.LifecycleConfiguration?.Rules ?? []
    for (const rule of rules) {
      expect(rule.Expiration).toBeUndefined()
      expect(rule.ExpirationInDays).toBeUndefined()
    }
  })

  it("CORS allows GET/HEAD/POST from the exact web origin with Range + Content-Type + x-amz-* headers", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: DOCUMENTS_BUCKET_NAME,
      CorsConfiguration: Match.objectLike({
        CorsRules: Match.arrayWith([
          Match.objectLike({
            AllowedMethods: ["GET", "HEAD", "POST"],
            AllowedOrigins: ["https://test.example.com"],
            AllowedHeaders: Match.arrayWith([
              "Range",
              "Content-Type",
              "x-amz-*",
            ]),
            ExposedHeaders: Match.arrayWith([
              "Content-Range",
              "Content-Length",
              "Accept-Ranges",
              "ETag",
            ]),
          }),
        ]),
      }),
    })
  })

  it("bucket policy denies a PutObject that names a non-CMK KMS key, guarded so header-omitted puts still land (the footgun)", () => {
    const policies = template.findResources("AWS::S3::BucketPolicy")
    const statements: Statement[] = []
    for (const policy of Object.values(policies) as Array<{
      Properties?: { PolicyDocument?: { Statement?: Statement[] } }
    }>) {
      statements.push(...(policy.Properties?.PolicyDocument?.Statement ?? []))
    }

    const keyIdDeny = statements.find((s) => {
      const cond = JSON.stringify(s.Condition ?? {})
      return (
        s.Effect === "Deny" &&
        cond.includes("s3:x-amz-server-side-encryption-aws-kms-key-id") &&
        cond.includes('"Null"')
      )
    })
    expect(keyIdDeny).toBeDefined()
    // The Null guard MUST be "false" (= header present). "true" would deny
    // header-omitted puts and brick every browser upload.
    const nullGuard = (
      keyIdDeny?.Condition as {
        Null?: Record<string, string>
      }
    )?.Null?.["s3:x-amz-server-side-encryption-aws-kms-key-id"]
    expect(nullGuard).toBe("false")
    // And it must be a StringNotEquals guard (deny only a WRONG key).
    expect(
      (keyIdDeny?.Condition as { StringNotEquals?: unknown })?.StringNotEquals,
    ).toBeDefined()
    expect(actionsOf(keyIdDeny as Statement)).toContain("s3:PutObject")

    // Companion: deny an explicit non-KMS algorithm (e.g. AES256 downgrade),
    // same Null:false guard so header-omitted puts still pass.
    const algDeny = statements.find((s) => {
      const cond = JSON.stringify(s.Condition ?? {})
      return (
        s.Effect === "Deny" &&
        cond.includes('"s3:x-amz-server-side-encryption"') &&
        cond.includes('"Null"')
      )
    })
    expect(algDeny).toBeDefined()
    const algNull = (algDeny?.Condition as { Null?: Record<string, string> })
      ?.Null?.["s3:x-amz-server-side-encryption"]
    expect(algNull).toBe("false")

    // Companion: deny SSE-C (customer-provided key). It sets neither header
    // above, so without this it would evade both denies and land under a key
    // the app can't read. Denied whenever the SSE-C algorithm header is
    // present (Null:false); header-omitted puts still pass.
    const sseCDeny = statements.find((s) => {
      const cond = JSON.stringify(s.Condition ?? {})
      return (
        s.Effect === "Deny" &&
        cond.includes("s3:x-amz-server-side-encryption-customer-algorithm")
      )
    })
    expect(sseCDeny).toBeDefined()
    const sseCNull = (sseCDeny?.Condition as { Null?: Record<string, string> })
      ?.Null?.["s3:x-amz-server-side-encryption-customer-algorithm"]
    expect(sseCNull).toBe("false")
    expect(actionsOf(sseCDeny as Statement)).toContain("s3:PutObject")
  })
})

describe("DocumentsBucket — app task-role grants (SAFETY: Get+Put+tag, NEVER Delete)", () => {
  const { appStack } = buildTestApp()
  const template = Template.fromStack(appStack)

  // Collect every IAM policy statement in the App stack whose Resource
  // references the documents bucket. With `@aws-cdk/aws-iam:minimizePolicies`
  // on and a SHARED task role that legitimately holds s3:Delete* on the *app*
  // bucket, the assertion MUST be resource-scoped: no Delete may reference the
  // DOCUMENTS bucket, even though the role has Delete on appBucket.
  const statements = allStatements(
    template.findResources("AWS::IAM::Policy"),
  ).filter((s) => {
    if (s.Effect && s.Effect !== "Allow") return false
    return JSON.stringify(s.Resource ?? "").includes("DocumentsBucket")
  })
  const docActions = new Set<string>()
  for (const s of statements) for (const a of actionsOf(s)) docActions.add(a)

  it("grants read (GetObject*) + put (PutObject) on the documents bucket", () => {
    expect(docActions.has("s3:GetObject*")).toBe(true)
    expect(docActions.has("s3:PutObject")).toBe(true)
  })

  it("grants object tagging (Put + Get) on the documents bucket", () => {
    expect(docActions.has("s3:PutObjectTagging")).toBe(true)
    expect(docActions.has("s3:GetObjectTagging")).toBe(true)
  })

  it("grants NO s3:DeleteObject* / DeleteObjectVersion on the documents bucket", () => {
    const deletes = [...docActions].filter((a) => /^s3:DeleteObject/i.test(a))
    expect(
      deletes,
      `unexpected Delete actions on documents bucket: ${deletes.join(", ")}`,
    ).toEqual([])
  })

  it("grants KMS decrypt + data-key on the documents CMK (SSE-KMS put + presigned-GET decrypt)", () => {
    const kmsStatements = allStatements(
      template.findResources("AWS::IAM::Policy"),
    ).filter((s) => {
      if (s.Effect && s.Effect !== "Allow") return false
      return JSON.stringify(s.Resource ?? "").includes("DocumentsKey")
    })
    const kmsActions = new Set<string>()
    for (const s of kmsStatements)
      for (const a of actionsOf(s)) kmsActions.add(a)
    expect(kmsActions.has("kms:Decrypt")).toBe(true)
    expect([...kmsActions].some((a) => /^kms:GenerateDataKey/i.test(a))).toBe(
      true,
    )
  })
})

describe("ObservabilityStack — documents bucket alarms", () => {
  const { observability } = buildTestApp()
  const template = Template.fromStack(observability)

  it("has put-rate + bucket-size alarms for the documents bucket", () => {
    for (const name of [
      "monorepo-test-s3-documents-put-rate-high",
      "monorepo-test-s3-documents-bucket-size-high",
    ]) {
      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        AlarmName: name,
      })
    }
  })

  it("documents put-rate + size alarms are SNS-only, never the kill-switch", () => {
    // A documents write-flood must NOT stop the ECS service — a bulk invoice
    // onboarding is legitimate. Both alarms alert via SNS only (1 action).
    const alarms = template.findResources("AWS::CloudWatch::Alarm")
    const byName = (n: string) =>
      Object.values(alarms).find(
        (a) =>
          (a as { Properties?: { AlarmName?: string } }).Properties
            ?.AlarmName === n,
      ) as { Properties?: { AlarmActions?: unknown[] } } | undefined
    expect(
      byName("monorepo-test-s3-documents-put-rate-high")?.Properties
        ?.AlarmActions?.length,
    ).toBe(1)
    expect(
      byName("monorepo-test-s3-documents-bucket-size-high")?.Properties
        ?.AlarmActions?.length,
    ).toBe(1)
  })

  it("documents size alarm sums Intelligent-Tiering storage classes (not StandardStorage-only)", () => {
    const alarms = template.findResources("AWS::CloudWatch::Alarm")
    const size = Object.values(alarms).find(
      (a) =>
        (a as { Properties?: { AlarmName?: string } }).Properties?.AlarmName ===
        "monorepo-test-s3-documents-bucket-size-high",
    ) as { Properties?: { Metrics?: unknown[] } } | undefined
    const serialized = JSON.stringify(size?.Properties?.Metrics ?? [])
    expect(serialized).toContain("IntelligentTieringFAStorage")
    expect(serialized).toContain("IntelligentTieringIAStorage")
    expect(serialized).toContain("IntelligentTieringAIAStorage")
  })
})

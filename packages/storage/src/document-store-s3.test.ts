import { createHash } from "node:crypto"
import {
  CopyObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { mockClient } from "aws-sdk-client-mock"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { S3DocumentStore } from "./document-store-s3"

// CAVEAT: this suite mocks the S3 SDK client (aws-sdk-client-mock) and never
// hits real S3. It only asserts the SHAPE of the requests we send — it
// proves nothing about S3's server-side enforcement of the POST policy
// (content-length-range, key, checksum conditions), the x-amz-checksum-sha256
// recompute-and-compare S3 does on upload, or SSE-KMS behavior. Real-S3
// verification is the P1 staging gate.

// createPresignedPost/getSignedUrl sign locally (no network call), but still
// need resolvable static credentials — set env vars so the default provider
// chain resolves instantly instead of falling through to a local profile or
// IMDS. AWS_PROFILE is cleared first: the env-credentials provider defers to
// it when both are set, which would pull in whatever profile the developer's
// shell happens to have configured.
beforeAll(() => {
  delete process.env.AWS_PROFILE
  process.env.AWS_ACCESS_KEY_ID = "test-access-key-id"
  process.env.AWS_SECRET_ACCESS_KEY = "test-secret-access-key"
})

const s3Mock = mockClient(S3Client)

beforeEach(() => {
  s3Mock.reset()
})

function makeStore(kmsKeyId?: string): S3DocumentStore {
  return new S3DocumentStore({
    bucket: "documents-bucket",
    region: "us-east-1",
    kmsKeyId,
  })
}

function decodePolicy(fields: Record<string, string>): unknown[] {
  const policy = fields.Policy
  expect(policy).toBeDefined()
  const decoded = JSON.parse(
    Buffer.from(policy as string, "base64").toString("utf8"),
  ) as { conditions: unknown[] }
  return decoded.conditions
}

// The workspaceId segment of a document key is a UUID (documentKey() rejects
// anything else — S1). Keys that reach documentKey (put/presignPost) use this;
// raw-key tests below (presignGet/headExists never validate the workspaceId)
// keep their opaque "ws_1" fixtures.
const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111"

describe("key derivation (documents/{workspaceId}/{sha256}.{ext})", () => {
  it("put() derives the key from the workspaceId, the bytes' own sha256, and the filename extension", async () => {
    s3Mock.on(PutObjectCommand).resolves({})
    const store = makeStore()
    const bytes = Buffer.from("hello world")
    const expectedSha256 = createHash("sha256").update(bytes).digest("hex")

    const result = await store.put(bytes, {
      workspaceId: WORKSPACE_ID,
      contentType: "text/plain",
      filename: "notes.TXT",
    })

    expect(result.key).toBe(`documents/${WORKSPACE_ID}/${expectedSha256}.txt`)
    expect(result.sha256).toBe(expectedSha256)
    expect(result.size).toBe(bytes.byteLength)
  })

  it("presignPost() derives the key from the caller-supplied sha256 (client computed it before presigning)", async () => {
    const store = makeStore()
    const sha256 = "a".repeat(64)

    const result = await store.presignPost({
      workspaceId: WORKSPACE_ID,
      sha256,
      ext: "pdf",
      contentType: "application/pdf",
      maxBytes: 10_000_000,
      ttlSeconds: 60,
    })

    expect(result.key).toBe(`documents/${WORKSPACE_ID}/${sha256}.pdf`)
  })

  it("put() and presignPost() reject a workspaceId that is not a UUID (S1 — key must match parseDocumentKey)", async () => {
    const store = makeStore()

    await expect(
      store.put(Buffer.from("x"), {
        workspaceId: "ws_1",
        contentType: "text/plain",
        filename: "notes.txt",
      }),
    ).rejects.toThrow(/workspaceId/)
    await expect(
      store.presignPost({
        workspaceId: "ws_1",
        sha256: "a".repeat(64),
        ext: "pdf",
        contentType: "application/pdf",
        maxBytes: 10_000_000,
        ttlSeconds: 60,
      }),
    ).rejects.toThrow(/workspaceId/)
  })
})

describe("presignPost() policy conditions", () => {
  it("enforces content-length-range, the pinned key, content-type, and the sha256 checksum", async () => {
    const store = makeStore()
    const sha256 = "b".repeat(64)

    const result = await store.presignPost({
      workspaceId: WORKSPACE_ID,
      sha256,
      ext: "pdf",
      contentType: "application/pdf",
      maxBytes: 10_000_000,
      ttlSeconds: 60,
    })

    const conditions = decodePolicy(result.fields)
    const checksumBase64 = Buffer.from(sha256, "hex").toString("base64")

    expect(conditions).toContainEqual(["content-length-range", 1, 10_000_000])
    expect(conditions).toContainEqual(["eq", "$key", result.key])
    expect(conditions).toContainEqual([
      "eq",
      "$Content-Type",
      "application/pdf",
    ])
    expect(conditions).toContainEqual([
      "eq",
      "$x-amz-checksum-sha256",
      checksumBase64,
    ])
    expect(result.fields["Content-Type"]).toBe("application/pdf")
    expect(result.fields["x-amz-checksum-sha256"]).toBe(checksumBase64)
  })

  it("never adds an x-amz-server-side-encryption condition, even when a CMK is configured", async () => {
    // A browser presigned POST does not reliably send
    // x-amz-server-side-encryption* headers, so requiring them via a policy
    // condition would 403 every KMS-mode upload. Encryption comes from the
    // bucket's default encryption instead.
    const kmsKeyId = "arn:aws:kms:eu-central-1:123456789012:key/test-cmk"
    const store = makeStore(kmsKeyId)

    const result = await store.presignPost({
      workspaceId: WORKSPACE_ID,
      sha256: "c".repeat(64),
      ext: "pdf",
      contentType: "application/pdf",
      maxBytes: 10_000_000,
      ttlSeconds: 60,
    })

    const conditions = decodePolicy(result.fields)
    const hasSseCondition = conditions.some(
      (condition) =>
        Array.isArray(condition) &&
        typeof condition[1] === "string" &&
        condition[1].startsWith("$x-amz-server-side-encryption"),
    )
    expect(hasSseCondition).toBe(false)
    expect(conditions).toContainEqual(["content-length-range", 1, 10_000_000])
    expect(conditions).toContainEqual(["eq", "$key", result.key])
    expect(conditions).toContainEqual([
      "eq",
      "$Content-Type",
      "application/pdf",
    ])
  })

  it("omits SSE-KMS conditions when no CMK is configured", async () => {
    const store = makeStore()

    const result = await store.presignPost({
      workspaceId: WORKSPACE_ID,
      sha256: "d".repeat(64),
      ext: "pdf",
      contentType: "application/pdf",
      maxBytes: 10_000_000,
      ttlSeconds: 60,
    })

    const conditions = decodePolicy(result.fields)
    const hasSseCondition = conditions.some(
      (condition) =>
        Array.isArray(condition) &&
        typeof condition[1] === "string" &&
        condition[1].startsWith("$x-amz-server-side-encryption"),
    )
    expect(hasSseCondition).toBe(false)
  })
})

describe("presignPost() input validation", () => {
  const validInput = {
    workspaceId: WORKSPACE_ID,
    sha256: "e".repeat(64),
    ext: "pdf",
    contentType: "application/pdf",
    maxBytes: 10_000_000,
    ttlSeconds: 60,
  }

  it("throws on a sha256 that is not 64 lowercase hex characters", async () => {
    const store = makeStore()

    await expect(
      store.presignPost({ ...validInput, sha256: "not-hex" }),
    ).rejects.toThrow(/sha256/)
    await expect(
      store.presignPost({ ...validInput, sha256: "A".repeat(64) }),
    ).rejects.toThrow(/sha256/)
  })

  it("throws on an ext with uppercase or symbol characters", async () => {
    const store = makeStore()

    await expect(
      store.presignPost({ ...validInput, ext: "PDF" }),
    ).rejects.toThrow(/extension/)
    await expect(
      store.presignPost({ ...validInput, ext: "pdf;drop" }),
    ).rejects.toThrow(/extension/)
  })

  it("throws when maxBytes is less than 1", async () => {
    const store = makeStore()

    await expect(
      store.presignPost({ ...validInput, maxBytes: 0 }),
    ).rejects.toThrow(/maxBytes/)
    await expect(
      store.presignPost({ ...validInput, maxBytes: -5 }),
    ).rejects.toThrow(/maxBytes/)
  })

  it("throws when maxBytes is not an integer", async () => {
    const store = makeStore()

    await expect(
      store.presignPost({ ...validInput, maxBytes: 1.5 }),
    ).rejects.toThrow(/maxBytes/)
  })

  it("throws when ttlSeconds is out of the [1, 604800] range", async () => {
    const store = makeStore()

    await expect(
      store.presignPost({ ...validInput, ttlSeconds: 0 }),
    ).rejects.toThrow(/ttlSeconds/)
    await expect(
      store.presignPost({ ...validInput, ttlSeconds: 604_801 }),
    ).rejects.toThrow(/ttlSeconds/)
  })
})

describe("presignGet()", () => {
  const GET_KEY = `documents/${WORKSPACE_ID}/${"a".repeat(64)}.pdf`

  it("signs ResponseContentDisposition and ResponseContentType into the URL", async () => {
    const store = makeStore()

    const url = await store.presignGet(GET_KEY, {
      ttlSeconds: 900,
      disposition: "inline",
      responseContentType: "application/pdf",
      callerWorkspaceId: WORKSPACE_ID,
    })

    const params = new URL(url).searchParams
    expect(params.get("response-content-disposition")).toBe("inline")
    expect(params.get("response-content-type")).toBe("application/pdf")
    expect(params.get("X-Amz-Expires")).toBe("900")
  })

  it("supports attachment disposition with a sanitized filename", async () => {
    const store = makeStore()

    const url = await store.presignGet(GET_KEY, {
      ttlSeconds: 900,
      disposition: "attachment",
      filename: 'faktura "2025".pdf',
      callerWorkspaceId: WORKSPACE_ID,
    })

    const params = new URL(url).searchParams
    expect(params.get("response-content-disposition")).toBe(
      "attachment; filename=\"faktura _2025_.pdf\"; filename*=UTF-8''faktura%20%222025%22.pdf",
    )
    expect(params.has("response-content-type")).toBe(false)
  })

  it("throws when the key does not belong to the caller's workspace (IDOR backstop)", async () => {
    const store = makeStore()
    await expect(
      store.presignGet(GET_KEY, {
        ttlSeconds: 900,
        disposition: "inline",
        callerWorkspaceId: "22222222-2222-2222-2222-222222222222",
      }),
    ).rejects.toThrow(/does not belong to the caller's workspace/)
  })
})

describe("headExists()", () => {
  it("returns true when HeadObject succeeds", async () => {
    s3Mock.on(HeadObjectCommand).resolves({})
    const store = makeStore()

    await expect(store.headExists("documents/ws_1/abc.pdf")).resolves.toBe(true)
  })

  it("returns false on a NotFound error", async () => {
    s3Mock
      .on(HeadObjectCommand)
      .rejects(new NotFound({ message: "Not Found", $metadata: {} }))
    const store = makeStore()

    await expect(store.headExists("documents/ws_1/missing.pdf")).resolves.toBe(
      false,
    )
  })

  it("returns false on a generic 404 error", async () => {
    s3Mock
      .on(HeadObjectCommand)
      .rejects({ name: "SomeOtherName", $metadata: { httpStatusCode: 404 } })
    const store = makeStore()

    await expect(store.headExists("documents/ws_1/missing.pdf")).resolves.toBe(
      false,
    )
  })

  it("rethrows non-404 errors", async () => {
    s3Mock.on(HeadObjectCommand).rejects(new Error("boom"))
    const store = makeStore()

    await expect(store.headExists("documents/ws_1/abc.pdf")).rejects.toThrow(
      "boom",
    )
  })
})

describe("tag methods — merge, never clobber", () => {
  function putTaggingCalls() {
    return s3Mock.commandCalls(PutObjectTaggingCommand)
  }

  function copyCalls() {
    return s3Mock.commandCalls(CopyObjectCommand)
  }

  it("setDeletedTag adds deleted-at=<ISO now> and preserves existing tags", async () => {
    s3Mock.on(GetObjectTaggingCommand).resolves({
      TagSet: [{ Key: "confirmed-at", Value: "2026-01-01T00:00:00.000Z" }],
    })
    s3Mock.on(PutObjectTaggingCommand).resolves({})
    const store = makeStore()

    const before = new Date().toISOString()
    await store.setDeletedTag("documents/ws_1/abc.pdf")
    const after = new Date().toISOString()

    const calls = putTaggingCalls()
    expect(calls).toHaveLength(1)
    const call = calls[0]
    if (!call) throw new Error("expected exactly one PutObjectTagging call")
    const tagSet = call.args[0].input.Tagging?.TagSet ?? []
    const tags = Object.fromEntries(tagSet.map((tag) => [tag.Key, tag.Value]))

    expect(tags["confirmed-at"]).toBe("2026-01-01T00:00:00.000Z")
    const deletedAt = tags["deleted-at"]
    expect(deletedAt).toBeDefined()
    expect(
      (deletedAt as string) >= before && (deletedAt as string) <= after,
    ).toBe(true)
  })

  it("clearDeletedTag copies the pinned version and removes only deleted-at", async () => {
    s3Mock.on(GetObjectTaggingCommand).resolves({
      VersionId: "source+version/1",
      TagSet: [
        { Key: "deleted-at", Value: "2026-01-01T00:00:00.000Z" },
        { Key: "confirmed-at", Value: "2025-12-01T00:00:00.000Z" },
        { Key: "unrelated", Value: "keep me" },
      ],
    })
    s3Mock.on(HeadObjectCommand).resolves({
      VersionId: "source+version/1",
      ETag: '"source-etag"',
      ContentType: "application/pdf",
      ContentDisposition: "inline",
      Metadata: { originalname: "invoice.pdf" },
      StorageClass: "STANDARD_IA",
    })
    s3Mock.on(CopyObjectCommand).resolves({})
    const store = makeStore()

    await store.clearDeletedTag("documents/ws_1/abc.pdf")

    const calls = copyCalls()
    expect(calls).toHaveLength(1)
    const call = calls[0]
    if (!call) throw new Error("expected exactly one CopyObject call")
    const input = call.args[0].input
    const tags = Object.fromEntries(new URLSearchParams(input.Tagging))

    expect(tags).not.toHaveProperty("deleted-at")
    expect(tags["confirmed-at"]).toBe("2025-12-01T00:00:00.000Z")
    expect(tags["unrelated"]).toBe("keep me")
    expect(input.CopySource).toBe(
      "documents-bucket/documents/ws_1/abc.pdf?versionId=source%2Bversion%2F1",
    )
    expect(input.CopySourceIfMatch).toBe('"source-etag"')
    expect(input.MetadataDirective).toBe("REPLACE")
    expect(input.ContentType).toBe("application/pdf")
    expect(input.ContentDisposition).toBe("inline")
    expect(input.Metadata).toEqual({ originalname: "invoice.pdf" })
    expect(input.StorageClass).toBe("STANDARD_IA")
    expect(input.TaggingDirective).toBe("REPLACE")
    expect(input.ChecksumAlgorithm).toBe("SHA256")
    // The pinned VersionId now comes from HEAD (portable), and the tags are
    // read for that exact version.
    const tagCall = s3Mock.commandCalls(GetObjectTaggingCommand)[0]
    expect(tagCall?.args[0].input.VersionId).toBe("source+version/1")
    expect(putTaggingCalls()).toHaveLength(0)
  })

  it("tagConfirmed copies the pinned version with fresh live tags and KMS encryption", async () => {
    s3Mock.on(GetObjectTaggingCommand).resolves({
      VersionId: "source-version",
      TagSet: [
        { Key: "some-other-tag", Value: "keep-me" },
        { Key: "confirmed-at", Value: "2025-12-01T00:00:00.000Z" },
        { Key: "deleted-at", Value: "2026-01-01T00:00:00.000Z" },
        { Key: "orphan-at", Value: "2026-01-02T00:00:00.000Z" },
      ],
    })
    s3Mock.on(HeadObjectCommand).resolves({
      VersionId: "source-version",
      ETag: '"source-etag"',
      ContentType: "application/pdf",
    })
    s3Mock.on(CopyObjectCommand).resolves({})
    const kmsKeyId = "arn:aws:kms:eu-central-1:123456789012:key/test-cmk"
    const store = makeStore(kmsKeyId)
    const confirmedAt = "2026-07-14T08:00:00.000Z"

    vi.useFakeTimers()
    vi.setSystemTime(confirmedAt)
    try {
      await store.tagConfirmed("documents/ws_1/abc.pdf")
    } finally {
      vi.useRealTimers()
    }

    const calls = copyCalls()
    expect(calls).toHaveLength(1)
    const call = calls[0]
    if (!call) throw new Error("expected exactly one CopyObject call")
    const input = call.args[0].input
    const tags = Object.fromEntries(new URLSearchParams(input.Tagging))

    expect(tags["some-other-tag"]).toBe("keep-me")
    expect(tags["confirmed-at"]).toBe(confirmedAt)
    expect(tags).not.toHaveProperty("deleted-at")
    expect(tags).not.toHaveProperty("orphan-at")
    expect(input.CopySource).toBe(
      "documents-bucket/documents/ws_1/abc.pdf?versionId=source-version",
    )
    expect(input.ServerSideEncryption).toBe("aws:kms")
    expect(input.SSEKMSKeyId).toBe(kmsKeyId)
    expect(input.CopySourceIfMatch).toBe('"source-etag"')
    expect(input.MetadataDirective).toBe("REPLACE")
    expect(input.ContentType).toBe("application/pdf")
    expect(input.ChecksumAlgorithm).toBe("SHA256")
    expect(putTaggingCalls()).toHaveLength(0)
  })

  it("does not report confirmation success when the pinned source was reaped", async () => {
    s3Mock.on(GetObjectTaggingCommand).resolves({
      VersionId: "reaped-source",
      TagSet: [],
    })
    s3Mock.on(HeadObjectCommand).resolves({
      VersionId: "reaped-source",
      ETag: '"source-etag"',
    })
    s3Mock.on(CopyObjectCommand).rejects(new Error("NoSuchKey"))
    const store = makeStore()

    await expect(store.tagConfirmed("documents/ws_1/abc.pdf")).rejects.toThrow(
      "NoSuchKey",
    )
    expect(putTaggingCalls()).toHaveLength(0)
  })

  it("tagOrphan adds orphan-at=<ISO now> and preserves existing tags", async () => {
    s3Mock.on(GetObjectTaggingCommand).resolves({
      TagSet: [{ Key: "some-other-tag", Value: "keep-me" }],
    })
    s3Mock.on(PutObjectTaggingCommand).resolves({})
    const store = makeStore()

    const before = new Date().toISOString()
    await store.tagOrphan("documents/ws_1/abc.pdf")
    const after = new Date().toISOString()

    const calls = putTaggingCalls()
    const call = calls[0]
    if (!call) throw new Error("expected exactly one PutObjectTagging call")
    const tagSet = call.args[0].input.Tagging?.TagSet ?? []
    const tags = Object.fromEntries(tagSet.map((tag) => [tag.Key, tag.Value]))

    expect(tags["some-other-tag"]).toBe("keep-me")
    const orphanAt = tags["orphan-at"]
    expect(orphanAt).toBeDefined()
    expect(
      (orphanAt as string) >= before && (orphanAt as string) <= after,
    ).toBe(true)
  })
})

describe("head()", () => {
  it("returns the S3-authoritative values verbatim", async () => {
    s3Mock.on(HeadObjectCommand).resolves({
      ContentLength: 1234,
      ContentType: "application/pdf",
      ChecksumSHA256: "deadbeef==",
      ETag: '"abc123"',
    })
    const store = makeStore()

    const result = await store.head("documents/ws_1/abc.pdf")

    expect(result).toEqual({
      size: 1234,
      contentType: "application/pdf",
      checksumSha256: "deadbeef==",
      etag: '"abc123"',
    })
  })
})

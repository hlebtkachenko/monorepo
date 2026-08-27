/**
 * Config parsing: the local MinIO override and the production default shape.
 *
 * `readS3DocumentStoreConfig()` reads five env vars, mirroring the sibling
 * store's exact names and precedence
 * (`packages/storage/src/document-store-s3.ts`, `docs/ENVIRONMENT-VARIABLES.md`).
 * The property under test throughout: with the new vars unset, the returned
 * config and the `S3Client` options `createS3DocumentStore` builds from it are
 * byte-identical to what they were before this override existed.
 */
import { S3Client } from "@aws-sdk/client-s3"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  readS3DocumentStoreConfig,
  s3ClientOptionsFromConfig,
} from "./document-store-s3"

const ENV_KEYS = [
  "DOCUMENTS_BUCKET",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "DOCUMENTS_KMS_KEY_ID",
  "S3_ENDPOINT",
  "DOCUMENTS_S3_ACCESS_KEY_ID",
  "DOCUMENTS_S3_SECRET_ACCESS_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
] as const

let saved: Partial<Record<(typeof ENV_KEYS)[number], string>>

beforeEach(() => {
  saved = {}
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
  process.env["DOCUMENTS_BUCKET"] = "beta-documents"
  process.env["AWS_REGION"] = "eu-central-1"
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("readS3DocumentStoreConfig — required vars", () => {
  it("throws when DOCUMENTS_BUCKET is unset", () => {
    delete process.env["DOCUMENTS_BUCKET"]
    expect(() => readS3DocumentStoreConfig()).toThrow(/DOCUMENTS_BUCKET/)
  })

  it("throws when neither AWS_REGION nor AWS_DEFAULT_REGION is set", () => {
    delete process.env["AWS_REGION"]
    expect(() => readS3DocumentStoreConfig()).toThrow(/AWS_REGION/)
  })

  it("falls back to AWS_DEFAULT_REGION when AWS_REGION is unset", () => {
    delete process.env["AWS_REGION"]
    process.env["AWS_DEFAULT_REGION"] = "eu-west-1"
    expect(readS3DocumentStoreConfig().region).toBe("eu-west-1")
  })
})

describe("readS3DocumentStoreConfig — no endpoint override (today's production shape)", () => {
  it("returns exactly {bucket, region} with none of the optional vars set", () => {
    expect(readS3DocumentStoreConfig()).toEqual({
      bucket: "beta-documents",
      region: "eu-central-1",
    })
  })

  it("adds only kmsKeyId when DOCUMENTS_KMS_KEY_ID is set and no endpoint is set", () => {
    process.env["DOCUMENTS_KMS_KEY_ID"] =
      "arn:aws:kms:eu-central-1:111111111111:key/test-cmk"

    expect(readS3DocumentStoreConfig()).toEqual({
      bucket: "beta-documents",
      region: "eu-central-1",
      kmsKeyId: "arn:aws:kms:eu-central-1:111111111111:key/test-cmk",
    })
  })

  it("never adds credentials from stray AWS_ACCESS_KEY_ID/SECRET when S3_ENDPOINT is unset", () => {
    process.env["AWS_ACCESS_KEY_ID"] = "leaked-id"
    process.env["AWS_SECRET_ACCESS_KEY"] = "leaked-secret"

    expect(readS3DocumentStoreConfig()).toEqual({
      bucket: "beta-documents",
      region: "eu-central-1",
    })
  })
})

describe("readS3DocumentStoreConfig — S3_ENDPOINT override (local MinIO)", () => {
  it("adds endpoint with document-scoped credentials when both are set", () => {
    process.env["S3_ENDPOINT"] = "http://localhost:9000"
    process.env["DOCUMENTS_S3_ACCESS_KEY_ID"] = "minio-id"
    process.env["DOCUMENTS_S3_SECRET_ACCESS_KEY"] = "minio-secret"

    expect(readS3DocumentStoreConfig()).toEqual({
      bucket: "beta-documents",
      region: "eu-central-1",
      endpoint: "http://localhost:9000",
      credentials: {
        accessKeyId: "minio-id",
        secretAccessKey: "minio-secret",
      },
    })
  })

  it("falls back to AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY when the document-scoped vars are unset", () => {
    process.env["S3_ENDPOINT"] = "http://localhost:9000"
    process.env["AWS_ACCESS_KEY_ID"] = "fallback-id"
    process.env["AWS_SECRET_ACCESS_KEY"] = "fallback-secret"

    expect(readS3DocumentStoreConfig().credentials).toEqual({
      accessKeyId: "fallback-id",
      secretAccessKey: "fallback-secret",
    })
  })

  it("prefers the document-scoped vars over the process-global AWS ones", () => {
    process.env["S3_ENDPOINT"] = "http://localhost:9000"
    process.env["DOCUMENTS_S3_ACCESS_KEY_ID"] = "scoped-id"
    process.env["DOCUMENTS_S3_SECRET_ACCESS_KEY"] = "scoped-secret"
    process.env["AWS_ACCESS_KEY_ID"] = "global-id"
    process.env["AWS_SECRET_ACCESS_KEY"] = "global-secret"

    expect(readS3DocumentStoreConfig().credentials).toEqual({
      accessKeyId: "scoped-id",
      secretAccessKey: "scoped-secret",
    })
  })

  it("sets endpoint with no credentials when only one credential half is present", () => {
    process.env["S3_ENDPOINT"] = "http://localhost:9000"
    process.env["DOCUMENTS_S3_ACCESS_KEY_ID"] = "only-id"

    const config = readS3DocumentStoreConfig()
    expect(config.endpoint).toBe("http://localhost:9000")
    expect(config.credentials).toBeUndefined()
  })

  it("trims surrounding whitespace on the endpoint and credential vars", () => {
    process.env["S3_ENDPOINT"] = "  http://localhost:9000  "
    process.env["DOCUMENTS_S3_ACCESS_KEY_ID"] = " minio-id "
    process.env["DOCUMENTS_S3_SECRET_ACCESS_KEY"] = " minio-secret "

    expect(readS3DocumentStoreConfig()).toEqual({
      bucket: "beta-documents",
      region: "eu-central-1",
      endpoint: "http://localhost:9000",
      credentials: {
        accessKeyId: "minio-id",
        secretAccessKey: "minio-secret",
      },
    })
  })
})

describe("s3ClientOptionsFromConfig — the S3Client this app actually builds", () => {
  it("today's shape: no endpoint, no forcePathStyle, no credentials override", () => {
    const client = new S3Client(
      s3ClientOptionsFromConfig({ bucket: "b", region: "eu-central-1" }),
    )

    expect(client.config.forcePathStyle).toBe(false)
    expect(client.config.endpoint).toBeUndefined()
  })

  it("an endpoint override forces path-style addressing and pins the endpoint", async () => {
    const client = new S3Client(
      s3ClientOptionsFromConfig({
        bucket: "b",
        region: "eu-central-1",
        endpoint: "http://localhost:9000",
        credentials: {
          accessKeyId: "minio-id",
          secretAccessKey: "minio-secret",
        },
      }),
    )

    expect(client.config.forcePathStyle).toBe(true)
    const resolvedEndpoint = await client.config.endpoint?.()
    expect(resolvedEndpoint).toMatchObject({
      hostname: "localhost",
      port: 9000,
      protocol: "http:",
    })
    const resolvedCredentials = await client.config.credentials()
    expect(resolvedCredentials).toMatchObject({
      accessKeyId: "minio-id",
      secretAccessKey: "minio-secret",
    })
  })

  it("an endpoint without credentials still forces path-style, with no credentials override", () => {
    const client = new S3Client(
      s3ClientOptionsFromConfig({
        bucket: "b",
        region: "eu-central-1",
        endpoint: "http://localhost:9000",
      }),
    )

    expect(client.config.forcePathStyle).toBe(true)
    expect(client.config.endpoint).toBeDefined()
  })
})

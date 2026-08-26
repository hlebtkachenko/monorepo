import "server-only"

/**
 * The process-wide document store handle.
 *
 * Lazy for the same reason `db/client.ts` is lazy: a module-level `S3Client`
 * would be constructed during `next build`, where `DOCUMENTS_BUCKET` is not set.
 *
 * THE TEST SEAM, AND WHY IT IS A SETTER RATHER THAN AN ENV SWITCH. Route tests
 * need an in-memory store. The tempting shape is `if (process.env.STORE ===
 * "memory")` inside this module — and that is a production code path whose
 * failure mode is "every document the office uploaded is gone at the next
 * deploy, silently". A setter cannot be reached by a misconfigured environment
 * variable at all, and the production guard below means it cannot be reached in
 * production even by code.
 */
import type { BetaDocumentStore } from "./document-store"
import {
  createS3DocumentStore,
  readS3DocumentStoreConfig,
} from "./document-store-s3"

let cached: BetaDocumentStore | undefined
let override: BetaDocumentStore | undefined

export function documentStore(): BetaDocumentStore {
  if (override) return override
  cached ??= createS3DocumentStore(readS3DocumentStoreConfig())
  return cached
}

/**
 * Swap in a fake for the duration of a test. Pass `undefined` to restore.
 *
 * Refuses outright in production: a store this app cannot lose data through is
 * worth one branch.
 */
export function setDocumentStoreForTests(
  store: BetaDocumentStore | undefined,
): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("the document store cannot be replaced in production")
  }
  override = store
}

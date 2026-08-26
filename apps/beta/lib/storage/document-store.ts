/**
 * The storage seam: everything the data layer knows about where bytes live.
 *
 * NARROW ON PURPOSE — three methods. There is no `presign` of any kind and
 * there will not be one: plan Part 4 forbids presigned URLs outright ("files
 * streamed through app routes … No presigned URLs"), for two reasons that both
 * still hold. A presigned URL is a bearer credential with no membership behind
 * it — once minted it survives the user losing access, and it is copy-pasteable
 * out of the product — and it puts a second origin (`*.s3.amazonaws.com`) into
 * every CSP that wants to render a document, which is the `img-src`/`connect-src`
 * trap the main app already walked into. Streaming through a route costs a
 * proxy hop and buys an authorization check per byte range served.
 *
 * KEYS ARE OPAQUE AND ORG-PREFIXED. `org/<organization uuid>/<object uuid>.<ext>`.
 * Never the filename, never a hash of the content, never a date. `documentObjectKey`
 * is the ONLY place a key is constructed, and `assertKeyBelongsTo` is the
 * fail-closed floor under every read: even a caller holding a key from another
 * organization's row cannot get bytes out of the store.
 *
 * This module is PURE (no AWS import, no `server-only`) so the interface can be
 * implemented by an in-memory fake in tests. The S3 implementation lives in
 * `document-store-s3.ts` and is import-fenced.
 */
import { randomUUID } from "node:crypto"
import type { Readable } from "node:stream"

import type {
  BetaDocumentContentType,
  BetaDocumentExtension,
} from "./content-type"

export type PutDocumentInput = {
  organizationId: string
  contentType: BetaDocumentContentType
  extension: BetaDocumentExtension
  /** Streamed straight through; never buffered whole by the store. */
  body: Readable
}

export type PutDocumentResult = {
  /** The minted key. The caller persists it; it is not derivable from the row. */
  key: string
}

export interface BetaDocumentStore {
  /**
   * Streams `body` into a freshly-minted key. Rejects — leaving nothing behind
   * — when `body` errors, which is how the 25 MiB abort reaches S3.
   */
  put(input: PutDocumentInput): Promise<PutDocumentResult>
  /**
   * Opens the object for streaming back to the client. `organizationId` is the
   * CALLER's organization: the store refuses a key outside that prefix.
   */
  get(key: string, organizationId: string): Promise<Readable>
  /**
   * Removes an object. Used only as the compensating half of a failed upload
   * (a quota refusal or a duplicate, both decided after the bytes are already
   * in S3). Client-visible deletion is a soft delete on the row; the retention
   * purge of PR 37 is what eventually removes those objects.
   */
  delete(key: string, organizationId: string): Promise<void>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** `org/<organization uuid>/` — the prefix every one of an org's objects sits under. */
export function organizationPrefix(organizationId: string): string {
  if (!UUID.test(organizationId)) {
    throw new Error("organization id is not a uuid")
  }
  return `org/${organizationId}/`
}

/**
 * Mint a key for a new object.
 *
 * Random, not derived. A content-addressed key (`<sha256>.pdf`, which is what
 * the main app's store uses) would make the key a function of the bytes, and
 * therefore an oracle: anyone who can guess a document's contents can confirm
 * the guess by probing for its key. Here the key carries no information at all.
 */
export function documentObjectKey(
  organizationId: string,
  extension: BetaDocumentExtension,
): string {
  return `${organizationPrefix(organizationId)}${randomUUID()}.${extension}`
}

/**
 * Fail-closed containment check, run by every store implementation before it
 * touches an object.
 *
 * This is DEFENCE IN DEPTH, not the authorization boundary. The boundary is
 * `lib/data/documents.ts`, which loads the row filtered by `scope.organizationId`
 * and never lets a request-supplied key reach the store at all. This check is
 * what makes a bug there non-exploitable rather than merely unlikely.
 */
export function assertKeyBelongsTo(key: string, organizationId: string): void {
  if (!key.startsWith(organizationPrefix(organizationId))) {
    throw new Error("document object key belongs to another organization")
  }
}

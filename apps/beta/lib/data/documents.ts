import "server-only"

/**
 * Documents: the org-scoped reads, and the one write that puts bytes in the
 * bucket.
 *
 * This module is the AUTHORIZATION BOUNDARY for files. The routes above it
 * parse a request and shape a response; the store below it moves bytes and
 * knows nothing about memberships. Everything that decides whether a given
 * person may see a given file happens here, and every function takes an
 * `OrgScope` as its first argument, so none of it is reachable without a
 * resolved membership.
 *
 * FOUR FILTERS ARE ON EVERY READ, and each is a different rule:
 *
 *   1. `organization_id = scope.organizationId` — tenancy. The document id from
 *      the URL is never used alone; it is always ANDed with the scope's org, so
 *      a valid id from another book returns no row and the route answers 404.
 *   2. `deleted_at IS NULL` — a soft-deleted document is not "hidden in the UI",
 *      it is gone from the data layer. The bytes survive until PR 37's purge.
 *   3. `doc_type <> 'payslip'` — spec §2.2, verbatim: payslip rows are excluded
 *      from every Dokumenty view SERVER-SIDE. They become reachable in PR 31
 *      through Mzdy › Výplatnice under `payrollScope()`, which does not exist
 *      yet — so today the correct behaviour is that this module cannot serve
 *      one at all. Fail closed, not "we will remember to add the check".
 *   4. `visible_to_client` — the hidden class. owner IS the accountant (plan
 *      Part 4), so owner sees the whole book; every other role sees only what
 *      the office has marked client-visible.
 *
 * THE UPLOAD'S ORDER OF OPERATIONS, and why the bytes go first:
 *
 *   pre-check quota (cheap, advisory) → stream to S3 → atomic transaction
 *   (lock org, duplicate check, quota check, insert) → compensating delete on
 *   any refusal.
 *
 * The digest is only known after the last byte, and the duplicate rule is keyed
 * on the digest, so a "check then write" order is not available: it would need
 * the whole file in memory to hash it first, which is the DoS `upload-stream.ts`
 * exists to prevent. Writing first and compensating means a refused upload can
 * leave an orphan object if the compensating delete itself fails — that is the
 * accepted cost, it is bounded by the 25 MiB cap, and PR 37's retention job is
 * where such objects are swept.
 */
import type { Readable } from "node:stream"

import { and, desc, eq, isNull, ne, sql } from "drizzle-orm"

import { betaDb } from "@/db/client"
import {
  document,
  organization,
  type BetaClientDocumentType,
} from "@/db/schema"
import { isInlineSafeContentType } from "@/lib/storage/content-type"
import { baseFilename } from "@/lib/storage/content-disposition"
import { documentStore } from "@/lib/storage/store"
import {
  isUploadTooLarge,
  scanUpload,
  type UploadScanRefusal,
} from "@/lib/storage/upload-stream"
import { isDeadlock, isUniqueViolation } from "@/lib/pg-error"

import { documentSummary, type DocumentSummary } from "./projections"
import type { OrgScope } from "./scope"

/**
 * Per-organization storage quota.
 *
 * NOT IN THE SPEC. `32-advisor-part4.md` requires "per-org byte quota" and no
 * document names a number, so this is a decision made here and stated out loud:
 * 5 GiB, which is ~200 uploads at the 25 MiB ceiling and several thousand phone
 * photos of receipts — a decade of a small s.r.o.'s paperwork — while capping
 * what a single compromised client account can cost, and what one client can
 * cost the shared bucket. A constant rather than an environment variable on
 * purpose: an env var is a value that can differ between environments without
 * anyone deciding that it should, and beta has exactly one environment.
 */
export const ORGANIZATION_QUOTA_BYTES = 5 * 1024 * 1024 * 1024

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Default page size for the Dokumenty list. PR 12 adds real pagination. */
const DEFAULT_LIST_LIMIT = 100
const MAX_LIST_LIMIT = 500

const MAX_FILENAME_LENGTH = 255
const MAX_SITE_REF_LENGTH = 120

/** Columns of the client projection, named once. */
const summaryColumns = {
  id: document.id,
  original_filename: document.original_filename,
  doc_type: document.doc_type,
  status: document.status,
  content_type: document.content_type,
  byte_size: document.byte_size,
  created_at: document.created_at,
  document_date: document.document_date,
  amount: document.amount,
  site_ref: document.site_ref,
  office_message: document.office_message,
}

/**
 * The four filters of the module header, as one expression.
 *
 * Written once and reused by every read so that a new query cannot ship with
 * three of the four. `extra` is ANDed on top for the single-row reads.
 */
function visibleDocuments(scope: OrgScope) {
  return and(
    eq(document.organization_id, scope.organizationId),
    isNull(document.deleted_at),
    ne(document.doc_type, "payslip"),
    // owner is the accountant and sees the whole book; everyone else sees only
    // the client-visible layer.
    scope.role === "owner" ? undefined : eq(document.visible_to_client, true),
  )
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The Dokumenty list, newest first. Deliberately minimal — PR 12 adds the
 * status / typ / období / stavba filters and the search on top of this.
 */
export async function listDocuments(
  scope: OrgScope,
  options: { limit?: number } = {},
): Promise<DocumentSummary[]> {
  const limit = Math.min(
    Math.max(options.limit ?? DEFAULT_LIST_LIMIT, 1),
    MAX_LIST_LIMIT,
  )

  const rows = await betaDb()
    .select(summaryColumns)
    .from(document)
    .where(visibleDocuments(scope))
    .orderBy(desc(document.created_at))
    .limit(limit)

  return rows.map(documentSummary)
}

/** One document, or null. Null is what the routes turn into a 404. */
export async function documentForScope(
  scope: OrgScope,
  documentId: string,
): Promise<DocumentSummary | null> {
  // A non-uuid id is answered without a round trip. Without this the driver
  // raises `invalid input syntax for type uuid`, which a route would surface as
  // a 500 — a different answer for a malformed id than for an unknown one, and
  // therefore an oracle as well as a bug.
  if (!UUID.test(documentId)) return null

  const [row] = await betaDb()
    .select(summaryColumns)
    .from(document)
    .where(and(visibleDocuments(scope), eq(document.id, documentId)))
    .limit(1)

  return row ? documentSummary(row) : null
}

export type DocumentFileHandle = {
  document: DocumentSummary
  /** Whether the download route may honour a request for `inline`. */
  inlineAllowed: boolean
  body: Readable
}

/**
 * Open a document's bytes for streaming.
 *
 * The storage key is read here and never leaves: the route receives a stream,
 * not a key, so there is no shape of this API in which a client-supplied key
 * reaches S3.
 */
export async function openDocumentFile(
  scope: OrgScope,
  documentId: string,
): Promise<DocumentFileHandle | null> {
  if (!UUID.test(documentId)) return null

  const [row] = await betaDb()
    .select({ ...summaryColumns, storage_key: document.storage_key })
    .from(document)
    .where(and(visibleDocuments(scope), eq(document.id, documentId)))
    .limit(1)

  if (!row) return null

  const body = await documentStore().get(row.storage_key, scope.organizationId)
  return {
    document: documentSummary(row),
    inlineAllowed: isInlineSafeContentType(row.content_type),
    body,
  }
}

/** Bytes currently counted against the quota. Soft-deleted rows do not count. */
export async function organizationStorageUsage(
  scope: OrgScope,
): Promise<{ usedBytes: number; quotaBytes: number }> {
  const [row] = await betaDb()
    .select({ used: sql<string>`coalesce(sum(${document.byte_size}), 0)` })
    .from(document)
    .where(
      and(
        eq(document.organization_id, scope.organizationId),
        isNull(document.deleted_at),
      ),
    )

  return {
    usedBytes: Number(row?.used ?? 0),
    quotaBytes: ORGANIZATION_QUOTA_BYTES,
  }
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export type DocumentUploadRefusal =
  /** The role may not upload. guest is view+download only (spec §5). */
  | "forbidden"
  | UploadScanRefusal
  /** The filename is missing, or not a filename. */
  | "invalid_filename"
  /** This organization is out of storage. */
  | "quota_exceeded"
  /** Postgres broke a lock cycle and picked this transaction; try again. */
  | "retry"

export type DocumentUploadResult =
  | {
      ok: true
      /**
       * `duplicate` means these exact bytes are already on this book, and the
       * row returned is the EXISTING one (spec §2.2 duplicate soft-detect:
       * "Tento soubor už jste nahráli DD.MM.YYYY — otevřít / nahrát znovu",
       * never an error page). Nothing new was stored.
       */
      status: "stored" | "duplicate"
      document: DocumentSummary
    }
  | { ok: false; reason: DocumentUploadRefusal }

export type DocumentUploadInput = {
  filename: string
  docType: BetaClientDocumentType
  siteRef?: string | null
  /** The request body. Consumed at most once. */
  source: AsyncIterable<Uint8Array>
}

/**
 * May this scope upload?
 *
 * Spec §5: management seats (owner / admin / member) upload; `guest` is an
 * external viewer with downloads but no writes. The employee seat of §2.6.1 is
 * ALSO a guest membership, and it does upload its own podklady — that narrowing
 * arrives in PR 32 together with the `payroll_employee` link that distinguishes
 * the two, and it will widen this predicate deliberately rather than by
 * accident.
 */
export function canUploadDocuments(scope: OrgScope): boolean {
  return scope.role !== "guest"
}

/** Trim, strip any path the caller sent, and bound the length. */
function normalizeFilename(raw: string): string | null {
  const name = baseFilename(raw)
  if (name.length === 0 || name.length > MAX_FILENAME_LENGTH) return null
  // A control character in a filename has no legitimate source and is a header
  // injection attempt everywhere it is echoed. `content-disposition.ts` encodes
  // rather than trusts, so this is the second layer, not the only one.
  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) return null
  }
  return name
}

function normalizeSiteRef(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  return trimmed.slice(0, MAX_SITE_REF_LENGTH)
}

/**
 * Stream an upload into the bucket and record it.
 *
 * QUOTA MECHANISM. The authoritative check is inside the write transaction and
 * is serialised by a row lock:
 *
 *     SELECT id FROM organization WHERE id = $1 FOR NO KEY UPDATE
 *     SELECT coalesce(sum(byte_size), 0) FROM document
 *      WHERE organization_id = $1 AND deleted_at IS NULL
 *     -- refuse if sum + size > quota
 *     INSERT INTO document ...
 *
 * Two concurrent uploads for the same organization cannot both pass: the second
 * transaction blocks on the row lock until the first has committed its INSERT,
 * so the SUM it reads already contains the first upload's bytes. A counter
 * column would be faster and would also be a second copy of a number that can
 * drift from the rows it summarises; at beta's scale (hundreds of rows per
 * organization, one partial index) the SUM is the cheaper thing to be right
 * about. `FOR NO KEY UPDATE` rather than `FOR UPDATE` so the lock does not
 * block the FK checks other tables take against the same organization row.
 *
 * The cheap pre-check before the stream is NOT the enforcement. It exists so
 * that an organization already over its quota is told so before it spends
 * bandwidth uploading 25 MiB that will be deleted again.
 */
export async function uploadDocument(
  scope: OrgScope,
  input: DocumentUploadInput,
): Promise<DocumentUploadResult> {
  if (!canUploadDocuments(scope)) return { ok: false, reason: "forbidden" }

  const filename = normalizeFilename(input.filename)
  if (filename === null) return { ok: false, reason: "invalid_filename" }
  const siteRef = normalizeSiteRef(input.siteRef)

  const usage = await organizationStorageUsage(scope)
  if (usage.usedBytes >= usage.quotaBytes) {
    return { ok: false, reason: "quota_exceeded" }
  }

  const scan = await scanUpload(input.source)
  if (!scan.ok) return { ok: false, reason: scan.reason }

  const store = documentStore()
  let key: string
  let digest: { sha256: string; byteSize: number }
  try {
    const put = await store.put({
      organizationId: scope.organizationId,
      contentType: scan.type.contentType,
      extension: scan.type.extension,
      body: scan.body,
    })
    key = put.key
    // The upload can report success on a body that ended early; only the
    // scanner knows whether the stream finished cleanly, and only it has the
    // digest. Awaiting it is what makes `byte_size` and `sha256` describe the
    // bytes that are actually in the bucket.
    digest = await scan.settled
  } catch (error) {
    if (isUploadTooLarge(error)) return { ok: false, reason: "too_large" }
    throw error
  }

  const discard = async (): Promise<void> => {
    try {
      await store.delete(key, scope.organizationId)
    } catch {
      // Best effort. An orphan object costs at most 25 MiB and is swept by the
      // retention job (PR 37); failing the request because the cleanup failed
      // would turn a successful refusal into a 500.
    }
  }

  try {
    const outcome = await betaDb().transaction(async (tx) => {
      // The row lock that serialises the quota arithmetic. `no key update`
      // rather than `update` so it does not block the FK checks other tables
      // take against this organization row (see the lock-order note in
      // migration 0004: organization is class 2, document class 4).
      await tx
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, scope.organizationId))
        .for("no key update")

      const [existing] = await tx
        .select(summaryColumns)
        .from(document)
        .where(
          and(
            eq(document.organization_id, scope.organizationId),
            eq(document.sha256, digest.sha256),
            isNull(document.deleted_at),
          ),
        )
        .limit(1)

      if (existing) {
        return { kind: "duplicate" as const, row: existing }
      }

      const [used] = await tx
        .select({ total: sql<string>`coalesce(sum(${document.byte_size}), 0)` })
        .from(document)
        .where(
          and(
            eq(document.organization_id, scope.organizationId),
            isNull(document.deleted_at),
          ),
        )

      if (
        Number(used?.total ?? 0) + digest.byteSize >
        ORGANIZATION_QUOTA_BYTES
      ) {
        return { kind: "quota" as const }
      }

      const [inserted] = await tx
        .insert(document)
        .values({
          organization_id: scope.organizationId,
          doc_type: input.docType,
          original_filename: filename,
          storage_key: key,
          content_type: scan.type.contentType,
          extension: scan.type.extension,
          byte_size: digest.byteSize,
          sha256: digest.sha256,
          site_ref: siteRef,
          uploaded_by_user_id: scope.userId,
        })
        .returning(summaryColumns)

      return { kind: "stored" as const, row: inserted }
    })

    if (outcome.kind === "quota") {
      await discard()
      return { ok: false, reason: "quota_exceeded" }
    }
    if (outcome.kind === "duplicate") {
      // The bytes we just wrote are a second copy of an object this book
      // already has. Drop it — the row the client gets back is the original.
      await discard()
      return {
        ok: true,
        status: "duplicate",
        document: documentSummary(outcome.row),
      }
    }
    if (!outcome.row) throw new Error("insert returned no row")
    return {
      ok: true,
      status: "stored",
      document: documentSummary(outcome.row),
    }
  } catch (error) {
    await discard()
    // Two identical uploads that raced past the row lock — possible only if the
    // lock is ever removed — land on the partial unique index instead. Answer
    // them the way the duplicate branch does rather than as a 500: re-read the
    // row that won.
    if (isUniqueViolation(error)) {
      const winner = await betaDb()
        .select(summaryColumns)
        .from(document)
        .where(
          and(
            eq(document.organization_id, scope.organizationId),
            eq(document.sha256, digest.sha256),
            isNull(document.deleted_at),
          ),
        )
        .limit(1)
      const [row] = winner
      if (row) {
        return { ok: true, status: "duplicate", document: documentSummary(row) }
      }
    }
    // Postgres broke a lock cycle and picked this transaction as the victim.
    // Nothing about the request was wrong, so a 500 would be a lie — the office
    // is told to try again, the same way `lib/data/office/memberships.ts`
    // answers it. Deliberately not an automatic retry: the body has already
    // been consumed, so there is nothing left to re-stream.
    if (isDeadlock(error)) return { ok: false, reason: "retry" }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Soft delete
// ---------------------------------------------------------------------------

/**
 * Withdraw a document from the book.
 *
 * Owner-only: deleting an accounting document is an accounting act (spec §5 —
 * every write below owner is a read). The row and its S3 object both survive;
 * PR 37's retention job purges the bytes, which is what keeps "the office
 * deleted it by mistake" recoverable for as long as the retention window.
 */
export async function softDeleteDocument(
  scope: OrgScope,
  documentId: string,
): Promise<boolean> {
  if (scope.role !== "owner") return false
  if (!UUID.test(documentId)) return false

  const updated = await betaDb()
    .update(document)
    .set({ deleted_at: sql`now()` })
    .where(
      and(
        eq(document.organization_id, scope.organizationId),
        eq(document.id, documentId),
        isNull(document.deleted_at),
      ),
    )
    .returning({ id: document.id })

  return updated.length > 0
}

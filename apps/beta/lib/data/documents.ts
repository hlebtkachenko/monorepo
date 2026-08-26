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
 * FOUR FILTERS GOVERN EVERY READ — on every client-facing read they are in the
 * WHERE clause; on the one query that cannot put them there (the upload's
 * duplicate lookup, explained below) they are re-applied to the result. Each is
 * a different rule:
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
 * THE ONE QUERY THAT DOES NOT USE THAT FILTER, AND WHY IT IS STILL SAFE. The
 * upload's duplicate lookup searches (organization_id, sha256) with filters 1
 * and 2 only. It has to: `document_organization_sha256_unique` is unconditional
 * over live rows, so a lookup that could not SEE a hidden twin would let the
 * INSERT behind it hit the index and raise 23505 — the office hiding a document
 * would start turning a client's next upload into a 500. The filter is applied
 * to the ANSWER instead: `duplicateTwinVisibleTo` re-applies rules 3 and 4 and
 * returns `document: null` when the twin is one this caller could not read
 * through any other door. The upload is still correctly refused as a duplicate;
 * the caller simply learns nothing about the row. Matching a file's digest is
 * not a permission to read a row that shares it.
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

import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lt,
  ne,
  sql,
} from "drizzle-orm"

import { betaDb } from "@/db/client"
import {
  document,
  organization,
  type BetaClientDocumentType,
  type BetaDocumentType,
} from "@/db/schema"
import {
  isFramePreviewableContentType,
  isInlineSafeContentType,
} from "@/lib/storage/content-type"
import { baseFilename } from "@/lib/storage/content-disposition"
import { documentStore } from "@/lib/storage/store"
import {
  isUploadTooLarge,
  scanUpload,
  type UploadScanRefusal,
} from "@/lib/storage/upload-stream"
import { isDeadlock, isUniqueViolation } from "@/lib/pg-error"

import {
  DOCUMENT_LIST_PAGE_SIZE,
  EMPTY_DOCUMENT_LIST_FILTERS,
  type DocumentListFilters,
} from "./document-filters"
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

/**
 * Highest page the list will serve.
 *
 * At 25 rows a page this is 250 000 documents — orders of magnitude past what a
 * small s.r.o.'s book will ever hold, and the point of the ceiling is not the
 * row count: `OFFSET` makes Postgres walk every skipped row, so an unbounded
 * `?page=` is a free way to make one request scan the whole index.
 */
const MAX_LIST_PAGE = 10_000

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

/**
 * The two extra columns the duplicate lookup needs, and only it.
 *
 * WHY THE DUPLICATE LOOKUP IS THE ONE READ THAT CANNOT USE `visibleDocuments`.
 * `document_organization_sha256_unique` is UNCONDITIONAL over live rows — it
 * knows nothing about `doc_type` or `visible_to_client`. If the pre-INSERT
 * lookup filtered on visibility, a hidden twin would be invisible to the SELECT
 * and the INSERT behind it would hit the index and raise 23505: the office
 * hiding one document would start turning a client's next upload into a 500.
 *
 * So the SELECT stays unfiltered — and the ANSWER is gated instead. The row is
 * found (so the duplicate is correctly detected) but its projection is only
 * returned to a caller who could have read that row through any other door.
 */
const duplicateLookupColumns = {
  ...summaryColumns,
  visible_to_client: document.visible_to_client,
}

/**
 * May this caller be told WHICH row their upload duplicates?
 *
 * Mirrors filters 3 and 4 of `visibleDocuments` exactly. Without it, uploading
 * bytes that happen to match a hidden row would hand back that row's whole
 * projection — filename, status, office message, amount, date, site — to
 * someone the office deliberately hid it from, and after PR 32 an employee
 * seat could surface a colleague's payslip the same way. The digest of a file
 * is not a permission to read a row that shares it.
 */
function duplicateTwinVisibleTo(
  scope: OrgScope,
  twin: { doc_type: BetaDocumentType; visible_to_client: boolean },
): boolean {
  if (twin.doc_type === "payslip") return false
  return scope.role === "owner" || twin.visible_to_client
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Czech accounting deadlines — and therefore Czech calendar days — are read in
 * Prague local time (`i18n/formats.ts`). `created_at` is a `timestamptz`, so a
 * day boundary is only a day boundary once it is anchored to a zone: without
 * this, "od 1. 3." would start at 01:00 Prague in summer and quietly drop an
 * hour of the client's own uploads.
 */
const PRAGUE = sql`'Europe/Prague'`

/**
 * Escape the LIKE metacharacters in a user's search string.
 *
 * Drizzle parameterises the pattern, so this is not about injection — it is
 * about meaning. Unescaped, a client typing `%` matches every row and a client
 * searching for `faktura_03` silently matches `faktura-03` too. Backslash is the
 * default LIKE escape character in Postgres, so it has to be escaped first.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

/**
 * The four visibility filters, plus the user's own narrowing (spec §2.2:
 * "Filters status/typ/období/stavba; ilike search").
 *
 * EVERY FILTER IS SQL-SIDE. Fetching the page and filtering in the component
 * would be wrong twice over: the page would be a page of the UNFILTERED list
 * (so the pager would lie), and rows the client narrowed away would still have
 * crossed the wire.
 *
 * The values arriving here are already closed sets — `parseDocumentListQuery`
 * validated them against the enum and against a real calendar day — so this
 * function shapes a query, it does not re-validate one.
 */
function listConditions(scope: OrgScope, filters: DocumentListFilters) {
  return and(
    visibleDocuments(scope),
    filters.status ? eq(document.status, filters.status) : undefined,
    filters.docType ? eq(document.doc_type, filters.docType) : undefined,
    filters.siteRef ? eq(document.site_ref, filters.siteRef) : undefined,
    // Inclusive on both ends: `to` is turned into "before the next day starts",
    // so a range of a single day contains that whole day.
    filters.from
      ? gte(
          document.created_at,
          sql`(${filters.from}::date)::timestamp at time zone ${PRAGUE}`,
        )
      : undefined,
    filters.to
      ? lt(
          document.created_at,
          sql`((${filters.to}::date + 1))::timestamp at time zone ${PRAGUE}`,
        )
      : undefined,
    filters.search
      ? ilike(
          document.original_filename,
          sql`${`%${escapeLikePattern(filters.search)}%`}`,
        )
      : undefined,
  )
}

/** One page of the Dokumenty table, and everything the pager needs. */
export type DocumentListPage = {
  documents: DocumentSummary[]
  /** Rows matching the filters, across all pages. */
  total: number
  /** The page actually served, 1-based. */
  page: number
  pageSize: number
  pageCount: number
}

/**
 * The Dokumenty list (spec §2.2 "Vše"), newest first, filtered and paged.
 *
 * ONE ROUND TRIP, NOT TWO. `count(*) over ()` rides along on the same statement
 * as the rows, so the total the pager renders is the total of the very query
 * that produced those rows. A separate `SELECT count(*)` would be a second
 * snapshot: an upload landing between the two calls makes the pager disagree
 * with the table it is paging, which is exactly the kind of small lie that
 * costs an office a support call.
 */
export async function listDocuments(
  scope: OrgScope,
  options: { filters?: DocumentListFilters; page?: number } = {},
): Promise<DocumentListPage> {
  const filters = options.filters ?? EMPTY_DOCUMENT_LIST_FILTERS
  const pageSize = DOCUMENT_LIST_PAGE_SIZE
  const page = Math.min(Math.max(options.page ?? 1, 1), MAX_LIST_PAGE)

  const rows = await betaDb()
    .select({ ...summaryColumns, total: sql<string>`count(*) over ()` })
    .from(document)
    .where(listConditions(scope, filters))
    // `created_at` alone is not a total order — two uploads in the same
    // transaction share a timestamp, and a tie broken differently between two
    // pages either repeats a row or drops one. `id` is uuidv7, so it is itself
    // time-ordered and the tiebreak agrees with the sort.
    .orderBy(desc(document.created_at), desc(document.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const total = Number(rows[0]?.total ?? 0)

  return {
    documents: rows.map(documentSummary),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/**
 * The distinct `stavba` values on this book, for the site filter's options.
 *
 * Same four visibility filters as the list itself — a site that only appears on
 * documents the office has hidden is not an option this caller may be offered,
 * because choosing it would render an empty table and thereby confirm the
 * hidden row exists.
 *
 * Deliberately NOT the Stavby grouping page (spec §2.2, PR 13): this is a list
 * of strings for a `<select>`, with no counts and no sums.
 */
export async function listDocumentSites(scope: OrgScope): Promise<string[]> {
  const rows = await betaDb()
    .selectDistinct({ site_ref: document.site_ref })
    .from(document)
    .where(and(visibleDocuments(scope), sql`${document.site_ref} is not null`))
    .orderBy(asc(document.site_ref))

  return rows
    .map((row) => row.site_ref)
    .filter((value): value is string => value !== null)
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
  /**
   * Whether the route may honour a request for `preview` — the row sheet's
   * sandboxed frame. Images plus PDF; see `isFramePreviewableContentType`.
   */
  previewAllowed: boolean
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
    previewAllowed: isFramePreviewableContentType(row.content_type),
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
  | { ok: true; status: "stored"; document: DocumentSummary }
  | {
      ok: true
      /**
       * These exact bytes are already on this book (spec §2.2 duplicate
       * soft-detect: "Tento soubor už jste nahráli DD.MM.YYYY — otevřít /
       * nahrát znovu", never an error page). Nothing new was stored.
       */
      status: "duplicate"
      /**
       * The EXISTING row — or `null` when that row is one this caller may not
       * read (see `duplicateTwinVisibleTo`). Null is not an error: the upload
       * was still correctly refused as a duplicate, the client is still told
       * so, it just gets no link to open. A UI renders "tento soubor už na
       * účtu je" without the "otevřít" button.
       */
      document: DocumentSummary | null
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

/**
 * Exported for `documents-office.ts` (PR 14): the office's field-edit form
 * writes the same `site_ref` column through the same rule, so the cap and the
 * empty-string-means-null behaviour live in exactly one place.
 */
export function normalizeSiteRef(
  raw: string | null | undefined,
): string | null {
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

      // Unfiltered by design — see `duplicateLookupColumns`. The visibility
      // decision is made on the way OUT, not in the WHERE clause.
      const [existing] = await tx
        .select(duplicateLookupColumns)
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
      // already has. Drop it — the row the client gets back is the original,
      // and only when that original is one they could read anyway.
      await discard()
      return {
        ok: true,
        status: "duplicate",
        document: duplicateTwinVisibleTo(scope, outcome.row)
          ? documentSummary(outcome.row)
          : null,
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
      // Same unfiltered lookup, same gate on the way out.
      const winner = await betaDb()
        .select(duplicateLookupColumns)
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
        return {
          ok: true,
          status: "duplicate",
          document: duplicateTwinVisibleTo(scope, row)
            ? documentSummary(row)
            : null,
        }
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

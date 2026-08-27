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
 * FIVE FILTERS GOVERN EVERY READ — on every client-facing read they are in the
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
 *      from every Dokumenty view SERVER-SIDE. They are reachable through Mzdy ›
 *      Výplatnice under `payrollScope()` (PR 32, `lib/data/payslips.ts`), which
 *      is a different module with a different door — never through this one.
 *   4. `visible_to_client` — the hidden class. owner IS the accountant (plan
 *      Part 4), so owner sees the whole book; every other role sees only what
 *      the office has marked client-visible.
 *   5. `uploaded_by_user_id = scope.userId`, FOR THE EMPLOYEE SEAT ONLY (spec
 *      §2.6.1: the seat's Dokumenty is "own uploads + podklady"; PR 33). It is
 *      the only filter here keyed on the PERSON rather than on the book, and it
 *      is what makes the seat's Dokumenty a personal folder inside a company
 *      book: a bricklayer with a portal login uploads their own attendance sheet
 *      and their own receipts, and sees exactly those. Everybody else's uploads,
 *      the office's contracts, the bank statements and every other client-
 *      visible row of the company are as invisible to them as another tenant's
 *      book is.
 *
 *      "PODKLADY" IS NOT A SEPARATE ARM, and the reading is deliberate. The
 *      podklady an employee has any relationship to are the ones they uploaded,
 *      which filter 5 already returns. Office-uploaded payroll podklady
 *      (`doc_type` payroll / attendance / hr) carry no per-employee link in this
 *      schema at all — an attendance sheet is one file for the whole crew — so
 *      an arm that admitted them by type would hand every employee the whole
 *      crew's hours. Where the spec's phrase and the schema disagree about what
 *      is severable, this fails closed.
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
  inArray,
  isNull,
  lt,
  ne,
  sql,
  type SQL,
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

import { attachHeicPreview } from "./document-preview"
import {
  COMPANY_DOCUMENT_TYPES,
  DOCUMENT_LIST_PAGE_SIZE,
  EMPTY_DOCUMENT_LIST_FILTERS,
  PAYROLL_SUPPORTING_DOCUMENT_TYPES,
  type DocumentListFilters,
} from "./document-filters"
import { documentSummary, type DocumentSummary } from "./projections"
import { isEmployeeSeat, type OrgScope } from "./scope"

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
  // Read as a key, projected as `hasPreview` — never serialised (PR 11).
  // `documentSummary` turns it into the boolean the row sheet branches on.
  preview_storage_key: document.preview_storage_key,
}

/**
 * The five filters of the module header, as one expression.
 *
 * Written once and reused by every read so that a new query cannot ship with
 * four of the five. `extra` is ANDed on top for the single-row reads.
 */
function visibleDocuments(scope: OrgScope) {
  return and(
    eq(document.organization_id, scope.organizationId),
    isNull(document.deleted_at),
    ne(document.doc_type, "payslip"),
    // owner is the accountant and sees the whole book; everyone else sees only
    // the client-visible layer.
    scope.role === "owner" ? undefined : eq(document.visible_to_client, true),
    // The employee seat's personal folder (spec §2.6.1). `undefined` for every
    // other holder, so this expression is byte-identical to what it was before
    // PR 33 for the four roles that existed then — the narrowing is additive
    // and reaches exactly one kind of caller.
    //
    // `uploaded_by_user_id` IS NULLABLE (a row seeded or agent-written has no
    // uploader), and that nullability is doing safety work here rather than
    // needing a `COALESCE`: `= scope.userId` is UNKNOWN for a NULL uploader, so
    // an office-created row is excluded rather than matched. Fail closed by the
    // grammar of SQL, not by a comparison somebody has to remember to write.
    isEmployeeSeat(scope)
      ? eq(document.uploaded_by_user_id, scope.userId)
      : undefined,
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
  // Filter 5's input (PR 33). Read for the same reason `visible_to_client` is:
  // the ANSWER is gated on it, because the SELECT itself cannot be.
  uploaded_by_user_id: document.uploaded_by_user_id,
}

/**
 * May this caller be told WHICH row their upload duplicates?
 *
 * Mirrors filters 3, 4 and 5 of `visibleDocuments` exactly. Without it,
 * uploading bytes that happen to match a hidden row would hand back that row's
 * whole projection — filename, status, office message, amount, date, site — to
 * someone the office deliberately hid it from. The digest of a file is not a
 * permission to read a row that shares it.
 *
 * FILTER 5 MATTERS MOST HERE, and it is the reason this function grew with the
 * employee seat rather than being left as it was. The other two filters hide
 * rows an attacker would have to guess at; this one is a CONFIRMATION ORACLE
 * against a file they already hold. An employee who obtains a colleague's
 * payslip PDF (forwarded, printed, found on a shared drive) and uploads it would
 * otherwise be told "this is already here, uploaded on 12. 3." — turning
 * possession of the bytes into proof of who else in the company holds them, and
 * naming the row. With filter 5 mirrored, the seat gets the generic "already
 * uploaded" answer with `document: null`, exactly as the header's last sentence
 * requires. (Filter 3 covers payslips specifically; filter 5 covers every other
 * document in the book, which is the larger surface.)
 */
function duplicateTwinVisibleTo(
  scope: OrgScope,
  twin: {
    doc_type: BetaDocumentType
    visible_to_client: boolean
    uploaded_by_user_id: string | null
  },
): boolean {
  if (twin.doc_type === "payslip") return false
  // Filter 4 and filter 5 are ANDed, exactly as the WHERE clause ANDs them. The
  // seat is a `guest`, so the office CAN hide one of its own uploads from it,
  // and short-circuiting on ownership alone would re-open the oracle for that
  // row — the caller would learn about a document the list refuses to show.
  const layerVisible = scope.role === "owner" || twin.visible_to_client
  if (isEmployeeSeat(scope)) {
    return layerVisible && twin.uploaded_by_user_id === scope.userId
  }
  return layerVisible
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
 * One filtered, paged page of `document`, given a WHERE condition that has
 * already applied `visibleDocuments` (and whatever else a caller ANDs on top).
 *
 * ONE ROUND TRIP, NOT TWO. `count(*) over ()` rides along on the same statement
 * as the rows, so the total the pager renders is the total of the very query
 * that produced those rows. A separate `SELECT count(*)` would be a second
 * snapshot: an upload landing between the two calls makes the pager disagree
 * with the table it is paging, which is exactly the kind of small lie that
 * costs an office a support call.
 *
 * SHARED BY `listDocuments` (spec §2.2 "Vše") AND `listCompanyDocuments`
 * (§2.2 "Doklady firmy", PR 13) — the paging, ordering and count-in-one-round-
 * trip contract is identical between the two; only the WHERE condition differs.
 */
async function paginatedDocumentList(
  condition: SQL | undefined,
  page: number,
): Promise<DocumentListPage> {
  const pageSize = DOCUMENT_LIST_PAGE_SIZE
  const clampedPage = Math.min(Math.max(page, 1), MAX_LIST_PAGE)

  const rows = await betaDb()
    .select({ ...summaryColumns, total: sql<string>`count(*) over ()` })
    .from(document)
    .where(condition)
    // `created_at` alone is not a total order — two uploads in the same
    // transaction share a timestamp, and a tie broken differently between two
    // pages either repeats a row or drops one. `id` is uuidv7, so it is itself
    // time-ordered and the tiebreak agrees with the sort.
    .orderBy(desc(document.created_at), desc(document.id))
    .limit(pageSize)
    .offset((clampedPage - 1) * pageSize)

  const total = Number(rows[0]?.total ?? 0)

  return {
    documents: rows.map(documentSummary),
    total,
    page: clampedPage,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/** The Dokumenty list (spec §2.2 "Vše"), newest first, filtered and paged. */
export async function listDocuments(
  scope: OrgScope,
  options: { filters?: DocumentListFilters; page?: number } = {},
): Promise<DocumentListPage> {
  const filters = options.filters ?? EMPTY_DOCUMENT_LIST_FILTERS
  return paginatedDocumentList(
    listConditions(scope, filters),
    options.page ?? 1,
  )
}

/**
 * "Doklady firmy" (spec §2.2, PR 13): the same list machinery as `listDocuments`,
 * narrowed to `COMPANY_DOCUMENT_TYPES`. The type restriction is ANDed onto the
 * SAME `listConditions` the "Vše" view uses, so this view carries every one of
 * `visibleDocuments`'s four filters plus the caller's own status/období/search
 * narrowing — nothing about tenancy, soft delete, the payslip exclusion or the
 * hidden class is re-implemented here.
 *
 * A caller-supplied `filters.docType` outside `COMPANY_DOCUMENT_TYPES` (for
 * instance a hand-edited `?type=invoice_in`) is not a leak: the two conditions
 * are ANDed together, so they simply cannot both be satisfied and the query
 * answers an empty page rather than falling back to the unfiltered company set.
 */
export async function listCompanyDocuments(
  scope: OrgScope,
  options: { filters?: DocumentListFilters; page?: number } = {},
): Promise<DocumentListPage> {
  const filters = options.filters ?? EMPTY_DOCUMENT_LIST_FILTERS
  return paginatedDocumentList(
    and(
      inArray(document.doc_type, COMPANY_DOCUMENT_TYPES),
      listConditions(scope, filters),
    ),
    options.page ?? 1,
  )
}

/**
 * Mzdy › Podklady (spec §2.6, PR 31): the same list machinery, narrowed to
 * `PAYROLL_SUPPORTING_DOCUMENT_TYPES` — exactly the relationship
 * `listCompanyDocuments` has with `COMPANY_DOCUMENT_TYPES`, including the
 * "a caller-supplied filter outside the narrowed set answers an empty page,
 * never the unfiltered set" property that comment explains.
 *
 * `listConditions` still runs `visibleDocuments(scope)` underneath, so the
 * payslip exclusion applies here too even though these two doc types could
 * never collide with it — no read of `document` in this file skips that gate.
 */
export async function listPayrollSupportingDocuments(
  scope: OrgScope,
  options: { filters?: DocumentListFilters; page?: number } = {},
): Promise<DocumentListPage> {
  const filters = options.filters ?? EMPTY_DOCUMENT_LIST_FILTERS
  return paginatedDocumentList(
    and(
      inArray(document.doc_type, PAYROLL_SUPPORTING_DOCUMENT_TYPES),
      listConditions(scope, filters),
    ),
    options.page ?? 1,
  )
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

/** One row of the Stavby grouping (spec §2.2, PR 13). */
export type DocumentSiteSummary = {
  /** `null` is the "bez stavby" bucket — every visible document with no site. */
  siteRef: string | null
  documentCount: number
  /** `numeric(14,2)` as a string, SQL-summed — see the function's own header. */
  amountTotal: string
}

/**
 * "Stavby" (spec §2.2, PR 13): one row per `site_ref`, with the count and the
 * `SUM(amount)` of every document on it — SQL-side, never JavaScript addition
 * (spec §0.2, §0.7). Reuses `visibleDocuments`, so a site whose only documents
 * are hidden, a payslip, or soft-deleted contributes NOTHING to its count or
 * sum — the same guarantee `listDocumentSites`'s options list already gives the
 * "Vše" filter bar, extended to the numbers this grouping adds.
 *
 * `GROUP BY site_ref` puts every row with a `NULL` site into ONE group rather
 * than dropping them, because Postgres treats `NULL` as a single group for
 * `GROUP BY` — so the "bez přiřazené stavby" bucket the spec calls for falls
 * out of the query for free, as `{ siteRef: null, ... }`, rather than needing a
 * second query or a `COALESCE` that would make a real site literally named
 * "(no site)" collide with it.
 *
 * `ORDER BY site_ref ASC` sorts every named site alphabetically with the
 * `NULL` bucket last (Postgres's default `NULLS LAST` for ascending order) —
 * the named construction sites read as the primary list, with the catch-all
 * bucket trailing them.
 */
export async function listDocumentSiteSummaries(
  scope: OrgScope,
): Promise<DocumentSiteSummary[]> {
  const rows = await betaDb()
    .select({
      site_ref: document.site_ref,
      document_count: sql<string>`count(*)`,
      amount_total: sql<string>`coalesce(sum(${document.amount}), 0)`,
    })
    .from(document)
    .where(visibleDocuments(scope))
    .groupBy(document.site_ref)
    .orderBy(asc(document.site_ref))

  return rows.map((row) => ({
    siteRef: row.site_ref,
    documentCount: Number(row.document_count),
    amountTotal: row.amount_total,
  }))
}

/** The Partneři detail's own bound — a construction client's supplier does
 * not accumulate thousands of documents, and the newest ones are what the
 * page needs to show first. */
const PARTNER_DOCUMENTS_LIMIT = 200

/**
 * The documents linked to one partner (spec §2.4: Partneři detail's "linked
 * documents"), newest first.
 *
 * REUSES `visibleDocuments` WHOLE, so a guest reading a client's own Partneři
 * detail sees exactly the same client-visible layer Dokumenty already shows
 * them — never a hidden document merely because it happens to name this
 * partner as its protistrana.
 */
export async function documentsForPartner(
  scope: OrgScope,
  partnerId: string,
): Promise<DocumentSummary[]> {
  const rows = await betaDb()
    .select(summaryColumns)
    .from(document)
    .where(and(visibleDocuments(scope), eq(document.partner_id, partnerId)))
    .orderBy(desc(document.created_at), desc(document.id))
    .limit(PARTNER_DOCUMENTS_LIMIT)

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
  /**
   * Whether the route may honour a request for `preview` — the row sheet's
   * sandboxed frame. Images plus PDF (`isFramePreviewableContentType`), plus a
   * HEIC that has a JPEG derivative, which is the whole point of having one.
   */
  previewAllowed: boolean
  /**
   * The type of the bytes in `body`. Equal to the row's `content_type` except
   * on the derivative, where it is `image/jpeg` — the response must describe
   * what it is sending, not what the row is about.
   */
  contentType: string
  /** Length of `body`, for `content-length`. The derivative's own size. */
  byteSize: number
  /**
   * True when `body` is the JPEG derivative rather than the stored original.
   * The route uses it to send a `.jpg` filename with the JPEG bytes.
   */
  isDerivative: boolean
  body: Readable
}

/**
 * Open a document's bytes for streaming.
 *
 * The storage key is read here and never leaves: the route receives a stream,
 * not a key, so there is no shape of this API in which a client-supplied key
 * reaches S3. That holds for BOTH keys — the derivative's is read off the same
 * row, filtered by the same four rules, and is no more reachable from a request
 * than the original's.
 *
 * `variant: "preview"` asks for the JPEG derivative and FALLS BACK to the
 * original when there is none. The fallback is what keeps the route's contract
 * unchanged for the types that were previewable before derivatives existed: a
 * PDF asked for as a preview still gets the PDF.
 */
export async function openDocumentFile(
  scope: OrgScope,
  documentId: string,
  options: { variant?: "original" | "preview" } = {},
): Promise<DocumentFileHandle | null> {
  if (!UUID.test(documentId)) return null

  const [row] = await betaDb()
    .select({
      ...summaryColumns,
      storage_key: document.storage_key,
      preview_byte_size: document.preview_byte_size,
    })
    .from(document)
    .where(and(visibleDocuments(scope), eq(document.id, documentId)))
    .limit(1)

  if (!row) return null

  const derivative =
    options.variant === "preview" &&
    row.preview_storage_key !== null &&
    row.preview_byte_size !== null
      ? { key: row.preview_storage_key, byteSize: row.preview_byte_size }
      : null

  const body = await documentStore().get(
    derivative ? derivative.key : row.storage_key,
    scope.organizationId,
  )

  return {
    document: documentSummary(row),
    inlineAllowed: isInlineSafeContentType(row.content_type),
    previewAllowed:
      isFramePreviewableContentType(row.content_type) ||
      row.preview_storage_key !== null,
    contentType: derivative ? "image/jpeg" : row.content_type,
    byteSize: derivative ? derivative.byteSize : row.byte_size,
    isDerivative: derivative !== null,
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
 * ALSO a guest membership, and it DOES upload its own podklady — so this
 * predicate widened in PR 33, deliberately and by exactly one case. (The comment
 * this replaces said "PR 32"; the seat landed as PR 33 of EPIC #1009 and the
 * numbering is corrected here rather than left to rot into a wrong pointer.)
 *
 * THE WIDENING IS SAFE BECAUSE THE READ NARROWED IN THE SAME CHANGE. Letting the
 * seat write would be alarming on its own — it is a `guest`, the least trusted
 * role in the model. What makes it ordinary is filter 5 of `visibleDocuments`:
 * every row the seat creates is stamped `uploaded_by_user_id = <them>`, and that
 * is the only row class they can ever read back. An upload by an employee seat
 * therefore adds a document to the company's book that the OFFICE can see and
 * the employee can see, and that no colleague on another seat can, which is what
 * "podklady" means for a person who is not management.
 *
 * NOTHING ABOUT `doc_type` CHANGES. `uploadDocument`'s input is
 * `BetaClientDocumentType`, which structurally excludes `"payslip"` — so no
 * widening of THIS predicate can let anyone, seat or otherwise, mint a payslip
 * row. That fence is in the type, where it cannot be widened by an `if`.
 */
export function canUploadDocuments(scope: OrgScope): boolean {
  return scope.role !== "guest" || isEmployeeSeat(scope)
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

  /**
   * The row the transaction inserted, carried OUT of the try block.
   *
   * The derivative must not run inside it. `discard()` in the catch deletes the
   * object this upload just wrote, which is the right compensation for a
   * transaction that never committed — and exactly the wrong one after it has:
   * a throw from the derivative step would leave a committed row pointing at a
   * deleted object. `attachHeicPreview` swallows everything by contract, so this
   * is belt to that brace; it is worth the two extra lines because the failure
   * it prevents is silent and permanent.
   */
  let storedRow: Parameters<typeof documentSummary>[0] | undefined

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
    storedRow = outcome.row
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

  // Past this point the row is COMMITTED and there is no compensation left to
  // run — which is the whole reason the derivative lives here rather than inside
  // the block above.
  //
  // The HEIC derivative (spec §2.2), generated once, only for the outcome that
  // produced a new object. A no-op for every other content type, and it cannot
  // fail the upload — see `document-preview.ts`.
  const hasPreview = await attachHeicPreview(scope, {
    id: storedRow.id,
    contentType: storedRow.content_type,
    storageKey: key,
  })

  return {
    ok: true,
    status: "stored",
    // The row was returned before the derivative existed, so its
    // `preview_storage_key` is null in hand. Reflecting the outcome we just
    // produced is cheaper and more honest than a second read of a row we wrote:
    // the client's sheet can render the preview immediately.
    document: { ...documentSummary(storedRow), hasPreview },
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

/**
 * The Dokumenty list query — its shape, its bounds, and the one function that
 * turns request input into it.
 *
 * WHY THIS IS A SEPARATE, PURE MODULE. `documents.ts` is `server-only` and
 * imports the Drizzle client; the filter bar is a Client Component and the URL
 * is the only place the filter state lives. Both sides need the same vocabulary
 * — which statuses exist, which document types a client may filter by, what a
 * page is worth — so it lives here, in a module with no I/O, no `server-only`
 * and no RUNTIME import of the schema. The `import type` below is erased at
 * compile time, so a client bundle that imports this file does not drag
 * `drizzle-orm/pg-core` along with it (the same rule `projections.ts` follows).
 *
 * THE ALLOWED-VALUE ARRAYS ARE WRITTEN OUT, NOT DERIVED. Deriving them from the
 * pgEnum would be the runtime import this module exists to avoid. `satisfies`
 * makes a typo a compile error, and `document-filters.test.ts` asserts the
 * arrays still equal the enum's values, so a future `ALTER TYPE ... ADD VALUE`
 * that forgets this file fails the suite rather than silently dropping a filter
 * option.
 */
import type { BetaClientDocumentType, BetaDocumentStatus } from "@/db/schema"

/**
 * Spec §2.2: Přijato / Zpracovává se / Zpracováno / Vráceno. Order is the
 * lifecycle order, which is also the order the filter renders in.
 */
export const DOCUMENT_STATUS_VALUES = [
  "received",
  "in_processing",
  "processed",
  "returned",
] as const satisfies readonly BetaDocumentStatus[]

/**
 * Spec §2.2 doc_type, MINUS `payslip`.
 *
 * `BetaClientDocumentType` excludes it at the type level, so this is not a
 * runtime `filter` anyone can forget: a payslip row is invisible to every
 * Dokumenty read server-side (`documents.ts`, filter 3), so an option that
 * could only ever return an empty list would be a lie in the UI.
 */
export const DOCUMENT_TYPE_VALUES = [
  "invoice_in",
  "invoice_out",
  "receipt",
  "bank_statement",
  "contract",
  "payroll",
  "attendance",
  "hr",
  "other",
] as const satisfies readonly BetaClientDocumentType[]

/**
 * Spec §2.2 "Doklady firmy": smlouva / zápis-výpis / plná moc / ostatní.
 *
 * The `doc_type` enum has no value for "zápis-výpis" (an extract from the
 * obchodní/živnostenský rejstřík) or "plná moc" (power of attorney) — adding
 * one is a migration, and PR 13 is query-level only (campaign rule). `contract`
 * covers "smlouva" literally; the other three spec-named kinds are all
 * variants of "a company legal document that is not itself a contract", which
 * is exactly what `other` already means. So Doklady firmy is defined as
 * `doc_type IN ('contract', 'other')` — the two existing enum values wide
 * enough to cover the four named kinds without inventing a value the database
 * cannot yet hold. `lib/data/documents.ts`'s `listCompanyDocuments` is the one
 * reader of this constant.
 */
export const COMPANY_DOCUMENT_TYPES = [
  "contract",
  "other",
] as const satisfies readonly BetaClientDocumentType[]

/** Rows per page. Beta books hold hundreds of documents, not millions. */
export const DOCUMENT_LIST_PAGE_SIZE = 25

/** Bounds on the free-text inputs, so a filter cannot become a payload. */
const MAX_SEARCH_LENGTH = 120
const MAX_SITE_REF_LENGTH = 120

/** `YYYY-MM-DD`, and a real day — `2026-02-30` is not one. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The filters of spec §2.2 — "Filters status/typ/období/stavba; ilike search".
 *
 * `from` / `to` are the `období` filter, INCLUSIVE calendar days in Europe/Prague
 * and applied to `created_at` — "nahráno", the column the table shows and the
 * only date every row actually has. `document_date` is the office-typed date of
 * the document itself; nothing writes it until the Zpracování queue (PR 14), so
 * filtering on it today would hide every row behind an empty column. When PR 14
 * starts populating it, THAT is the moment to decide whether období should mean
 * the document's own date — deliberately, in the PR that gives it values.
 */
export type DocumentListFilters = {
  status: BetaDocumentStatus | null
  docType: BetaClientDocumentType | null
  from: string | null
  to: string | null
  siteRef: string | null
  search: string | null
}

export const EMPTY_DOCUMENT_LIST_FILTERS: DocumentListFilters = Object.freeze({
  status: null,
  docType: null,
  from: null,
  to: null,
  siteRef: null,
  search: null,
})

export type DocumentListQuery = {
  filters: DocumentListFilters
  /** 1-based. */
  page: number
}

/** Whether anything is actually narrowing the list. Drives the empty state. */
export function hasActiveFilters(filters: DocumentListFilters): boolean {
  return Object.values(filters).some((value) => value !== null)
}

/**
 * Next hands a page `searchParams` as a plain record whose values may be
 * repeated. A repeated parameter is not an error — it is a URL someone edited —
 * so the FIRST occurrence wins and the rest are ignored, which is what a browser
 * form would have produced.
 */
export type RawSearchParams =
  URLSearchParams | Record<string, string | string[] | undefined>

function readParam(params: RawSearchParams, key: string): string | null {
  if (params instanceof URLSearchParams) return params.get(key)
  const value = params[key]
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function readEnum<T extends string>(
  params: RawSearchParams,
  key: string,
  allowed: readonly T[],
): T | null {
  const raw = readParam(params, key)
  if (raw === null) return null
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null
}

/**
 * A calendar day, or null.
 *
 * The round-trip through `Date` rejects `2026-02-30` and `2026-13-01`, which the
 * regex alone accepts — a value that reaches Postgres as `::date` would raise
 * there instead, turning a hand-edited URL into a 500.
 */
function readDate(params: RawSearchParams, key: string): string | null {
  const raw = readParam(params, key)
  if (raw === null || !ISO_DATE.test(raw)) return null
  const parsed = new Date(`${raw}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10) === raw ? raw : null
}

function readText(
  params: RawSearchParams,
  key: string,
  maxLength: number,
): string | null {
  const raw = readParam(params, key)
  if (raw === null) return null
  const trimmed = raw.trim().slice(0, maxLength)
  return trimmed.length === 0 ? null : trimmed
}

/**
 * Request input → a query the data layer can run.
 *
 * EVERY UNRECOGNISED VALUE BECOMES `null` rather than an error. This is a list
 * of a client's own paperwork reached by a GET: a stale bookmark, a truncated
 * link in an e-mail or a hand-edited URL should show the unfiltered list, not an
 * error page. The values that DO survive are checked against closed sets here,
 * so nothing downstream has to re-validate them — `status` and `docType` reach
 * the query as enum members, `from`/`to` as real calendar days, and the two free
 * strings are length-bounded (and escaped for LIKE at the point of use).
 */
export function parseDocumentListQuery(
  params: RawSearchParams,
): DocumentListQuery {
  const filters: DocumentListFilters = {
    status: readEnum(params, "status", DOCUMENT_STATUS_VALUES),
    docType: readEnum(params, "type", DOCUMENT_TYPE_VALUES),
    from: readDate(params, "from"),
    to: readDate(params, "to"),
    siteRef: readText(params, "site", MAX_SITE_REF_LENGTH),
    search: readText(params, "q", MAX_SEARCH_LENGTH),
  }

  // A reversed range is a mistake, not an attack: keeping both bounds would
  // render an always-empty list with no clue why. The upper bound is dropped so
  // the list still answers "from this day on".
  if (
    filters.from !== null &&
    filters.to !== null &&
    filters.to < filters.from
  ) {
    filters.to = null
  }

  const rawPage = Number(readParam(params, "page") ?? "1")
  const page =
    Number.isSafeInteger(rawPage) && rawPage >= 1
      ? Math.min(rawPage, 10_000)
      : 1

  return { filters, page }
}

/**
 * The inverse: a query back into a URL query string, with defaults omitted.
 *
 * Used by the filter bar and the pager so the URL stays the single source of
 * truth for what the table is showing — a filtered view is a link someone can
 * send to their accountant.
 */
export function documentListSearchParams(
  query: DocumentListQuery,
): URLSearchParams {
  const params = new URLSearchParams()
  const { filters, page } = query
  if (filters.status) params.set("status", filters.status)
  if (filters.docType) params.set("type", filters.docType)
  if (filters.from) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  if (filters.siteRef) params.set("site", filters.siteRef)
  if (filters.search) params.set("q", filters.search)
  if (page > 1) params.set("page", String(page))
  return params
}

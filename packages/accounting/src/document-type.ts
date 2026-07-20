/**
 * Typy dokladů + Dokladové řady config backend — the SINGLE domain source every
 * future Doklady page and table reads. Doklad types (document_type) carry a Druh,
 * a default číselná řada, default účtování + DPH routing + payment defaults; číselné
 * řady (number_series, entity_type DOCUMENT) carry their config-facing category and
 * per-období numbering rows (number_series_period).
 *
 * Snake_case DB-native rows (matching the books read-model rows) — the app edge
 * camelCases for presentation. Reads type `db` as ReadExecutor (safe under
 * withOrgReadonly); mutating helpers keep the narrower RowExecutor.
 *
 * document_category layers OVER summary_record_type (the posting-lane discriminant)
 * — it never replaces it. A category with a posting-lane twin (RECEIVED_INVOICE,
 * ISSUED_INVOICE, CASH↔CASH_DOCUMENT, BANK↔BANK_STATEMENT, INTERNAL) maps to it at
 * capture time; the config-only buckets (SET_OFF, OTHER_*, TAX_APPLICATION) do not.
 */

import { sql } from "drizzle-orm"
import type { SQL } from "drizzle-orm"
import { one, rows } from "./sql"
import type { ReadExecutor, RowExecutor } from "./sql"
import type { DocumentCategory, DocumentKind, OrgCtx } from "./types"

/**
 * The 9 config-facing doklad categories, in the fixed display order both config
 * pages iterate. Typy dokladů surfaces all 9; Dokladové řady surfaces the 4 with an
 * initial číselné-řady scope (RECEIVED_INVOICE, ISSUED_INVOICE, INTERNAL,
 * TAX_APPLICATION — DOCUMENT_SERIES_CATEGORIES).
 */
export const DOCUMENT_CATEGORIES = [
  "RECEIVED_INVOICE",
  "ISSUED_INVOICE",
  "CASH",
  "BANK",
  "INTERNAL",
  "SET_OFF",
  "OTHER_RECEIVABLE",
  "OTHER_PAYABLE",
  "TAX_APPLICATION",
] as const satisfies readonly DocumentCategory[]

/** The 4 categories the Dokladové řady page surfaces initially (task §4). */
export const DOCUMENT_SERIES_CATEGORIES = [
  "RECEIVED_INVOICE",
  "ISSUED_INVOICE",
  "INTERNAL",
  "TAX_APPLICATION",
] as const satisfies readonly DocumentCategory[]

const INVOICE_KINDS = [
  "STANDARD",
  "CREDIT_NOTE",
  "ADVANCE",
  "ADVANCE_TAX_DOC",
  "DELIVERY_NOTE",
  "PROFORMA",
] as const satisfies readonly DocumentKind[]

/**
 * Which Druh values are valid for a category. A partial map: only the categories
 * whose page has landed carry a kind set (received / issued invoices + internal per
 * the ABRA XML). A category absent here permits NO kind — a type in it must leave
 * `kind` null until its kinds are defined. Extend as each category's page lands.
 */
export const DOCUMENT_KINDS_BY_CATEGORY: Partial<
  Record<DocumentCategory, readonly DocumentKind[]>
> = {
  RECEIVED_INVOICE: INVOICE_KINDS,
  ISSUED_INVOICE: INVOICE_KINDS,
  INTERNAL: [
    "GENERAL",
    "FX_GAIN",
    "FX_LOSS",
    "REMAINDER_COST",
    "REMAINDER_REVENUE",
  ],
}

/** The Druh values valid for a category (empty when none are defined yet). */
export function documentKindsFor(
  category: DocumentCategory,
): readonly DocumentKind[] {
  return DOCUMENT_KINDS_BY_CATEGORY[category] ?? []
}

/** The 9 config categories, in display order — the Typy/Dokladové řady hub read. */
export function listDocumentCategories(): readonly DocumentCategory[] {
  return DOCUMENT_CATEGORIES
}

// --- document_type reads -----------------------------------------------------

/** One Typ dokladu row. Snake_case, DB-native; the app edge camelCases for display. */
export interface DocumentTypeRow {
  id: string
  category: DocumentCategory
  code: string
  name: string
  kind: DocumentKind | null
  default_series_id: string | null
  /** Zkratka of the default série (joined) — the Typy dokladů "Řada" column; null if unset. */
  default_series_code: string | null
  is_primary: boolean
  is_active: boolean
  default_account: string | null
  posting_prescription: string | null
  cost_centre: string | null
  activity: string | null
  bank_account: string | null
  payment_form: string | null
  due_days: number | null
  vat_country: string | null
  kh_section: string | null
  description: string | null
  valid_from_year: number | null
  valid_to_year: number | null
  external_source_id: string | null
}

const DOCUMENT_TYPE_COLUMNS = sql`
  dt.id, dt.category, dt.code, dt.name, dt.kind, dt.default_series_id,
  ns.code AS default_series_code,
  dt.is_primary, dt.is_active, dt.default_account, dt.posting_prescription,
  dt.cost_centre, dt.activity, dt.bank_account, dt.payment_form, dt.due_days,
  dt.vat_country, dt.kh_section, dt.description, dt.valid_from_year,
  dt.valid_to_year, dt.external_source_id`

// LEFT JOIN so a type with no default série still returns (default_series_code null).
// The org match is redundant under RLS but keeps the join explicit + composite-safe.
const DOCUMENT_TYPE_FROM = sql`
  FROM document_type dt
  LEFT JOIN number_series ns
    ON ns.id = dt.default_series_id AND ns.organization_id = dt.organization_id`

/**
 * List the org's doklad types. `category` narrows to one bucket (the per-category
 * Table read); `activeOnly` hides archived types. Primary type first, then Zkratka.
 */
export function listDocumentTypes(
  db: ReadExecutor,
  filter: { category?: DocumentCategory; activeOnly?: boolean } = {},
): Promise<DocumentTypeRow[]> {
  const conds: SQL[] = []
  if (filter.category) conds.push(sql`dt.category = ${filter.category}`)
  if (filter.activeOnly) conds.push(sql`dt.is_active = true`)
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``
  return rows<DocumentTypeRow>(
    db,
    sql`SELECT ${DOCUMENT_TYPE_COLUMNS}
        ${DOCUMENT_TYPE_FROM}
        ${where}
        ORDER BY dt.is_primary DESC, dt.code`,
  )
}

/** One doklad type by id, or null if the org has none with that id. */
export async function getDocumentType(
  db: ReadExecutor,
  id: string,
): Promise<DocumentTypeRow | null> {
  const found = await rows<DocumentTypeRow>(
    db,
    sql`SELECT ${DOCUMENT_TYPE_COLUMNS}
        ${DOCUMENT_TYPE_FROM}
        WHERE dt.id = ${id}::uuid`,
  )
  return found[0] ?? null
}

// --- číselné řady (DOCUMENT number_series) reads -----------------------------

/** One Dokladová řada header (a DOCUMENT number_series) + its editor metadata. */
export interface DocumentSeriesRow {
  id: string
  category: DocumentCategory | null
  code: string // Zkratka
  pattern: string
  name: string | null // Název
  note: string | null // Poznámka
  description: string | null // Popis
  valid_from_year: number | null // Platí od roku
  valid_to_year: number | null // Platí do roku
  next_number: number
}

// next_number is bigint (postgres.js returns it as a string) — cast to int so the
// typed `number` row is truthful; a série counter is far below the int4 ceiling.
const DOCUMENT_SERIES_COLUMNS = sql`
  id, category, code, pattern, name, note, description,
  valid_from_year, valid_to_year, next_number::int AS next_number`

/** One per-účetní-období numbering row of a série (the Dokladové řady grid). */
export interface NumberSeriesPeriodRow {
  id: string
  period_id: string
  number_length: number
  prefix: string
  postfix: string
  current_number: number
}

/**
 * List DOCUMENT číselné řady, optionally narrowed to one config category (the
 * Dokladové řady per-category Table read). EVENT / ASSET / INVENTORY_COUNT séries
 * are never returned. Sorted by Zkratka.
 */
export function listDocumentSeries(
  db: ReadExecutor,
  filter: { category?: DocumentCategory } = {},
): Promise<DocumentSeriesRow[]> {
  const catCond = filter.category
    ? sql`AND category = ${filter.category}`
    : sql``
  return rows<DocumentSeriesRow>(
    db,
    sql`SELECT ${DOCUMENT_SERIES_COLUMNS}
        FROM number_series
        WHERE entity_type = 'DOCUMENT' ${catCond}
        ORDER BY code`,
  )
}

/**
 * One Dokladová řada with its per-období numbering rows, or null if the org has no
 * DOCUMENT série with that id. Period rows sorted newest účetní období first.
 */
export async function getDocumentSeries(
  db: ReadExecutor,
  id: string,
): Promise<{
  series: DocumentSeriesRow
  periods: NumberSeriesPeriodRow[]
} | null> {
  const found = await rows<DocumentSeriesRow>(
    db,
    sql`SELECT ${DOCUMENT_SERIES_COLUMNS}
        FROM number_series
        WHERE id = ${id}::uuid AND entity_type = 'DOCUMENT'`,
  )
  const series = found[0]
  if (series === undefined) return null
  const periods = await rows<NumberSeriesPeriodRow>(
    db,
    sql`SELECT nsp.id, nsp.period_id, nsp.number_length, nsp.prefix, nsp.postfix,
               nsp.current_number::int AS current_number
        FROM number_series_period nsp
        JOIN accounting_period p ON p.id = nsp.period_id
        WHERE nsp.number_series_id = ${id}::uuid
        ORDER BY p.period_start DESC`,
  )
  return { series, periods }
}

// --- document_type writes ----------------------------------------------------

/**
 * Fields settable on a doklad type. Upsert keyed on (org, category, Zkratka).
 * `is_primary` is deliberately NOT here — primacy is set only through
 * {@link setPrimaryDocumentType}, the single writer that enforces the exclusive
 * "one primary per category" invariant. A fresh type inserts as non-primary.
 */
export interface UpsertDocumentTypeInput {
  category: DocumentCategory
  code: string
  name: string
  kind?: DocumentKind | null
  defaultSeriesId?: string | null
  defaultAccount?: string | null
  postingPrescription?: string | null
  costCentre?: string | null
  activity?: string | null
  bankAccount?: string | null
  paymentForm?: string | null
  dueDays?: number | null
  vatCountry?: string | null
  khSection?: string | null
  description?: string | null
  validFromYear?: number | null
  validToYear?: number | null
  externalSourceId?: string | null
}

/**
 * Create or overwrite a doklad type, keyed on (org, category, Zkratka). Validates
 * the Druh against DOCUMENT_KINDS_BY_CATEGORY (a kind on a category with no defined
 * kinds, or a kind outside its set, is rejected). A fresh row inserts as
 * non-primary and the conflict path never touches is_primary — primacy is owned
 * solely by {@link setPrimaryDocumentType}, so neither a create nor an edit can
 * mint a second primary. Returns the row id.
 */
export async function upsertDocumentType(
  db: RowExecutor,
  ctx: OrgCtx,
  input: UpsertDocumentTypeInput,
): Promise<string> {
  if (input.kind != null) {
    const allowed = documentKindsFor(input.category)
    if (!allowed.includes(input.kind)) {
      throw new Error(
        `document type: Druh ${input.kind} is not valid for category ${input.category}`,
      )
    }
  }
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO document_type
          (organization_id, category, code, name, kind, default_series_id,
           default_account, posting_prescription, cost_centre, activity, bank_account,
           payment_form, due_days, vat_country, kh_section, description,
           valid_from_year, valid_to_year, external_source_id)
        VALUES
          (${ctx.organizationId}::uuid, ${input.category}, ${input.code}, ${input.name},
           ${input.kind ?? null}, ${input.defaultSeriesId ?? null},
           ${input.defaultAccount ?? null}, ${input.postingPrescription ?? null},
           ${input.costCentre ?? null}, ${input.activity ?? null}, ${input.bankAccount ?? null},
           ${input.paymentForm ?? null}, ${input.dueDays ?? null}, ${input.vatCountry ?? null},
           ${input.khSection ?? null}, ${input.description ?? null},
           ${input.validFromYear ?? null}, ${input.validToYear ?? null}, ${input.externalSourceId ?? null})
        ON CONFLICT (organization_id, category, code) DO UPDATE SET
          name                 = EXCLUDED.name,
          kind                 = EXCLUDED.kind,
          default_series_id    = EXCLUDED.default_series_id,
          default_account      = EXCLUDED.default_account,
          posting_prescription = EXCLUDED.posting_prescription,
          cost_centre          = EXCLUDED.cost_centre,
          activity             = EXCLUDED.activity,
          bank_account         = EXCLUDED.bank_account,
          payment_form         = EXCLUDED.payment_form,
          due_days             = EXCLUDED.due_days,
          vat_country          = EXCLUDED.vat_country,
          kh_section           = EXCLUDED.kh_section,
          description          = EXCLUDED.description,
          valid_from_year      = EXCLUDED.valid_from_year,
          valid_to_year        = EXCLUDED.valid_to_year,
          external_source_id   = EXCLUDED.external_source_id,
          updated_at           = now()
        RETURNING id`,
  )
  return r.id
}

/**
 * Make one ACTIVE type the primary of its category — atomically, so exactly one
 * row per (org, category) has is_primary = true. A single UPDATE flips every
 * ACTIVE sibling in the category: the target to true, the rest to false. Archived
 * (is_active = false) rows are excluded (a primary must be active), so a
 * non-existent or archived id fails the RETURNING check and throws.
 */
export async function setPrimaryDocumentType(
  db: RowExecutor,
  ctx: OrgCtx,
  input: { id: string; category: DocumentCategory },
): Promise<void> {
  const updated = await rows<{ id: string }>(
    db,
    sql`UPDATE document_type
          SET is_primary = (id = ${input.id}::uuid), updated_at = now()
        WHERE organization_id = ${ctx.organizationId}::uuid
          AND category = ${input.category}
          AND is_active = true
        RETURNING id`,
  )
  if (!updated.some((r) => r.id === input.id)) {
    throw new Error(
      `document type: ${input.id} is not an active type of category ${input.category}`,
    )
  }
}

/**
 * Toggle a type's Aktivní flag (archive / restore). Archiving also demotes the
 * type (is_primary = false) so an archived row can never remain a category's
 * primary; restoring leaves it non-primary until re-elected via
 * {@link setPrimaryDocumentType}. Throws if the id is unknown.
 */
export async function setDocumentTypeActive(
  db: RowExecutor,
  ctx: OrgCtx,
  input: { id: string; isActive: boolean },
): Promise<void> {
  const updated = await rows<{ id: string }>(
    db,
    sql`UPDATE document_type
          SET is_active = ${input.isActive},
              is_primary = is_primary AND ${input.isActive},
              updated_at = now()
        WHERE id = ${input.id}::uuid
          AND organization_id = ${ctx.organizationId}::uuid
        RETURNING id`,
  )
  if (updated[0] === undefined) {
    throw new Error(`document type: ${input.id} not found`)
  }
}

// --- Dokladová řada (DOCUMENT number_series) writes --------------------------

/** Fields settable on a Dokladová řada. Upsert keyed on (org, DOCUMENT, Zkratka). */
export interface UpsertDocumentSeriesInput {
  category: DocumentCategory
  code: string // Zkratka
  name?: string | null // Název
  note?: string | null // Poznámka
  description?: string | null // Popis
  validFromYear?: number | null
  validToYear?: number | null
  /** Flat fallback pattern, set only on create; defaults to `<code>{NNNN}`. */
  pattern?: string
}

/**
 * Create or edit a Dokladová řada (a DOCUMENT number_series), keyed on (org,
 * DOCUMENT, Zkratka). The conflict path updates only the config category + editor
 * metadata — it never touches `pattern` (the flat fallback, set once on create)
 * or `next_number` (the gapless counter — resetting it would violate §11/1a). The
 * per-období format lives in number_series_period, edited via
 * {@link upsertNumberSeriesPeriod}. Returns the série id.
 */
export async function upsertDocumentSeries(
  db: RowExecutor,
  ctx: OrgCtx,
  input: UpsertDocumentSeriesInput,
): Promise<string> {
  const pattern = input.pattern ?? `${input.code}{NNNN}`
  const r = await one<{ id: string }>(
    db,
    sql`INSERT INTO number_series
          (organization_id, entity_type, category, code, pattern, name, note,
           description, valid_from_year, valid_to_year)
        VALUES
          (${ctx.organizationId}::uuid, 'DOCUMENT', ${input.category}, ${input.code},
           ${pattern}, ${input.name ?? null}, ${input.note ?? null},
           ${input.description ?? null}, ${input.validFromYear ?? null}, ${input.validToYear ?? null})
        ON CONFLICT (organization_id, entity_type, code) DO UPDATE SET
          category        = EXCLUDED.category,
          name            = EXCLUDED.name,
          note            = EXCLUDED.note,
          description     = EXCLUDED.description,
          valid_from_year = EXCLUDED.valid_from_year,
          valid_to_year   = EXCLUDED.valid_to_year,
          updated_at      = now()
        RETURNING id`,
  )
  return r.id
}

/**
 * Create or edit one per-účetní-období numbering row of a DOCUMENT série (the
 * Dokladové řady grid). On INSERT the gapless `current_number` seeds (1, or an
 * imported historical value); the conflict path edits ONLY the format
 * (number_length / prefix / postfix) and NEVER `current_number` — an in-flight
 * gapless counter must not be reset (§11/1a). Gated at the source: the INSERT…SELECT
 * yields zero rows (and throws) unless the target série is DOCUMENT. Returns the
 * period-row id.
 */
export async function upsertNumberSeriesPeriod(
  db: RowExecutor,
  ctx: OrgCtx,
  input: {
    numberSeriesId: string
    periodId: string
    numberLength: number
    prefix?: string
    postfix?: string
    currentNumber?: number
  },
): Promise<string> {
  const inserted = await rows<{ id: string }>(
    db,
    sql`INSERT INTO number_series_period
          (organization_id, number_series_id, period_id, number_length, prefix, postfix, current_number)
        SELECT ${ctx.organizationId}::uuid, s.id, ${input.periodId}::uuid,
               ${input.numberLength}, ${input.prefix ?? ""}, ${input.postfix ?? ""}, ${input.currentNumber ?? 1}
          FROM number_series s
         WHERE s.id = ${input.numberSeriesId}::uuid
           AND s.entity_type = 'DOCUMENT'
        ON CONFLICT (number_series_id, period_id) DO UPDATE SET
          number_length = EXCLUDED.number_length,
          prefix        = EXCLUDED.prefix,
          postfix       = EXCLUDED.postfix,
          updated_at    = now()
        RETURNING id`,
  )
  const r = inserted[0]
  if (r === undefined) {
    throw new Error(
      `accounting: number series ${input.numberSeriesId} not found or not DOCUMENT — only DOCUMENT séries carry per-period rows`,
    )
  }
  return r.id
}

/**
 * Delete a per-období numbering row — only if it has never issued a number
 * (current_number = 1). A row whose counter has advanced holds the gapless
 * sequence for already-issued Označení; deleting it would orphan them (§11/1a), so
 * it is refused. Throws when the row is unknown, or when it has allocations.
 */
export async function deleteNumberSeriesPeriod(
  db: RowExecutor,
  ctx: OrgCtx,
  input: { id: string },
): Promise<void> {
  const deleted = await rows<{ id: string }>(
    db,
    sql`DELETE FROM number_series_period
         WHERE id = ${input.id}::uuid
           AND organization_id = ${ctx.organizationId}::uuid
           AND current_number = 1
        RETURNING id`,
  )
  if (deleted[0] !== undefined) return
  // Nothing deleted: distinguish not-found from has-allocations for a clear error.
  const existing = await rows<{ current_number: string }>(
    db,
    sql`SELECT current_number FROM number_series_period
         WHERE id = ${input.id}::uuid`,
  )
  if (existing[0] === undefined) {
    throw new Error(`accounting: number series period ${input.id} not found`)
  }
  throw new Error(
    `accounting: number series period ${input.id} has already issued numbers — a gapless counter cannot be deleted (§11/1a)`,
  )
}

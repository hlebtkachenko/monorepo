import "server-only"

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm"

import { betaDb, type BetaExecutor } from "@/db/client"
import {
  betaFilingFamily,
  document,
  filing,
  reporting_period,
  type BetaFilingFamily,
  type BetaFilingKind,
  type BetaFilingStatus,
  type BetaPeriodKind,
} from "@/db/schema"

import { filingView, reportingPeriodView, type FilingView } from "./projections"
import { assertOwner, type OrgScope } from "./scope"

/**
 * The filing registry — one table, five families, six views (spec §2.3, §2.4).
 *
 * READS ARE FOR EVERY ROLE. A guest sees the same filings an owner does; §5
 * makes guest an external VIEWER, not a blinded one, and the role restrictions
 * bite at the write surfaces below. (The employee seat of §2.6.1 — a guest
 * membership linked to a payroll employee — must NOT see company financials, but
 * that is a NARROWING of `OrgScope` itself — `payrollEmployeeId`, landed in PR 33
 * — applied once at the seam and at the Daně layout's `assertNotEmployeeSeat`
 * rather than re-implemented per module. Nothing here changes for it.)
 *
 * WRITES ARE OWNER-ONLY. Spec §3.3: client pages are read-only for every role
 * and Zadávání dat is the only editing home for non-document data. Every write
 * below opens with `assertOwner(scope)`.
 *
 * THE FAMILY MAPPING IS NOT IN THIS FILE. `beta_filing_family(kind)` is a SQL
 * function (migration 0005 §4) and is selected back off the row. A TypeScript
 * copy would be a second constant mapping to keep in step with the first.
 */

/**
 * Derived in SQL against `CURRENT_DATE`, per spec §2.4 ("Po splatnosti
 * derived"). An unpaid filing whose deadline has passed is overdue; a paid one
 * never is, however late the payment was — the row is closed.
 */
const IS_OVERDUE = sql<boolean>`(${filing.paid_at} IS NULL AND ${filing.due_on} < CURRENT_DATE)`

const FILING_FAMILY = sql<BetaFilingFamily>`beta_filing_family(${filing.kind})`

/**
 * The join that decides whether a filing's attachment EXISTS FOR THIS READER.
 *
 * `filing.document_id` being non-null is NOT the same question. A document is
 * soft-deleted rather than removed (`document.deleted_at`, migration 0004: "a
 * soft-deleted row is never listed, never served"), and the office can mark one
 * hidden (`visible_to_client`) — so a filing can hold a perfectly valid id for a
 * row that `lib/data/documents.ts` will refuse to serve. Reporting
 * `hasAttachment: true` off the raw column would put a paperclip in the UI whose
 * only possible outcome is a 404, and spec §0.4's "empty beats stale" says the
 * honest answer is that there is nothing there.
 *
 * So this mirrors `visibleDocuments()` in `lib/data/documents.ts` filter for
 * filter — tenancy, soft delete, the payslip exclusion, the hidden class — and
 * the two must stay in step. The payslip arm is not hypothetical hygiene: an
 * attachment that is somehow a payslip must read as absent here, because §2.2
 * excludes payslips from every non-payroll surface server-side and a filing is
 * not a payroll surface. Fail closed.
 *
 * PR 17 reads `document.id` back off this same join as
 * `FilingView.attachmentDocumentId`, for the Daně a podání download link. That
 * is safe precisely BECAUSE the id only ever exists here after these four
 * filters already ran — see the field's own doc comment in `projections.ts`.
 */
function visibleAttachment(scope: OrgScope) {
  return and(
    eq(document.id, filing.document_id),
    // Redundant with `filing_document_fk` (composite, carries organization_id),
    // written anyway for the same reason the period join carries it: the seam
    // has to be correct on its own terms.
    eq(document.organization_id, filing.organization_id),
    isNull(document.deleted_at),
    ne(document.doc_type, "payslip"),
    // owner IS the accountant and sees the whole book; every other role sees
    // only what the office marked client-visible.
    scope.role === "owner" ? undefined : eq(document.visible_to_client, true),
  )
}

const FILING_COLUMNS = {
  id: filing.id,
  kind: filing.kind,
  status: filing.status,
  due_on: filing.due_on,
  filed_on: filing.filed_on,
  amount_due: filing.amount_due,
  paid_at: filing.paid_at,
  variable_symbol: filing.variable_symbol,
  // The LEFT JOIN's id, not `filing.document_id`: null here means "no
  // attachment this reader may open", which is the only question the projection
  // asks. Selected as a plain column reference so Drizzle qualifies it — three
  // tables in this query have an `id`, and a raw `sql` expression would emit a
  // bare one (see `visibleFilingFamiliesForScope` for what that costs).
  attachment_id: document.id,
  note_client: filing.note_client,
  updated_at: filing.updated_at,
  family: FILING_FAMILY,
  overdue: IS_OVERDUE,
  // note_internal is deliberately not selected. It is office-only (§3.1) and on
  // CLIENT_FORBIDDEN_COLUMNS; not selecting it means no projection here can leak
  // it even by accident.
  period_id: reporting_period.id,
  period_kind: reporting_period.period_kind,
  period_year: reporting_period.year,
  period_month: reporting_period.month,
  period_quarter: reporting_period.quarter,
  period_starts_on: reporting_period.starts_on,
  period_ends_on: reporting_period.ends_on,
}

function toFilingView(row: {
  id: string
  kind: BetaFilingKind
  status: BetaFilingStatus
  due_on: string
  filed_on: string | null
  amount_due: string | null
  paid_at: Date | null
  variable_symbol: string | null
  attachment_id: string | null
  note_client: string | null
  updated_at: Date
  family: BetaFilingFamily
  overdue: boolean
  period_id: string
  period_kind: BetaPeriodKind
  period_year: number
  period_month: number | null
  period_quarter: number | null
  period_starts_on: string
  period_ends_on: string
}): FilingView {
  return filingView({
    ...row,
    hasAttachment: row.attachment_id !== null,
    attachmentDocumentId: row.attachment_id,
    period: reportingPeriodView({
      id: row.period_id,
      period_kind: row.period_kind,
      year: row.period_year,
      month: row.period_month,
      quarter: row.period_quarter,
      starts_on: row.period_starts_on,
      ends_on: row.period_ends_on,
    }),
  })
}

export type FilingFilter = {
  readonly family?: BetaFilingFamily
  readonly periodId?: string
}

/**
 * Souhrn's "YTD paid per family" (spec §2.3) — how much of each family's
 * filings this organization has actually PAID so far in the current calendar
 * year.
 *
 * SUMMED IN SQL, AGAINST `CURRENT_DATE`'s OWN YEAR — never in JavaScript, and
 * never against a year the caller supplies (there is no year parameter: a
 * client-suppliable year would let this answer a question about a year that
 * is not actually "now"). Mirrors `IS_OVERDUE` above in using bare
 * `CURRENT_DATE` rather than an explicit `AT TIME ZONE` conversion, for the
 * same reason: nothing else in this module does either, and Prague-local
 * "what year is it" is a Part 3 formatting concern, not a query one.
 *
 * ALL FOUR FAMILIES ARE ALWAYS PRESENT, at `"0.00"` when a family paid
 * nothing this year — built from `betaFilingFamily.enumValues`, the same
 * technique `OBLIGATION_SOURCES` in `lib/data/obligations.ts` uses, so the
 * Souhrn page can render "0 Kč" for a family with real history but no
 * payments yet without confusing it with a family that has no rows at all.
 *
 * THIS FUNCTION HAS NO OPINION ON VISIBILITY. The DPH gate
 * (`visibleFilingFamiliesForScope`) is a separate concern the CALLER applies —
 * a neplátce with no DPH history still gets a `"0.00"` row back here, and
 * Souhrn's page component is the one that drops it before rendering.
 */
export type FilingFamilyPaidTotal = {
  family: BetaFilingFamily
  /** `numeric(14,2)` as a string, SQL-summed (spec §0.2). Never negative: a
   * refund is never "paid". */
  paidTotal: string
}

export async function filingYtdPaidByFamily(
  scope: OrgScope,
): Promise<FilingFamilyPaidTotal[]> {
  const rows = await betaDb().execute(sql`
    SELECT
      beta_filing_family(f.kind) AS family,
      COALESCE(SUM(f.amount_due), 0) AS paid_total
    FROM filing f
    WHERE f.organization_id = ${scope.organizationId}
      AND f.paid_at IS NOT NULL
      AND f.paid_at >= date_trunc('year', CURRENT_DATE)
      AND f.paid_at < date_trunc('year', CURRENT_DATE) + interval '1 year'
    GROUP BY beta_filing_family(f.kind)
  `)

  const byFamily = new Map(
    (rows as unknown as { family: BetaFilingFamily; paid_total: string }[]).map(
      (row) => [row.family, row.paid_total],
    ),
  )

  return betaFilingFamily.enumValues.map((family) => ({
    family,
    paidTotal: byFamily.get(family) ?? "0.00",
  }))
}

/**
 * The organization's filings, earliest deadline first.
 *
 * The `family` filter is what makes the five §2.3 sidebar entries five calls to
 * one function rather than five tables. `Souhrn` passes no family — it is the
 * cross-family rollup, which is why it is not a `BetaFilingFamily` value.
 */
export async function filingsForScope(
  scope: OrgScope,
  filter: FilingFilter = {},
): Promise<FilingView[]> {
  const rows = await betaDb()
    .select(FILING_COLUMNS)
    .from(filing)
    .innerJoin(
      reporting_period,
      and(
        eq(reporting_period.id, filing.period_id),
        // Redundant with the composite FK, which makes a cross-tenant period
        // reference unrepresentable. Written anyway: this join is the place a
        // future migration relaxing that FK would silently start leaking, and
        // the seam has to be correct on its own terms.
        eq(reporting_period.organization_id, filing.organization_id),
      ),
    )
    // LEFT, not INNER: a filing with no attachment — or one whose attachment
    // this reader may not see — is still a filing.
    .leftJoin(document, visibleAttachment(scope))
    .where(
      and(
        eq(filing.organization_id, scope.organizationId),
        filter.family ? eq(FILING_FAMILY, filter.family) : undefined,
        filter.periodId ? eq(filing.period_id, filter.periodId) : undefined,
      ),
    )
    .orderBy(asc(filing.due_on), asc(filing.id))

  return rows.map(toFilingView)
}

/**
 * Which of the four families this organization's Daně a podání sidebar shows.
 *
 * Spec §2.3 gates exactly one of them: "DPH: visible when `vat_regime='platce'`
 * OR any DPH filing exists". The second half is the load-bearing one — a company
 * that deregistered from VAT still has to be able to open the DPH přiznání it
 * filed while it was a plátce, and its `vat_regime` now says `neplatce`. History
 * outlives the regime.
 *
 * The other three are unconditional. They are not hidden when empty either: an
 * empty family renders "zatím nebylo nahráno" (§0.4, "empty beats stale"), which
 * is information. Hiding DPH is different in kind — for a neplátce with no DPH
 * history the family is not empty, it is inapplicable, and showing it would
 * suggest a filing obligation that does not exist.
 *
 * WRITTEN AS RAW SQL WITH EXPLICIT ALIASES, deliberately. A Drizzle column
 * interpolated into a correlated subquery emits a BARE `"organization_id"` —
 * Drizzle drops the table qualifier in an expression position — and a bare
 * column inside the subquery binds to the SUBQUERY's table first. Here that
 * silently turned the correlation into `filing.organization_id = filing.id`,
 * which is false for every row, and the gate reported "no DPH history" for an
 * organization that had one. The same trap is documented on the count subqueries
 * in `lib/data/office/organizations.ts`; qualify, always.
 */
export async function visibleFilingFamiliesForScope(
  scope: OrgScope,
): Promise<BetaFilingFamily[]> {
  const rows = await betaDb().execute<{
    is_vat_payer: boolean
    has_vat_history: boolean
  }>(sql`
    SELECT
      (o.vat_regime = 'platce') AS is_vat_payer,
      EXISTS (
        SELECT 1 FROM filing f
         WHERE f.organization_id = o.id
           AND beta_filing_family(f.kind) = 'dph'
      ) AS has_vat_history
    FROM organization o
    WHERE o.id = ${scope.organizationId}
  `)

  const row = (
    rows as unknown as { is_vat_payer: boolean; has_vat_history: boolean }[]
  )[0]
  const dphVisible = Boolean(row?.is_vat_payer || row?.has_vat_history)

  return betaFilingFamily.enumValues.filter(
    (family) => family !== "dph" || dphVisible,
  )
}

// ---------------------------------------------------------------------------
// Office writes — the Zadávání dat groundwork (spec §3.3)
// ---------------------------------------------------------------------------

/**
 * WHAT THE PORTAL IS ALLOWED TO WRITE. `amount_due` arrives as a STRING and is
 * stored verbatim. Beta never computes an accounting number (spec §0.2) — the
 * office types the figure its own software produced, or the ingestion API of PR
 * 24 feeds it — so there is no place in this file where a money value is parsed,
 * added, rounded or reformatted. `numeric(14,2)` rejects a malformed one at the
 * boundary, which is where validation belongs.
 */
export type FilingWriteInput = {
  readonly kind: BetaFilingKind
  readonly periodId: string
  readonly dueOn: string
  readonly status?: BetaFilingStatus
  readonly filedOn?: string | null
  /** `numeric(14,2)` as a string, or null for "the office has not stated one". */
  readonly amountDue?: string | null
  readonly paidAt?: Date | null
  readonly variableSymbol?: string | null
  readonly documentId?: string | null
  readonly noteClient?: string | null
  readonly noteInternal?: string | null
  /**
   * The source system's own id (migration 0011). Set only by the agent
   * ingestion API, where it is the upsert match key; office-typed filings leave
   * it NULL and are therefore never overwritten by an agent run.
   */
  readonly externalRef?: string | null
}

/**
 * The filing an agent's `externalRef` names, with the two fields an upsert is
 * not allowed to change.
 *
 * Returns `kind` and `periodId` alongside the id because `updateFiling` refuses
 * to patch either (they are the row's identity), so the caller has to be able to
 * REFUSE a payload that moved one rather than silently ignore it.
 */
export async function filingByExternalRef(
  scope: OrgScope,
  externalRef: string,
  executor: BetaExecutor = betaDb(),
): Promise<{ id: string; kind: BetaFilingKind; periodId: string } | null> {
  const [row] = await executor
    .select({
      id: filing.id,
      kind: filing.kind,
      periodId: filing.period_id,
    })
    .from(filing)
    .where(
      and(
        eq(filing.organization_id, scope.organizationId),
        eq(filing.external_ref, externalRef),
      ),
    )
    .limit(1)

  return row ?? null
}

/**
 * Create a filing.
 *
 * `period_id` is taken as an id rather than a period shape, so a caller cannot
 * name a period belonging to another organization without first having held a
 * scope for it: the composite FK refuses the insert outright (`filing_period_fk`
 * carries `organization_id`), which is a database-level 23503 rather than a
 * silently-wrong row. `ensureReportingPeriod` is the function that turns a shape
 * into an id, and it is scoped too.
 */
export async function createFiling(
  scope: OrgScope,
  input: FilingWriteInput,
  executor: BetaExecutor = betaDb(),
): Promise<{ id: string }> {
  assertOwner(scope)

  const [row] = await executor
    .insert(filing)
    .values({
      organization_id: scope.organizationId,
      kind: input.kind,
      period_id: input.periodId,
      due_on: input.dueOn,
      status: input.status ?? "planned",
      filed_on: input.filedOn ?? null,
      amount_due: input.amountDue ?? null,
      paid_at: input.paidAt ?? null,
      variable_symbol: input.variableSymbol ?? null,
      document_id: input.documentId ?? null,
      note_client: input.noteClient ?? null,
      note_internal: input.noteInternal ?? null,
      external_ref: input.externalRef ?? null,
    })
    .returning({ id: filing.id })

  if (!row) throw new Error("filing insert returned no row")
  return row
}

/** The fields Zadávání dat may change. `kind` and `period_id` are not among them. */
export type FilingPatch = Partial<
  Pick<
    FilingWriteInput,
    | "dueOn"
    | "status"
    | "filedOn"
    | "amountDue"
    | "paidAt"
    | "variableSymbol"
    | "documentId"
    | "noteClient"
    | "noteInternal"
  >
>

/**
 * Edit a filing.
 *
 * `kind` and `period_id` are NOT patchable. Both are the row's identity — the
 * family it appears under and the period it is stamped with — and re-pointing
 * either silently rewrites history for every surface that already showed it. A
 * mistyped filing is deleted and re-entered, which leaves a hole rather than a
 * lie.
 *
 * The WHERE clause carries `organization_id` even though `id` is a primary key.
 * That is not belt-and-braces: without it, an id leaked or guessed from anywhere
 * would let a holder of ANY scope edit ANY filing, and this database has no RLS
 * behind the seam to catch it.
 *
 * Returns whether a row matched, so the caller can 404 rather than report a
 * successful save of nothing.
 */
export async function updateFiling(
  scope: OrgScope,
  filingId: string,
  patch: FilingPatch,
  executor: BetaExecutor = betaDb(),
): Promise<boolean> {
  assertOwner(scope)

  const values = {
    ...("dueOn" in patch ? { due_on: patch.dueOn } : {}),
    ...("status" in patch ? { status: patch.status } : {}),
    ...("filedOn" in patch ? { filed_on: patch.filedOn ?? null } : {}),
    ...("amountDue" in patch ? { amount_due: patch.amountDue ?? null } : {}),
    ...("paidAt" in patch ? { paid_at: patch.paidAt ?? null } : {}),
    ...("variableSymbol" in patch
      ? { variable_symbol: patch.variableSymbol ?? null }
      : {}),
    ...("documentId" in patch ? { document_id: patch.documentId ?? null } : {}),
    ...("noteClient" in patch ? { note_client: patch.noteClient ?? null } : {}),
    ...("noteInternal" in patch
      ? { note_internal: patch.noteInternal ?? null }
      : {}),
  }

  if (Object.keys(values).length === 0) return true

  const updated = await executor
    .update(filing)
    .set(values)
    .where(
      and(
        eq(filing.id, filingId),
        eq(filing.organization_id, scope.organizationId),
      ),
    )
    .returning({ id: filing.id })

  return updated.length > 0
}

/**
 * Delete filings by id, within the scope's own organization.
 *
 * The counterpart to "a mistyped filing is re-entered rather than re-pointed"
 * above. Scoped by `organization_id` for the same reason `updateFiling` is.
 */
export async function deleteFilings(
  scope: OrgScope,
  filingIds: readonly string[],
): Promise<number> {
  assertOwner(scope)
  if (filingIds.length === 0) return 0

  const deleted = await betaDb()
    .delete(filing)
    .where(
      and(
        eq(filing.organization_id, scope.organizationId),
        inArray(filing.id, [...filingIds]),
      ),
    )
    .returning({ id: filing.id })

  return deleted.length
}

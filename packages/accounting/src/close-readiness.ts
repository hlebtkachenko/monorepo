import { sql } from "drizzle-orm"

import {
  findUnbalancedPostings,
  reconcileAnalytics,
  reconcileReadModel,
  unlinkedInvoiceLines,
  unpostedCases,
} from "./invariants"
import { rows } from "./sql"
import type { RowExecutor } from "./sql"
import type { FxRateKind, OrgCtx, PeriodStatus, Regime } from "./types"

export type PeriodCloseCheckCode =
  | "PERIOD_EXISTS"
  | "PERIOD_OPEN"
  | "NO_UNPOSTED_CASES"
  | "INVOICE_LINES_TRACEABLE"
  | "READ_MODEL_RECONCILED"
  | "POSTINGS_BALANCED"
  | "ANALYTICS_RECONCILED"
  | "REQUIRED_NUMBER_SERIES_AVAILABLE"
  | "PENDING_BRAIN_PROPOSALS"
  | "ASSET_AND_INVENTORY_COMPLETENESS"
  | "FILING_COMPLETENESS"
  | "YEAR_END_SCHEDULE_COMPLETENESS"
  | "SIGNED_STATEMENT_COMPLETENESS"

export type CloseCheckSeverity = "BLOCKER" | "WARNING" | "INFO"
export type CloseCheckStatus = "PASS" | "FAIL" | "UNAVAILABLE"

export interface PeriodCloseReference {
  id: string
  designation?: string
}

export interface PeriodCloseCheck {
  code: PeriodCloseCheckCode
  severity: CloseCheckSeverity
  status: CloseCheckStatus
  label: string
  message: string
  count?: number
  /** Bounded examples only; count is the authoritative total. */
  references?: PeriodCloseReference[]
}

export interface PeriodCloseReadiness {
  periodId: string
  organizationId: string
  regimeCode: Regime | null
  periodStart: string | null
  periodEnd: string | null
  periodStatus: PeriodStatus | null
  ready: boolean
  checks: PeriodCloseCheck[]
}

export class PeriodCloseBlockedError extends Error {
  constructor(public readonly readiness: PeriodCloseReadiness) {
    super("accounting: period close blocked by readiness checks")
    this.name = "PeriodCloseBlockedError"
  }
}

interface ClosePeriodRow {
  regime_code: Regime
  accounting_currency: string
  fx_rate_policy: FxRateKind | null
  period_start: string
  period_end: string
  status: PeriodStatus
}

interface RequiredCloseNumberSeries {
  eventSeriesId: string | null
  documentSeriesId: string | null
}

interface PendingBrainProposalRow {
  id: string
  tool_name: string
  total_count: number
  unscoped_count: number
}

interface PendingBrainProposalSummary {
  totalCount: number
  unscopedCount: number
  references: PeriodCloseReference[]
}

export interface PeriodCloseAssessmentContext {
  readiness: PeriodCloseReadiness
  period: ClosePeriodRow | null
  numberSeries: RequiredCloseNumberSeries
}

const unavailableChecks: PeriodCloseCheck[] = [
  {
    code: "FILING_COMPLETENESS",
    severity: "WARNING",
    status: "UNAVAILABLE",
    label: "Tax and payroll filings",
    message:
      "VAT, income-tax, payroll, and other filing completion is not verified.",
  },
  {
    code: "YEAR_END_SCHEDULE_COMPLETENESS",
    severity: "WARNING",
    status: "UNAVAILABLE",
    label: "Year-end schedules",
    message:
      "Accrual, provision, impairment, and deferred-tax schedule completion is not verified.",
  },
  {
    code: "SIGNED_STATEMENT_COMPLETENESS",
    severity: "WARNING",
    status: "UNAVAILABLE",
    label: "Signed statements and publication",
    message:
      "Signed statement artifacts, filing receipts, approval, and publication are not verified.",
  },
]

const MAX_EXPOSED_REFERENCES = 3

const LEGACY_PERIOD_SCOPED_BRAIN_TOOLS = [
  "createAccountingEvent",
  "captureAccountingDocument",
  "createAccountingPosting",
  "createInvoice",
] as const

function dependentUnavailable(
  code: PeriodCloseCheckCode,
  label: string,
): PeriodCloseCheck {
  return {
    code,
    severity: "BLOCKER",
    status: "UNAVAILABLE",
    label,
    message: "Check unavailable because the period was not found.",
  }
}

async function resolveRequiredNumberSeries(
  db: RowExecutor,
  organizationId: string,
): Promise<RequiredCloseNumberSeries> {
  const event = await rows<{ id: string }>(
    db,
    sql`SELECT id FROM number_series
          WHERE organization_id = ${organizationId}::uuid
            AND entity_type = 'EVENT'
          ORDER BY created_at, id
          LIMIT 1`,
  )
  const document = await rows<{ id: string }>(
    db,
    sql`SELECT id FROM number_series
          WHERE organization_id = ${organizationId}::uuid
            AND entity_type = 'DOCUMENT'
          ORDER BY (code = 'ID') DESC, created_at, id
          LIMIT 1`,
  )
  return {
    eventSeriesId: event[0]?.id ?? null,
    documentSeriesId: document[0]?.id ?? null,
  }
}

async function pendingBrainProposals(
  db: RowExecutor,
  periodId: string,
): Promise<PendingBrainProposalSummary> {
  const proposals = await rows<PendingBrainProposalRow>(
    db,
    sql`WITH pending AS (
          SELECT id, tool_name, period_id, created_at
            FROM tool_call_log
           WHERE auto_applied = false
             AND approved_by_user_id IS NULL
             AND (
               period_id = ${periodId}::uuid
               OR (
                 period_id IS NULL
                 AND tool_name IN (${sql.join(
                   LEGACY_PERIOD_SCOPED_BRAIN_TOOLS.map((tool) => sql`${tool}`),
                   sql`, `,
                 )})
               )
             )
        )
        SELECT id,
               tool_name,
               (count(*) OVER ())::int AS total_count,
               (count(*) FILTER (WHERE period_id IS NULL) OVER ())::int AS unscoped_count
          FROM pending
         ORDER BY created_at, id
         LIMIT ${MAX_EXPOSED_REFERENCES}`,
  )
  const first = proposals[0]
  return {
    totalCount: first?.total_count ?? 0,
    unscopedCount: first?.unscoped_count ?? 0,
    references: proposals.map((proposal) => ({
      id: proposal.id,
      designation: `${proposal.tool_name} (${proposal.id})`,
    })),
  }
}

function pendingBrainProposalCheck(
  proposals: PendingBrainProposalSummary,
): PeriodCloseCheck {
  const { totalCount, unscopedCount, references } = proposals
  const scopedCount = totalCount - unscopedCount
  const status: CloseCheckStatus =
    unscopedCount > 0 ? "UNAVAILABLE" : scopedCount > 0 ? "FAIL" : "PASS"
  const scopedLabel =
    scopedCount === 1
      ? "1 unresolved HELD Brain proposal targets"
      : `${scopedCount} unresolved HELD Brain proposals target`
  const unscopedLabel =
    unscopedCount === 1
      ? "1 unresolved accounting proposal lacks"
      : `${unscopedCount} unresolved accounting proposals lack`
  const message =
    unscopedCount > 0 && scopedCount > 0
      ? `${scopedLabel} this period; ${unscopedLabel} authoritative period linkage.`
      : unscopedCount > 0
        ? `${unscopedLabel} authoritative period linkage.`
        : scopedCount > 0
          ? `${scopedLabel} this period.`
          : "No unresolved HELD Brain proposals target this period."

  return {
    code: "PENDING_BRAIN_PROPOSALS",
    severity: "BLOCKER",
    status,
    label: "Pending Brain proposals",
    message,
    count: totalCount,
    references,
  }
}

interface AssetInventoryIncompleteRow {
  kind: "ASSET_DEPRECIATION" | "INVENTORY_RECONCILIATION"
  id: string
  designation: string
  total_count: number
  asset_count: number
  inventory_count: number
}

interface AssetInventoryCompletenessSummary {
  totalCount: number
  assetCount: number
  inventoryCount: number
  references: PeriodCloseReference[]
}

/**
 * §26–33 / ČÚS 013 + §29–30 inventarizace completeness for a period. Conservative
 * by construction: an empty register (no assets, no inventory counts) yields zero
 * findings, so a book with no assets and no uncounted inventory always passes. The
 * check fires ONLY on provable incompleteness:
 *
 *   asset depreciation — a depreciable asset (INTANGIBLE / TANGIBLE_DEPRECIABLE;
 *     land is TANGIBLE_NON_DEPRECIABLE and excluded) that was in use during the
 *     period (commissioned on or before period end, not disposed before period
 *     start) but carries no odpisový plán at all. A fully-depreciated or disposed
 *     asset keeps its plan row (status FULLY_DEPRECIATED / DISPOSED), so it is not
 *     flagged.
 *
 *   inventory reconciliation — an inventurní soupis dated inside the period whose
 *     lines record a real difference (SHORTAGE / SURPLUS, i.e. manko / přebytek)
 *     with no posting linked to that count. A matched count (all lines MATCH) or a
 *     count whose differences are already booked is not flagged.
 *
 * Org isolation is enforced by FORCE RLS on the org-bound executor; the explicit
 * organization_id predicate mirrors the surrounding close-readiness queries.
 */
async function assetInventoryCompleteness(
  db: RowExecutor,
  organizationId: string,
  periodStart: string,
  periodEnd: string,
): Promise<AssetInventoryCompletenessSummary> {
  const findings = await rows<AssetInventoryIncompleteRow>(
    db,
    sql`WITH incomplete AS (
          SELECT 'ASSET_DEPRECIATION'::text AS kind,
                 a.id,
                 a.designation,
                 a.commissioning_date AS ordinal
            FROM asset a
           WHERE a.organization_id = ${organizationId}::uuid
             AND a.category IN ('INTANGIBLE', 'TANGIBLE_DEPRECIABLE')
             AND a.commissioning_date <= ${periodEnd}::date
             AND (a.disposal_date IS NULL OR a.disposal_date >= ${periodStart}::date)
             AND NOT EXISTS (
               SELECT 1 FROM depreciation_plan dp
                WHERE dp.asset_id = a.id
                  AND dp.organization_id = a.organization_id)
          UNION ALL
          SELECT 'INVENTORY_RECONCILIATION'::text AS kind,
                 ic.id,
                 ic.designation,
                 ic.count_date AS ordinal
            FROM inventory_count ic
           WHERE ic.organization_id = ${organizationId}::uuid
             AND ic.count_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
             AND EXISTS (
               SELECT 1 FROM inventory_count_line icl
                WHERE icl.inventory_count_id = ic.id
                  AND icl.organization_id = ic.organization_id
                  AND icl.difference_kind IN ('SHORTAGE', 'SURPLUS'))
             AND NOT EXISTS (
               SELECT 1 FROM posting p
                WHERE p.inventory_count_id = ic.id
                  AND p.organization_id = ic.organization_id)
        )
        SELECT kind,
               id,
               designation,
               (count(*) OVER ())::int AS total_count,
               (count(*) FILTER (WHERE kind = 'ASSET_DEPRECIATION') OVER ())::int
                 AS asset_count,
               (count(*) FILTER (WHERE kind = 'INVENTORY_RECONCILIATION') OVER ())::int
                 AS inventory_count
          FROM incomplete
         ORDER BY kind, ordinal, id
         LIMIT ${MAX_EXPOSED_REFERENCES}`,
  )
  const first = findings[0]
  return {
    totalCount: first?.total_count ?? 0,
    assetCount: first?.asset_count ?? 0,
    inventoryCount: first?.inventory_count ?? 0,
    references: findings.map((finding) => ({
      id: finding.id,
      designation:
        finding.kind === "ASSET_DEPRECIATION"
          ? `Asset ${finding.designation} (no depreciation plan)`
          : `Inventory count ${finding.designation} (unrecorded difference)`,
    })),
  }
}

function assetInventoryCompletenessCheck(
  summary: AssetInventoryCompletenessSummary,
): PeriodCloseCheck {
  const { totalCount, assetCount, inventoryCount, references } = summary
  const parts: string[] = []
  if (assetCount > 0) {
    parts.push(
      assetCount === 1
        ? "1 depreciable asset has no depreciation plan"
        : `${assetCount} depreciable assets have no depreciation plan`,
    )
  }
  if (inventoryCount > 0) {
    parts.push(
      inventoryCount === 1
        ? "1 inventory count has an unrecorded difference"
        : `${inventoryCount} inventory counts have unrecorded differences`,
    )
  }
  return {
    code: "ASSET_AND_INVENTORY_COMPLETENESS",
    severity: "BLOCKER",
    status: totalCount === 0 ? "PASS" : "FAIL",
    label: "Assets and inventory",
    message:
      totalCount === 0
        ? "Depreciable assets carry a depreciation plan and inventory differences are recorded."
        : `${parts.join("; ")}.`,
    count: totalCount,
    references,
  }
}

export async function assessPeriodCloseReadinessWithContext(
  db: RowExecutor,
  ctx: OrgCtx,
  periodId: string,
): Promise<PeriodCloseAssessmentContext> {
  const periodRows = await rows<ClosePeriodRow>(
    db,
    sql`SELECT regime_code, accounting_currency, fx_rate_policy,
               period_start::text AS period_start,
               period_end::text AS period_end,
               status
          FROM accounting_period
         WHERE id = ${periodId}::uuid
           AND organization_id = ${ctx.organizationId}::uuid`,
  )
  const period = periodRows[0] ?? null
  const numberSeries = await resolveRequiredNumberSeries(db, ctx.organizationId)
  const checks: PeriodCloseCheck[] = [
    {
      code: "PERIOD_EXISTS",
      severity: "BLOCKER",
      status: period ? "PASS" : "FAIL",
      label: "Period exists",
      message: period
        ? "Period exists in this organization."
        : "Period was not found in this organization.",
    },
    {
      code: "PERIOD_OPEN",
      severity: "BLOCKER",
      status: period
        ? period.status === "OPEN"
          ? "PASS"
          : "FAIL"
        : "UNAVAILABLE",
      label: "Period is open",
      message: period
        ? period.status === "OPEN"
          ? "Period is open."
          : "Period is already closed."
        : "Check unavailable because the period was not found.",
    },
  ]

  if (period) {
    const unposted = await unpostedCases(db, periodId)
    checks.push({
      code: "NO_UNPOSTED_CASES",
      severity: "BLOCKER",
      status: unposted.length === 0 ? "PASS" : "FAIL",
      label: "All cases posted",
      message:
        unposted.length === 0
          ? "Every accounting case in the period is posted."
          : `${unposted.length} accounting case(s) remain unposted.`,
      count: unposted.length,
      references: unposted.slice(0, MAX_EXPOSED_REFERENCES).map((item) => ({
        id: item.individual_record_id,
        designation: item.event_designation,
      })),
    })

    const unlinked = await unlinkedInvoiceLines(db, periodId)
    checks.push({
      code: "INVOICE_LINES_TRACEABLE",
      severity: "BLOCKER",
      status: unlinked.length === 0 ? "PASS" : "FAIL",
      label: "Invoice lines traceable",
      message:
        unlinked.length === 0
          ? "Every invoice posting line is linked to its source record."
          : `${unlinked.length} invoice posting line(s) lack a source link.`,
      count: unlinked.length,
      references: unlinked.slice(0, MAX_EXPOSED_REFERENCES).map((item) => ({
        id: item.line_id,
        designation: item.summary_designation,
      })),
    })

    const drift = await reconcileReadModel(db, periodId)
    checks.push({
      code: "READ_MODEL_RECONCILED",
      severity: "BLOCKER",
      status: drift.length === 0 ? "PASS" : "FAIL",
      label: "Read model reconciled",
      message:
        drift.length === 0
          ? "Ledger balances match journal lines."
          : `${drift.length} account balance(s) differ from the journal.`,
      count: drift.length,
      references: drift
        .slice(0, MAX_EXPOSED_REFERENCES)
        .map((item) => ({ id: item.account_id })),
    })

    const unbalanced = await findUnbalancedPostings(db, periodId)
    checks.push({
      code: "POSTINGS_BALANCED",
      severity: "BLOCKER",
      status: unbalanced.length === 0 ? "PASS" : "FAIL",
      label: "Postings balanced",
      message:
        unbalanced.length === 0
          ? "Every double-entry posting is balanced."
          : `${unbalanced.length} posting(s) are unbalanced.`,
      count: unbalanced.length,
      references: unbalanced
        .slice(0, MAX_EXPOSED_REFERENCES)
        .map((item) => ({ id: item.posting_id })),
    })

    const analytics = await reconcileAnalytics(db, periodId)
    const failedAnalytics = analytics.filter((item) => !item.reconciles)
    checks.push({
      code: "ANALYTICS_RECONCILED",
      severity: "BLOCKER",
      status: failedAnalytics.length === 0 ? "PASS" : "FAIL",
      label: "Analytical accounts reconciled",
      message:
        failedAnalytics.length === 0
          ? "Analytical accounts reconcile to their synthetic accounts."
          : `${failedAnalytics.length} synthetic account group(s) do not reconcile.`,
      count: failedAnalytics.length,
      references: failedAnalytics
        .slice(0, MAX_EXPOSED_REFERENCES)
        .map((item) => ({ id: item.synthetic_code })),
    })

    checks.push(
      pendingBrainProposalCheck(await pendingBrainProposals(db, periodId)),
    )

    checks.push(
      assetInventoryCompletenessCheck(
        await assetInventoryCompleteness(
          db,
          ctx.organizationId,
          period.period_start,
          period.period_end,
        ),
      ),
    )
  } else {
    checks.push(
      dependentUnavailable("NO_UNPOSTED_CASES", "All cases posted"),
      dependentUnavailable(
        "INVOICE_LINES_TRACEABLE",
        "Invoice lines traceable",
      ),
      dependentUnavailable("READ_MODEL_RECONCILED", "Read model reconciled"),
      dependentUnavailable("POSTINGS_BALANCED", "Postings balanced"),
      dependentUnavailable(
        "ANALYTICS_RECONCILED",
        "Analytical accounts reconciled",
      ),
      dependentUnavailable(
        "PENDING_BRAIN_PROPOSALS",
        "Pending Brain proposals",
      ),
      dependentUnavailable(
        "ASSET_AND_INVENTORY_COMPLETENESS",
        "Assets and inventory",
      ),
    )
  }

  const missingSeries = [
    numberSeries.eventSeriesId ? null : "EVENT",
    numberSeries.documentSeriesId ? null : "DOCUMENT",
  ].filter((value): value is string => value !== null)
  checks.push({
    code: "REQUIRED_NUMBER_SERIES_AVAILABLE",
    severity: "BLOCKER",
    status: missingSeries.length === 0 ? "PASS" : "FAIL",
    label: "Required number series available",
    message:
      missingSeries.length === 0
        ? "EVENT and DOCUMENT number series are available."
        : `Missing required number series: ${missingSeries.join(", ")}.`,
    count: missingSeries.length,
  })
  checks.push(...unavailableChecks.map((check) => ({ ...check })))

  const readiness: PeriodCloseReadiness = {
    periodId,
    organizationId: ctx.organizationId,
    regimeCode: period?.regime_code ?? null,
    periodStart: period?.period_start ?? null,
    periodEnd: period?.period_end ?? null,
    periodStatus: period?.status ?? null,
    ready: checks
      .filter((check) => check.severity === "BLOCKER")
      .every((check) => check.status === "PASS"),
    checks,
  }

  return { readiness, period, numberSeries }
}

export async function assessPeriodCloseReadiness(
  db: RowExecutor,
  ctx: OrgCtx,
  periodId: string,
): Promise<PeriodCloseReadiness> {
  const assessment = await assessPeriodCloseReadinessWithContext(
    db,
    ctx,
    periodId,
  )
  return assessment.readiness
}

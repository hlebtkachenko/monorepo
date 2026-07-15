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

export interface PeriodCloseAssessmentContext {
  readiness: PeriodCloseReadiness
  period: ClosePeriodRow | null
  numberSeries: RequiredCloseNumberSeries
}

const unavailableChecks: PeriodCloseCheck[] = [
  {
    code: "PENDING_BRAIN_PROPOSALS",
    severity: "WARNING",
    status: "UNAVAILABLE",
    label: "Pending Brain proposals",
    message:
      "Pending HELD Brain proposals cannot yet be matched reliably to this period.",
  },
  {
    code: "ASSET_AND_INVENTORY_COMPLETENESS",
    severity: "WARNING",
    status: "UNAVAILABLE",
    label: "Assets and inventory",
    message:
      "Asset commissioning, depreciation, register completeness, and inventory approval are not verified.",
  },
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

/**
 * The COUPLED accounting scaffold — period + (chart + seeded accounts for
 * double-entry) + default number series — created together in one org-bound
 * frame. This is the single source both `scaffoldOrganization` (fresh org) and
 * `POST /v1/accounting/periods` (an existing org that lacks its accounting
 * structure) call, so a period is NEVER minted without its chart + number
 * series (#579: a wizard/API path that created a period alone left the org
 * unbookable).
 *
 * Pure master-data inserts through the `@workspace/accounting` primitives — NOT
 * a gated accounting write (no tool_call_log, no confidence gate). The caller
 * owns the org-bound transaction (RLS satisfied by the GUC).
 */
import { sql } from "drizzle-orm"
import { executeRows } from "@workspace/db"
import type { OrganizationBoundDb } from "@workspace/db"
import type { FxRateKind, OrgCtx, PeriodStatus } from "@workspace/accounting"
import {
  backfillDefaultDocumentTypes,
  backfillDefaultNumberSeries,
  createChart,
  createPeriod,
  seedChartFromDirectives,
  resolveFrameworkYear,
} from "@workspace/accounting"
import { deriveRegime, type LegalFormFacts, type Regime } from "./regime"
import { ScaffoldValidationError } from "./errors"

/** Nonprofit legal forms book under Vyhláška 504/2002 — a chart we don't seed. */
const NONPROFIT_FORMS: ReadonlySet<string> = new Set([
  "SPOLEK",
  "NADACE",
  "USTAV",
  "SVJ",
])

export interface OrgAccountingProfile {
  /** Bookkeeping regime the period is opened under (immutable per entity). */
  regime: Regime
  /** true when the regime keeps a chart of accounts (double-entry). */
  requiresChart: boolean
  /** Org's fiscal-year start month (1–12) — drives period-end derivation. */
  fiscalYearStartMonth: number
}

/**
 * Resolve the accounting regime + chart requirement for an EXISTING org.
 *
 * If the org already books under a regime (has any accounting_period), that
 * regime is reused — the regime is fixed per entity, so a second period must
 * not diverge. Only when the org has NO period yet (the #579 case: created
 * without its accounting scaffold) is the regime derived from the legal form,
 * exactly as `scaffoldOrganization` does at creation time. `regimeOverride`
 * disambiguates a legal form that permits more than one regime.
 */
export async function resolveOrgAccountingProfile(
  db: OrganizationBoundDb,
  organizationId: string,
  regimeOverride?: Regime,
): Promise<OrgAccountingProfile> {
  const orgRows = await executeRows<{
    legal_form_code: string
    fiscal_year_start_month: number
    legal_subject_kind: string | null
  }>(
    db,
    sql`SELECT legal_form_code, fiscal_year_start_month, legal_subject_kind
        FROM organization WHERE id = ${organizationId}::uuid`,
  )
  const org = orgRows[0]
  if (!org) {
    throw new ScaffoldValidationError(
      "organization not found",
      "REGIME_NOT_ALLOWED",
    )
  }

  // Reuse the regime of the org's earliest existing period, if any.
  const existing = await executeRows<{ regime_code: Regime }>(
    db,
    sql`SELECT regime_code FROM accounting_period
        WHERE organization_id = ${organizationId}::uuid
        ORDER BY period_start LIMIT 1`,
  )
  if (existing[0]) {
    const regime = existing[0].regime_code
    if (regimeOverride && regimeOverride !== regime) {
      throw new ScaffoldValidationError(
        `this organization already books under ${regime}; regimeCode cannot switch it`,
        "REGIME_CONFLICT",
      )
    }
    return {
      regime,
      requiresChart: await requiresChartForRegime(db, regime),
      fiscalYearStartMonth: org.fiscal_year_start_month,
    }
  }

  // First period: derive the regime from the legal form (same rules as creation).
  const formRows = await executeRows<{ mandatory_double_entry: boolean }>(
    db,
    sql`SELECT mandatory_double_entry FROM legal_form WHERE code = ${org.legal_form_code}`,
  )
  if (!formRows[0]) {
    throw new ScaffoldValidationError(
      `unknown legal form: ${org.legal_form_code}`,
      "REGIME_NOT_ALLOWED",
    )
  }
  const allowedRows = await executeRows<{ regime_code: Regime }>(
    db,
    sql`SELECT regime_code FROM legal_form_allowed_regime
        WHERE legal_form_code = ${org.legal_form_code}`,
  )
  // inPublicRegister is not stored on the org row; a legal form that mandates
  // double-entry already forces it here, and the rare natural-person-in-a-public-
  // register case is resolved by passing regimeCode explicitly.
  const facts: LegalFormFacts = {
    allowedRegimes: allowedRows.map((r) => r.regime_code),
    mandatoryDoubleEntry: formRows[0].mandatory_double_entry,
    inPublicRegister: false,
  }
  const derivation = deriveRegime(facts, regimeOverride)
  if ("ambiguous" in derivation) {
    throw new ScaffoldValidationError(
      `regime is ambiguous for ${org.legal_form_code}; pass regimeCode (one of ${derivation.allowed.join(", ")})`,
      "REGIME_AMBIGUOUS",
    )
  }
  const regime = derivation.resolved
  const requiresChart = await requiresChartForRegime(db, regime)

  const isNonprofit =
    org.legal_subject_kind === "non_profit" ||
    NONPROFIT_FORMS.has(org.legal_form_code)
  if (requiresChart && isNonprofit) {
    throw new ScaffoldValidationError(
      "nonprofit double-entry (Vyhláška 504/2002) is not supported yet",
      "NONPROFIT_DOUBLE_ENTRY_UNSUPPORTED",
    )
  }

  return {
    regime,
    requiresChart,
    fiscalYearStartMonth: org.fiscal_year_start_month,
  }
}

async function requiresChartForRegime(
  db: OrganizationBoundDb,
  regime: Regime,
): Promise<boolean> {
  const rows = await executeRows<{ requires: boolean }>(
    db,
    sql`SELECT requires_chart_of_accounts AS requires FROM regime WHERE code = ${regime}`,
  )
  return rows[0]?.requires ?? false
}

export interface AccountingScaffoldContext {
  organizationId: string
  workspaceId: string
  regime: Regime
  /** true → also create + seed the chart of accounts (double-entry). */
  requiresChart: boolean
}

export interface AccountingScaffoldParams {
  periodStart: string
  periodEnd: string
  accountingCurrency?: string
  accountingSizeCode?: string | null
  fxRatePolicy?: FxRateKind | null
  status?: PeriodStatus
}

export interface AccountingScaffoldResult {
  periodId: string
  /** null for non-double-entry regimes (no chart). */
  chartId: string | null
  accountsSeeded: number
  /** Default number series inserted (0 when the org already had all of them). */
  seriesCreated: number
  /** Default doklad types seeded (0 when the org already had all of them). */
  typesSeeded: number
}

/**
 * Create a period plus its coupled scaffold (chart + seeded účty for double-
 * entry, default number series) in the caller's org-bound frame. Number-series
 * creation is idempotent (`ON CONFLICT DO NOTHING`), so a second period on an
 * already-scaffolded org adds only the period + chart, not duplicate series.
 */
export async function scaffoldAccountingPeriod(
  db: OrganizationBoundDb,
  ctx: AccountingScaffoldContext,
  params: AccountingScaffoldParams,
): Promise<AccountingScaffoldResult> {
  const orgCtx: OrgCtx = {
    organizationId: ctx.organizationId,
    workspaceId: ctx.workspaceId,
  }

  // Overlap guard (F1). accounting_period has only CHECK (start <= end) — nothing
  // stops a period whose range intersects an existing one for the same org. A
  // retried or double-fired create-period (realistic: a Brain agent retrying a
  // timed-out-but-committed request) would otherwise mint a SECOND účetní období,
  // each with its own chart of accounts, over the same dates — an accounting-
  // integrity hazard with no dedup. Reject inside the caller's org-bound tx
  // (RLS-scoped; the explicit organization_id filter is belt-and-suspenders)
  // BEFORE any INSERT. Standard half-open-agnostic interval-overlap predicate:
  // existing.start <= req.end AND existing.end >= req.start. The internal period-
  // progression callers (closePeriod / rollForwardPeriod) go through the lower-
  // level createPeriod primitive, not this scaffold, so their non-overlapping
  // roll-forward is untouched.
  const overlap = await executeRows<{
    id: string
    period_start: string
    period_end: string
  }>(
    db,
    sql`SELECT id, period_start::text AS period_start, period_end::text AS period_end
          FROM accounting_period
         WHERE organization_id = ${ctx.organizationId}::uuid
           AND period_start <= ${params.periodEnd}::date
           AND period_end >= ${params.periodStart}::date
         ORDER BY period_start
         LIMIT 1`,
  )
  if (overlap[0]) {
    const c = overlap[0]
    throw new ScaffoldValidationError(
      `the requested účetní období ${params.periodStart}…${params.periodEnd} overlaps an existing period ${c.period_start}…${c.period_end} (id ${c.id}); open a non-overlapping period or reuse the existing one`,
      "PERIOD_OVERLAP",
    )
  }

  const periodId = await createPeriod(db, orgCtx, {
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    regimeCode: ctx.regime,
    accountingCurrency: params.accountingCurrency ?? "CZK",
    status: params.status,
    accountingSizeCode: params.accountingSizeCode ?? null,
    fxRatePolicy: params.fxRatePolicy ?? null,
  })

  let chartId: string | null = null
  let accountsSeeded = 0
  if (ctx.requiresChart) {
    chartId = await createChart(db, orgCtx, { periodId })
    // Seed from the Účetní osnova effective for the period's year (falls back to the latest
    // published prior year if that exact year has none yet).
    const requestedYear = Number(params.periodStart.slice(0, 4))
    const frameworkYear =
      (await resolveFrameworkYear(db, requestedYear)) ?? requestedYear
    accountsSeeded = await seedChartFromDirectives(db, orgCtx, {
      chartId,
      periodId,
      year: frameworkYear,
    })
  }

  const seriesCreated = await backfillDefaultNumberSeries(db, orgCtx)
  // Seed the default doklad types AFTER the séries — each type links to its série by
  // code, so the séries must exist first (same org-bound transaction).
  const typesSeeded = await backfillDefaultDocumentTypes(db, orgCtx)

  return { periodId, chartId, accountsSeeded, seriesCreated, typesSeeded }
}

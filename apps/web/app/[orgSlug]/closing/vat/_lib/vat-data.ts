import "server-only"

import { sql } from "drizzle-orm"
import { executeRows, withOrganization } from "@workspace/db"
import {
  buildDph,
  buildKontrolniHlaseni,
  buildSouhrnneHlaseni,
  computeObligations,
  type Dph,
  type KontrolniHlaseni,
  type ObligationKind,
  type PersonType,
  type SouhrnneHlaseni,
  type VatFilingPeriod,
  type VatRegimeCode,
} from "@workspace/accounting"

import {
  getOrgAccountingContext,
  type OrgAccountingContext,
} from "../../../_lib/accounting-data"
import { formatIsoDate } from "../../_lib/closing-shared"

/**
 * Server-side data for the Closing VAT pages (Overview / DAP / KH / SH) — the
 * filing-period-aware counterpart of `closing-data.ts`. Resolves the org's
 * active accounting period + the vat_status EFFECTIVE FOR that period (same
 * query approach as `getClosingObligations`), then derives the set of
 * statutory FILING periods (month or quarter, §99/§99a ZDPH) a VAT payer owes
 * a return/control-statement/EC-sales-list for, via the
 * `@workspace/accounting` obligation engine. Each filing period's real figures
 * come straight from `buildDph` / `buildKontrolniHlaseni` /
 * `buildSouhrnneHlaseni`, scoped to that sub-period — never fabricated.
 *
 * Only a PAYER has a declared filing cadence to select a period FROM (§6
 * ZDPH); a NON_PAYER reports "not-payer" (no VAT obligations at all) while an
 * IDENTIFIED_PERSON reports the distinct "identified-person" status — per
 * §101 odst. 5 + §102 ZDPH an identifikovaná osoba DOES file a VAT return /
 * EC sales list, just event-driven (when a liability or EU supply arises)
 * rather than on a standing monthly/quarterly cadence, so it has no filing
 * PERIOD to select from here. Those conditional obligations still show on the
 * Closing Overview via the obligation engine.
 */

export interface VatFilingPeriodOption {
  /** Statutory period label from the obligation engine, e.g. "June 2026" or "Q2 2026". */
  label: string
  /** ISO date — filing sub-period start (inclusive). */
  from: string
  /** ISO date — filing sub-period end (inclusive). */
  to: string
}

export type VatBaseStatus =
  | { status: "no-access" }
  | { status: "no-period" }
  | { status: "not-payer" }
  | { status: "identified-person" }
  | { status: "vat-unconfigured"; periodLabel: string }

export type VatFilingPeriodsResult =
  | VatBaseStatus
  | {
      status: "ok"
      periodId: string
      filingPeriods: VatFilingPeriodOption[]
      regime: VatRegimeCode
      filingPeriod: VatFilingPeriod
    }

export type VatReturnResult =
  | VatBaseStatus
  | {
      status: "ok"
      filingPeriods: VatFilingPeriodOption[]
      selected: VatFilingPeriodOption
      dph: Dph
    }

export type VatControlStatementResult =
  | VatBaseStatus
  | {
      status: "ok"
      filingPeriods: VatFilingPeriodOption[]
      selected: VatFilingPeriodOption
      kh: KontrolniHlaseni
    }

export type VatEcSalesListResult =
  | VatBaseStatus
  | {
      status: "ok"
      filingPeriods: VatFilingPeriodOption[]
      selected: VatFilingPeriodOption
      sh: SouhrnneHlaseni
    }

interface ResolvedVatContext {
  ctx: OrgAccountingContext
  periodId: string
  periodLabel: string
  filingPeriods: VatFilingPeriodOption[]
  regime: VatRegimeCode
  filingPeriod: VatFilingPeriod
}

type VatContextResolution =
  VatBaseStatus | ({ status: "ok" } & ResolvedVatContext)

/**
 * Resolve the org + active period + period-effective vat_status, then derive
 * the filing-period set for one obligation `kind` (VAT_RETURN for DAP,
 * CONTROL_STATEMENT for KH, EC_SALES_LIST for SH) via the obligation engine.
 * `computeObligations` THROWS when regime is PAYER with a null filing period,
 * so that combination is detected as "vat-unconfigured" BEFORE calling it —
 * mirrors `getClosingObligations`'s guard.
 */
async function resolveVatContext(
  orgSlug: string,
  kind: ObligationKind,
): Promise<VatContextResolution> {
  const ctx = await getOrgAccountingContext(orgSlug)
  if (!ctx) return { status: "no-access" }
  if (
    ctx.periodId == null ||
    ctx.periodStart == null ||
    ctx.periodEnd == null
  ) {
    return { status: "no-period" }
  }
  const periodStart = ctx.periodStart
  const periodEnd = ctx.periodEnd
  const periodLabel = `${formatIsoDate(periodStart)} – ${formatIsoDate(periodEnd)}`

  const { vatRegimeCode, filingPeriod, personType } = await withOrganization(
    ctx.organizationId,
    ctx.userId,
    async (db) => {
      const [vatStatus] = await executeRows<{
        vat_regime_code: string
        filing_period: string | null
      }>(
        db,
        // Regime effective FOR the active period (not merely current) — same
        // period-effective query `getClosingObligations` uses.
        sql`SELECT vat_regime_code, filing_period FROM vat_status
            WHERE organization_id = ${ctx.organizationId}::uuid
              AND valid_from <= ${periodEnd}
              AND (valid_to IS NULL OR valid_to >= ${periodStart})
            ORDER BY valid_from DESC LIMIT 1`,
      )
      const [org] = await executeRows<{ person_type: string }>(
        db,
        sql`SELECT person_type FROM organization WHERE id = ${ctx.organizationId}::uuid`,
      )
      return {
        vatRegimeCode: (vatStatus?.vat_regime_code ??
          null) as VatRegimeCode | null,
        filingPeriod: (vatStatus?.filing_period ??
          null) as VatFilingPeriod | null,
        personType: (org?.person_type ?? "LEGAL") as PersonType,
      }
    },
  )

  // VAT pages only apply to a PAYER (a declared monthly/quarterly filing
  // cadence, §99/§99a ZDPH) — NON_PAYER and IDENTIFIED_PERSON have no such
  // cadence to select a filing period from. IDENTIFIED_PERSON still owes
  // event-driven filings (§101/5 + §102 ZDPH), surfaced distinctly.
  if (vatRegimeCode === "IDENTIFIED_PERSON")
    return { status: "identified-person" }
  if (vatRegimeCode !== "PAYER") return { status: "not-payer" }
  if (filingPeriod == null) return { status: "vat-unconfigured", periodLabel }

  const obligations = computeObligations({
    periodStart,
    periodEnd,
    vatRegimeCode,
    vatFilingPeriod: filingPeriod,
    personType,
    hasEmployees: false,
  })

  const filingPeriods: VatFilingPeriodOption[] = obligations
    .filter((o) => o.kind === kind)
    .map((o) => ({
      label: o.periodLabel,
      from: o.periodStart,
      to: o.periodEnd,
    }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))

  return {
    status: "ok",
    ctx,
    periodId: ctx.periodId,
    periodLabel,
    filingPeriods,
    regime: vatRegimeCode,
    filingPeriod,
  }
}

/**
 * Pick the default filing period when none is explicitly selected: the
 * latest period whose end (`to`) is on or before `today`, else the
 * chronologically first period (a fully-future accounting period still shows
 * something). Pure — `filingPeriods` must be sorted ascending by `from`
 * (guaranteed by `resolveVatContext`).
 */
export function pickDefaultFilingPeriod(
  filingPeriods: VatFilingPeriodOption[],
  today: string,
): VatFilingPeriodOption | null {
  let latestPast: VatFilingPeriodOption | null = null
  for (const fp of filingPeriods) {
    if (fp.to <= today) latestPast = fp
  }
  return latestPast ?? filingPeriods[0] ?? null
}

/**
 * Validate a candidate `(from, to)` against the real filing-period set
 * (matched by `from`, and by `to` too when given) — a crafted or stale query
 * param that doesn't name a real period falls back to the default period
 * instead of querying an arbitrary date range.
 */
function selectFilingPeriod(
  filingPeriods: VatFilingPeriodOption[],
  from: string | undefined,
  to: string | undefined,
): VatFilingPeriodOption | null {
  if (from != null) {
    const match = filingPeriods.find(
      (fp) => fp.from === from && (to == null || fp.to === to),
    )
    if (match) return match
  }
  return pickDefaultFilingPeriod(
    filingPeriods,
    new Date().toISOString().slice(0, 10),
  )
}

/**
 * The org's VAT filing periods for the active accounting period (the DAP /
 * VAT_RETURN cadence). Landing-page summary use — DAP/KH/SH each derive their
 * OWN kind-specific set internally (KH/SH cadence can differ from DAP's, see
 * module doc).
 */
export async function getVatFilingPeriods(
  orgSlug: string,
): Promise<VatFilingPeriodsResult> {
  const resolved = await resolveVatContext(orgSlug, "VAT_RETURN")
  if (resolved.status !== "ok") return resolved
  return {
    status: "ok",
    periodId: resolved.periodId,
    filingPeriods: resolved.filingPeriods,
    regime: resolved.regime,
    filingPeriod: resolved.filingPeriod,
  }
}

/** The VAT return (přiznání k DPH) for a filing period — real computed figures from `buildDph`. */
export async function getVatReturn(
  orgSlug: string,
  from?: string,
  to?: string,
): Promise<VatReturnResult> {
  const resolved = await resolveVatContext(orgSlug, "VAT_RETURN")
  if (resolved.status !== "ok") return resolved
  const selected = selectFilingPeriod(resolved.filingPeriods, from, to)
  if (!selected)
    return { status: "vat-unconfigured", periodLabel: resolved.periodLabel }
  const dph = await withOrganization(
    resolved.ctx.organizationId,
    resolved.ctx.userId,
    (db) =>
      buildDph(db, resolved.periodId, {
        from: selected.from,
        to: selected.to,
      }),
  )
  return { status: "ok", filingPeriods: resolved.filingPeriods, selected, dph }
}

/** The control statement (kontrolní hlášení) for a filing period — real computed rows from `buildKontrolniHlaseni`. */
export async function getControlStatement(
  orgSlug: string,
  from?: string,
  to?: string,
): Promise<VatControlStatementResult> {
  const resolved = await resolveVatContext(orgSlug, "CONTROL_STATEMENT")
  if (resolved.status !== "ok") return resolved
  const selected = selectFilingPeriod(resolved.filingPeriods, from, to)
  if (!selected)
    return { status: "vat-unconfigured", periodLabel: resolved.periodLabel }
  const kh = await withOrganization(
    resolved.ctx.organizationId,
    resolved.ctx.userId,
    (db) =>
      buildKontrolniHlaseni(db, resolved.periodId, {
        from: selected.from,
        to: selected.to,
      }),
  )
  return { status: "ok", filingPeriods: resolved.filingPeriods, selected, kh }
}

/** The EC sales list (souhrnné hlášení) for a filing period — real computed rows from `buildSouhrnneHlaseni`. */
export async function getEcSalesList(
  orgSlug: string,
  from?: string,
  to?: string,
): Promise<VatEcSalesListResult> {
  const resolved = await resolveVatContext(orgSlug, "EC_SALES_LIST")
  if (resolved.status !== "ok") return resolved
  const selected = selectFilingPeriod(resolved.filingPeriods, from, to)
  if (!selected)
    return { status: "vat-unconfigured", periodLabel: resolved.periodLabel }
  const sh = await withOrganization(
    resolved.ctx.organizationId,
    resolved.ctx.userId,
    (db) =>
      buildSouhrnneHlaseni(db, resolved.periodId, {
        from: selected.from,
        to: selected.to,
      }),
  )
  return { status: "ok", filingPeriods: resolved.filingPeriods, selected, sh }
}

import "server-only"

import { withOrganization } from "@workspace/db"
import {
  buildDppo,
  buildDpfo,
  loadDppoAdjustments,
  type Dppo,
  type Dpfo,
  type PersonType,
  type Regime,
} from "@workspace/accounting"

import { isOrgAdmin } from "../../../_lib/org-authz"
import {
  resolvePeriodProfile,
  type PeriodProfileResult,
} from "../../_lib/period-profile"

/**
 * Server-side data for the Closing Income tax pages (Corporation tax / DPPO,
 * Personal income tax / DPFO). Unlike VAT these are ANNUAL — one computation
 * per accounting period, no filing-period picker.
 *
 * Resolves the shared period profile (`resolvePeriodProfile`) then gates each
 * tax on TWO axes: the statutory person type — DPPO (daň z příjmů
 * právnických osob, Act 586/1992 Sb.) applies only to a LEGAL organization,
 * DPFO (daň z příjmů fyzických osob) only to a NATURAL one — AND the period's
 * accounting regime, since each builder reads a regime-specific read-model
 * (`buildDppo` -> account_period_balance, DOUBLE_ENTRY only; `buildDpfo` ->
 * monetary_period_summary, TAX_RECORDS only). A mismatch on either axis (e.g.
 * a NATURAL org kept in DOUBLE_ENTRY, or a LEGAL org kept in SINGLE_ENTRY)
 * reports an honest "not-applicable" state instead of silently reading an
 * empty read-model and presenting an all-zero result as the real tax.
 */

type IncomeTaxBase = Exclude<PeriodProfileResult, { status: "ok" }>

export type CorporateIncomeTaxResult =
  | IncomeTaxBase
  | { status: "not-applicable"; reason: string }
  | {
      status: "ok"
      /** Slug for the edit action (`saveDppoAdjustmentsAction`). */
      slug: string
      /** Whether the current member may edit the adjustments (owner/admin). */
      canEdit: boolean
      /** The rendered period's id — passed back to the save action so it can reject a stale-period write. */
      periodId: string
      periodLabel: string
      dppo: Dppo
    }

export type PersonalIncomeTaxResult =
  | IncomeTaxBase
  | { status: "not-applicable"; reason: string }
  | { status: "ok"; periodLabel: string; dpfo: Dpfo }

export type IncomeTaxLandingResult =
  IncomeTaxBase | { status: "ok"; personType: PersonType }

const DPPO_NOT_APPLICABLE_REASON =
  "This company is a natural person; corporate income tax (DPPO) does not apply — see Personal income tax."
const DPFO_NOT_APPLICABLE_REASON =
  "This company is a legal entity; personal income tax (DPFO) does not apply — see Corporation tax."

function dppoRegimeNotApplicableReason(regime: Regime): string {
  return `Corporate income tax here is computed from double-entry books; this period uses ${regime}, which isn't supported yet.`
}

function dpfoRegimeNotApplicableReason(regime: Regime): string {
  return `Personal income tax here is computed from tax records (daňová evidence); this period uses ${regime}, which isn't supported yet.`
}

/** Corporation tax (DPPO) — the active period's real figures from `buildDppo`. LEGAL + DOUBLE_ENTRY only. */
export async function getCorporateIncomeTax(
  orgSlug: string,
): Promise<CorporateIncomeTaxResult> {
  const profile = await resolvePeriodProfile(orgSlug)
  if (profile.status !== "ok") return profile
  if (profile.personType !== "LEGAL") {
    return { status: "not-applicable", reason: DPPO_NOT_APPLICABLE_REASON }
  }
  if (profile.regime !== "DOUBLE_ENTRY") {
    return {
      status: "not-applicable",
      reason: dppoRegimeNotApplicableReason(profile.regime),
    }
  }
  // Supply the persisted, provenanced adjustments so buildDppo can actually
  // compute (without them the worksheet can only ever report NEEDS_INPUT).
  const dppo = await withOrganization(
    profile.ctx.organizationId,
    profile.ctx.userId,
    async (db) => {
      const input = await loadDppoAdjustments(db, profile.periodId)
      return buildDppo(db, profile.periodId, input)
    },
  )
  // Edit affordance — same owner/admin gate the save action enforces, read from
  // the membership already resolved by resolvePeriodProfile (no extra query, no
  // cross-feature seam into settings). The join in getOrgAccountingContext
  // already filters to an active membership, so only the role predicate remains.
  const canEdit = isOrgAdmin(profile.ctx.role)
  return {
    status: "ok",
    slug: orgSlug,
    canEdit,
    periodId: profile.periodId,
    periodLabel: profile.periodLabel,
    dppo,
  }
}

/** Personal income tax (DPFO) — the active period's real figures from `buildDpfo`. NATURAL + TAX_RECORDS only. */
export async function getPersonalIncomeTax(
  orgSlug: string,
): Promise<PersonalIncomeTaxResult> {
  const profile = await resolvePeriodProfile(orgSlug)
  if (profile.status !== "ok") return profile
  if (profile.personType !== "NATURAL") {
    return { status: "not-applicable", reason: DPFO_NOT_APPLICABLE_REASON }
  }
  if (profile.regime !== "TAX_RECORDS") {
    return {
      status: "not-applicable",
      reason: dpfoRegimeNotApplicableReason(profile.regime),
    }
  }
  const dpfo = await withOrganization(
    profile.ctx.organizationId,
    profile.ctx.userId,
    (db) => buildDpfo(db, profile.periodId),
  )
  return { status: "ok", periodLabel: profile.periodLabel, dpfo }
}

/** Income tax landing summary — just the person type, to pick which of DPPO/DPFO to link to. */
export async function getIncomeTaxLanding(
  orgSlug: string,
): Promise<IncomeTaxLandingResult> {
  const profile = await resolvePeriodProfile(orgSlug)
  if (profile.status !== "ok") return profile
  return { status: "ok", personType: profile.personType }
}

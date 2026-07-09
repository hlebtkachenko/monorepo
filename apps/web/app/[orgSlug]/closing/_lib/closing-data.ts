import "server-only"

import { computeObligations } from "@workspace/accounting"
import { czechToday } from "@/lib/czech-today"

import { resolvePeriodProfile } from "./period-profile"
import {
  deriveObligationStatus,
  type ClosingObligationsResult,
} from "./closing-shared"

export {
  deriveObligationStatus,
  formatIsoDate,
  type ClosingObligationStatus,
  type ObligationWithStatus,
  type ClosingObligationsResult,
} from "./closing-shared"

/**
 * Server-side data for the Closing Overview + Calendar pages — resolves the
 * org's active accounting period and current VAT/person profile, then runs
 * them through `computeObligations` (the pure `@workspace/accounting`
 * obligation engine). Real, computed rows only: an org that owes nothing
 * (e.g. NON_PAYER, no employees) legitimately gets an empty obligations
 * array — that is the correct answer, not a gap.
 *
 * `computeObligations` THROWS when `vatRegimeCode === "PAYER"` and
 * `vatFilingPeriod` is null (a payer must declare a filing cadence) — the
 * "vat-unconfigured" result branch below detects that combination BEFORE
 * calling the engine.
 */

/**
 * Resolve the org + active period + the vat_status/person_type profile
 * EFFECTIVE FOR that period via `resolvePeriodProfile` (shared with
 * `resolveVatContext` in vat-data.ts), then compute the period's statutory
 * obligations.
 */
export async function getClosingObligations(
  orgSlug: string,
): Promise<ClosingObligationsResult> {
  const profile = await resolvePeriodProfile(orgSlug)
  if (profile.status !== "ok") return profile

  const {
    periodStart,
    periodEnd,
    periodLabel,
    vatRegimeCode,
    filingPeriod,
    personType,
    hasEmployees,
  } = profile

  if (vatRegimeCode === "PAYER" && filingPeriod == null) {
    return { status: "vat-unconfigured", periodLabel }
  }

  const obligations = computeObligations({
    periodStart,
    periodEnd,
    vatRegimeCode,
    vatFilingPeriod: filingPeriod,
    personType,
    hasEmployees,
  })

  const today = czechToday()

  return {
    status: "ok",
    periodLabel,
    periodStart,
    periodEnd,
    obligations: obligations.map((o) => ({
      ...o,
      status: deriveObligationStatus(o.dueDate, today),
    })),
  }
}

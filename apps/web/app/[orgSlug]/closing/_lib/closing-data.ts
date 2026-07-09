import "server-only"

import { computeTimelineObligations } from "@workspace/accounting"
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
 * org's active accounting period and effective VAT/payroll timelines, then
 * runs them through the pure `@workspace/accounting` obligation engine. Real,
 * computed rows only: an org that owes nothing legitimately gets an empty
 * array, while unknown intervals remain explicit configuration issues.
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
    personType,
    vatTimeline,
    payrollTimeline,
  } = profile
  const result = computeTimelineObligations({
    from: periodStart,
    to: periodEnd,
    personType,
    vatTimeline,
    payrollTimeline,
  })

  const today = czechToday()

  return {
    status: "ok",
    periodLabel,
    periodStart,
    periodEnd,
    issues: result.issues,
    obligations: result.obligations.map((o) => ({
      ...o,
      status: deriveObligationStatus(o, today),
    })),
  }
}

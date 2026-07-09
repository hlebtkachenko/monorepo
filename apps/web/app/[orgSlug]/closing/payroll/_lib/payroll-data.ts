import "server-only"

import { computePayrollObligations } from "@workspace/accounting"
import { czechToday } from "@/lib/czech-today"

import { resolvePeriodProfile } from "../../_lib/period-profile"
import {
  deriveObligationStatus,
  type ObligationWithStatus,
} from "../../_lib/closing-shared"

/**
 * Payroll obligations for the active accounting period. Unlike the Closing
 * Overview loader this does NOT gate on VAT configuration — payroll
 * remittances are independent of a VAT payer's filing period, so a
 * VAT-unconfigured org still sees its real payroll obligations here.
 */
export type PayrollObligationsResult =
  | { status: "no-access" }
  | { status: "no-period" }
  | { status: "ok"; periodLabel: string; obligations: ObligationWithStatus[] }

export async function getPayrollObligations(
  orgSlug: string,
): Promise<PayrollObligationsResult> {
  const profile = await resolvePeriodProfile(orgSlug)
  if (profile.status !== "ok") return profile

  const today = czechToday()
  const obligations: ObligationWithStatus[] = computePayrollObligations({
    periodStart: profile.periodStart,
    periodEnd: profile.periodEnd,
    hasEmployees: profile.hasEmployees,
  }).map((o) => ({ ...o, status: deriveObligationStatus(o.dueDate, today) }))

  return { status: "ok", periodLabel: profile.periodLabel, obligations }
}

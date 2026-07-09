import "server-only"

import {
  computeTimelineObligations,
  type ProfileIssue,
} from "@workspace/accounting"
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
  | {
      status: "ok"
      periodLabel: string
      obligations: ObligationWithStatus[]
      issues: ProfileIssue[]
    }

export async function getPayrollObligations(
  orgSlug: string,
): Promise<PayrollObligationsResult> {
  const profile = await resolvePeriodProfile(orgSlug)
  if (profile.status !== "ok") return profile

  const today = czechToday()
  const result = computeTimelineObligations({
    from: profile.periodStart,
    to: profile.periodEnd,
    personType: profile.personType,
    vatTimeline: [],
    payrollTimeline: profile.payrollTimeline,
  })
  const obligations: ObligationWithStatus[] = result.obligations.map((o) => ({
    ...o,
    status: deriveObligationStatus(o, today),
  }))

  return {
    status: "ok",
    periodLabel: profile.periodLabel,
    obligations,
    issues: result.issues.filter((issue) => issue.code.startsWith("PAYROLL_")),
  }
}

import type { PersonType, VatFilingPeriod, VatRegime } from "../types"
import type { EffectiveSegment } from "./effective-timeline"
import type { Obligation } from "./model"
import { computeObligations, computePayrollObligations } from "./obligations"

export interface VatProfileValue {
  regime: VatRegime
  filingPeriod: VatFilingPeriod | null
}

export interface PayrollProfileValue {
  hasEmployees: boolean
}

export type ProfileIssueCode =
  | "VAT_PROFILE_MISSING"
  | "VAT_FILING_PERIOD_MISSING"
  | "PAYROLL_PROFILE_MISSING"

export interface ProfileIssue {
  code: ProfileIssueCode
  from: string
  to: string
  message: string
}

export interface TimelineObligationResult {
  obligations: Obligation[]
  issues: ProfileIssue[]
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0")
}

/** Full calendar-quarter envelope needed to evaluate boundary candidates. */
export function statutoryVatEnvelope(
  from: string,
  to: string,
): { from: string; to: string } {
  const [fromYear, fromMonth] = from.split("-").map(Number) as [number, number]
  const [toYear, toMonth] = to.split("-").map(Number) as [number, number]
  const firstMonth = Math.floor((fromMonth - 1) / 3) * 3 + 1
  const lastMonth = Math.floor((toMonth - 1) / 3) * 3 + 3
  const lastDay = new Date(Date.UTC(toYear, lastMonth, 0)).getUTCDate()
  return {
    from: `${fromYear}-${pad2(firstMonth)}-01`,
    to: `${toYear}-${pad2(lastMonth)}-${pad2(lastDay)}`,
  }
}

function obligationKey(obligation: Obligation): string {
  return [obligation.kind, obligation.periodStart, obligation.periodEnd].join(
    ":",
  )
}

/**
 * Evaluate canonical profile timelines without reducing a year to one row.
 * Unknown intervals are returned as explicit issues; known facts produce only
 * obligations whose schedule intersects their own effective interval.
 */
export function computeTimelineObligations(input: {
  from: string
  to: string
  personType: PersonType
  vatTimeline: ReadonlyArray<EffectiveSegment<VatProfileValue>>
  payrollTimeline: ReadonlyArray<EffectiveSegment<PayrollProfileValue>>
}): TimelineObligationResult {
  const obligations = new Map<string, Obligation>()
  const issues: ProfileIssue[] = []

  const add = (rows: Obligation[]) => {
    for (const row of rows) {
      const key = obligationKey(row)
      const current = obligations.get(key)
      if (
        !current ||
        (current.applicability.status === "CONDITION_NOT_EVALUATED" &&
          row.applicability.status === "APPLICABLE")
      ) {
        obligations.set(key, row)
      }
    }
  }

  for (const segment of input.vatTimeline) {
    if (segment.status === "UNKNOWN") {
      issues.push({
        code: "VAT_PROFILE_MISSING",
        from: segment.from,
        to: segment.to,
        message: "VAT status is not configured for this interval.",
      })
      continue
    }

    const profile = segment.fact.value
    if (profile.regime === "PAYER" && profile.filingPeriod === null) {
      issues.push({
        code: "VAT_FILING_PERIOD_MISSING",
        from: segment.from,
        to: segment.to,
        message:
          "VAT payer filing cadence is not configured for this interval.",
      })
      continue
    }

    add(
      computeObligations({
        periodStart: segment.from,
        periodEnd: segment.to,
        vatRegimeCode: profile.regime,
        vatFilingPeriod: profile.filingPeriod,
        personType: input.personType,
        hasEmployees: false,
      }),
    )
  }

  for (const segment of input.payrollTimeline) {
    if (segment.status === "UNKNOWN") {
      issues.push({
        code: "PAYROLL_PROFILE_MISSING",
        from: segment.from,
        to: segment.to,
        message: "Payroll participation is not configured for this interval.",
      })
      continue
    }

    add(
      computePayrollObligations({
        periodStart: segment.from,
        periodEnd: segment.to,
        hasEmployees: segment.fact.value.hasEmployees,
      }),
    )
  }

  return {
    obligations: [...obligations.values()]
      .filter(
        (row) => row.periodStart <= input.to && row.periodEnd >= input.from,
      )
      .sort((a, b) => {
        if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
        if (a.category !== b.category) return a.category < b.category ? -1 : 1
        return a.kind.localeCompare(b.kind)
      }),
    issues,
  }
}

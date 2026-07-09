/**
 * Obligation engine — computes the monthly/quarterly statutory filing
 * obligations (VAT return, kontrolní hlášení, souhrnné hlášení, payroll
 * remittances) an accounting period generates, with business-day-shifted
 * due dates. This is the reusable core the org Closing UI (Overview /
 * Calendar) and the workspace Legislation surface both consume.
 *
 * SCOPE: monthly/quarterly obligations only — these are the ones cleanly
 * verified against the KB (`60-deadlines-penalties/filing-deadlines.md`).
 * Annual income-tax / year-end obligations (DPFO/DPPO daňové přiznání,
 * účetní závěrka approval + publication, OSVČ přehledy, …) are deliberately
 * OUT of scope for this unit — the KB flags open ambiguities there (e.g. the
 * DPFO 4-month e-filing extension eligibility rule) that need a dedicated
 * pass. `personType` is threaded through `ObligationInput` for that
 * follow-up (DPFO vs DPPO routing) AND is already load-bearing here: a
 * natural person on quarterly VAT filing files kontrolní hlášení (KH)
 * quarterly rather than monthly (§101e ZDPH) — see `computeObligations`.
 *
 * VAT filing periods (month or quarter) are ALWAYS calendar-aligned per
 * §99/§99a ZDPH, regardless of the účetní jednotka's fiscal year — a
 * quarterly payer's "Q2" is always April-June, never a fiscal-year-relative
 * quarter. This module iterates the actual calendar months inside
 * [periodStart, periodEnd] and groups them into true calendar quarters. For
 * the common case (a calendar-year accounting period) that is 12 months /
 * 4 clean quarters.
 *
 * No fabricated obligations: NON_PAYER with no employees returns [] — that
 * is the correct answer, not a placeholder gap.
 */

import type { PersonType, VatFilingPeriod, VatRegime } from "../types"
import { payrollMonthlyDeadline, vatMonthlyDeadline } from "./deadlines"
import type {
  ApplicabilityDecision,
  Obligation,
  ObligationKind,
} from "./model"

export type {
  ApplicabilityDecision,
  Obligation,
  ObligationCategory,
  ObligationKind,
  ScheduleCandidate,
} from "./model"

// VatRegime, VatFilingPeriod, and PersonType are reused from ./types
// (identical unions, each backed by a DB pgEnum/reference table) via
// type-only imports — erased at compile, so the pure engine keeps no runtime
// DB dependency. Local copies would be exported-but-unused (knip), since the
// package index already re-exports the ./types ones.

export interface ObligationInput {
  /** ISO date — the annual accounting_period start. */
  periodStart: string
  /** ISO date — the annual accounting_period end. */
  periodEnd: string
  vatRegimeCode: VatRegime | null
  /** null unless vatRegimeCode === "PAYER". */
  vatFilingPeriod: VatFilingPeriod | null
  personType: PersonType
  /** Caller-supplied; treated as false if undeclared. */
  hasEmployees: boolean
}

const APPLICABLE = (reason: string): ApplicabilityDecision => ({
  status: "APPLICABLE",
  reason,
})

const CONDITION_NOT_EVALUATED = (reason: string): ApplicabilityDecision => ({
  status: "CONDITION_NOT_EVALUATED",
  reason,
})

const TITLES: Record<ObligationKind, string> = {
  VAT_RETURN: "VAT return",
  CONTROL_STATEMENT: "Control statement (KH)",
  EC_SALES_LIST: "EC sales list (SH)",
  SOCIAL_INSURANCE: "Social insurance",
  HEALTH_INSURANCE: "Health insurance",
  WITHHOLDING_TAX: "Withholding tax",
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

function pad2(n: number): string {
  return n.toString().padStart(2, "0")
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** Last day-of-month as an ISO date, via UTC day-0-of-next-month rollback. */
function lastDayOfMonthIso(year: number, month: number): string {
  const dt = new Date(Date.UTC(year, month, 0))
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

/** The calendar months (year, month) covered by [periodStart, periodEnd], inclusive. */
function monthsInRange(
  periodStart: string,
  periodEnd: string,
): { year: number; month: number }[] {
  const [startYear, startMonth] = periodStart.split("-").map(Number)
  const [endYear, endMonth] = periodEnd.split("-").map(Number)
  const months: { year: number; month: number }[] = []
  let year = startYear as number
  let month = startMonth as number
  while (
    year < (endYear as number) ||
    (year === endYear && month <= (endMonth as number))
  ) {
    months.push({ year, month })
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

function calendarQuarter(month: number): number {
  return Math.ceil(month / 3)
}

/** The true calendar quarters (year, quarter) touched by `months`, in order, deduped. */
function quartersInRange(
  months: { year: number; month: number }[],
): { year: number; quarter: number }[] {
  const seen = new Set<string>()
  const quarters: { year: number; quarter: number }[] = []
  for (const { year, month } of months) {
    const quarter = calendarQuarter(month)
    const key = `${year}-${quarter}`
    if (!seen.has(key)) {
      seen.add(key)
      quarters.push({ year, quarter })
    }
  }
  return quarters
}

function quarterBounds(
  year: number,
  quarter: number,
): { periodStart: string; periodEnd: string } {
  const firstMonth = (quarter - 1) * 3 + 1
  const lastMonth = firstMonth + 2
  return {
    periodStart: toIso(year, firstMonth, 1),
    periodEnd: lastDayOfMonthIso(year, lastMonth),
  }
}

/**
 * Emit one quarterly obligation (VAT_RETURN or CONTROL_STATEMENT) per true
 * calendar quarter touched by `months`. Statutory VAT periods are complete
 * calendar quarters even when the accounting period starts or ends partway
 * through one. The deadline is derived from the calendar-quarter end too.
 */
function quarterlyObligations(
  kind: "VAT_RETURN" | "CONTROL_STATEMENT",
  months: { year: number; month: number }[],
): Obligation[] {
  return quartersInRange(months).map(({ year, quarter }) => {
    const bounds = quarterBounds(year, quarter)
    const lastMonthOfQuarter = (quarter - 1) * 3 + 3
    return {
      kind,
      category: "VAT",
      title: TITLES[kind],
      periodLabel: `Q${quarter} ${year}`,
      periodStart: bounds.periodStart,
      periodEnd: bounds.periodEnd,
      dueDate: vatMonthlyDeadline(year, lastMonthOfQuarter),
      applicability: APPLICABLE("VAT payer filing cadence applies."),
    }
  })
}

/**
 * Payroll obligations (social + health insurance, withholding/advance payroll
 * tax) for the period — monthly, business-day-shifted, independent of VAT
 * configuration. Extracted so the Payroll surface can compute payroll without
 * the VAT-payer filing-period gate that `computeObligations` enforces.
 */
export function computePayrollObligations(input: {
  periodStart: string
  periodEnd: string
  hasEmployees: boolean
}): Obligation[] {
  if (!input.hasEmployees) return []
  const obligations: Obligation[] = []
  for (const { year, month } of monthsInRange(
    input.periodStart,
    input.periodEnd,
  )) {
    const shared = {
      category: "PAYROLL" as const,
      periodLabel: monthLabel(year, month),
      periodStart: toIso(year, month, 1),
      periodEnd: lastDayOfMonthIso(year, month),
      dueDate: payrollMonthlyDeadline(year, month),
      applicability: APPLICABLE("Employee profile indicates payroll activity."),
    }
    obligations.push({
      kind: "SOCIAL_INSURANCE",
      title: TITLES.SOCIAL_INSURANCE,
      ...shared,
    })
    obligations.push({
      kind: "HEALTH_INSURANCE",
      title: TITLES.HEALTH_INSURANCE,
      ...shared,
    })
    obligations.push({
      kind: "WITHHOLDING_TAX",
      title: TITLES.WITHHOLDING_TAX,
      ...shared,
    })
  }
  return obligations
}

/**
 * Compute the monthly/quarterly statutory obligations for an accounting
 * period. Deterministic — no fabricated obligations; a regime/filing
 * combination that owes nothing returns no rows for it.
 */
export function computeObligations(input: ObligationInput): Obligation[] {
  if (input.vatRegimeCode === "PAYER" && input.vatFilingPeriod == null) {
    throw new Error(
      "A VAT payer must have a filing period (MONTHLY or QUARTERLY); got null.",
    )
  }

  const months = monthsInRange(input.periodStart, input.periodEnd)
  const isVatPayer = input.vatRegimeCode === "PAYER"
  const isIdentifiedPerson = input.vatRegimeCode === "IDENTIFIED_PERSON"

  const obligations: Obligation[] = []

  // VAT_RETURN — monthly or quarterly payer.
  if (isVatPayer && input.vatFilingPeriod === "MONTHLY") {
    for (const { year, month } of months) {
      obligations.push({
        kind: "VAT_RETURN",
        category: "VAT",
        title: TITLES.VAT_RETURN,
        periodLabel: monthLabel(year, month),
        periodStart: toIso(year, month, 1),
        periodEnd: lastDayOfMonthIso(year, month),
        dueDate: vatMonthlyDeadline(year, month),
        applicability: APPLICABLE("Monthly VAT payer filing cadence applies."),
      })
    }
  } else if (isVatPayer && input.vatFilingPeriod === "QUARTERLY") {
    obligations.push(...quarterlyObligations("VAT_RETURN", months))
  } else if (isVatPayer) {
    // Defensive: the top-of-function guard only rules out null, so a future
    // third VatFilingPeriod enum value would otherwise silently fall through
    // and emit no VAT_RETURN for a payer instead of failing loudly.
    throw new Error(
      `Unhandled VAT filing period for a PAYER: ${String(input.vatFilingPeriod)}`,
    )
  }

  // VAT_RETURN — identified persons file conditionally (§101 odst. 5 ZDPH):
  // only in a month a VAT liability actually arose (e.g. a service received
  // from abroad or an intra-EU acquisition), unlike a payer's automatic
  // monthly/quarterly obligation above.
  if (isIdentifiedPerson) {
    for (const { year, month } of months) {
      obligations.push({
        kind: "VAT_RETURN",
        category: "VAT",
        title: TITLES.VAT_RETURN,
        periodLabel: monthLabel(year, month),
        periodStart: toIso(year, month, 1),
        periodEnd: lastDayOfMonthIso(year, month),
        dueDate: vatMonthlyDeadline(year, month),
        applicability: CONDITION_NOT_EVALUATED(
          "Requires a VAT-liability event in the month, such as a service received from abroad or an intra-EU acquisition.",
        ),
      })
    }
  }

  // CONTROL_STATEMENT (KH) — §101e ZDPH: a legal person, or a natural person
  // on MONTHLY VAT filing, files KH monthly. A natural person on QUARTERLY
  // VAT filing files KH quarterly instead, alongside the quarterly
  // VAT_RETURN. Identified persons file no KH at all.
  const khQuarterly =
    input.personType === "NATURAL" && input.vatFilingPeriod === "QUARTERLY"
  if (isVatPayer && khQuarterly) {
    obligations.push(...quarterlyObligations("CONTROL_STATEMENT", months))
  } else if (isVatPayer) {
    for (const { year, month } of months) {
      obligations.push({
        kind: "CONTROL_STATEMENT",
        category: "VAT",
        title: TITLES.CONTROL_STATEMENT,
        periodLabel: monthLabel(year, month),
        periodStart: toIso(year, month, 1),
        periodEnd: lastDayOfMonthIso(year, month),
        dueDate: vatMonthlyDeadline(year, month),
        applicability: APPLICABLE(
          "VAT payer person type and filing cadence require this schedule.",
        ),
      })
    }
  }

  // EC_SALES_LIST (SH) — payer or identified person, conditional on EU
  // supplies actually occurring that month, always monthly.
  if (isVatPayer || isIdentifiedPerson) {
    for (const { year, month } of months) {
      obligations.push({
        kind: "EC_SALES_LIST",
        category: "VAT",
        title: TITLES.EC_SALES_LIST,
        periodLabel: monthLabel(year, month),
        periodStart: toIso(year, month, 1),
        periodEnd: lastDayOfMonthIso(year, month),
        dueDate: vatMonthlyDeadline(year, month),
        applicability: CONDITION_NOT_EVALUATED(
          "Requires a qualifying EU goods supply or cross-border B2B service.",
        ),
      })
    }
  }

  // Payroll — social/health insurance + withholding tax remittances, monthly.
  obligations.push(
    ...computePayrollObligations({
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      hasEmployees: input.hasEmployees,
    }),
  )

  return obligations.sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
    if (a.category !== b.category) return a.category < b.category ? -1 : 1
    return 0
  })
}

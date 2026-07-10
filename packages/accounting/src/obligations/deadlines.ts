/**
 * Statutory filing deadlines for the monthly/quarterly obligations (§101,
 * §101e, §102 ZDPH; §17 Act 589/1992 Sb.; §5 Act 592/1992 Sb.; §38h ZDP).
 * Verified against the KB's `60-deadlines-penalties/filing-deadlines.md`
 * (status: verified, confidence: high).
 *
 * Both statutory deadlines are "the Nth of the month AFTER the reference
 * month", shifted per `shiftToBusinessDay`. `month` below is always the
 * reference (obligation) month, 1-12.
 */

import { shiftToBusinessDay } from "./holidays"

function pad2(n: number): string {
  return n.toString().padStart(2, "0")
}

/**
 * ISO date for `day` of the calendar month AFTER (year, month) — handles the
 * December → January rollover into the next year.
 */
export function nthOfNextMonth(
  year: number,
  month: number,
  day: number,
): string {
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  return `${nextYear}-${pad2(nextMonth)}-${pad2(day)}`
}

/**
 * VAT return / kontrolní hlášení (KH) / souhrnné hlášení (SH) deadline for
 * obligation month `month` of `year` — the 25th of the following month
 * (§101/§101e/§102 ZDPH), business-day-shifted.
 */
export function vatMonthlyDeadline(year: number, month: number): string {
  return shiftToBusinessDay(nthOfNextMonth(year, month, 25))
}

/**
 * Payroll remittance deadline (sociální/zdravotní pojištění, záloha na daň
 * ze závislé činnosti) for obligation month `month` of `year` — the 20th of
 * the following month (§17 Act 589/1992 Sb., §5 Act 592/1992 Sb., §38h ZDP),
 * business-day-shifted.
 */
export function payrollMonthlyDeadline(year: number, month: number): string {
  return shiftToBusinessDay(nthOfNextMonth(year, month, 20))
}

/** Special-rate withholding is remitted by the end of the following month. */
export function specialRateWithholdingDeadline(
  year: number,
  month: number,
): string {
  const followingMonth = month === 12 ? 1 : month + 1
  const followingYear = month === 12 ? year + 1 : year
  const lastDay = new Date(
    Date.UTC(followingYear, followingMonth, 0),
  ).getUTCDate()
  return shiftToBusinessDay(
    `${followingYear}-${pad2(followingMonth)}-${pad2(lastDay)}`,
  )
}

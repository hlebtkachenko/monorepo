/**
 * Czech statutory obligation + deadline engine — monthly/quarterly VAT
 * (return, KH, SH) and payroll filing obligations. Pure, deterministic, no
 * DB access. See obligations.ts for the full scope note (annual income-tax
 * / year-end deadlines are deliberately out of this unit).
 */
export { czechHolidays, shiftToBusinessDay } from "./holidays"
export {
  nthOfNextMonth,
  vatMonthlyDeadline,
  payrollMonthlyDeadline,
} from "./deadlines"
export {
  computeObligations,
  computePayrollObligations,
  type ObligationCategory,
  type ObligationKind,
  type ObligationInput,
  type Obligation,
} from "./obligations"

/**
 * Czech statutory obligation + deadline engine — monthly/quarterly VAT
 * (return, KH, SH) and payroll filing obligations. Pure, deterministic, no
 * DB access. See obligations.ts for the full scope note (annual income-tax
 * / year-end deadlines are deliberately out of this unit).
 */
export { czechHolidays, shiftToBusinessDay } from "./holidays"
export {
  resolveEffectiveTimeline,
  singleEffectiveValue,
  type EffectiveFact,
  type EffectiveSegment,
} from "./effective-timeline"
export {
  deriveObligationPresentationStatus,
  type ApplicabilityDecision,
  type FilingRecord,
  type ObligationPresentationStatus,
  type ScheduleCandidate,
} from "./model"
export {
  computeTimelineObligations,
  statutoryVatEnvelope,
  type PayrollProfileValue,
  type ProfileIssue,
  type ProfileIssueCode,
  type TimelineObligationResult,
  type VatProfileValue,
} from "./timeline-obligations"
export {
  nthOfNextMonth,
  vatMonthlyDeadline,
  payrollMonthlyDeadline,
  specialRateWithholdingDeadline,
} from "./deadlines"
export {
  PAYROLL_THRESHOLD_RULES,
  PAYROLL_DEADLINE_RULES,
  payrollDeadlineForMonth,
  payrollDeadlineRuleForMonth,
  payrollThresholdRuleForMonth,
  evaluateAgreementInsuranceParticipation,
  type LegalSourceMetadata,
  type PayrollThresholdRule,
  type PayrollDeadlineRule,
  type PayrollObligationKind,
  type AgreementKind,
  type AgreementInsuranceParticipation,
} from "./payroll-legal-rules"
export {
  computeObligations,
  computePayrollObligations,
  type ObligationCategory,
  type ObligationKind,
  type ObligationInput,
  type Obligation,
  type VatPeriodActivity,
} from "./obligations"

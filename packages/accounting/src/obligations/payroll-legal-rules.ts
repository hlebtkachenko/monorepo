export interface LegalSourceMetadata {
  authority: string
  url: string
  section: string
  verifiedOn: string
}

export interface PayrollThresholdRule {
  id: string
  validFrom: string
  validTo: string | null
  dppInsuranceThresholdCzk: string
  dpcInsuranceThresholdCzk: string
  source: LegalSourceMetadata
}

export type PayrollObligationKind = Extract<
  ObligationKind,
  | "SOCIAL_INSURANCE"
  | "HEALTH_INSURANCE"
  | "PAYROLL_TAX_ADVANCE"
  | "SPECIAL_RATE_WITHHOLDING_TAX"
>

export interface PayrollDeadlineRule {
  id: string
  obligationKind: PayrollObligationKind
  validFrom: string
  validTo: string | null
  deadlineBasis: "TWENTIETH_OF_NEXT_MONTH" | "END_OF_NEXT_MONTH"
  source: LegalSourceMetadata
}

const VZP_AGREEMENT_THRESHOLDS_2026: LegalSourceMetadata = {
  authority: "General Health Insurance Company of the Czech Republic",
  url: "https://www.vzp.cz/o-nas/tiskove-centrum/otazky-tydne/zmeny-u-odvodu-na-zdravotnim-pojisteni-pro-dpp-a-dpc-2026",
  section: "DPP and DPČ insurance thresholds for 2025 and 2026",
  verifiedOn: "2026-07-09",
}

const CSSZ_PAYMENT_DEADLINE: LegalSourceMetadata = {
  authority: "Czech Social Security Administration",
  url: "https://eportal.cssz.cz/web/portal/-/tiskopisy/pvpoj-2016",
  section: "Premium payment and statement deadline",
  verifiedOn: "2026-07-09",
}

const VZP_PAYMENT_DEADLINE: LegalSourceMetadata = {
  authority: "General Health Insurance Company of the Czech Republic",
  url: "https://www.vzp.cz/platci/informace/zamestnavatel/splatnost-a-dalsi-zasady-pro-platbu-pojistneho/splatnost-pojistneho",
  section: "Employee premium due date",
  verifiedOn: "2026-07-09",
}

const FINANCIAL_ADMINISTRATION_CALENDAR: LegalSourceMetadata = {
  authority: "Financial Administration of the Czech Republic",
  url: "https://financnisprava.gov.cz/cs/danovy-kalendar",
  section: "2026 employee tax remittance calendar",
  verifiedOn: "2026-07-09",
}

export const PAYROLL_DEADLINE_RULES: readonly PayrollDeadlineRule[] = [
  {
    id: "CZ-SOCIAL-DEADLINE-1993",
    obligationKind: "SOCIAL_INSURANCE",
    validFrom: "1993-01-01",
    validTo: null,
    deadlineBasis: "TWENTIETH_OF_NEXT_MONTH",
    source: CSSZ_PAYMENT_DEADLINE,
  },
  {
    id: "CZ-HEALTH-DEADLINE-1993",
    obligationKind: "HEALTH_INSURANCE",
    validFrom: "1993-01-01",
    validTo: null,
    deadlineBasis: "TWENTIETH_OF_NEXT_MONTH",
    source: VZP_PAYMENT_DEADLINE,
  },
  {
    id: "CZ-PAYROLL-ADVANCE-DEADLINE-1993",
    obligationKind: "PAYROLL_TAX_ADVANCE",
    validFrom: "1993-01-01",
    validTo: null,
    deadlineBasis: "TWENTIETH_OF_NEXT_MONTH",
    source: FINANCIAL_ADMINISTRATION_CALENDAR,
  },
  {
    id: "CZ-SPECIAL-WITHHOLDING-DEADLINE-1993",
    obligationKind: "SPECIAL_RATE_WITHHOLDING_TAX",
    validFrom: "1993-01-01",
    validTo: null,
    deadlineBasis: "END_OF_NEXT_MONTH",
    source: FINANCIAL_ADMINISTRATION_CALENDAR,
  },
] as const

/**
 * Thresholds are reference metadata only. Payroll obligation applicability is
 * driven by the explicit monthly participation facts produced by payroll, not
 * re-derived from incomplete aggregate income in Closing.
 */
export const PAYROLL_THRESHOLD_RULES: readonly PayrollThresholdRule[] = [
  {
    id: "CZ-PAYROLL-2025",
    validFrom: "2025-01-01",
    validTo: "2025-12-31",
    dppInsuranceThresholdCzk: "11500",
    dpcInsuranceThresholdCzk: "4500",
    source: VZP_AGREEMENT_THRESHOLDS_2026,
  },
  {
    id: "CZ-PAYROLL-2026",
    validFrom: "2026-01-01",
    validTo: null,
    dppInsuranceThresholdCzk: "12000",
    dpcInsuranceThresholdCzk: "4500",
    source: VZP_AGREEMENT_THRESHOLDS_2026,
  },
] as const

export function payrollThresholdRuleForMonth(
  month: string,
): PayrollThresholdRule | undefined {
  return PAYROLL_THRESHOLD_RULES.find(
    (rule) =>
      rule.validFrom <= month &&
      (rule.validTo === null || rule.validTo >= month),
  )
}

export type AgreementKind = "DPP" | "DPC"
export type AgreementInsuranceParticipation =
  "PARTICIPATES" | "DOES_NOT_PARTICIPATE" | "UNSUPPORTED_RULE"

/**
 * Evaluate a same-employer monthly gross total against the dated rule. The
 * Closing engine stores the resulting participation fact; it does not guess
 * income or cross-employer facts from the ledger.
 */
export function evaluateAgreementInsuranceParticipation(input: {
  kind: AgreementKind
  month: string
  grossIncomeCzk: string
}): AgreementInsuranceParticipation {
  if (!/^\d+$/.test(input.grossIncomeCzk)) {
    throw new Error("grossIncomeCzk must be a non-negative whole-CZK string.")
  }
  const rule = payrollThresholdRuleForMonth(input.month)
  if (!rule) return "UNSUPPORTED_RULE"
  const threshold =
    input.kind === "DPP"
      ? rule.dppInsuranceThresholdCzk
      : rule.dpcInsuranceThresholdCzk
  return BigInt(input.grossIncomeCzk) >= BigInt(threshold)
    ? "PARTICIPATES"
    : "DOES_NOT_PARTICIPATE"
}

export function payrollDeadlineRuleForMonth(
  obligationKind: PayrollObligationKind,
  month: string,
): PayrollDeadlineRule | undefined {
  return PAYROLL_DEADLINE_RULES.find(
    (rule) =>
      rule.obligationKind === obligationKind &&
      rule.validFrom <= month &&
      (rule.validTo === null || rule.validTo >= month),
  )
}

export function payrollDeadlineForMonth(
  obligationKind: PayrollObligationKind,
  year: number,
  month: number,
): string | undefined {
  const monthIso = `${year}-${month.toString().padStart(2, "0")}-01`
  const rule = payrollDeadlineRuleForMonth(obligationKind, monthIso)
  if (!rule) return undefined
  return rule.deadlineBasis === "END_OF_NEXT_MONTH"
    ? specialRateWithholdingDeadline(year, month)
    : payrollMonthlyDeadline(year, month)
}
import type { ObligationKind } from "./model"
import {
  payrollMonthlyDeadline,
  specialRateWithholdingDeadline,
} from "./deadlines"

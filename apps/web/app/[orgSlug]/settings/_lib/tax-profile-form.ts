export interface PayrollFactState {
  hasStandardEmployment: boolean | null
  hasDpp: boolean | null
  hasDpc: boolean | null
  socialInsuranceParticipation: boolean | null
  healthInsuranceParticipation: boolean | null
  payrollTaxAdvanceDue: boolean | null
  specialRateWithholdingDue: boolean | null
}

export type PayrollFactKey = keyof PayrollFactState

export const PAYROLL_FACT_FIELDS: ReadonlyArray<{
  key: PayrollFactKey
  id: string
  label: string
}> = [
  {
    key: "hasStandardEmployment",
    id: "tax-profile-employment",
    label: "Standard employment active",
  },
  { key: "hasDpp", id: "tax-profile-dpp", label: "DPP active" },
  { key: "hasDpc", id: "tax-profile-dpc", label: "DPČ active" },
  {
    key: "socialInsuranceParticipation",
    id: "tax-profile-social",
    label: "Social insurance participation",
  },
  {
    key: "healthInsuranceParticipation",
    id: "tax-profile-health",
    label: "Health insurance participation",
  },
  {
    key: "payrollTaxAdvanceDue",
    id: "tax-profile-advance",
    label: "Payroll tax advance due",
  },
  {
    key: "specialRateWithholdingDue",
    id: "tax-profile-special",
    label: "Special-rate withholding due",
  },
]

export function toPayrollFactState(
  input: Partial<PayrollFactState> | null | undefined,
): PayrollFactState {
  return {
    hasStandardEmployment: input?.hasStandardEmployment ?? null,
    hasDpp: input?.hasDpp ?? null,
    hasDpc: input?.hasDpc ?? null,
    socialInsuranceParticipation: input?.socialInsuranceParticipation ?? null,
    healthInsuranceParticipation: input?.healthInsuranceParticipation ?? null,
    payrollTaxAdvanceDue: input?.payrollTaxAdvanceDue ?? null,
    specialRateWithholdingDue: input?.specialRateWithholdingDue ?? null,
  }
}

export function missingPayrollFactKeys(
  state: PayrollFactState,
): PayrollFactKey[] {
  return PAYROLL_FACT_FIELDS.filter(({ key }) => state[key] === null).map(
    ({ key }) => key,
  )
}

export function hasCompletePayrollFacts(
  state: PayrollFactState,
): state is { [K in PayrollFactKey]: boolean } {
  return missingPayrollFactKeys(state).length === 0
}

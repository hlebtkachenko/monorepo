import { describe, expect, it } from "vitest"

import {
  hasCompletePayrollFacts,
  missingPayrollFactKeys,
  toPayrollFactState,
} from "./tax-profile-form"

describe("tax profile form facts", () => {
  it("preserves legacy nulls as unanswered instead of coercing them to false", () => {
    const state = toPayrollFactState({
      hasStandardEmployment: true,
      hasDpp: null,
      hasDpc: false,
    })

    expect(state.hasStandardEmployment).toBe(true)
    expect(state.hasDpp).toBeNull()
    expect(state.hasDpc).toBe(false)
    expect(missingPayrollFactKeys(state)).toContain("hasDpp")
  })

  it("requires an explicit answer for all seven payroll facts", () => {
    const incomplete = toPayrollFactState({
      hasStandardEmployment: false,
      hasDpp: false,
      hasDpc: false,
      socialInsuranceParticipation: false,
      healthInsuranceParticipation: false,
      payrollTaxAdvanceDue: false,
    })
    expect(hasCompletePayrollFacts(incomplete)).toBe(false)
    expect(missingPayrollFactKeys(incomplete)).toEqual([
      "specialRateWithholdingDue",
    ])

    const complete = {
      ...incomplete,
      specialRateWithholdingDue: false,
    }
    expect(hasCompletePayrollFacts(complete)).toBe(true)
  })
})

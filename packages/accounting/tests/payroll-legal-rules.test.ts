import { describe, expect, it } from "vitest"

import {
  evaluateAgreementInsuranceParticipation,
  payrollDeadlineForMonth,
  payrollDeadlineRuleForMonth,
  payrollThresholdRuleForMonth,
  specialRateWithholdingDeadline,
} from "../src/obligations"

describe("payroll legal rules", () => {
  it("uses the threshold rule effective in the payroll month", () => {
    expect(
      payrollThresholdRuleForMonth("2025-12-01")?.dppInsuranceThresholdCzk,
    ).toBe("11500")
    expect(
      payrollThresholdRuleForMonth("2026-01-01")?.dppInsuranceThresholdCzk,
    ).toBe("12000")
  })

  it("returns unsupported for months without a verified rule", () => {
    expect(payrollThresholdRuleForMonth("2024-12-01")).toBeUndefined()
  })

  it("evaluates DPP and DPČ boundaries using the rule effective that month", () => {
    expect(
      evaluateAgreementInsuranceParticipation({
        kind: "DPP",
        month: "2025-12-01",
        grossIncomeCzk: "11499",
      }),
    ).toBe("DOES_NOT_PARTICIPATE")
    expect(
      evaluateAgreementInsuranceParticipation({
        kind: "DPP",
        month: "2025-12-01",
        grossIncomeCzk: "11500",
      }),
    ).toBe("PARTICIPATES")
    expect(
      evaluateAgreementInsuranceParticipation({
        kind: "DPP",
        month: "2026-01-01",
        grossIncomeCzk: "11999",
      }),
    ).toBe("DOES_NOT_PARTICIPATE")
    expect(
      evaluateAgreementInsuranceParticipation({
        kind: "DPC",
        month: "2026-01-01",
        grossIncomeCzk: "4500",
      }),
    ).toBe("PARTICIPATES")
  })

  it("keeps special-rate withholding separate from the 20th-day rules", () => {
    expect(payrollDeadlineForMonth("PAYROLL_TAX_ADVANCE", 2026, 1)).toBe(
      "2026-02-20",
    )
    expect(
      payrollDeadlineForMonth("SPECIAL_RATE_WITHHOLDING_TAX", 2026, 1),
    ).toBe("2026-03-02")
    expect(
      payrollDeadlineRuleForMonth("SPECIAL_RATE_WITHHOLDING_TAX", "2026-01-01")
        ?.source.verifiedOn,
    ).toBe("2026-07-09")
    expect(specialRateWithholdingDeadline(2026, 1)).toBe("2026-03-02")
    expect(specialRateWithholdingDeadline(2026, 11)).toBe("2026-12-31")
  })
})

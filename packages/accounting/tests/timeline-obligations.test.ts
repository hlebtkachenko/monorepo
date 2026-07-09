import { describe, expect, it } from "vitest"

import { resolveEffectiveTimeline } from "../src/obligations/effective-timeline"
import { computeTimelineObligations } from "../src/obligations/timeline-obligations"

function payrollValue(
  overrides: {
    socialInsuranceParticipation?: boolean
    healthInsuranceParticipation?: boolean
    payrollTaxAdvanceDue?: boolean
    specialRateWithholdingDue?: boolean
  } = {},
) {
  return {
    hasStandardEmployment: false,
    hasDpp: false,
    hasDpc: false,
    socialInsuranceParticipation: false,
    healthInsuranceParticipation: false,
    payrollTaxAdvanceDue: false,
    specialRateWithholdingDue: false,
    ...overrides,
  }
}

const noPayroll = resolveEffectiveTimeline({
  from: "2026-01-01",
  to: "2026-12-31",
  facts: [
    {
      sourceId: "payroll-none",
      validFrom: "2026-01-01",
      validTo: null,
      value: payrollValue(),
    },
  ],
})

describe("computeTimelineObligations", () => {
  it("a July VAT registration creates no payer obligations for January through June", () => {
    const vatTimeline = resolveEffectiveTimeline({
      from: "2026-01-01",
      to: "2026-12-31",
      facts: [
        {
          sourceId: "non-payer",
          validFrom: "2026-01-01",
          validTo: "2026-06-30",
          value: { regime: "NON_PAYER" as const, filingPeriod: null },
        },
        {
          sourceId: "payer",
          validFrom: "2026-07-01",
          validTo: null,
          value: { regime: "PAYER" as const, filingPeriod: "MONTHLY" as const },
        },
      ],
    })

    const result = computeTimelineObligations({
      from: "2026-01-01",
      to: "2026-12-31",
      personType: "LEGAL",
      vatTimeline,
      payrollTimeline: noPayroll,
    })
    const vatReturns = result.obligations.filter(
      (row) => row.kind === "VAT_RETURN",
    )

    expect(vatReturns).toHaveLength(6)
    expect(vatReturns[0]?.periodStart).toBe("2026-07-01")
    expect(result.issues).toEqual([])
  })

  it("deregistration preserves obligations from the earlier registered interval", () => {
    const vatTimeline = resolveEffectiveTimeline({
      from: "2026-01-01",
      to: "2026-12-31",
      facts: [
        {
          sourceId: "payer",
          validFrom: "2026-01-01",
          validTo: "2026-06-30",
          value: { regime: "PAYER" as const, filingPeriod: "MONTHLY" as const },
        },
        {
          sourceId: "non-payer",
          validFrom: "2026-07-01",
          validTo: null,
          value: { regime: "NON_PAYER" as const, filingPeriod: null },
        },
      ],
    })

    const result = computeTimelineObligations({
      from: "2026-01-01",
      to: "2026-12-31",
      personType: "LEGAL",
      vatTimeline,
      payrollTimeline: noPayroll,
    })

    expect(
      result.obligations.filter((row) => row.kind === "VAT_RETURN"),
    ).toHaveLength(6)
  })

  it("applies remittance facts only to their effective months", () => {
    const vatTimeline = resolveEffectiveTimeline({
      from: "2026-01-01",
      to: "2026-12-31",
      facts: [
        {
          sourceId: "non-payer",
          validFrom: "2026-01-01",
          validTo: null,
          value: { regime: "NON_PAYER" as const, filingPeriod: null },
        },
      ],
    })
    const payrollTimeline = resolveEffectiveTimeline({
      from: "2026-01-01",
      to: "2026-12-31",
      facts: [
        {
          sourceId: "no-employees",
          validFrom: "2026-01-01",
          validTo: "2026-08-31",
          value: payrollValue(),
        },
        {
          sourceId: "employees",
          validFrom: "2026-09-01",
          validTo: null,
          value: payrollValue({
            socialInsuranceParticipation: true,
            healthInsuranceParticipation: true,
            payrollTaxAdvanceDue: true,
            specialRateWithholdingDue: true,
          }),
        },
      ],
    })

    const result = computeTimelineObligations({
      from: "2026-01-01",
      to: "2026-12-31",
      personType: "LEGAL",
      vatTimeline,
      payrollTimeline,
    })
    const payroll = result.obligations.filter(
      (row) => row.category === "PAYROLL",
    )

    expect(payroll).toHaveLength(16)
    expect(payroll[0]?.periodStart).toBe("2026-09-01")
  })

  it("keeps DPP and DPČ relationship changes inside their effective interval", () => {
    const payrollTimeline = resolveEffectiveTimeline({
      from: "2026-01-01",
      to: "2026-12-31",
      facts: [
        {
          sourceId: "dpp-summer",
          validFrom: "2026-07-01",
          validTo: "2026-09-30",
          value: {
            ...payrollValue({ payrollTaxAdvanceDue: true }),
            hasDpp: true,
          },
        },
      ],
    })
    const result = computeTimelineObligations({
      from: "2026-01-01",
      to: "2026-12-31",
      personType: "LEGAL",
      vatTimeline: [],
      payrollTimeline,
    })

    expect(
      result.obligations.map((obligation) => obligation.periodStart),
    ).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"])
    expect(result.issues.map((issue) => [issue.from, issue.to])).toEqual([
      ["2026-01-01", "2026-06-30"],
      ["2026-10-01", "2026-12-31"],
    ])
  })

  it("does not turn a legacy has-employees row into obligations", () => {
    const result = computeTimelineObligations({
      from: "2026-01-01",
      to: "2026-01-31",
      personType: "LEGAL",
      vatTimeline: [],
      payrollTimeline: resolveEffectiveTimeline({
        from: "2026-01-01",
        to: "2026-01-31",
        facts: [
          {
            sourceId: "legacy",
            validFrom: "2026-01-01",
            validTo: null,
            value: {
              hasStandardEmployment: null,
              hasDpp: null,
              hasDpc: null,
              socialInsuranceParticipation: null,
              healthInsuranceParticipation: null,
              payrollTaxAdvanceDue: null,
              specialRateWithholdingDue: null,
            },
          },
        ],
      }),
    })

    expect(result.obligations).toEqual([])
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "PAYROLL_CONFIGURATION_INCOMPLETE",
    ])
  })

  it("returns missing profile intervals as needs-input issues", () => {
    const result = computeTimelineObligations({
      from: "2026-01-01",
      to: "2026-12-31",
      personType: "LEGAL",
      vatTimeline: resolveEffectiveTimeline({
        from: "2026-01-01",
        to: "2026-12-31",
        facts: [],
      }),
      payrollTimeline: resolveEffectiveTimeline({
        from: "2026-01-01",
        to: "2026-12-31",
        facts: [],
      }),
    })

    expect(result.obligations).toEqual([])
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "VAT_PROFILE_MISSING",
      "PAYROLL_PROFILE_MISSING",
    ])
  })

  it("deduplicates full calendar-quarter candidates across adjacent facts", () => {
    const vatTimeline = resolveEffectiveTimeline({
      from: "2026-01-01",
      to: "2026-12-31",
      facts: [
        {
          sourceId: "quarterly-one",
          validFrom: "2026-01-01",
          validTo: "2026-02-15",
          value: {
            regime: "PAYER" as const,
            filingPeriod: "QUARTERLY" as const,
          },
        },
        {
          sourceId: "quarterly-two",
          validFrom: "2026-02-16",
          validTo: null,
          value: {
            regime: "PAYER" as const,
            filingPeriod: "QUARTERLY" as const,
          },
        },
      ],
    })

    const result = computeTimelineObligations({
      from: "2026-01-01",
      to: "2026-12-31",
      personType: "NATURAL",
      vatTimeline,
      payrollTimeline: noPayroll,
    })

    expect(
      result.obligations.filter((row) => row.kind === "VAT_RETURN"),
    ).toHaveLength(4)
  })

  it("merges a mid-month regime change into one filing with proven applicability", () => {
    const vatTimeline = resolveEffectiveTimeline({
      from: "2026-01-01",
      to: "2026-01-31",
      facts: [
        {
          sourceId: "identified",
          validFrom: "2026-01-01",
          validTo: "2026-01-15",
          value: { regime: "IDENTIFIED_PERSON" as const, filingPeriod: null },
        },
        {
          sourceId: "payer",
          validFrom: "2026-01-16",
          validTo: null,
          value: { regime: "PAYER" as const, filingPeriod: "MONTHLY" as const },
        },
      ],
    })

    const result = computeTimelineObligations({
      from: "2026-01-01",
      to: "2026-01-31",
      personType: "LEGAL",
      vatTimeline,
      payrollTimeline: [],
    })
    const vatReturns = result.obligations.filter(
      (row) => row.kind === "VAT_RETURN",
    )

    expect(vatReturns).toHaveLength(1)
    expect(vatReturns[0]?.applicability.status).toBe("APPLICABLE")
  })
})

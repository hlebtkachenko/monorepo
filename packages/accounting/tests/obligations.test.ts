/**
 * Obligation + deadline engine — pure unit tests. No DB, no testcontainer
 * dependency (the module under test has none); this just rides the shared
 * vitest runner alongside the DB-backed suites in this package.
 *
 * Dates are cross-checked against the KB's
 * `60-deadlines-penalties/filing-deadlines.md` (2026 calendar, confidence:
 * high) plus independently-computed 2027/2028 rollover cases.
 */
import { describe, expect, it } from "vitest"
import {
  computeObligations,
  czechHolidays,
  shiftToBusinessDay,
} from "../src/index"
import type { Obligation } from "../src/index"

function expectApplicability(
  obligations: Obligation[],
  status: Obligation["applicability"]["status"],
): void {
  expect(obligations.every((o) => o.applicability.status === status)).toBe(true)
  expect(
    obligations.every((o) => o.applicability.reason.trim().length > 0),
  ).toBe(true)
}

describe("czechHolidays", () => {
  it("includes all 11 fixed-date holidays for 2026", () => {
    const holidays = czechHolidays(2026)
    for (const iso of [
      "2026-01-01",
      "2026-05-01",
      "2026-05-08",
      "2026-07-05",
      "2026-07-06",
      "2026-09-28",
      "2026-10-28",
      "2026-11-17",
      "2026-12-24",
      "2026-12-25",
      "2026-12-26",
    ]) {
      expect(holidays.has(iso)).toBe(true)
    }
  })

  it("computes Good Friday and Easter Monday for 2026 via Meeus/Butcher", () => {
    const holidays = czechHolidays(2026)
    expect(holidays.has("2026-04-03")).toBe(true) // Good Friday
    expect(holidays.has("2026-04-06")).toBe(true) // Easter Monday
  })

  it("has exactly 13 holidays (11 fixed + Good Friday + Easter Monday)", () => {
    expect(czechHolidays(2026).size).toBe(13)
  })
})

describe("shiftToBusinessDay", () => {
  it("shifts a Saturday deadline to the following Monday", () => {
    expect(shiftToBusinessDay("2026-07-25")).toBe("2026-07-27")
  })

  it("shifts a Sunday deadline to the following Monday", () => {
    expect(shiftToBusinessDay("2026-10-25")).toBe("2026-10-26")
  })

  it("leaves a normal weekday unchanged", () => {
    expect(shiftToBusinessDay("2026-06-15")).toBe("2026-06-15")
  })

  it("shifts off a holiday cluster (Christmas 25/26 Dec) to the next business day", () => {
    expect(shiftToBusinessDay("2026-12-25")).toBe("2026-12-28")
  })

  it("leaves 2026-12-31 (a Thursday) unchanged", () => {
    expect(shiftToBusinessDay("2026-12-31")).toBe("2026-12-31")
  })

  it("shifts a Saturday deadline in a different year (2027), rolling into March", () => {
    expect(shiftToBusinessDay("2027-02-27")).toBe("2027-03-01")
  })

  it("rolls a Saturday deadline across an actual year boundary (2028 -> 2029)", () => {
    expect(shiftToBusinessDay("2028-12-30")).toBe("2029-01-02")
  })
})

describe("computeObligations", () => {
  const calendar2026 = { periodStart: "2026-01-01", periodEnd: "2026-12-31" }

  it("PAYER + MONTHLY, no employees: 12 VAT_RETURN + 12 CONTROL_STATEMENT + 12 EC_SALES_LIST", () => {
    const obligations = computeObligations({
      ...calendar2026,
      vatRegimeCode: "PAYER",
      vatFilingPeriod: "MONTHLY",
      personType: "LEGAL",
      hasEmployees: false,
    })
    const byKind = (kind: Obligation["kind"]) =>
      obligations.filter((o) => o.kind === kind)

    expect(byKind("VAT_RETURN")).toHaveLength(12)
    expect(byKind("CONTROL_STATEMENT")).toHaveLength(12)
    expectApplicability(byKind("VAT_RETURN"), "APPLICABLE")
    expectApplicability(byKind("CONTROL_STATEMENT"), "APPLICABLE")
    const sh = byKind("EC_SALES_LIST")
    expect(sh).toHaveLength(12)
    expectApplicability(sh, "CONDITION_NOT_EVALUATED")
    expect(obligations).toHaveLength(36)

    const june = byKind("VAT_RETURN").find((o) => o.periodLabel === "June 2026")
    expect(june?.dueDate).toBe("2026-07-27")
    const sep = byKind("VAT_RETURN").find(
      (o) => o.periodLabel === "September 2026",
    )
    expect(sep?.dueDate).toBe("2026-10-26")
  })

  it("PAYER + QUARTERLY + LEGAL person: 4 VAT_RETURN (Q1..Q4) + 12 CONTROL_STATEMENT (monthly, §101e ZDPH)", () => {
    const obligations = computeObligations({
      ...calendar2026,
      vatRegimeCode: "PAYER",
      vatFilingPeriod: "QUARTERLY",
      personType: "LEGAL",
      hasEmployees: false,
    })
    const vatReturns = obligations.filter((o) => o.kind === "VAT_RETURN")
    const kh = obligations.filter((o) => o.kind === "CONTROL_STATEMENT")
    const sh = obligations.filter((o) => o.kind === "EC_SALES_LIST")
    expect(vatReturns).toHaveLength(4)
    // A legal person files KH monthly regardless of the VAT return's own
    // (quarterly) filing period.
    expect(kh).toHaveLength(12)
    // SH stays monthly-conditional regardless of VAT filing period.
    expect(sh).toHaveLength(12)

    const q2 = vatReturns.find((o) => o.periodLabel === "Q2 2026")
    expect(q2?.dueDate).toBe("2026-07-27")
    expect(q2?.periodStart).toBe("2026-04-01")
    expect(q2?.periodEnd).toBe("2026-06-30")
  })

  it("PAYER + QUARTERLY + NATURAL person: 4 VAT_RETURN (Q1..Q4) + 4 CONTROL_STATEMENT (quarterly, §101e ZDPH)", () => {
    const obligations = computeObligations({
      ...calendar2026,
      vatRegimeCode: "PAYER",
      vatFilingPeriod: "QUARTERLY",
      personType: "NATURAL",
      hasEmployees: false,
    })
    const vatReturns = obligations.filter((o) => o.kind === "VAT_RETURN")
    const kh = obligations.filter((o) => o.kind === "CONTROL_STATEMENT")
    const sh = obligations.filter((o) => o.kind === "EC_SALES_LIST")
    expect(vatReturns).toHaveLength(4)
    // A natural person on quarterly VAT filing files KH quarterly too,
    // filed alongside the quarterly VAT return.
    expect(kh).toHaveLength(4)
    // SH stays monthly-conditional regardless of VAT filing period.
    expect(sh).toHaveLength(12)

    const khQ2 = kh.find((o) => o.periodLabel === "Q2 2026")
    const vatQ2 = vatReturns.find((o) => o.periodLabel === "Q2 2026")
    expect(khQ2?.dueDate).toBe("2026-07-27")
    expect(khQ2?.dueDate).toBe(vatQ2?.dueDate)
    expect(khQ2?.periodStart).toBe("2026-04-01")
    expect(khQ2?.periodEnd).toBe("2026-06-30")
  })

  it("PAYER + QUARTERLY, non-calendar accounting period: VAT_RETURN and CONTROL_STATEMENT use complete calendar-quarter bounds", () => {
    const obligations = computeObligations({
      periodStart: "2026-02-01",
      periodEnd: "2026-04-30",
      vatRegimeCode: "PAYER",
      vatFilingPeriod: "QUARTERLY",
      personType: "NATURAL",
      hasEmployees: false,
    })
    const vatReturns = obligations.filter((o) => o.kind === "VAT_RETURN")
    const kh = obligations.filter((o) => o.kind === "CONTROL_STATEMENT")
    expect(vatReturns).toHaveLength(2)
    expect(kh).toHaveLength(2)

    for (const obligationsForKind of [vatReturns, kh]) {
      const q1 = obligationsForKind.find((o) => o.periodLabel === "Q1 2026")
      expect(q1?.periodStart).toBe("2026-01-01")
      expect(q1?.periodEnd).toBe("2026-03-31")
      expect(q1?.dueDate).toBe("2026-04-27")

      const q2 = obligationsForKind.find((o) => o.periodLabel === "Q2 2026")
      expect(q2?.periodStart).toBe("2026-04-01")
      expect(q2?.periodEnd).toBe("2026-06-30")
      expect(q2?.dueDate).toBe("2026-07-27")
    }
  })

  it("PAYER with vatFilingPeriod: null throws instead of silently omitting VAT_RETURN", () => {
    expect(() =>
      computeObligations({
        ...calendar2026,
        vatRegimeCode: "PAYER",
        vatFilingPeriod: null,
        personType: "LEGAL",
        hasEmployees: false,
      }),
    ).toThrow(
      "A VAT payer must have a filing period (MONTHLY or QUARTERLY); got null.",
    )
  })

  it("shifts a VAT_RETURN deadline that lands on a weekday public holiday (November 2026 -> 25 Dec, a Friday holiday -> 28 Dec)", () => {
    const obligations = computeObligations({
      ...calendar2026,
      vatRegimeCode: "PAYER",
      vatFilingPeriod: "MONTHLY",
      personType: "LEGAL",
      hasEmployees: false,
    })
    const november = obligations.find(
      (o) => o.kind === "VAT_RETURN" && o.periodLabel === "November 2026",
    )
    // 25 Dec 2026 is a Friday (weekday) AND a public holiday (1. svátek
    // vánoční) — it shifts, then rolls past the 26th (Saturday) and 27th
    // (Sunday) to the next business day, 28 Dec (Monday).
    expect(november?.dueDate).toBe("2026-12-28")
  })

  it("hasEmployees=true adds 12x3 payroll obligations", () => {
    const obligations = computeObligations({
      ...calendar2026,
      vatRegimeCode: "NON_PAYER",
      vatFilingPeriod: null,
      personType: "NATURAL",
      hasEmployees: true,
    })
    expect(
      obligations.filter((o) => o.kind === "SOCIAL_INSURANCE"),
    ).toHaveLength(12)
    expect(
      obligations.filter((o) => o.kind === "HEALTH_INSURANCE"),
    ).toHaveLength(12)
    expect(
      obligations.filter((o) => o.kind === "WITHHOLDING_TAX"),
    ).toHaveLength(12)
    expect(obligations).toHaveLength(36)

    const may = obligations.find(
      (o) => o.kind === "SOCIAL_INSURANCE" && o.periodLabel === "May 2026",
    )
    expect(may?.dueDate).toBe("2026-06-22")
  })

  it("NON_PAYER with no employees returns no obligations", () => {
    const obligations = computeObligations({
      ...calendar2026,
      vatRegimeCode: "NON_PAYER",
      vatFilingPeriod: null,
      personType: "NATURAL",
      hasEmployees: false,
    })
    expect(obligations).toEqual([])
  })

  it("IDENTIFIED_PERSON: 12 conditional VAT_RETURN + 12 conditional EC_SALES_LIST, no CONTROL_STATEMENT (§101 odst. 5 ZDPH)", () => {
    const obligations = computeObligations({
      ...calendar2026,
      vatRegimeCode: "IDENTIFIED_PERSON",
      vatFilingPeriod: null,
      personType: "LEGAL",
      hasEmployees: false,
    })
    const vatReturns = obligations.filter((o) => o.kind === "VAT_RETURN")
    const sh = obligations.filter((o) => o.kind === "EC_SALES_LIST")
    expect(vatReturns).toHaveLength(12)
    expectApplicability(vatReturns, "CONDITION_NOT_EVALUATED")
    expect(sh).toHaveLength(12)
    expectApplicability(sh, "CONDITION_NOT_EVALUATED")
    expect(
      obligations.filter((o) => o.kind === "CONTROL_STATEMENT"),
    ).toHaveLength(0)
    expect(obligations).toHaveLength(24)
  })
})

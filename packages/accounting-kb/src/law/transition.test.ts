import { describe, expect, it } from "vitest"

import {
  DE_TO_UCETNICTVI_TAX_ADJUSTMENTS,
  openingBalancePosting,
  OPENING_BALANCE_BRIDGE,
  PROPRIETOR_CAPITAL_ACCOUNT,
  TRANSITION_DPFO_APPENDIX,
  VOLUNTARY_BACKSWITCH_MIN_PERIODS,
} from "./transition"

describe("zahajovací rozvaha — převodový můstek (DE → účetnictví)", () => {
  it("the bridge counter is account 491 (individuální podnikatel)", () => {
    expect(PROPRIETOR_CAPITAL_ACCOUNT).toBe("491")
  })

  it("assets debit the account and credit 491; liabilities debit 491 and credit the account", () => {
    const cash = OPENING_BALANCE_BRIDGE.find((e) => e.account === "211")
    const payables = OPENING_BALANCE_BRIDGE.find((e) => e.account === "321")
    expect(cash && openingBalancePosting(cash)).toEqual({
      debit: "211",
      credit: "491",
    })
    expect(payables && openingBalancePosting(payables)).toEqual({
      debit: "491",
      credit: "321",
    })
  })

  it("every bridge entry posts exactly one leg against 491", () => {
    for (const e of OPENING_BALANCE_BRIDGE) {
      const p = openingBalancePosting(e)
      expect([p.debit, p.credit]).toContain("491")
      expect([p.debit, p.credit]).toContain(e.account)
      expect(p.debit).not.toBe(p.credit)
    }
  })

  it("carries cash/bank/receivables/inventory/DHM as assets and payables/tax/ČSSZ/loans as liabilities", () => {
    const assets = OPENING_BALANCE_BRIDGE.filter((e) => e.side === "asset").map(
      (e) => e.account,
    )
    const liabilities = OPENING_BALANCE_BRIDGE.filter(
      (e) => e.side === "liability",
    ).map((e) => e.account)
    expect(assets).toEqual(
      expect.arrayContaining(["211", "221", "311", "112", "022"]),
    )
    expect(liabilities).toEqual(
      expect.arrayContaining(["321", "343", "336", "461"]),
    )
  })
})

describe("§23 odst. 14 transition tax-base adjustment (directional)", () => {
  it("receivables increase, payables decrease, inventory neutral, reserves reverse", () => {
    expect(DE_TO_UCETNICTVI_TAX_ADJUSTMENTS.receivables.effect).toBe("increase")
    expect(DE_TO_UCETNICTVI_TAX_ADJUSTMENTS.payables.effect).toBe("decrease")
    expect(DE_TO_UCETNICTVI_TAX_ADJUSTMENTS.inventory.effect).toBe("neutral")
    expect(DE_TO_UCETNICTVI_TAX_ADJUSTMENTS.reserves.effect).toBe("reverse")
  })

  it("adjustments are declared on Příloha č. 3 of the DPFO", () => {
    expect(TRANSITION_DPFO_APPENDIX).toContain("Příloha č. 3")
  })
})

describe("§4 odst. 7 voluntary back-switch", () => {
  it("requires 5 consecutive účetní období before reverting to daňová evidence", () => {
    expect(VOLUNTARY_BACKSWITCH_MIN_PERIODS).toBe(5)
  })
})

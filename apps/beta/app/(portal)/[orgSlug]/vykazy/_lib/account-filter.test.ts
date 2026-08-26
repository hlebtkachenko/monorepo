import { describe, expect, it } from "vitest"

import type { TrialBalanceLineView } from "@/lib/data/projections"

import { filterTrialBalance } from "./account-filter"

function account(
  accountCode: string,
  accountName: string,
): TrialBalanceLineView {
  return {
    id: `acc-${accountCode}`,
    accountCode,
    accountName,
    openingBalance: null,
    turnoverDebit: null,
    turnoverCredit: null,
    closingBalance: null,
  }
}

const LINES = [
  account("211", "Pokladna"),
  account("221", "Bankovní účty"),
  account("311100", "Odběratelé — tuzemsko"),
  account("343.01", "DPH na výstupu"),
]

describe("filterTrialBalance", () => {
  it("returns everything for an empty query", () => {
    expect(filterTrialBalance(LINES, "")).toHaveLength(4)
    expect(filterTrialBalance(LINES, "   ")).toHaveLength(4)
  })

  it("matches an account code as a substring, analytics included", () => {
    expect(
      filterTrialBalance(LINES, "311").map((line) => line.accountCode),
    ).toEqual(["311100"])
    expect(
      filterTrialBalance(LINES, "343.01").map((line) => line.accountCode),
    ).toEqual(["343.01"])
    expect(
      filterTrialBalance(LINES, "2").map((line) => line.accountCode),
    ).toEqual(["211", "221"])
  })

  it("matches the name too, ignoring case and diacritics", () => {
    // The office types what it remembers, with or without háčky.
    for (const query of ["bankovni", "BANKOVNÍ", "ucty", "ÚČTY", " účty "]) {
      expect(
        filterTrialBalance(LINES, query).map((line) => line.accountCode),
      ).toEqual(["221"])
    }
  })

  it("matches a name with diacritics when the query has none, and vice versa", () => {
    expect(
      filterTrialBalance(LINES, "odberatele").map((line) => line.accountCode),
    ).toEqual(["311100"])
    expect(
      filterTrialBalance(LINES, "výstupu").map((line) => line.accountCode),
    ).toEqual(["343.01"])
  })

  it("answers empty for a query nothing matches, without throwing", () => {
    expect(filterTrialBalance(LINES, "zzz")).toEqual([])
  })
})

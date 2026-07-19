/**
 * Chart-of-accounts app-edge — the derived presentation columns (statement class / account type)
 * and the table column descriptors the UI renders from. Pure logic; the DB reads are covered in
 * @workspace/accounting. Dynamic import so the @workspace/db singletons bind after globalSetup.
 */
import { describe, expect, it } from "vitest"

const mod = await import("./accounting")
const { statementClass, accountType, CHART_ACCOUNT_COLUMNS } = mod

describe("statementClass — derived statement membership", () => {
  it("maps balance-sheet / income-statement / closing / off-balance natures", () => {
    expect(statementClass("ASSET")).toBe("BALANCE_SHEET")
    expect(statementClass("LIABILITY")).toBe("BALANCE_SHEET")
    expect(statementClass("EQUITY")).toBe("BALANCE_SHEET")
    expect(statementClass("EXPENSE")).toBe("INCOME_STATEMENT")
    expect(statementClass("REVENUE")).toBe("INCOME_STATEMENT")
    expect(statementClass("CLOSING")).toBe("CLOSING")
    expect(statementClass("OFF_BALANCE")).toBe("OFF_BALANCE")
  })
})

describe("accountType — derived account type", () => {
  it("maps active / passive / expense / revenue, null for closing/off-balance", () => {
    expect(accountType("ASSET")).toBe("ACTIVE")
    expect(accountType("LIABILITY")).toBe("PASSIVE")
    expect(accountType("EQUITY")).toBe("PASSIVE")
    expect(accountType("EXPENSE")).toBe("EXPENSE")
    expect(accountType("REVENUE")).toBe("REVENUE")
    expect(accountType("CLOSING")).toBeNull()
    expect(accountType("OFF_BALANCE")).toBeNull()
  })
})

describe("CHART_ACCOUNT_COLUMNS — the table render spec", () => {
  it("exposes the reference-platform columns with unique keys", () => {
    const keys = CHART_ACCOUNT_COLUMNS.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(
      expect.arrayContaining([
        "number",
        "name",
        "statementClass",
        "accountType",
        "tracksOpenItems",
        "taxRelevant",
      ]),
    )
  })

  it("carries an i18n labelKey (no literal header text) on every column", () => {
    for (const c of CHART_ACCOUNT_COLUMNS) {
      expect(c.labelKey).toMatch(/^accounting\.chartOfAccounts\.columns\./)
      // no hardcoded user-facing strings leaked onto the descriptor
      expect(c).not.toHaveProperty("header")
    }
  })

  it("marks only name / open-items / tax-relevant editable, derived columns read-only", () => {
    const editable = CHART_ACCOUNT_COLUMNS.filter((c) => c.editable).map(
      (c) => c.key,
    )
    expect(editable.sort()).toEqual(["name", "taxRelevant", "tracksOpenItems"])
    expect(CHART_ACCOUNT_COLUMNS.every((c) => !(c.derived && c.editable))).toBe(
      true,
    )
  })
})

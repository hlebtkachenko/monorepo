/**
 * Chart-of-accounts app-edge — the derived presentation columns (Druh / Typ) and the table
 * column descriptors the UI renders from. Pure logic; the DB reads are covered in
 * @workspace/accounting. Dynamic import so the @workspace/db singletons bind after globalSetup.
 */
import { describe, expect, it } from "vitest"

const mod = await import("./accounting")
const { accountDruh, accountTyp, CHART_ACCOUNT_COLUMNS } = mod

describe("accountDruh — derived statement class", () => {
  it("maps balance / P&L / closing / off-balance natures", () => {
    expect(accountDruh("ASSET")).toBe("ROZVAHOVY")
    expect(accountDruh("LIABILITY")).toBe("ROZVAHOVY")
    expect(accountDruh("EQUITY")).toBe("ROZVAHOVY")
    expect(accountDruh("EXPENSE")).toBe("VYSLEDKOVY")
    expect(accountDruh("REVENUE")).toBe("VYSLEDKOVY")
    expect(accountDruh("CLOSING")).toBe("ZAVERKOVY")
    expect(accountDruh("OFF_BALANCE")).toBe("PODROZVAHOVY")
  })
})

describe("accountTyp — derived account type", () => {
  it("maps active / passive / expense / revenue, null for closing/off-balance", () => {
    expect(accountTyp("ASSET")).toBe("AKTIVNI")
    expect(accountTyp("LIABILITY")).toBe("PASIVNI")
    expect(accountTyp("EQUITY")).toBe("PASIVNI")
    expect(accountTyp("EXPENSE")).toBe("NAKLADOVY")
    expect(accountTyp("REVENUE")).toBe("VYNOSOVY")
    expect(accountTyp("CLOSING")).toBeNull()
    expect(accountTyp("OFF_BALANCE")).toBeNull()
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
        "druh",
        "typ",
        "tracksOpenItems",
        "taxRelevant",
      ]),
    )
  })

  it("marks only name / saldo / daňový editable, and derived columns as read-only", () => {
    const editable = CHART_ACCOUNT_COLUMNS.filter((c) => c.editable).map(
      (c) => c.key,
    )
    expect(editable.sort()).toEqual(["name", "taxRelevant", "tracksOpenItems"])
    // derived columns are never editable
    expect(CHART_ACCOUNT_COLUMNS.every((c) => !(c.derived && c.editable))).toBe(
      true,
    )
  })

  it("every column carries both cs and en headers", () => {
    for (const c of CHART_ACCOUNT_COLUMNS) {
      expect(c.header.cs.length).toBeGreaterThan(0)
      expect(c.header.en.length).toBeGreaterThan(0)
    }
  })
})

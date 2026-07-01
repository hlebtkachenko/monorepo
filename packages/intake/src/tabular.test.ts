import { describe, expect, it } from "vitest"
import {
  normalizeDate,
  parseAmountMinor,
  rowsToBankTransactions,
  type Cell,
} from "./tabular"
import type { ParseContext } from "./types"
import { isBankTransaction } from "@workspace/brain"

const ctx: ParseContext = {
  orgRef: "org-1",
  sourcePath: "dump/bank.csv",
  ingestedAt: "2026-07-01T00:00:00.000Z",
}

describe("parseAmountMinor", () => {
  it("parses CZ formatting with a space thousands separator and comma decimal", () => {
    expect(parseAmountMinor("1 234,56")).toBe(123456n)
  })

  it("parses dot decimal", () => {
    expect(parseAmountMinor("1234.56")).toBe(123456n)
  })

  it("parses a negative sign and parentheses", () => {
    expect(parseAmountMinor("-100")).toBe(-10000n)
    expect(parseAmountMinor("(50,00)")).toBe(-5000n)
  })

  it("treats dot-grouped integer thousands as thousands, not a decimal (CZ dot-thousands)", () => {
    // "1.234" means 1 234 Kč, not 1.23 Kč — a lone "." here is a thousands separator, not decimal.
    expect(parseAmountMinor("1.234")).toBe(123400n)
    expect(parseAmountMinor("1.500")).toBe(150000n)
    // Multi-group still works.
    expect(parseAmountMinor("1.500.000")).toBe(150000000n)
  })

  it("still treats a lone dot with a 1–2 digit fraction as a decimal point", () => {
    expect(parseAmountMinor("12.5")).toBe(1250n)
    expect(parseAmountMinor("1234.56")).toBe(123456n)
  })

  it("does not regress mixed CZ formatting", () => {
    expect(parseAmountMinor("1 234,56")).toBe(123456n)
    expect(parseAmountMinor("1.234.567,89")).toBe(123456789n)
  })

  it("returns null for gibberish", () => {
    expect(parseAmountMinor("not-a-number")).toBeNull()
  })
})

describe("normalizeDate", () => {
  it("normalizes DD.MM.YYYY to ISO", () => {
    expect(normalizeDate("1. 2. 2025")).toBe("2025-02-01")
  })

  it("passes through ISO", () => {
    expect(normalizeDate("2025-03-04")).toBe("2025-03-04")
  })

  it("returns null for an unrecognized format", () => {
    expect(normalizeDate("March 4")).toBeNull()
  })
})

describe("rowsToBankTransactions", () => {
  it("maps a signed-amount bank export to BankTransaction IR with a full envelope", () => {
    const rows: Cell[][] = [
      ["datum", "částka", "měna", "VS", "zpráva"],
      ["2025-01-15", "1 234,56", "CZK", "12345", "platba"],
      ["2025-01-16", "-500,00", "CZK", "", "poplatek"],
    ]
    const { records, warnings } = rowsToBankTransactions(rows, ctx, "csv")
    expect(warnings).toHaveLength(0)
    expect(records).toHaveLength(2)

    const first = records[0]!
    expect(isBankTransaction(first)).toBe(true)
    expect(first.record_type).toBe("bank_transaction")
    if (first.record_type !== "bank_transaction") throw new Error("type")
    expect(first.amount_minor).toBe(123456n)
    expect(first.direction).toBe("credit")
    expect(first.currency).toBe("CZK")
    expect(first.variable_symbol).toBe("12345")
    expect(first.booking_date).toBe("2025-01-15")

    expect(first.ir_id).toMatch(/^[0-9a-f]{64}$/)
    expect(first.source).toBe("csv")
    expect(first.org_ref).toBe("org-1")
    expect(first.ingested_at).toBe("2026-07-01T00:00:00.000Z")
    expect(first.source_locator).toBe("dump/bank.csv#row=1")
    expect(first.source_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(first.confidence).toBe(0.95)
    expect(first.needs_review).toBe(false)
    expect(first.content_hash).toBeUndefined()

    const second = records[1]!
    if (second.record_type !== "bank_transaction") throw new Error("type")
    expect(second.amount_minor).toBe(-50000n)
    expect(second.direction).toBe("debit")
  })

  it("resolves a split debit/credit export into a signed amount", () => {
    const rows: Cell[][] = [
      ["datum", "příjem", "výdaj"],
      ["2025-02-01", "1000", ""],
      ["2025-02-02", "", "250"],
    ]
    const { records } = rowsToBankTransactions(rows, ctx, "csv")
    expect(records).toHaveLength(2)
    const a = records[0]!
    const b = records[1]!
    if (a.record_type !== "bank_transaction") throw new Error("type")
    if (b.record_type !== "bank_transaction") throw new Error("type")
    expect(a.amount_minor).toBe(100000n)
    expect(a.direction).toBe("credit")
    expect(b.amount_minor).toBe(-25000n)
    expect(b.direction).toBe("debit")
  })

  it("flags needs_review when currency is absent (inferred CZK)", () => {
    const rows: Cell[][] = [
      ["datum", "částka"],
      ["2025-01-01", "10,00"],
    ]
    const { records } = rowsToBankTransactions(rows, ctx, "csv")
    const rec = records[0]!
    expect(rec.needs_review).toBe(true)
    expect(rec.confidence).toBe(0.8)
    if (rec.record_type !== "bank_transaction") throw new Error("type")
    expect(rec.currency).toBe("CZK")
  })

  it("warns and emits nothing when no header row is recognizable", () => {
    const rows: Cell[][] = [
      ["foo", "bar"],
      ["1", "2"],
    ]
    const { records, warnings } = rowsToBankTransactions(rows, ctx, "csv")
    expect(records).toHaveLength(0)
    expect(warnings.some((w) => /no recognizable header/.test(w.message))).toBe(
      true,
    )
  })

  it("skips a row with a huge numeric amount cell instead of throwing (BigInt overflow guard)", () => {
    const rows: Cell[][] = [
      ["datum", "částka", "měna"],
      ["2025-01-01", 1e300, "CZK"], // scaled value is not a safe integer → BigInt() would throw
      ["2025-01-02", 100, "CZK"], // a sane row alongside it still parses
    ]
    const { records, warnings } = rowsToBankTransactions(rows, ctx, "csv")
    expect(records).toHaveLength(1)
    const rec = records[0]!
    if (rec.record_type !== "bank_transaction") throw new Error("type")
    expect(rec.amount_minor).toBe(10000n)
    expect(warnings.some((w) => /unparseable amount/.test(w.message))).toBe(
      true,
    )
  })

  it("warns when a header is found but there is no amount column", () => {
    const rows: Cell[][] = [
      ["datum", "zpráva"],
      ["2025-01-01", "hello"],
    ]
    const { records, warnings } = rowsToBankTransactions(rows, ctx, "csv")
    expect(records).toHaveLength(0)
    expect(warnings.some((w) => /no amount column/.test(w.message))).toBe(true)
  })
})

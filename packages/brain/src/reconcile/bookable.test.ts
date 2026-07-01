import { describe, expect, it } from "vitest"

import type {
  Attachment,
  BankTransaction,
  CashDocument,
  GLEntry,
  Invoice,
  IrRecord,
} from "../ir/records"
import {
  assertBookableSource,
  BOOKABLE_IR_RECORD_TYPES,
  type BookableRecord,
  isBookableSource,
} from "./bookable"

// Control 2: a GLEntry (a prior accountant's journal row) is NEVER a booking source. The Brain books
// from primary facts only. These tests pin that the whitelist stays primary-facts-only and that a
// GLEntry can neither pass the runtime guard nor be assigned to the compile-time `BookableRecord` type.

const envelope = (record_type: IrRecord["record_type"]) => ({
  ir_id: "ir-1",
  org_ref: "org-1",
  source: "csv" as const,
  source_locator: "row:1",
  source_hash: "h",
  ingested_at: "2026-01-01T00:00:00Z",
  confidence: 1,
  needs_review: false,
  raw: {},
  record_type,
})

const invoice = { ...envelope("invoice") } as Invoice
const bank = { ...envelope("bank_transaction") } as BankTransaction
const cash = { ...envelope("cash_document") } as CashDocument
const glEntry = { ...envelope("gl_entry") } as GLEntry
const attachment = { ...envelope("attachment") } as Attachment

describe("bookable-source guard (control 2)", () => {
  it("the whitelist is the three primary facts only — never gl_entry/attachment", () => {
    expect([...BOOKABLE_IR_RECORD_TYPES]).toEqual([
      "invoice",
      "bank_transaction",
      "cash_document",
    ])
    expect(BOOKABLE_IR_RECORD_TYPES).not.toContain("gl_entry")
    expect(BOOKABLE_IR_RECORD_TYPES).not.toContain("attachment")
  })

  it("isBookableSource is true for the three primaries", () => {
    expect(isBookableSource(invoice)).toBe(true)
    expect(isBookableSource(bank)).toBe(true)
    expect(isBookableSource(cash)).toBe(true)
  })

  it("isBookableSource is false for a GLEntry and an Attachment", () => {
    expect(isBookableSource(glEntry)).toBe(false)
    expect(isBookableSource(attachment)).toBe(false)
  })

  it("assertBookableSource throws on a GLEntry (never a booking source)", () => {
    expect(() => assertBookableSource(glEntry)).toThrow(/gl_entry/)
    expect(() => assertBookableSource(attachment)).toThrow(/attachment/)
  })

  it("assertBookableSource passes a primary fact through", () => {
    expect(() => assertBookableSource(invoice)).not.toThrow()
  })

  it("a GLEntry is not assignable to BookableRecord (compile-time control 2)", () => {
    // @ts-expect-error — a GLEntry can never be a BookableRecord; removing this line must fail typecheck.
    const _never: BookableRecord = glEntry
    void _never
  })
})

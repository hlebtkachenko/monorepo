import { describe, expect, it } from "vitest"

import {
  IR_RECORD_TYPES,
  IR_SOURCES,
  isIrRecordType,
  isIrSource,
  isUntrustedPrior,
  type ProvenanceEnvelope,
} from "./provenance"
import {
  type Attachment,
  type BankTransaction,
  type CashDocument,
  type GLEntry,
  type Invoice,
  type IrRecord,
  isAttachment,
  isBankTransaction,
  isCashDocument,
  isGLEntry,
  isInvoice,
} from "./records"

const envelope = (
  ir_id: string,
  source: ProvenanceEnvelope["source"],
): ProvenanceEnvelope => ({
  ir_id,
  org_ref: "acme",
  source,
  source_locator: "dump/acme/2025/x.xml#/FaktPrij[1]",
  source_hash: "sha256:abc",
  ingested_at: "2026-06-25T10:00:00Z",
  confidence: 1,
  needs_review: false,
  raw: {},
})

const invoice: Invoice = {
  ...envelope("inv-1", "isdoc"),
  record_type: "invoice",
  direction: "received",
  doc_type: "invoice",
  number: "2025/0042",
  issue_date: "2025-03-01",
  currency: "CZK",
  lines: [
    {
      description: "Goods",
      quantity: 1,
      unit_price_minor: 100_00n,
      vat_rate: 21,
    },
  ],
  vat_summary: [{ rate: 21, base_minor: 100_00n, tax_minor: 21_00n }],
  total_minor: 121_00n,
}

const bank: BankTransaction = {
  ...envelope("bank-1", "fio"),
  record_type: "bank_transaction",
  account: { account: "2900123456", bank_code: "2010" },
  booking_date: "2025-03-05",
  amount_minor: -121_00n,
  currency: "CZK",
  direction: "debit",
}

const cash: CashDocument = {
  ...envelope("cash-1", "money_s3"),
  record_type: "cash_document",
  direction: "expense",
  number: "VPD-1",
  date: "2025-03-02",
  amount_minor: 500_00n,
  currency: "CZK",
}

const gl: GLEntry = {
  ...envelope("gl-1", "pohoda_xml"),
  record_type: "gl_entry",
  date: "2025-03-01",
  debit_account: "504",
  credit_account: "321",
  amount_minor: 100_00n,
  description: "Nákup zboží",
}

const attach: Attachment = {
  ...envelope("att-1", "pdf"),
  record_type: "attachment",
  kind: "invoice_pdf",
  mime: "application/pdf",
  stored_blob_ref: "blob:sha256:def",
  linked_ir_id: "inv-1",
  link_confidence: 0.9,
}

describe("IR source + record-type predicates", () => {
  it("IR_SOURCES covers the 10 formats and isIrSource guards them", () => {
    expect(IR_SOURCES).toHaveLength(10)
    expect(isIrSource("fio")).toBe(true)
    expect(isIrSource("xlsx")).toBe(true)
    expect(isIrSource("pohoda_xml")).toBe(true)
    expect(isIrSource("pohoda_db")).toBe(true)
    expect(isIrSource("pohoda")).toBe(false) // retired — was ambiguous XML-vs-native-backup
    expect(isIrSource(42)).toBe(false)
  })

  it("IR_RECORD_TYPES covers the 5 records and isIrRecordType guards them", () => {
    expect(IR_RECORD_TYPES).toHaveLength(5)
    expect(isIrRecordType("invoice")).toBe(true)
    expect(isIrRecordType("ledger")).toBe(false)
  })
})

describe("source_trust — the untrusted prior-book axis", () => {
  it("defaults to primary when absent", () => {
    // a plain parsed fact carries no source_trust → treated as primary (the Brain books from it)
    expect(isUntrustedPrior(invoice)).toBe(false)
    expect(isUntrustedPrior({})).toBe(false)
  })

  it("flags a prior-book GLEntry as untrusted when tagged", () => {
    const priorBooking: GLEntry = {
      ...envelope("gl-prior", "pohoda_xml"),
      source_trust: "untrusted_prior",
      content_hash: undefined, // a bare GL row has no doc-number identity → won't collide with its source
      record_type: "gl_entry",
      date: "2025-05-01",
      debit_account: "501", // the previous accountant expensed it...
      credit_account: "321",
      amount_minor: 60_000_00n, // ...a 60k asset — the classic prior error to flag, not inherit
      description: "Notebook",
    }
    expect(isUntrustedPrior(priorBooking)).toBe(true)
  })
})

describe("IR record type guards narrow the discriminated union", () => {
  const records: IrRecord[] = [invoice, bank, cash, gl, attach]

  it("each guard matches only its own record_type", () => {
    expect(records.filter(isInvoice)).toEqual([invoice])
    expect(records.filter(isBankTransaction)).toEqual([bank])
    expect(records.filter(isCashDocument)).toEqual([cash])
    expect(records.filter(isGLEntry)).toEqual([gl])
    expect(records.filter(isAttachment)).toEqual([attach])
  })

  it("a narrowed invoice exposes its invoice-only fields", () => {
    const found = records.find(isInvoice)
    expect(found?.total_minor).toBe(121_00n)
    expect(found?.lines[0]?.description).toBe("Goods")
  })
})

describe("IR money is bigint minor units, never a native number", () => {
  it("amount/total/vat fields are bigint", () => {
    expect(typeof invoice.total_minor).toBe("bigint")
    expect(typeof invoice.vat_summary[0]?.base_minor).toBe("bigint")
    expect(typeof bank.amount_minor).toBe("bigint")
    expect(typeof cash.amount_minor).toBe("bigint")
    // signed bank amount: debit is negative
    expect(bank.amount_minor).toBeLessThan(0n)
  })
})

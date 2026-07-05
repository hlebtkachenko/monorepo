import { describe, expect, it } from "vitest"

import { CaptureAccountingDocumentRequestSchema } from "@workspace/shared/api"
import type { BankTransaction, CashDocument, Invoice } from "@workspace/brain"
import { BOOKABLE_IR_RECORD_TYPES } from "@workspace/brain"

import * as irToCapture from "./ir-to-capture"
import {
  bankToCapture,
  cashDocumentToCapture,
  invoiceToCapture,
  type IrToCaptureContext,
} from "./ir-to-capture"

const ctx: IrToCaptureContext = {
  periodId: "00000000-0000-4000-8000-000000000001",
  seriesId: "00000000-0000-4000-8000-000000000002",
  eventId: "00000000-0000-4000-8000-000000000003",
  confidence: 0.95,
  rationale: "Standard domestic service invoice, VAT 21% deductible.",
}

// The provenance envelope every IR record carries. The adapter never reads it, but the IR types require
// it, so a shared fixture keeps the record fixtures honest (real types, no casts).
const envelope = {
  ir_id: "ir-1",
  org_ref: "org-1",
  source: "isdoc" as const,
  source_locator: "dump/invoices/FP-0042.xml",
  source_hash: "hash-1",
  ingested_at: "2026-07-01T00:00:00.000Z",
  confidence: 0.95,
  needs_review: false,
  raw: {},
}

// A minimal but complete IR Invoice; per-test overrides tweak the fields under test.
const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  ...envelope,
  record_type: "invoice",
  direction: "received",
  doc_type: "invoice",
  number: "FP-2025-0042",
  issue_date: "2025-03-14",
  currency: "CZK",
  lines: [],
  vat_summary: [{ rate: 21, base_minor: 100000n, tax_minor: 21000n }],
  total_minor: 121000n,
  ...over,
})

const cashDocument = (over: Partial<CashDocument> = {}): CashDocument => ({
  ...envelope,
  record_type: "cash_document",
  direction: "expense",
  number: "PPD-2025-0007",
  date: "2025-03-14",
  amount_minor: 50000n,
  currency: "CZK",
  ...over,
})

// A minimal but complete IR BankTransaction. `amount_minor` is ALREADY SIGNED (+ credit / − debit);
// per-test overrides set the sign under test.
const bankTransaction = (
  over: Partial<BankTransaction> = {},
): BankTransaction => ({
  ...envelope,
  record_type: "bank_transaction",
  account: { account: "123456789", bank_code: "0800" },
  booking_date: "2025-03-14",
  amount_minor: -50000n,
  currency: "CZK",
  direction: "debit",
  message: "Platba dodavateli",
  ...over,
})

describe("invoiceToCapture", () => {
  it("(a) maps a STANDARD domestic invoice to a value that parses clean (round-trip)", () => {
    const request = invoiceToCapture(invoice(), ctx)
    // The round-trip proof: the adapter output satisfies the API contract exactly.
    expect(() =>
      CaptureAccountingDocumentRequestSchema.parse(request),
    ).not.toThrow()

    expect(request.type).toBe("RECEIVED_INVOICE")
    expect(request.periodId).toBe(ctx.periodId)
    expect(request.seriesId).toBe(ctx.seriesId)
    expect(request.lines).toHaveLength(1)
    expect(request.lines[0]!.eventId).toBe(ctx.eventId)
    const partial = request.lines[0]!.partials[0]!
    expect(partial.vatMode).toBe("STANDARD")
    expect(partial.vatRate).toBe("21")
    expect(partial.vatJurisdiction).toBe("DOMESTIC")
  })

  it("maps direction=issued to ISSUED_INVOICE", () => {
    const request = invoiceToCapture(invoice({ direction: "issued" }), ctx)
    expect(request.type).toBe("ISSUED_INVOICE")
  })

  it("(b) money round-trips exactly (haléř → decimal string)", () => {
    const request = invoiceToCapture(
      invoice({
        vat_summary: [{ rate: 21, base_minor: 100000n, tax_minor: 21000n }],
      }),
      ctx,
    )
    const partial = request.lines[0]!.partials[0]!
    // 100000 haléř = 1000.00 Kč; 21000 haléř = 210.00 Kč. NEVER base*rate, always the source tax field.
    expect(partial.baseAmount).toBe("1000.00")
    expect(partial.vatAmount).toBe("210.00")
  })

  it("(c) credit-note flips the sign of base + VAT", () => {
    const request = invoiceToCapture(invoice({ doc_type: "credit_note" }), ctx)
    expect(() =>
      CaptureAccountingDocumentRequestSchema.parse(request),
    ).not.toThrow()
    const partial = request.lines[0]!.partials[0]!
    expect(partial.baseAmount).toBe("-1000.00")
    expect(partial.vatAmount).toBe("-210.00")
  })

  it("(d) vatAmount is the source tax verbatim, never base*rate", () => {
    // A row whose declared tax does NOT equal base*rate: the adapter must emit the SOURCE tax (50.00), never
    // the computed base*rate (210.00). Synthesizing it would make the server's vat_mismatch check verify the
    // adapter against itself instead of against the document; the mismatch here is what the server SHOULD see.
    const request = invoiceToCapture(
      invoice({
        vat_summary: [{ rate: 21, base_minor: 100000n, tax_minor: 5000n }],
      }),
      ctx,
    )
    const partial = request.lines[0]!.partials[0]!
    expect(partial.vatAmount).toBe("50.00")
    expect(partial.vatAmount).not.toBe("210.00")
    expect(() =>
      CaptureAccountingDocumentRequestSchema.parse(request),
    ).not.toThrow()
  })

  it("(g) a 0-rate summary row is held (OUTSIDE_VAT), never asserted STANDARD 0%", () => {
    // A 0% row could be a genuine zero-rated supply OR a flattened EXEMPT one — the adapter must not guess
    // STANDARD (which the server veto passes through). It routes to OUTSIDE_VAT so the server holds it.
    const request = invoiceToCapture(
      invoice({
        vat_summary: [{ rate: 0, base_minor: 100000n, tax_minor: 0n }],
      }),
      ctx,
    )
    expect(() =>
      CaptureAccountingDocumentRequestSchema.parse(request),
    ).not.toThrow()
    const partial = request.lines[0]!.partials[0]!
    expect(partial.vatMode).toBe("OUTSIDE_VAT")
    expect(partial.vatMode).not.toBe("STANDARD")
    expect(partial.vatRate).toBeUndefined()
    expect(partial.baseAmount).toBe("1000.00")
  })

  it("(f) output carries no tenancy keys", () => {
    const request = invoiceToCapture(invoice(), ctx)
    const serialized = JSON.stringify(request, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    )
    for (const forbidden of [
      "organization_id",
      "user_id",
      "workspace_id",
      "role",
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})

describe("cashDocumentToCapture", () => {
  it("maps a cash document WITH a VAT summary to a STANDARD partial", () => {
    const request = cashDocumentToCapture(
      cashDocument({
        direction: "income",
        vat_summary: [{ rate: 21, base_minor: 100000n, tax_minor: 21000n }],
      }),
      ctx,
    )
    expect(() =>
      CaptureAccountingDocumentRequestSchema.parse(request),
    ).not.toThrow()
    expect(request.type).toBe("CASH_DOCUMENT")
    const partial = request.lines[0]!.partials[0]!
    expect(partial.vatMode).toBe("STANDARD")
    expect(partial.baseAmount).toBe("1000.00")
    expect(partial.vatAmount).toBe("210.00")
  })

  it("(e) a cash document with NO rate NEVER produces a STANDARD+null-rate partial", () => {
    const request = cashDocumentToCapture(cashDocument(), ctx)
    expect(() =>
      CaptureAccountingDocumentRequestSchema.parse(request),
    ).not.toThrow()
    const partial = request.lines[0]!.partials[0]!
    // The [G3-B1] invariant: no rate ⇒ NOT STANDARD (the server holds it via unverified_vat_regime).
    expect(partial.vatMode).not.toBe("STANDARD")
    expect(partial.vatRate).toBeUndefined()
    expect(partial.vatMode).toBe("OUTSIDE_VAT")
    // expense direction negates the base.
    expect(partial.baseAmount).toBe("-500.00")
  })

  it("no adapter output is EVER a STANDARD partial without a string vatRate", () => {
    // Cover both entry points across their rate-carrying and rate-less paths.
    const requests = [
      invoiceToCapture(invoice(), ctx),
      cashDocumentToCapture(cashDocument(), ctx),
      cashDocumentToCapture(
        cashDocument({
          vat_summary: [{ rate: 15, base_minor: 20000n, tax_minor: 3000n }],
        }),
        ctx,
      ),
    ]
    for (const request of requests) {
      for (const line of request.lines) {
        for (const partial of line.partials) {
          if (partial.vatMode === "STANDARD") {
            expect(typeof partial.vatRate).toBe("string")
          }
        }
      }
    }
  })
})

describe("bankToCapture", () => {
  it("maps a bank line to a value that parses clean (round-trip)", () => {
    const request = bankToCapture(bankTransaction(), ctx)
    expect(() =>
      CaptureAccountingDocumentRequestSchema.parse(request),
    ).not.toThrow()

    expect(request.type).toBe("BANK_STATEMENT")
    expect(request.periodId).toBe(ctx.periodId)
    expect(request.seriesId).toBe(ctx.seriesId)
    expect(request.issuedAt).toBe("2025-03-14")
    expect(request.lines).toHaveLength(1)
    expect(request.lines[0]!.eventId).toBe(ctx.eventId)
    expect(request.lines[0]!.partials).toHaveLength(1)
  })

  it("a DEBIT (negative amount_minor) yields a NEGATIVE base + a single OUTSIDE_VAT partial", () => {
    // amount_minor is ALREADY SIGNED (− debit); the adapter passes it through — no direction sign.
    const request = bankToCapture(
      bankTransaction({ amount_minor: -50000n, direction: "debit" }),
      ctx,
    )
    expect(() =>
      CaptureAccountingDocumentRequestSchema.parse(request),
    ).not.toThrow()
    const partial = request.lines[0]!.partials[0]!
    // −50000 haléř = −500.00 Kč. The sign is the SOURCE sign, NOT double-negated by direction.
    expect(partial.baseAmount).toBe("-500.00")
    expect(partial.vatMode).toBe("OUTSIDE_VAT")
    expect(request.lines[0]!.partials).toHaveLength(1)
  })

  it("a CREDIT (positive amount_minor) yields a POSITIVE base", () => {
    const request = bankToCapture(
      bankTransaction({
        amount_minor: 50000n,
        direction: "credit",
        message: "Platba od odberatele",
      }),
      ctx,
    )
    expect(() =>
      CaptureAccountingDocumentRequestSchema.parse(request),
    ).not.toThrow()
    const partial = request.lines[0]!.partials[0]!
    expect(partial.baseAmount).toBe("500.00")
    expect(partial.vatMode).toBe("OUTSIDE_VAT")
  })

  it("never fabricates a VAT rate/amount — a bank line has no VAT breakdown", () => {
    const request = bankToCapture(bankTransaction(), ctx)
    const partial = request.lines[0]!.partials[0]!
    expect(partial.vatMode).toBe("OUTSIDE_VAT")
    expect(partial.vatMode).not.toBe("STANDARD")
    expect(partial.vatRate).toBeUndefined()
    expect(partial.vatAmount).toBeUndefined()
    expect(partial.vatJurisdiction).toBeUndefined()
  })

  it("output carries no tenancy keys", () => {
    const request = bankToCapture(bankTransaction(), ctx)
    const serialized = JSON.stringify(request, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    )
    for (const forbidden of [
      "organization_id",
      "user_id",
      "workspace_id",
      "role",
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})

describe("GLEntry is never a booking source (Control 2)", () => {
  it("exports no glToCapture / gl_entry adapter", () => {
    // Belt-and-braces: the Brain re-derives postings from PRIMARY facts (invoice / bank / cash) and
    // treats a prior accountant's journal row (GLEntry) as import/reconcile-only. This module must never
    // grow a GLEntry booking adapter, so assert none exists on the module surface.
    const exportNames = Object.keys(irToCapture)
    for (const name of exportNames) {
      expect(name.toLowerCase()).not.toContain("gl")
    }
    expect(exportNames).not.toContain("glToCapture")
    expect(exportNames).not.toContain("glEntryToCapture")
  })

  it("the Control-2 bookable whitelist excludes gl_entry (invariant this adapter relies on)", () => {
    // The three record types that HAVE a *ToCapture adapter are exactly the bookable whitelist — and
    // gl_entry is not among them. If gl_entry ever entered the whitelist, this asserts loudly.
    expect(BOOKABLE_IR_RECORD_TYPES).toEqual([
      "invoice",
      "bank_transaction",
      "cash_document",
    ])
    expect(BOOKABLE_IR_RECORD_TYPES).not.toContain("gl_entry")
    expect(BOOKABLE_IR_RECORD_TYPES).not.toContain("attachment")
  })
})

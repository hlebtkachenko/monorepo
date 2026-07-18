import { describe, expect, it } from "vitest"

import {
  type CaptureAccountingDocumentRequest,
  CaptureAccountingDocumentRequestSchema,
  CreateAccountingEventRequestSchema,
} from "@workspace/shared/api"
import type {
  BankTransaction,
  CashDocument,
  Invoice,
  SupplyKind,
} from "@workspace/brain"
import { BOOKABLE_IR_RECORD_TYPES, BRAIN_SUPPLY_KINDS } from "@workspace/brain"

import * as irToCapture from "./ir-to-capture"
import {
  bankToCapture,
  cashDocumentToCapture,
  invoiceToCapture,
  invoiceToEvent,
  type IrToCaptureContext,
  type IrToEventContext,
} from "./ir-to-capture"

const ctx: IrToCaptureContext = {
  periodId: "00000000-0000-4000-8000-000000000001",
  seriesId: "00000000-0000-4000-8000-000000000002",
  eventId: "00000000-0000-4000-8000-000000000003",
  confidence: 0.95,
  rationale: "Standard domestic service invoice, VAT 21% deductible.",
}

const eventCtx: IrToEventContext = {
  periodId: "00000000-0000-4000-8000-000000000001",
  eventSeriesId: "00000000-0000-4000-8000-000000000009",
  confidence: 0.95,
  rationale: "Received invoice from a domestic supplier.",
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

  it("(h) threads a well-formed DUZP (taxPointDate); omits absent, never defaults to issue_date", () => {
    // The tax point (DUZP/DPPD, §21) drives the VAT-return period and is a DISTINCT legal date from the
    // §11/1d issue date. When the IR carries it, the capture must too — else the server leaves the VAT
    // period unresolved.
    const withDuzp = invoiceToCapture(
      invoice({ issue_date: "2025-03-14", tax_point_date: "2025-03-20" }),
      ctx,
    )
    expect(withDuzp.issuedAt).toBe("2025-03-14")
    expect(withDuzp.taxPointDate).toBe("2025-03-20")
    expect(() =>
      CaptureAccountingDocumentRequestSchema.parse(withDuzp),
    ).not.toThrow()
    // Absent in the IR → omitted, NEVER silently defaulted to the issue date (which would assert a wrong DUZP).
    const without = invoiceToCapture(invoice(), ctx)
    expect("taxPointDate" in without).toBe(false)
  })

  it("(h2) DROPS a malformed tax_point_date (datetime / impossible day) — never 400s the whole capture", () => {
    // The strict schema (`z.iso.date()`) rejects a datetime; the EVENT's occurredAt (lenient) would accept it,
    // so forwarding a datetime would create the event then 400 the capture, orphaning it. Dropping instead
    // leaves the DUZP unresolved (a state the server surfaces), and the capture still parses clean. And a date
    // is NEVER sliced off a datetime (UTC→Prague can shift the legal day ±1).
    for (const bad of ["2025-03-20T00:00:00Z", "2025-13-40", "2025-2-3", ""]) {
      const request = invoiceToCapture(invoice({ tax_point_date: bad }), ctx)
      expect("taxPointDate" in request).toBe(false)
      expect(() =>
        CaptureAccountingDocumentRequestSchema.parse(request),
      ).not.toThrow()
    }
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

describe("supply_kind threading (#779) — document-grounded, never fabricated", () => {
  it("stamps the document-grounded supply_kind on the STANDARD partial", () => {
    const request = invoiceToCapture(invoice({ supply_kind: "SERVICES" }), ctx)
    expect(() =>
      CaptureAccountingDocumentRequestSchema.parse(request),
    ).not.toThrow()
    expect(request.lines[0]!.partials[0]!.supplyKind).toBe("SERVICES")
  })

  it("stamps the same supply_kind on every rate bucket of a single-supply invoice", () => {
    const request = invoiceToCapture(
      invoice({
        supply_kind: "GOODS",
        vat_summary: [
          { rate: 21, base_minor: 100000n, tax_minor: 21000n },
          { rate: 12, base_minor: 50000n, tax_minor: 6000n },
        ],
      }),
      ctx,
    )
    expect(request.lines[0]!.partials).toHaveLength(2)
    for (const partial of request.lines[0]!.partials) {
      expect(partial.supplyKind).toBe("GOODS")
    }
  })

  it("omits supplyKind when the IR carries none → null the booker holds (fail-safe to identity)", () => {
    const request = invoiceToCapture(invoice(), ctx)
    expect(request.lines[0]!.partials[0]!.supplyKind).toBeUndefined()
    expect(() =>
      CaptureAccountingDocumentRequestSchema.parse(request),
    ).not.toThrow()
  })

  it("never stamps supplyKind on a rate-less OUTSIDE_VAT partial, even when the IR has one", () => {
    // A rate-0 row is held for VAT-regime review and the booker holds it too — it must stay supply-kind-null,
    // not carry a supply kind that would imply it is a bookable STANDARD partial.
    const request = invoiceToCapture(
      invoice({
        supply_kind: "SERVICES",
        vat_summary: [{ rate: 0, base_minor: 100000n, tax_minor: 0n }],
      }),
      ctx,
    )
    const partial = request.lines[0]!.partials[0]!
    expect(partial.vatMode).toBe("OUTSIDE_VAT")
    expect(partial.supplyKind).toBeUndefined()
  })

  it("parity: every BRAIN_SUPPLY_KINDS value is accepted by the capture contract (brain ⊆ capture)", () => {
    // Runtime drift guard: if the Brain IR set gains a value the capture SUPPLY_KIND enum rejects, this fails
    // loudly here rather than at a live write.
    for (const kind of BRAIN_SUPPLY_KINDS) {
      const request = invoiceToCapture(invoice({ supply_kind: kind }), ctx)
      expect(() =>
        CaptureAccountingDocumentRequestSchema.parse(request),
      ).not.toThrow()
      expect(request.lines[0]!.partials[0]!.supplyKind).toBe(kind)
    }
  })

  it("parity: capture-contract SUPPLY_KIND ⊆ Brain SupplyKind (compile-time identity)", () => {
    // The parameter + return types are a COMPILE-TIME bidirectional identity check: the parameter forces
    // SupplyKind ⊆ CaptureSupplyKind, the return type forces CaptureSupplyKind ⊆ SupplyKind. If EITHER enum
    // drifts, this stops type-checking. Calling it keeps it live (no unused symbol) and smoke-tests identity.
    type CaptureSupplyKind = NonNullable<
      CaptureAccountingDocumentRequest["lines"][number]["partials"][number]["supplyKind"]
    >
    const asBrainSupplyKind = (k: CaptureSupplyKind): SupplyKind => k
    for (const kind of BRAIN_SUPPLY_KINDS) {
      expect(asBrainSupplyKind(kind)).toBe(kind)
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

describe("gate envelope threading (extractionMethod / templateId / signals) — the W1.4 OCR-basis fields", () => {
  it("threads extractionMethod:'ocr' + a matched templateId + signals + conversationId onto the capture (the OCR path)", () => {
    const request = invoiceToCapture(invoice(), {
      ...ctx,
      extractionMethod: "ocr",
      templateId: "0196f1de-0000-7000-8000-0000000000e1",
      conversationId: "0196f1de-0000-7000-8000-0000000000c0",
      signals: { extractionQuality: 0.85, capSignals: ["novel_ico"] },
    })
    // Still a valid capture request with the whole gate envelope present.
    expect(() =>
      CaptureAccountingDocumentRequestSchema.parse(request),
    ).not.toThrow()
    expect(request.extractionMethod).toBe("ocr")
    expect(request.templateId).toBe("0196f1de-0000-7000-8000-0000000000e1")
    expect(request.conversationId).toBe("0196f1de-0000-7000-8000-0000000000c0")
    expect(request.signals).toEqual({
      extractionQuality: 0.85,
      capSignals: ["novel_ico"],
    })
  })

  it("sets extractionMethod:'structured' for a structured-export capture", () => {
    const request = invoiceToCapture(invoice(), {
      ...ctx,
      extractionMethod: "structured",
    })
    expect(request.extractionMethod).toBe("structured")
    // No template on a structured export → templateId omitted (not sent as null/undefined).
    expect("templateId" in request).toBe(false)
  })

  it("OMITS every optional gate field when the context did not supply it (absent, never undefined)", () => {
    const request = invoiceToCapture(invoice(), ctx)
    expect("extractionMethod" in request).toBe(false)
    expect("templateId" in request).toBe(false)
    expect("signals" in request).toBe(false)
    expect("conversationId" in request).toBe(false)
    // A missing extractionMethod is the server's fail-closed-to-'ocr' input — the client must not forge one.
    expect(() =>
      CaptureAccountingDocumentRequestSchema.parse(request),
    ).not.toThrow()
  })

  it("threads the gate envelope through the bank + cash adapters too (one source of truth)", () => {
    const bank = bankToCapture(bankTransaction(), {
      ...ctx,
      extractionMethod: "structured",
    })
    expect(bank.extractionMethod).toBe("structured")

    const cash = cashDocumentToCapture(cashDocument(), {
      ...ctx,
      extractionMethod: "ocr",
      templateId: "0196f1de-0000-7000-8000-0000000000e2",
    })
    expect(cash.extractionMethod).toBe("ocr")
    expect(cash.templateId).toBe("0196f1de-0000-7000-8000-0000000000e2")
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

describe("invoiceToEvent — IR invoice → accounting EVENT with the counterparty identity", () => {
  const supplier = {
    name: "Dodavatel s.r.o.",
    ico: "10000001",
    dic: "CZ10000001",
    address: { country: "CZ" },
  }
  const customer = { name: "Odběratel a.s.", ico: "20000002" }

  it("emits a valid CreateAccountingEventRequest for a received invoice (supplier identity)", () => {
    const request = invoiceToEvent(invoice({ supplier }), eventCtx)
    // Always re-validates against the SERVER's own request schema (the write is gated by it).
    expect(CreateAccountingEventRequestSchema.safeParse(request).success).toBe(
      true,
    )
    expect(request.periodId).toBe(eventCtx.periodId)
    // seriesId is the EVENT series, NOT any document series.
    expect(request.seriesId).toBe(eventCtx.eventSeriesId)
    expect(request.counterparty).toEqual({
      name: "Dodavatel s.r.o.",
      ico: "10000001",
      dic: "CZ10000001",
      countryCode: "CZ",
    })
  })

  it("picks the party by DIRECTION: issued → customer, received → supplier", () => {
    const received = invoiceToEvent(
      invoice({ direction: "received", supplier, customer }),
      eventCtx,
    )
    expect(received.counterparty?.name).toBe("Dodavatel s.r.o.")
    const issued = invoiceToEvent(
      invoice({ direction: "issued", supplier, customer }),
      eventCtx,
    )
    expect(issued.counterparty?.name).toBe("Odběratel a.s.")
  })

  it("occurredAt = tax_point_date ?? issue_date (the §11/1e plnění, not the §11/1d vyhotovení)", () => {
    expect(invoiceToEvent(invoice({ supplier }), eventCtx).occurredAt).toBe(
      "2025-03-14",
    )
    expect(
      invoiceToEvent(
        invoice({ supplier, tax_point_date: "2025-03-20" }),
        eventCtx,
      ).occurredAt,
    ).toBe("2025-03-20")
  })

  it("description = document number + party name (no synthetic FP/FV double-label), bounded to 2000", () => {
    expect(invoiceToEvent(invoice({ supplier }), eventCtx).description).toBe(
      "FP-2025-0042 — Dodavatel s.r.o.",
    )
    expect(
      invoiceToEvent(invoice({ direction: "issued", customer }), eventCtx)
        .description,
    ).toBe("FP-2025-0042 — Odběratel a.s.")
  })

  it("omits counterparty when there is no party (bare event still validates — reproduces today's behavior)", () => {
    const request = invoiceToEvent(invoice({ supplier: undefined }), eventCtx)
    expect(request.counterparty).toBeUndefined()
    expect(CreateAccountingEventRequestSchema.safeParse(request).success).toBe(
      true,
    )
    // description still satisfies min(1) — the number alone.
    expect(request.description).toBe("FP-2025-0042")
  })

  it("drops a malformed / foreign IČO (>8 digits or a country prefix) — never coerces, never crashes the CHECK", () => {
    const overlong = invoiceToEvent(
      invoice({ supplier: { name: "X GmbH", ico: "123456789" } }),
      eventCtx,
    )
    expect(overlong.counterparty).toEqual({ name: "X GmbH" })
    // A formatted IČO ("123 456 78") is normalized to digits when it fits.
    const spaced = invoiceToEvent(
      invoice({ supplier: { name: "Y", ico: "123 456 78" } }),
      eventCtx,
    )
    expect(spaced.counterparty?.ico).toBe("12345678")
    // A prefixed / foreign identifier ("SK12345678") is NOT a bare Czech IČO: the fix REJECTS it rather than
    // stripping the "SK" and binding the wrong-but-real Czech company that holds "12345678". Falls through
    // to the DIČ, so the counterparty identity is preserved — just never as a fabricated Czech IČO.
    const foreign = invoiceToEvent(
      invoice({
        supplier: {
          name: "Slovák s.r.o.",
          ico: "SK12345678",
          dic: "SK12345678",
        },
      }),
      eventCtx,
    )
    expect(foreign.counterparty?.ico).toBeUndefined()
    expect(foreign.counterparty?.dic).toBe("SK12345678")
  })

  it("drops a non-2-letter country (free-form IR) — never coerces 'Česká republika' to 'CZ'", () => {
    const request = invoiceToEvent(
      invoice({
        supplier: { name: "Z", address: { country: "Česká republika" } },
      }),
      eventCtx,
    )
    expect(request.counterparty).toEqual({ name: "Z" })
    // A genuine alpha-2 is uppercased and kept.
    const de = invoiceToEvent(
      invoice({ supplier: { name: "W", address: { country: "de" } } }),
      eventCtx,
    )
    expect(de.counterparty?.countryCode).toBe("DE")
  })

  it("an individual (no IČO/DIČ) emits name-only — never synthesizes an IČO", () => {
    const request = invoiceToEvent(
      invoice({ supplier: { name: "Jan Novák", is_individual: true } }),
      eventCtx,
    )
    expect(request.counterparty).toEqual({ name: "Jan Novák" })
  })

  it("emits NO tenancy keys and NO capture-only gate fields (templateId / extractionMethod)", () => {
    const request = invoiceToEvent(invoice({ supplier }), {
      ...eventCtx,
      conversationId: "00000000-0000-4000-8000-0000000000c1",
    })
    for (const forbidden of [
      "organization_id",
      "user_id",
      "workspace_id",
      "role",
      "templateId",
      "extractionMethod",
    ]) {
      expect(request).not.toHaveProperty(forbidden)
    }
    // conversationId is single-sourced from the context (present only when supplied).
    expect(request.conversationId).toBe("00000000-0000-4000-8000-0000000000c1")
    expect(invoiceToEvent(invoice({ supplier }), eventCtx)).not.toHaveProperty(
      "conversationId",
    )
  })
})

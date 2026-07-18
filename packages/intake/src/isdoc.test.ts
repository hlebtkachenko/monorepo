import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { isInvoice, type Invoice } from "@workspace/brain"
import { parseIsdoc } from "./isdoc"
import { invoiceToCapture, type IrToCaptureContext } from "./ir-to-capture"
import type { ParseContext } from "./types"

const FIXTURES = fileURLToPath(
  new URL("./__fixtures__/isdoc/", import.meta.url),
)

/** The two party IČOs the filing fixtures use (supplier/customer vary per document — see each test). */
const SUPPLIER_A = "12345678" // 01/02/05 supplier
const CUSTOMER_A = "87654321" // 01/02/05 customer AND 06/07/09/10 supplier

function bytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURES + name + ".isdoc"))
}

function ctxFor(subjectIco?: string, subjectDic?: string): ParseContext {
  return {
    orgRef: "book:org-unresolved",
    sourcePath: `folder/${subjectIco ?? "none"}.isdoc`,
    ingestedAt: "2026-07-18T00:00:00.000Z",
    ...(subjectIco ? { subjectIco } : {}),
    ...(subjectDic ? { subjectDic } : {}),
  }
}

/** Parse a fixture, assert exactly one Invoice record + no warnings, return it. */
function parseOne(name: string, ctx: ParseContext): Invoice {
  const { records, warnings } = parseIsdoc(bytes(name), ctx)
  expect(warnings).toHaveLength(0)
  expect(records).toHaveLength(1)
  const record = records[0]!
  expect(isInvoice(record)).toBe(true)
  return record as Invoice
}

const captureCtx: IrToCaptureContext = {
  periodId: "00000000-0000-4000-8000-000000000001",
  seriesId: "00000000-0000-4000-8000-000000000002",
  eventId: "00000000-0000-4000-8000-000000000003",
  confidence: 0.9,
  rationale: "test",
}

describe("parseIsdoc — direction (subject-relative)", () => {
  it("subject == customer → received (FP), with source-verbatim VAT + total", () => {
    const inv = parseOne("01-common", ctxFor(CUSTOMER_A))
    expect(inv.direction).toBe("received")
    expect(inv.doc_type).toBe("invoice")
    expect(inv.number).toBe("FP-2025-001")
    expect(inv.currency).toBe("CZK")
    expect(inv.supplier?.ico).toBe(SUPPLIER_A)
    expect(inv.supplier?.name).toBe("Dodavatel Alpha s.r.o.")
    expect(inv.vat_summary).toEqual([
      { rate: 21, base_minor: 100000n, tax_minor: 21000n },
    ])
    expect(inv.total_minor).toBe(121000n)
    expect(inv.payment_method).toBe("transfer")
    expect(inv.variable_symbol).toBe("2025000001")
  })

  it("subject == supplier → issued (FV) for the SAME document", () => {
    const inv = parseOne("01-common", ctxFor(SUPPLIER_A))
    expect(inv.direction).toBe("issued")
  })

  it("no subject identity → fail closed (no record + a direction warning)", () => {
    const { records, warnings } = parseIsdoc(bytes("01-common"), ctxFor())
    expect(records).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.message).toMatch(/direction is indeterminate/)
  })

  it("subject matches neither party → fail closed", () => {
    const { records, warnings } = parseIsdoc(
      bytes("01-common"),
      ctxFor("99999999"),
    )
    expect(records).toHaveLength(0)
    expect(warnings[0]!.message).toMatch(/direction is indeterminate/)
  })

  it("resolves direction by DIČ when the IČO is not the match key", () => {
    const inv = parseOne("01-common", ctxFor(undefined, "CZ87654321"))
    expect(inv.direction).toBe("received")
  })
})

describe("parseIsdoc — credit note (double-negation guard)", () => {
  it("emits POSITIVE magnitudes + doc_type credit_note; invoiceToCapture flips ONCE to negative", () => {
    const inv = parseOne("05-credit-note", ctxFor(CUSTOMER_A))
    expect(inv.doc_type).toBe("credit_note")
    // The ISDOC amounts are NEGATIVE (-200 / -42 / -242); the IR carries positive magnitudes...
    expect(inv.vat_summary).toEqual([
      { rate: 21, base_minor: 20000n, tax_minor: 4200n },
    ])
    expect(inv.total_minor).toBe(24200n)
    // ...and the capture flips exactly once → a negative dobropis, never a double-negated positive one.
    const capture = invoiceToCapture(inv, captureCtx)
    const partial = capture.lines[0]!.partials[0]!
    expect(partial.baseAmount).toBe("-200.00")
    expect(partial.vatAmount).toBe("-42.00")
    expect(partial.vatMode).toBe("STANDARD")
  })
})

describe("parseIsdoc — reverse charge (PDP §92)", () => {
  it("flags the vat_summary row reverse_charge; the capture routes it to the OUTSIDE_VAT hold", () => {
    const inv = parseOne("09-pdp", ctxFor(CUSTOMER_A)) // supplier of 09 is 87654321 → issued
    expect(inv.direction).toBe("issued")
    expect(inv.vat_summary).toEqual([
      { rate: 21, base_minor: 16500000n, tax_minor: 0n, reverse_charge: true },
    ])
    const partial = invoiceToCapture(inv, captureCtx).lines[0]!.partials[0]!
    // OUTSIDE_VAT with NO rate/vatAmount — the adapter never asserts REVERSE_CHARGE; the server classifies.
    expect(partial.vatMode).toBe("OUTSIDE_VAT")
    expect(partial.baseAmount).toBe("165000.00")
    expect(partial.vatRate).toBeUndefined()
    expect(partial.vatAmount).toBeUndefined()
  })
})

describe("parseIsdoc — foreign currency", () => {
  it("books the LOCAL (CZK) amounts, keeps EUR + rate as fx_rate provenance", () => {
    const inv = parseOne("10-non-czk", ctxFor(CUSTOMER_A)) // supplier 87654321 → issued
    expect(inv.currency).toBe("CZK")
    // The CZK local TaxableAmount is 25200.00 (NOT the 1000.00 EUR *Curr variant).
    expect(inv.vat_summary[0]!.base_minor).toBe(2520000n)
    expect(inv.fx_rate).toEqual({ rate: 25.2, ref_units: 1 })
  })
})

describe("parseIsdoc — payment method + document types", () => {
  it("maps a cash payment (PaymentMeansCode 10) to payment_method cash", () => {
    const inv = parseOne("02-cash", ctxFor(CUSTOMER_A))
    expect(inv.payment_method).toBe("cash")
    expect(inv.doc_type).toBe("invoice")
  })

  it("maps a simplified doc (DocumentType 7, anonymous customer) — issued, no customer", () => {
    const inv = parseOne("07-simplified", ctxFor(CUSTOMER_A)) // supplier 87654321 → issued
    expect(inv.doc_type).toBe("simplified")
    expect(inv.direction).toBe("issued")
    expect(inv.customer).toBeUndefined()
    expect(inv.payment_method).toBe("cash")
  })

  it("maps an advance tax document (DocumentType 5) and flags it needs_review", () => {
    const inv = parseOne("06-advance", ctxFor(CUSTOMER_A)) // supplier 87654321 → issued
    expect(inv.doc_type).toBe("advance")
    expect(inv.direction).toBe("issued")
    expect(inv.needs_review).toBe(true)
  })
})

describe("parseIsdoc — provenance + fail-closed", () => {
  it("stamps the isdoc provenance envelope", () => {
    const inv = parseOne("01-common", ctxFor(CUSTOMER_A))
    expect(inv.source).toBe("isdoc")
    expect(inv.source_locator).toContain("#Invoice")
    expect(typeof inv.ir_id).toBe("string")
    expect(inv.source_hash).toHaveLength(64)
  })

  it("refuses a non-ISDOC XML (no <Invoice> root)", () => {
    const xml = new TextEncoder().encode("<?xml version='1.0'?><Foo/>")
    const { records, warnings } = parseIsdoc(xml, ctxFor(CUSTOMER_A))
    expect(records).toHaveLength(0)
    expect(warnings[0]!.message).toMatch(/not an ISDOC document/)
  })

  it("refuses malformed XML with a warning, never a half-built record", () => {
    const xml = new TextEncoder().encode("<Invoice><unclosed>")
    const { records } = parseIsdoc(xml, ctxFor(CUSTOMER_A))
    expect(records).toHaveLength(0)
  })
})

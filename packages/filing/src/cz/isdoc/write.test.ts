import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse } from "../../xml/parse"
import { validateFiling } from "../../validate/validate"
import { IsdocInvoiceSchema } from "../../model/isdoc"
import { generateIsdoc } from "./write"

const FIXTURES_DIR = fileURLToPath(
  new URL("../../../fixtures/isdoc/", import.meta.url),
)
const fixtures = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(FIXTURES_DIR + name, "utf8"))
}

describe("ISDOC 6.0.1 writer", () => {
  it("ships all 10 reference fixtures", () => {
    expect(fixtures.length).toBe(10)
  })

  // The primary gate: real serialization exercised against the official XSD.
  for (const name of fixtures) {
    it(`${name} → XML validates against the official ISDOC XSD`, async () => {
      const input = loadFixture(name)
      // The Zod model accepts every fixture (the UI seam).
      expect(() => IsdocInvoiceSchema.parse(input)).not.toThrow()
      const xml = generateIsdoc(input)
      const result = await validateFiling(xml, "isdoc", "6.0.1")
      expect(result.errors).toEqual([])
      expect(result.valid).toBe(true)
    })
  }

  it("emits the correct root: namespace + version 6.0.1", () => {
    const xml = generateIsdoc(loadFixture("01-common.json"))
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    const tree = parse(xml) as { Invoice: Record<string, string> }
    expect(tree.Invoice["@_xmlns"]).toBe("http://isdoc.cz/namespace/2013")
    expect(tree.Invoice["@_version"]).toBe("6.0.1")
    expect(tree.Invoice.ID).toBe("FP-2025-001")
  })

  it("common invoice totals reconcile (1000 @ 21% → 210 tax, 1210 incl.)", () => {
    const xml = generateIsdoc(loadFixture("01-common.json"))
    expect(xml).toContain("<TaxableAmount>1000.00</TaxableAmount>")
    expect(xml).toContain("<TaxAmount>210.00</TaxAmount>")
    expect(xml).toContain("<TaxInclusiveAmount>1210.00</TaxInclusiveAmount>")
    expect(xml).toContain("<PayableAmount>1210.00</PayableAmount>")
  })

  it("PDP: reverse-charge lines carry the code/flag and self-assess zero tax", () => {
    const xml = generateIsdoc(loadFixture("09-pdp.json"))
    expect(xml).toContain("<LocalReverseChargeCode>4</LocalReverseChargeCode>")
    expect(xml).toContain(
      "<LocalReverseChargeFlag>true</LocalReverseChargeFlag>",
    )
    // 120000 + 45000 base, PDP → tax 0, inclusive == base
    expect(xml).toContain("<TaxableAmount>165000.00</TaxableAmount>")
    expect(xml).toContain("<TaxAmount>0.00</TaxAmount>")
  })

  it("non-VAT supplier omits PartyTaxScheme and sets VATApplicable=false", () => {
    const xml = generateIsdoc(loadFixture("03-non-vat-supplier.json"))
    expect(xml).toContain("<VATApplicable>false</VATApplicable>")
  })

  it("non-CZK invoice emits foreign currency code + Curr variants", () => {
    const xml = generateIsdoc(loadFixture("10-non-czk.json"))
    expect(xml).toContain("<ForeignCurrencyCode>EUR</ForeignCurrencyCode>")
    expect(xml).toContain("<LineExtensionAmountCurr>")
  })

  it("round-trips: parse(generate(x)) recovers structure", () => {
    const xml = generateIsdoc(loadFixture("01-common.json"))
    const tree = parse(xml) as { Invoice: Record<string, unknown> }
    expect(tree.Invoice.DocumentType).toBe("1")
    expect(tree.Invoice.UUID).toBe("11111111-1111-4111-8111-111111111111")
  })

  // Advisor gate finding 1: empty-string party fields must fall back to the
  // non-empty defaults (|| like the reference's `or`), not emit empty elements.
  it("empty-string party fields fall back to their defaults", () => {
    const xml = generateIsdoc({
      invoice_id: "X",
      issue_date: "2025-01-01",
      due_date: "2025-01-15",
      supplier: {
        name: "S",
        ico: "",
        dic: "",
        country_code: "",
        country_name: "",
      },
      customer: { name: "C" },
      lines: [
        { description: "d", qty: "1", unit_price_base: "100", vat_rate: "21" },
      ],
      payment_method: 42,
      bank: { account: "1", code: "0100", name: "KB", iban: "CZ", bic: "X" },
    })
    expect(xml).toContain("<ID>00000000</ID>")
    expect(xml).toContain("<IdentificationCode>CZ</IdentificationCode>")
    expect(xml).not.toContain("<ID/>")
    expect(xml).not.toContain("<IdentificationCode/>")
  })

  // Advisor gate finding 2: a trailing-zero rate spelling ("21.0") must still
  // match its already_claimed.by_rate entry (keys normalized through Decimal).
  it("already_claimed.by_rate matches a trailing-zero rate spelling", () => {
    const xml = generateIsdoc({
      invoice_id: "ADV",
      doc_type: "5",
      issue_date: "2025-01-01",
      due_date: "2025-01-15",
      supplier: { name: "S", dic: "CZ1" },
      customer: { name: "C", dic: "CZ2" },
      lines: [
        {
          description: "advance",
          qty: "1",
          unit_price_base: "100000",
          vat_rate: "21.0",
        },
      ],
      already_claimed: {
        tax_exclusive: "30000",
        tax_inclusive: "36300",
        by_rate: {
          "21.0": { taxable: "30000", tax: "6300", inclusive: "36300" },
        },
      },
      payment_method: 42,
      bank: { account: "1", code: "0100", name: "KB", iban: "CZ", bic: "X" },
    })
    expect(xml).toContain(
      "<AlreadyClaimedTaxableAmount>30000.00</AlreadyClaimedTaxableAmount>",
    )
    expect(xml).toContain(
      "<DifferenceTaxableAmount>70000.00</DifferenceTaxableAmount>",
    )
  })
})

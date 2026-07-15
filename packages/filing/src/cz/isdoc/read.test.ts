import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { validateFiling } from "../../validate/validate"
import { generateIsdoc } from "./write"
import { readIsdoc } from "./read"

const FIXTURES_DIR = fileURLToPath(
  new URL("../../../fixtures/isdoc/", import.meta.url),
)
const fixtures = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(FIXTURES_DIR + name, "utf8"))
}

describe("ISDOC 6.0.1 reader (round-trip)", () => {
  // generate → read → generate must be idempotent, and the result still valid.
  for (const name of fixtures) {
    it(`${name} round-trips: generate → read → generate is stable + valid`, async () => {
      const xml1 = generateIsdoc(loadFixture(name))
      const model = readIsdoc(xml1)
      const xml2 = generateIsdoc(model)
      expect(xml2).toBe(xml1)
      const result = await validateFiling(xml2, "isdoc", "6.0.1")
      expect(result.valid).toBe(true)
    })
  }

  it("recovers the key editable fields from an uploaded document", () => {
    const model = readIsdoc(generateIsdoc(loadFixture("01-common.json")))
    expect(model.invoice_id).toBe("FP-2025-001")
    expect(model.doc_type).toBe("1")
    expect(model.supplier.name).toBe("Dodavatel Alpha s.r.o.")
    expect(model.supplier.is_vat_payer).toBe(true)
    expect(model.lines).toHaveLength(1)
    expect(model.lines[0]!.unit_price_base).toBe("1000.00")
    expect(model.lines[0]!.vat_rate).toBe("21")
    expect(model.payment_method).toBe(42)
    expect(model.bank?.iban).toBe("CZ6501000000001234567890")
  })

  it("recovers the anonymous-customer branch (doc_type 7)", () => {
    const model = readIsdoc(generateIsdoc(loadFixture("07-simplified.json")))
    expect(model.customer).toBeUndefined()
    expect(model.anonymous_customer?.id).toBe("CZ-ANON-0007")
    expect(model.cash?.receipt_id).toBe("PV-2025-007")
  })

  it("recovers PDP reverse-charge lines", () => {
    const model = readIsdoc(generateIsdoc(loadFixture("09-pdp.json")))
    expect(model.lines[0]!.reverse_charge).toBe(true)
    expect(model.lines[0]!.reverse_charge_code).toBe("4")
  })

  it("recovers foreign currency", () => {
    const model = readIsdoc(generateIsdoc(loadFixture("10-non-czk.json")))
    expect(model.currency?.foreign).toBe("EUR")
    expect(model.currency?.rate).toBe("25.20")
  })

  it("rejects a non-ISDOC document", () => {
    expect(() => readIsdoc("<?xml version='1.0'?><Foo/>")).toThrow(
      /not an ISDOC/,
    )
  })
})

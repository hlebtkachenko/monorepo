import { describe, expect, it } from "vitest"

import { generateDphshv } from "./write"
import { readDphshv } from "./read"
import { validateFiling } from "../../../validate/validate"
import { buildDphshvFromAccounting, type ShData } from "../adapter"
import type { DphshvInput } from "../../../model/dphshv"

const meta = {
  rok: "2026",
  mesic: "6",
  c_ufo: "451",
  dic: "CZ12345678",
  name: "ACME s.r.o.",
}

const minimal: DphshvInput = {
  header: { rok: "2026", mesic: "6" },
  payer: { c_ufo: "451", dic: "CZ12345678", zkrobchjm: "ACME s.r.o." },
}

const sh: ShData = {
  rows: [
    {
      country_code: "DE",
      tax_id: "DE123456789",
      kod_plneni: "0",
      count: 3,
      value: "150000.00",
    },
    {
      country_code: "SK",
      tax_id: "SK2020123456",
      kod_plneni: "3",
      count: 1,
      value: "42000.00",
    },
  ],
}

describe("generateDphshv", () => {
  it("emits an XSD-valid minimal recapitulative statement", async () => {
    const xml = generateDphshv(minimal)
    expect(xml).toContain('<DPHSHV verzePis="02.01.04"')
    // Forma defaults to "R" (souhrnné hlášení), never the "B" of DPHDP3/DPHKH1.
    expect(xml).toContain('shvies_forma="R"')
    const result = await validateFiling(xml, "dphshv", "02.01.04")
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("emits one VetaR per counterparty with the country prefix split off", async () => {
    const xml = generateDphshv(buildDphshvFromAccounting(sh, meta))
    expect(xml).toContain('k_stat="DE"')
    expect(xml).toContain('c_vat="123456789"')
    expect(xml).toContain('k_stat="SK"')
    expect(xml).toContain('c_vat="2020123456"')
    expect(xml).toContain('k_pln_eu="3"')
    expect(xml).toContain('pln_pocet="3"')
    const result = await validateFiling(xml, "dphshv", "02.01.04")
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("rounds hodnota plnění UP to whole koruna, not half-up", () => {
    const xml = generateDphshv(
      buildDphshvFromAccounting(
        { rows: [{ ...sh.rows[0]!, value: "150000.01" }] },
        meta,
      ),
    )
    expect(xml).toContain('pln_hodnota="150001"')
  })

  it("keeps letters in an Irish or Dutch VAT id after stripping the prefix", () => {
    const xml = generateDphshv(
      buildDphshvFromAccounting(
        {
          rows: [
            {
              country_code: "IE",
              tax_id: "IE1234567FA",
              kod_plneni: "0",
              count: 1,
              value: "1000",
            },
          ],
        },
        meta,
      ),
    )
    expect(xml).toContain('c_vat="1234567FA"')
  })

  it("emits a row whose counterparty has no VAT id rather than dropping the value", () => {
    const xml = generateDphshv(
      buildDphshvFromAccounting(
        {
          rows: [
            {
              country_code: null,
              tax_id: null,
              kod_plneni: "0",
              count: 1,
              value: "9000",
            },
          ],
        },
        meta,
      ),
    )
    expect(xml).toContain("<VetaR")
    expect(xml).toContain('pln_hodnota="9000"')
    expect(xml).not.toContain("k_stat=")
  })

  it("carries a storno row and its call-off section through the writer", async () => {
    const xml = generateDphshv({
      header: { shvies_forma: "N", rok: "2026", mesic: "6" },
      payer: { c_ufo: "451", dic: "CZ12345678" },
      rows: [
        { c_rad: "1", k_storno: "A", k_stat: "DE", c_vat: "123456789", k_pln_eu: "0" }, // prettier-ignore
      ],
      callOff: [{ c_rad: "1", k_stat: "DE", c_vat: "123456789", k_cos: "1" }],
    })
    expect(xml).toContain('shvies_forma="N"')
    expect(xml).toContain('k_storno="A"')
    expect(xml).toContain("<VetaS")
    const result = await validateFiling(xml, "dphshv", "02.01.04")
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("round-trips generate → read → generate", () => {
    const xml1 = generateDphshv(buildDphshvFromAccounting(sh, meta))
    const xml2 = generateDphshv(readDphshv(xml1))
    expect(xml2).toBe(xml1)
  })

  it("reads the recap rows back as an array", () => {
    const model = readDphshv(
      generateDphshv(buildDphshvFromAccounting(sh, meta)),
    )
    expect(model.rows).toHaveLength(2)
    expect(model.rows?.[0]?.c_vat).toBe("123456789")
    expect(model.rows?.[1]?.k_pln_eu).toBe("3")
  })
})

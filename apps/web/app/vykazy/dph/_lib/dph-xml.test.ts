import { describe, expect, it } from "vitest"

import { buildDphXml } from "./dph-xml"
import type { DphEvidence } from "./dph-evidence"
import type { DphOrgMeta } from "./dph-project"

// End-to-end: evidence -> projection -> model -> XML -> official XSD.
//
// This is the test that would have caught the module shipping unusable. `c_ufo`
// was hardcoded to "", it is `use="required"` on VetaP of all three schemas, and
// the envelope omits an empty attribute rather than emitting `attr=""` — so every
// document failed validation and the download button, which gates on
// `xsd.valid`, could never appear. Every unit test still passed, because none of
// them ran the document past the schema.

const meta: DphOrgMeta = {
  c_ufo: "451",
  dic: "CZ12345678",
  typ_ds: "P",
  nazev: "ACME s.r.o.",
  naz_obce: "Praha",
  ulice: "Dlouhá",
  psc: "11000",
}

function evidence(over: Partial<DphEvidence> = {}): DphEvidence {
  return {
    version: 1,
    rok: "2026",
    mesic: "6",
    manual: {},
    rows: [
      {
        id: "out",
        smer: "vystup",
        dppd: "15.6.2026",
        evc: "2026001",
        dic: "CZ87654321",
        radek: "1",
        sazba: 21,
        zaklad: "100000",
        dan: "21000",
        khSekce: "A4",
      },
      {
        id: "in",
        smer: "vstup",
        dppd: "20.6.2026",
        evc: "2026/447",
        dic: "CZ11223344",
        radek: "40",
        sazba: 21,
        zaklad: "50000",
        dan: "10500",
        khSekce: "B2",
      },
      {
        id: "eu",
        smer: "vystup",
        dppd: "25.6.2026",
        evc: "2026002",
        dic: "SK1234567890",
        radek: "20",
        sazba: 0,
        zaklad: "250000",
        dan: "0",
        shKod: "0",
      },
    ],
    ...over,
  }
}

describe("buildDphXml against the official XSDs", () => {
  it.each(["priznani", "kh", "sh"] as const)(
    "produces a schema-valid %s",
    async (kind) => {
      const result = await buildDphXml(kind, evidence(), meta)
      expect(result.ok).toBe(true)
      expect(result.xsd?.errors ?? []).toEqual([])
      expect(result.xsd?.valid).toBe(true)
    },
  )

  it("fails validation without a finanční úřad, which is why the UI demands one", async () => {
    const result = await buildDphXml("priznani", evidence(), {
      ...meta,
      c_ufo: "",
    })
    expect(result.xsd?.valid).toBe(false)
    expect(result.xsd?.errors.join(" ")).toContain("c_ufo")
  })

  it("carries the odpočet in the V plné výši column, so ř.63 is not zero", async () => {
    const result = await buildDphXml("priznani", evidence(), meta)
    // ř.40 V plné výši = odp_tuz23_nar, and ř.63 (odp_zocelk) foots from it.
    expect(result.xml).toContain('odp_tuz23_nar="10500"')
    expect(result.xml).toContain('odp_zocelk="10500"')
    expect(result.xml).toContain('dano_da="10500"')
  })

  it("splits the A.2 VAT id and keeps a 12-character id under maxLength", async () => {
    const e = evidence()
    e.rows = [
      {
        id: "a2",
        smer: "vstup",
        dppd: "20.6.2026",
        evc: "NL-9",
        dic: "NL123456789B01",
        radek: "3",
        sazba: 21,
        zaklad: "10000",
        dan: "2100",
        khSekce: "A2",
      },
    ]
    const result = await buildDphXml("kh", e, meta)
    expect(result.xsd?.valid).toBe(true)
    expect(result.xml).toContain('k_stat="NL"')
    expect(result.xml).toContain('vatid_dod="123456789B01"')
  })

  it("emits a dodatečné přiznání with ř.66 and without ř.64/65", async () => {
    const result = await buildDphXml(
      "priznani",
      evidence({ forma: "D", dZjist: "1.7.2026" }),
      meta,
    )
    expect(result.xsd?.valid).toBe(true)
    expect(result.xml).toContain('dano="10500"')
    expect(result.xml).not.toContain("dano_da=")
    expect(result.xml).not.toContain("dano_no=")
  })

  it("emits a následné souhrnné hlášení whose storno row survives the merge", async () => {
    const e = evidence({ shForma: "N", shObdobi: "mesic" })
    e.rows = [
      { id: "s", smer: "vystup", dppd: "15.6.2026", evc: "F1", dic: "SK1234567890", radek: "20", sazba: 0, zaklad: "1000", dan: "0", shKod: "0", shStorno: true }, // prettier-ignore
      { id: "r", smer: "vystup", dppd: "15.6.2026", evc: "F1", dic: "SK1234567890", radek: "20", sazba: 0, zaklad: "2000", dan: "0", shKod: "0" }, // prettier-ignore
    ]
    const result = await buildDphXml("sh", e, meta)
    expect(result.xsd?.valid).toBe(true)
    // Two rows, not one: FÚ matches the storno to the original on the same
    // (k_stat, c_vat, k_pln_eu) triple, so merging them would cancel the
    // correction against itself.
    expect(result.xml?.match(/<VetaR\b/g)).toHaveLength(2)
    expect(result.xml).toContain('k_storno="A"')
  })
})

describe("the two remaining gaps, against the schema", () => {
  it("emits call-off stock as VetaS and still validates", async () => {
    const e = evidence()
    e.callOff = [
      { id: "1", dic: "SK1234567890", kod: "1" },
      { id: "2", dic: "DE123456789", kod: "3", dicPuvodni: "ATU12345678" },
    ]
    const result = await buildDphXml("sh", e, meta)
    expect(result.xsd?.errors ?? []).toEqual([])
    expect(result.xsd?.valid).toBe(true)
    expect(result.xml?.match(/<VetaS\b/g)).toHaveLength(2)
    expect(result.xml).toContain('k_cos="3"')
    // On a change of acquirer the schema wants BOTH ids on the row.
    expect(result.xml).toContain('c_vat_puv="U12345678"')
  })

  it("files a pre-2024 oprava into the third rate bucket and still validates", async () => {
    const e = evidence()
    e.rows = [
      { id: "p15", smer: "vystup", dppd: "15.6.2023", evc: "2023001", dic: "CZ87654321", radek: "2", sazba: 15, zaklad: "2000", dan: "300", khSekce: "A4" }, // prettier-ignore
      { id: "p10", smer: "vystup", dppd: "15.6.2023", evc: "2023002", dic: "CZ87654321", radek: "2", sazba: 10, zaklad: "3000", dan: "300", khSekce: "A4" }, // prettier-ignore
    ]
    const result = await buildDphXml("kh", e, meta)
    expect(result.xsd?.errors ?? []).toEqual([])
    expect(result.xsd?.valid).toBe(true)
    // 15 % rides in bucket 2 next to today's 12 %; 10 % gets bucket 3.
    expect(result.xml).toContain('zakl_dane2="2000.00"')
    expect(result.xml).toContain('zakl_dane3="3000.00"')
    expect(result.xml).toContain('dan3="300.00"')
  })
})

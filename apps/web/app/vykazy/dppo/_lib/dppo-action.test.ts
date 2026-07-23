import { describe, expect, it } from "vitest"

import { buildDppoXml } from "./dppo-action"

// Golden: a minimal legal-person return (checksum-valid IČO 12345679, ZO 2024 →
// 21 %) round-trips through adapter → writer → XSD validator cleanly, with the
// účetní výsledek and rate landing on the VetaO attributes the adapter maps.
describe("buildDppoXml", () => {
  it("produces an XSD-valid DPPDP9 with účetní výsledek + rate on VetaO", async () => {
    const res = await buildDppoXml(
      {
        ucetni_vysledek: "1000000",
        nedanove_naklady: "50000",
        osvobozene_vynosy: "0",
        odpocet_ztraty: "0",
        slevy: "0",
        sazba: "0.21",
      },
      {
        zdobd_od: "1.1.2024",
        zdobd_do: "31.12.2024",
        c_ufo_cil: "451",
        dic: "CZ12345679",
        name: "Test s.r.o.",
        naz_obce: "Praha",
        ulice: "Nádražní",
        c_pop: "12",
        psc: "11000",
      },
    )

    expect(res.ok).toBe(true)
    expect(res.xsd?.valid).toBe(true)
    expect(res.xsd?.errors).toEqual([])
    expect(res.xml).toContain('kc_ii10_10="1000000"')
    expect(res.xml).toContain('kc_ii270_280="21"')
  })

  it("routes the odpisy differences to ř.50 / ř.150 and still foots XSD-valid", async () => {
    const res = await buildDppoXml(
      {
        ucetni_vysledek: "1000000",
        nedanove_naklady: "50000",
        odpisy_ucetni_nad_danove: "30000", // ř.50 (base-increasing)
        osvobozene_vynosy: "0",
        odpisy_danove_nad_ucetni: "12000", // ř.150 (base-decreasing)
        odpocet_ztraty: "0",
        slevy: "0",
        sazba: "0.21",
      },
      {
        zdobd_od: "1.1.2024",
        zdobd_do: "31.12.2024",
        c_ufo_cil: "451",
        dic: "CZ12345679",
        name: "Test s.r.o.",
        naz_obce: "Praha",
      },
    )

    expect(res.ok).toBe(true)
    expect(res.xsd?.valid).toBe(true)
    expect(res.xsd?.errors).toEqual([])
    expect(res.xml).toContain('kc_ii60_50="30000"')
    expect(res.xml).toContain('kc_ii170_150="12000"')
  })
})

import { describe, expect, it } from "vitest"

import { generateDppo } from "./write"
import { validateFiling } from "../../../validate/validate"
import { buildDppoFromAccounting, type DppoFigures } from "./adapter"
import { computeDppoTotals } from "./compute"
import type { DppoInput } from "../../../model/dppo"

const meta = {
  zdobd_od: "2025-01-01",
  zdobd_do: "2025-12-31",
  c_ufo_cil: "451",
  dic: "CZ12345678",
  name: "ACME s.r.o.",
  naz_obce: "Praha",
  ulice: "Testovací",
  c_pop: "1",
  psc: "11000",
}

/** Minimal valid return — the XSD-required hlavička + an empty VetaO. */
const minimal: DppoInput = {
  header: {
    typ_dapdpp: "A",
    typ_zo: "A",
    typ_popldpp: "1",
    c_ufo_cil: "451",
    zdobd_od: "2025-01-01",
    zdobd_do: "2025-12-31",
  },
  payer: { dic: "CZ12345678", zkrobchjm: "ACME s.r.o." },
}

/** A profitable s.r.o.: zisk 1 000 000, add-backs 50 000, exempt 20 000, no loss c/f. */
const figures: DppoFigures = {
  ucetni_vysledek: "1000000.00",
  nedanove_naklady: "50000.00",
  osvobozene_vynosy: "20000.00",
  odpocet_ztraty: "0.00",
  sazba: "0.21",
  slevy: "0.00",
}

describe("generateDppo", () => {
  it("emits an XSD-valid minimal return", async () => {
    const xml = generateDppo(minimal)
    expect(xml).toContain("<Pisemnost")
    expect(xml).toContain('<DPPDP9 verzePis="05.01.01"')
    expect(xml).toContain('k_uladis="DPP"')
    expect(xml).toContain('dokument="DP9"')
    expect(xml).toContain('dapdpp_forma="B"') // injected default
    expect(xml).toContain("<VetaO") // required element always emitted
    const result = await validateFiling(xml, "dppo", "05.01.01")
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("strips the DIČ country prefix to digits and normalizes dates", () => {
    const xml = generateDppo(minimal)
    expect(xml).toContain('dic="12345678"')
    expect(xml).not.toContain('dic="CZ12345678"')
    expect(xml).toContain('zdobd_od="1.1.2025"')
    expect(xml).toContain('zdobd_do="31.12.2025"')
  })

  it("builds an XSD-valid, footing return from the accounting worksheet", async () => {
    const model = buildDppoFromAccounting(figures, meta)
    const xml = generateDppo(model)
    // Detail lines (whole koruna, no decimal point — fractionDigits=0).
    expect(xml).toContain('kc_ii10_10="1000000"') // ř.10 VH
    expect(xml).toContain('kc_ii50_40="50000"') // ř.40 add-back
    expect(xml).toContain('kc_ii120_110="20000"') // ř.110 exempt
    expect(xml).toContain('kc_ii270_280="21"') // ř.280 sazba as whole percent

    // The form arithmetic foots: ř.200 = 1 000 000 + 50 000 − 20 000 = 1 030 000.
    expect(xml).toContain('kc_ii200_200="1030000"')
    // ř.270 zaokrouhleno na tisíce dolů = 1 030 000. daň = ceil(1 030 000 × 0.21).
    expect(xml).toContain('kc_ii260_270="1030000"')
    expect(xml).toContain('kc_ii280_290="216300"') // ř.290 daň
    expect(xml).toContain('kc_ii_340="216300"') // ř.340 celková daň
    expect(xml).toContain('kc_ii_360="216300"') // ř.360 poslední známá daň

    const result = await validateFiling(xml, "dppo", "05.01.01")
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("emits a non-numeric amount verbatim so the XSD validator rejects it", async () => {
    const xml = generateDppo({
      header: minimal.header,
      payer: minimal.payer,
      vetaO: { kc_ii10_10: "a" },
    } as never)
    expect(xml).toContain('kc_ii10_10="a"')
    const result = await validateFiling(xml, "dppo", "05.01.01")
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it("applies a loss carry-forward on ř.230 before the tax", async () => {
    const withLoss = buildDppoFromAccounting(
      { ...figures, odpocet_ztraty: "30000.00" },
      meta,
    )
    const d = computeDppoTotals(
      buildDppoFromAccounting(
        { ...figures, odpocet_ztraty: "30000.00" },
        meta,
      ) as never,
    )
    // ř.250 = 1 030 000 − 30 000 = 1 000 000; daň = ceil(1 000 000 × 0.21) = 210 000.
    expect(d.r250).toBe("1000000")
    expect(d.r290).toBe("210000")
    const xml = generateDppo(withLoss)
    const result = await validateFiling(xml, "dppo", "05.01.01")
    expect(result.valid).toBe(true)
  })
})

describe("computeDppoTotals", () => {
  it("computes the II. oddíl footing from the input lines", () => {
    const d = computeDppoTotals({
      verze: "05.01.01",
      header: minimal.header,
      vetaO: {
        kc_ii10_10: "1000000",
        kc_ii50_40: "50000",
        kc_ii120_110: "20000",
        kc_ii270_280: "21",
      },
      extraVety: [],
    } as never)
    expect(d.r70).toBe("50000")
    expect(d.r170).toBe("20000")
    expect(d.r200).toBe("1030000")
    expect(d.r270).toBe("1030000")
    expect(d.r290).toBe("216300")
    expect(d.r310).toBe("216300")
    expect(d.r340).toBe("216300")
    expect(d.r360).toBe("216300")
  })

  it("rounds the base down to whole thousands (§21) and the tax up to koruna", () => {
    const d = computeDppoTotals({
      verze: "05.01.01",
      header: minimal.header,
      vetaO: { kc_ii10_10: "1234567", kc_ii270_280: "21" },
      extraVety: [],
    } as never)
    expect(d.r200).toBe("1234567")
    expect(d.r270).toBe("1234000") // floor to 1000
    expect(d.r290).toBe("259140") // ceil(1 234 000 × 0.21) = 259 140
  })

  it("includes ř.161 (likvidace) in the ř.170 mezisoučet snížení", () => {
    const d = computeDppoTotals({
      verze: "05.01.01",
      header: minimal.header,
      vetaO: {
        kc_ii10_10: "1000000",
        kc_ii181_161: "40000",
        kc_ii270_280: "21",
      },
      extraVety: [],
    } as never)
    expect(d.r170).toBe("40000")
    expect(d.r200).toBe("960000")
  })

  it("applies ř.251/260 between ř.250 and ř.270, not inside ř.250", () => {
    const d = computeDppoTotals({
      verze: "05.01.01",
      header: minimal.header,
      vetaO: {
        kc_ii10_10: "1000000",
        kc_ii231_251: "5000", // ř.251 §20/7
        kc_ii240_260: "3000", // ř.260 §20/8
        kc_ii270_280: "21",
      },
      extraVety: [],
    } as never)
    // ř.250 shows the base after §34 odečty only (here just ř.200 = 1 000 000).
    expect(d.r250).toBe("1000000")
    // ř.270 = floor((1 000 000 − 5 000 − 3 000) / 1000) × 1000 = 992 000.
    expect(d.r270).toBe("992000")
  })

  it("derives ř.360 as ř.340 − ř.330 (samostatný základ §20b excluded from advances)", () => {
    const d = computeDppoTotals({
      verze: "05.01.01",
      header: minimal.header,
      vetaO: {
        kc_ii10_10: "1000000",
        kc_ii270_280: "21",
        kc_ii320_330: "10000", // ř.330 daň ze samostatného základu §20b
      },
      extraVety: [],
    } as never)
    // ř.310 = 210 000; ř.340 = 210 000 + 10 000 = 220 000; ř.360 = 220 000 − 10 000.
    expect(d.r340).toBe("220000")
    expect(d.r360).toBe("210000")
  })

  it("does not throw on a non-numeric amount — coerces to 0 for footing", () => {
    expect(() =>
      computeDppoTotals({
        verze: "05.01.01",
        header: minimal.header,
        vetaO: { kc_ii10_10: "a", kc_ii50_40: "50000", kc_ii270_280: "21" },
        extraVety: [],
      } as never),
    ).not.toThrow()
    const d = computeDppoTotals({
      verze: "05.01.01",
      header: minimal.header,
      vetaO: { kc_ii10_10: "a", kc_ii50_40: "50000", kc_ii270_280: "21" },
      extraVety: [],
    } as never)
    // garbage ř.10 → 0, so ř.200 = 0 + 50 000 − 0 = 50 000.
    expect(d.r200).toBe("50000")
  })

  it("clamps a daňová ztráta chain to zero tax", () => {
    const d = computeDppoTotals({
      verze: "05.01.01",
      header: minimal.header,
      vetaO: { kc_ii10_10: "-500000", kc_ii270_280: "21" },
      extraVety: [],
    } as never)
    expect(d.r200).toBe("-500000")
    expect(d.r250).toBe("0")
    expect(d.r290).toBe("0")
    expect(d.r340).toBe("0")
  })
})

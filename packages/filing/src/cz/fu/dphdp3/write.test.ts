import { describe, expect, it } from "vitest"

import { generateDphdp3 } from "./write"
import { validateFiling } from "../../../validate/validate"
import { buildDphdp3FromAccounting, type DphFigures } from "../adapter"
import type { Dphdp3Input } from "../../../model/dphdp3"

const meta = {
  rok: "2026",
  mesic: "6",
  zdobd_od: "2026-06-01",
  zdobd_do: "2026-06-30",
  c_ufo: "451",
  dic: "CZ12345678",
  name: "ACME s.r.o.",
  naz_obce: "Praha",
  ulice: "Testovací",
  c_pop: "1",
  psc: "11000",
}

/** Zero-VAT plátce with the required hlavička/poplatník only. */
const minimal: Dphdp3Input = {
  header: { rok: "2026", mesic: "6" },
  payer: { c_ufo: "451", dic: "CZ12345678", zkrobchjm: "ACME s.r.o." },
}

/** A monthly return with output tax, an EU acquisition, and input deductions. */
const figures: DphFigures = {
  r1_base: "100000.00",
  r1_dan: "21000.00",
  r2_base: "0",
  r2_dan: "0",
  r3_base: "50000.00",
  r3_dan: "10500.00",
  r4_base: "0",
  r4_dan: "0",
  r5_base: "0",
  r5_dan: "0",
  r6_base: "0",
  r6_dan: "0",
  r10_base: "0",
  r10_dan: "0",
  r11_base: "0",
  r11_dan: "0",
  r12_base: "0",
  r12_dan: "0",
  r13_base: "0",
  r13_dan: "0",
  r20_base: "0",
  r21_base: "0",
  r22_base: "0",
  r25_base: "0",
  r40_base: "40000.00",
  r40_dan: "8400.00",
  r41_base: "0",
  r41_dan: "0",
  r43_base: "50000.00",
  r43_dan: "10500.00",
  r44_base: "0",
  r44_dan: "0",
  r50_base: "0",
  dan_na_vystupu: "31500.00",
  odpocet: "18900.00",
  vlastni_dan: "12600.00",
}

describe("generateDphdp3", () => {
  it("emits an XSD-valid minimal return", async () => {
    const xml = generateDphdp3(minimal)
    expect(xml).toContain("<Pisemnost")
    expect(xml).toContain('<DPHDP3 verzePis="03.01.03"')
    expect(xml).toContain('k_uladis="DPH"')
    expect(xml).toContain('dokument="DP3"')
    const result = await validateFiling(xml, "dphdp3", "03.01.03")
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("strips the DIČ country prefix to digits", () => {
    const xml = generateDphdp3(minimal)
    expect(xml).toContain('dic="12345678"')
    expect(xml).not.toContain('dic="CZ12345678"')
  })

  it("formats amounts as whole koruna and validates the adapter output", async () => {
    const model = buildDphdp3FromAccounting(figures, meta)
    const xml = generateDphdp3(model)
    // Whole-koruna, no decimal point (XSD fractionDigits=0).
    expect(xml).toContain('obrat23="100000"')
    expect(xml).toContain('dan23="21000"')
    expect(xml).toContain('p_zb23="50000"')
    expect(xml).toContain('dano_da="12600"')
    expect(xml).not.toMatch(/obrat23="\d+\.\d+"/)
    const result = await validateFiling(xml, "dphdp3", "03.01.03")
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("routes a nadměrný odpočet to dano_no as an absolute value", () => {
    const refund = buildDphdp3FromAccounting(
      { ...figures, dan_na_vystupu: "1000.00", odpocet: "6000.00" },
      meta,
    )
    const xml = generateDphdp3(refund)
    expect(xml).toContain('dano_no="5000"')
    expect(xml).not.toContain("dano_da=")
  })

  it("validates every attribute the full ř.1–66 tester renders", async () => {
    // Guards the hand-typed attribute names in the demo-epo full form: if any name is
    // not in the XSD, xmllint rejects it here. Amounts whole koruna; koeficient 0–100.
    const k = "1000"
    const full: Dphdp3Input = {
      header: { rok: "2026", mesic: "6" },
      payer: { c_ufo: "451", dic: "CZ12345678", zkrobchjm: "ACME s.r.o." },
      veta1: {
        obrat23: k,
        dan23: k,
        obrat5: k,
        dan5: k,
        p_zb23: k,
        dan_pzb23: k,
        p_zb5: k,
        dan_pzb5: k,
        p_sl23_e: k,
        dan_psl23_e: k,
        p_sl5_e: k,
        dan_psl5_e: k,
        dov_zb23: k,
        dan_dzb23: k,
        dov_zb5: k,
        dan_dzb5: k,
        p_dop_nrg: k,
        dan_pdop_nrg: k,
        rez_pren23: k,
        dan_rpren23: k,
        rez_pren5: k,
        dan_rpren5: k,
        p_sl23_z: k,
        dan_psl23_z: k,
        p_sl5_z: k,
        dan_psl5_z: k,
        opr_dane_zd: k,
        opr_dane_dan: k,
      },
      veta2: { dod_zb: k, pln_sluzby: k, pln_vyvoz: k, dod_dop_nrg: k, pln_zaslani: k, pln_rez_pren: k, pln_ost: k }, // prettier-ignore
      veta3: {
        tri_pozb: k,
        tri_dozb: k,
        dov_osv: k,
        opr_verit: k,
        opr_dluz: k,
      },
      veta4: {
        pln23: k,
        odp_tuz23: k,
        odp_tuz23_nar: k,
        pln5: k,
        odp_tuz5: k,
        odp_tuz5_nar: k,
        dov_cu: k,
        odp_cu: k,
        odp_cu_nar: k,
        nar_zdp23: k,
        od_zdp23: k,
        odkr_zdp23: k,
        nar_zdp5: k,
        od_zdp5: k,
        odkr_zdp5: k,
        odp_rezim: k,
        odp_rez_nar: k,
        odp_sum_nar: k,
        odp_sum_kr: k,
        nar_maj: k,
        od_maj: k,
        odkr_maj: k,
        kor_odp_zd: k,
        kor_odp_plne: k,
        kor_odp_krac: k,
      },
      veta5: { plnosv_kf: k, pln_nkf: k, plnosv_nkf: k, koef_p20_nov: "50", odp_uprav_kf: k, koef_p20_vypor: "50", vypor_odp: k }, // prettier-ignore
      veta6: { uprav_odp: k, dan_vrac: k, dan_zocelk: k, odp_zocelk: k, dano_da: k, dano_no: k, dano: k }, // prettier-ignore
    }
    const result = await validateFiling(
      generateDphdp3(full),
      "dphdp3",
      "03.01.03",
    )
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("routes ř.50 exempt output to plnosv_kf (not plnosv_nkf)", () => {
    const xml = generateDphdp3(
      buildDphdp3FromAccounting({ ...figures, r50_base: "7000.00" }, meta),
    )
    expect(xml).toContain('plnosv_kf="7000"')
    expect(xml).not.toContain("plnosv_nkf")
  })

  it("derives ř.64/65 from the rounded ř.62/63 so the return foots exactly", async () => {
    // ř.62 100.40→100, ř.63 3.60→4. vlastní daň must be 100−4=96, NOT round(96.80)=97.
    const f = {
      ...figures,
      r1_base: "478.10",
      r1_dan: "100.40",
      r3_base: "0",
      r3_dan: "0",
      r40_base: "17.14",
      r40_dan: "3.60",
      r43_base: "0",
      r43_dan: "0",
      dan_na_vystupu: "100.40",
      odpocet: "3.60",
      vlastni_dan: "96.80",
    }
    const xml = generateDphdp3(buildDphdp3FromAccounting(f, meta))
    expect(xml).toContain('dan_zocelk="100"')
    expect(xml).toContain('odp_zocelk="4"')
    expect(xml).toContain('dano_da="96"')
    const result = await validateFiling(xml, "dphdp3", "03.01.03")
    expect(result.valid).toBe(true)
  })
})

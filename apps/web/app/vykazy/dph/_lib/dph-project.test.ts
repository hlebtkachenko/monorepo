import { describe, expect, it } from "vitest"

import {
  projectPriznani,
  projectKontrolniHlaseni,
  projectSouhrnneHlaseni,
  kontrolniVazby,
  splitDic,
  type DphOrgMeta,
} from "./dph-project"
import type { DphEvidence, DphEvidenceRow } from "./dph-evidence"
import {
  parseDphEvidenceCsv,
  dphEvidenceToCsv,
  dphEvidenceCsvTemplate,
} from "./dph-evidence"

const meta: DphOrgMeta = {
  c_ufo: "451",
  dic: "CZ12345678",
  typ_ds: "P",
  nazev: "ACME s.r.o.",
}

function row(over: Partial<DphEvidenceRow> = {}): DphEvidenceRow {
  return {
    id: "r1",
    smer: "vystup",
    dppd: "15.06.2026",
    evc: "2026001",
    dic: "CZ87654321",
    radek: "1",
    sazba: 21,
    zaklad: "100000",
    dan: "21000",
    khSekce: "A4",
    ...over,
  }
}

function evidence(rows: DphEvidenceRow[]): DphEvidence {
  return { version: 1, rows, manual: {}, rok: "2026", mesic: "6" }
}

describe("projectPriznani", () => {
  it("writes each řádek to its statutory XML attribute", () => {
    const m = projectPriznani(evidence([row()]), meta)
    expect(m.veta1?.obrat23).toBe("100000")
    expect(m.veta1?.dan23).toBe("21000")
  })

  it("sums several dokladů landing on the same řádek", () => {
    const m = projectPriznani(
      evidence([
        row({ id: "a", zaklad: "100000", dan: "21000" }),
        row({ id: "b", zaklad: "50000.40", dan: "10584.08" }),
      ]),
      meta,
    )
    // Whole koruna, rounded once on the summed total (not per doklad).
    expect(m.veta1?.obrat23).toBe("150000")
    expect(m.veta1?.dan23).toBe("31584")
  })

  it("keeps the 12 % rate on its own řádek", () => {
    const m = projectPriznani(
      evidence([row({ radek: "2", sazba: 12, zaklad: "1000", dan: "120" })]),
      meta,
    )
    expect(m.veta1?.obrat5).toBe("1000")
    expect(m.veta1?.dan5).toBe("120")
    expect(m.veta1?.obrat23).toBeUndefined()
  })

  it("routes an osvobozené plnění to věta 2 with no daň", () => {
    const m = projectPriznani(
      evidence([row({ radek: "20", sazba: 0, zaklad: "80000", dan: "0" })]),
      meta,
    )
    expect(m.veta2?.dod_zb).toBe("80000")
  })

  it("lets a manual koeficient through untouched and money through the formatter", () => {
    const e = evidence([row()])
    e.manual = { koef_p20_nov: "85", odkr_zdp23: "1234.60" }
    const m = projectPriznani(e, meta)
    expect(m.veta5?.koef_p20_nov).toBe("85")
    expect(m.veta4?.odkr_zdp23).toBe("1235")
  })

  it("drops a derived řádek rather than writing a guessed value", () => {
    const m = projectPriznani(
      evidence([row({ radek: "62", zaklad: "0", dan: "999" })]),
      meta,
    )
    expect(m.veta6).toBeUndefined()
  })
})

describe("projectKontrolniHlaseni", () => {
  it("emits one A.4 row per doklad with haléř amounts", () => {
    const m = projectKontrolniHlaseni(evidence([row()]), meta)
    expect(m.a4).toHaveLength(1)
    expect(m.a4?.[0]?.dic_odb).toBe("CZ87654321")
    expect(m.a4?.[0]?.zakl_dane1).toBe("100000.00")
    expect(m.a4?.[0]?.dan1).toBe("21000.00")
  })

  it("folds two sazby of ONE doklad into a single row with both buckets", () => {
    const m = projectKontrolniHlaseni(
      evidence([
        row({ id: "a", sazba: 21, zaklad: "100000", dan: "21000" }),
        row({ id: "b", sazba: 12, zaklad: "50000", dan: "6000" }),
      ]),
      meta,
    )
    expect(m.a4).toHaveLength(1)
    expect(m.a4?.[0]?.zakl_dane1).toBe("100000.00")
    expect(m.a4?.[0]?.zakl_dane2).toBe("50000.00")
  })

  it("splits the A.5 aggregate by sazba instead of filing it all at 21 %", () => {
    const m = projectKontrolniHlaseni(
      evidence([
        row({ id: "a", khSekce: "A5", sazba: 21, zaklad: "1000", dan: "210" }),
        row({ id: "b", khSekce: "A5", sazba: 12, zaklad: "2000", dan: "240" }),
      ]),
      meta,
    )
    expect(m.a5?.zakl_dane1).toBe("1000.00")
    expect(m.a5?.zakl_dane2).toBe("2000.00")
    expect(m.a5?.dan2).toBe("240.00")
  })

  it("carries the §92 kód on A.1 and files základ without daň", () => {
    const m = projectKontrolniHlaseni(
      evidence([row({ khSekce: "A1", radek: "25", kodPredPl: "4", dan: "0" })]),
      meta,
    )
    expect(m.a1?.[0]?.kod_pred_pl).toBe("4")
    expect(m.a1?.[0]?.zakl_dane1).toBe("100000.00")
  })

  it("uses its own monthly period, because KH is monthly for a PO (§101e/1)", () => {
    const e = evidence([row()])
    e.ctvrt = "2"
    e.mesic = undefined
    e.khMesic = "6"
    const m = projectKontrolniHlaseni(e, meta)
    expect(m.header.mesic).toBe("6")
  })
})

describe("projectSouhrnneHlaseni", () => {
  const eu = (over: Partial<DphEvidenceRow> = {}) =>
    row({
      radek: "20",
      sazba: 0,
      dan: "0",
      dic: "DE123456789",
      shKod: "0",
      khSekce: undefined,
      ...over,
    })

  it("groups per counterparty and kód, counting dokladů not rows", () => {
    const m = projectSouhrnneHlaseni(
      evidence([
        eu({ id: "a", evc: "F1", zaklad: "1000" }),
        eu({ id: "b", evc: "F1", zaklad: "500" }), // same doklad, second line
        eu({ id: "c", evc: "F2", zaklad: "2000" }),
      ]),
      meta,
    )
    expect(m.rows).toHaveLength(1)
    expect(m.rows?.[0]?.pln_pocet).toBe("2")
    expect(m.rows?.[0]?.pln_hodnota).toBe("3500")
  })

  it("splits the country prefix off the DIČ", () => {
    const m = projectSouhrnneHlaseni(evidence([eu()]), meta)
    expect(m.rows?.[0]?.k_stat).toBe("DE")
    expect(m.rows?.[0]?.c_vat).toBe("123456789")
  })

  it("keeps goods and services apart under their own kód", () => {
    const m = projectSouhrnneHlaseni(
      evidence([eu({ id: "a" }), eu({ id: "b", shKod: "3", radek: "21" })]),
      meta,
    )
    expect(m.rows).toHaveLength(2)
  })

  it("ignores rows with no kód plnění", () => {
    const m = projectSouhrnneHlaseni(evidence([row()]), meta)
    expect(m.rows).toBeUndefined()
  })

  it("defaults to forma R, never the B of the other two filings", () => {
    expect(projectSouhrnneHlaseni(evidence([eu()]), meta).header.shvies_forma).toBe("R") // prettier-ignore
  })
})

describe("splitDic", () => {
  it("removes only a recognised member-state prefix", () => {
    expect(splitDic("DE123456789")).toEqual({ k_stat: "DE", c_vat: "123456789" }) // prettier-ignore
    expect(splitDic("IE1234567FA")).toEqual({ k_stat: "IE", c_vat: "1234567FA" }) // prettier-ignore
    // XX is not a member-state prefix, so the whole id survives.
    expect(splitDic("XX123456789")).toEqual({ k_stat: "", c_vat: "XX123456789" }) // prettier-ignore
  })
})

describe("kontrolniVazby", () => {
  it("passes when the KH sections tie to the přiznání lines", () => {
    const v = kontrolniVazby(evidence([row()]))
    const a4 = v.find((x) => x.label.startsWith("KH A.4"))
    expect(a4?.ok).toBe(true)
  })

  it("fails loudly when a doklad is on ř.1 but missing from the KH", () => {
    const v = kontrolniVazby(evidence([row({ khSekce: undefined })]))
    const a4 = v.find((x) => x.label.startsWith("KH A.4"))
    expect(a4?.ok).toBe(false)
    expect(a4?.right).toBe("100000.00")
  })

  it("ties the souhrnné hlášení to ř.20 + ř.21", () => {
    const v = kontrolniVazby(
      evidence([
        row({ radek: "20", shKod: "0", zaklad: "5000", dan: "0", khSekce: undefined }), // prettier-ignore
      ]),
    )
    expect(v.find((x) => x.label.startsWith("SH"))?.ok).toBe(true)
  })
})

describe("evidence CSV", () => {
  it("round-trips through the template shape", () => {
    const parsed = parseDphEvidenceCsv(dphEvidenceCsvTemplate())
    expect(parsed.headerOk).toBe(true)
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0]?.smer).toBe("vystup")
    expect(parsed.rows[1]?.smer).toBe("vstup")

    const again = parseDphEvidenceCsv(dphEvidenceToCsv(parsed.rows))
    expect(again.rows.map((r) => ({ ...r, id: "" }))).toEqual(
      parsed.rows.map((r) => ({ ...r, id: "" })),
    )
  })

  it("normalizes Czech decimal commas and spaced thousands", () => {
    const csv =
      "Směr;DPPD;Řádek;Sazba;Základ;Daň\r\nvystup;1.6.2026;1;21;100 000,50;21 000,11\r\n"
    const parsed = parseDphEvidenceCsv(csv)
    expect(parsed.rows[0]?.zaklad).toBe("100000.50")
    expect(parsed.rows[0]?.dan).toBe("21000.11")
  })

  it("reports a missing required column instead of importing junk", () => {
    const parsed = parseDphEvidenceCsv("Směr;DPPD\r\nvystup;1.6.2026\r\n")
    expect(parsed.headerOk).toBe(false)
    expect(parsed.missingHeaders).toContain("Řádek")
  })
})

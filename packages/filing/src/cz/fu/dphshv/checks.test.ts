import { describe, expect, it } from "vitest"

import { checkDphshv } from "./checks"
import { DphshvSchema, type DphshvInput } from "../../../model/dphshv"

const base: DphshvInput = {
  header: { rok: "2026", mesic: "6" },
  payer: { c_ufo: "451", dic: "CZ12345678" },
  rows: [
    {
      k_stat: "DE",
      c_vat: "123456789",
      k_pln_eu: "0",
      pln_pocet: "1",
      pln_hodnota: "1000",
    },
  ],
}

const parse = (input: DphshvInput) => DphshvSchema.parse(input)
const codes = (input: DphshvInput) =>
  checkDphshv(parse(input)).map((c) => c.code)

describe("checkDphshv", () => {
  it("passes a well-formed monthly hlášení", () => {
    expect(checkDphshv(parse(base))).toEqual([])
  })

  it("rejects a storno row on a řádné hlášení", () => {
    expect(
      codes({
        ...base,
        rows: [{ ...base.rows![0]!, k_storno: "A" }],
      }),
    ).toContain("STORNO_V_RADNEM")
  })

  it("accepts a storno row on a následné hlášení", () => {
    expect(
      codes({
        ...base,
        header: { ...base.header, shvies_forma: "N" },
        rows: [
          { k_storno: "A", k_stat: "DE", c_vat: "123456789", k_pln_eu: "0" },
        ],
      }),
    ).not.toContain("STORNO_V_RADNEM")
  })

  it("requires a zdaňovací období and refuses both at once", () => {
    expect(codes({ ...base, header: { rok: "2026" } })).toContain(
      "OBDOBI_CHYBI",
    )
    expect(
      codes({ ...base, header: { rok: "2026", mesic: "6", ctvrt: "2" } }),
    ).toContain("OBDOBI_DVOJI")
  })

  it("refuses goods on a quarterly hlášení (§102/6)", () => {
    expect(codes({ ...base, header: { rok: "2026", ctvrt: "2" } })).toContain(
      "CTVRTLETNI_SE_ZBOZIM",
    )
  })

  it("allows a services-only quarterly hlášení", () => {
    expect(
      codes({
        ...base,
        header: { rok: "2026", ctvrt: "2" },
        rows: [{ ...base.rows![0]!, k_pln_eu: "3" }],
      }),
    ).not.toContain("CTVRTLETNI_SE_ZBOZIM")
  })

  it("flags a non-member state, GR in place of EL, and a CZ counterparty", () => {
    expect(codes({ ...base, rows: [{ ...base.rows![0]!, k_stat: "GR" }] })).toContain("STAT_NENI_CLENSKY") // prettier-ignore
    expect(codes({ ...base, rows: [{ ...base.rows![0]!, k_stat: "US" }] })).toContain("STAT_NENI_CLENSKY") // prettier-ignore
    expect(codes({ ...base, rows: [{ ...base.rows![0]!, k_stat: "CZ" }] })).toContain("STAT_TUZEMSKO") // prettier-ignore
  })

  it("flags a missing DIČ or hodnota on a non-storno row", () => {
    const found = codes({
      ...base,
      rows: [{ k_pln_eu: "0", pln_pocet: "1" }],
    })
    expect(found).toContain("DIC_CHYBI")
    expect(found).toContain("HODNOTA_CHYBI")
  })

  it("flags a duplicate DIČ + kód plnění pair", () => {
    expect(
      codes({ ...base, rows: [base.rows![0]!, { ...base.rows![0]! }] }),
    ).toContain("DIC_DUPLICITNI")
  })

  it("allows the same DIČ under two different kódy plnění", () => {
    expect(
      codes({
        ...base,
        rows: [base.rows![0]!, { ...base.rows![0]!, k_pln_eu: "3" }],
      }),
    ).not.toContain("DIC_DUPLICITNI")
  })

  it("warns on kód 2 because a triangular trade cannot be derived from the books", () => {
    expect(codes({ ...base, rows: [{ ...base.rows![0]!, k_pln_eu: "2" }] })).toContain("KOD_2_TRISTRANNY") // prettier-ignore
  })

  it("rejects a non-integer hodnota and an invalid kód", () => {
    expect(codes({ ...base, rows: [{ ...base.rows![0]!, pln_hodnota: "1000.50" }] })).toContain("HODNOTA_NENI_CELE_CISLO") // prettier-ignore
    expect(codes({ ...base, rows: [{ ...base.rows![0]!, k_pln_eu: "9" }] })).toContain("KOD_PLNENI_NEPLATNY") // prettier-ignore
  })

  it("requires the original DIČ on a call-off change of pořizovatel", () => {
    expect(
      codes({
        ...base,
        callOff: [{ k_stat: "DE", c_vat: "123456789", k_cos: "3" }],
      }),
    ).toContain("COS_ZMENA_BEZ_PUVODNIHO")
  })

  it("warns on an empty řádné hlášení", () => {
    expect(codes({ ...base, rows: [] })).toContain("PRAZDNE_HLASENI")
  })
})

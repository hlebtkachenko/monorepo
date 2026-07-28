import { describe, expect, it } from "vitest"

import { checkDphshv } from "./checks"
import { splitVatId } from "../vat-id"
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

describe("DIČ format per member state", () => {
  const shv = (k_stat: string, c_vat: string) =>
    DphshvSchema.parse({
      header: { shvies_forma: "R", rok: "2026", mesic: "6" },
      payer: { c_ufo: "451", dic: "12345678", typ_ds: "P" },
      rows: [{ k_stat, c_vat, k_pln_eu: "0", pln_hodnota: "1000" }],
    })

  const codes = (k: string, v: string) =>
    checkDphshv(shv(k, v)).map((c) => c.code)

  it("accepts the shapes the schema's own table documents", () => {
    for (const [stat, vat] of [
      ["SK", "1234567890"],
      ["DE", "123456789"],
      ["AT", "U12345678"],
      ["NL", "123456789B01"],
      ["IE", "1234567FA"],
      ["ES", "X1234567L"],
      ["FR", "12345678901"],
      ["CY", "12345678L"],
      ["RO", "019"],
      ["XI", "GD123"],
    ] as const) {
      expect(codes(stat, vat), `${stat}${vat}`).not.toContain("DIC_FORMAT")
    }
  })

  it("flags an id that cannot be that state's", () => {
    // Slovak ids are 10 digits; 8 is a Slovenian one pasted under the wrong code.
    expect(codes("SK", "12345678")).toContain("DIC_FORMAT")
    // Austria always starts with U.
    expect(codes("AT", "123456789")).toContain("DIC_FORMAT")
    // The Dutch suffix runs B01..B99, never B00.
    expect(codes("NL", "123456789B00")).toContain("DIC_FORMAT")
    // France excludes I and O from the two leading letters.
    expect(codes("FR", "IO345678901")).toContain("DIC_FORMAT")
  })

  it("warns rather than blocks, because the table is transcribed", () => {
    const bad = checkDphshv(shv("SK", "1")).find((c) => c.code === "DIC_FORMAT")
    expect(bad?.severity).toBe("warning")
  })
})

describe("splitVatId when the prefix disagrees with the country", () => {
  it("keeps a prefixed id under the state its prefix names", () => {
    // A supplier registered outside its address country is routine with
    // warehousing. Taking the country code left the prefix on c_vat, and a
    // 14-character result blew A.2's maxLength="12".
    expect(splitVatId("DE", "NL123456789B01")).toEqual({
      k_stat: "NL",
      c_vat: "123456789B01",
    })
  })

  it("still treats a bare id as belonging to the supplied country", () => {
    // FR ids may start with two letters of their own; BE123456789 under FR is
    // a French id, not a Belgian one.
    expect(splitVatId("FR", "BE123456789")).toEqual({
      k_stat: "FR",
      c_vat: "BE123456789",
    })
  })

  it("leaves the agreeing and no-country cases exactly as they were", () => {
    expect(splitVatId("SK", "SK1234567890")).toEqual({ k_stat: "SK", c_vat: "1234567890" }) // prettier-ignore
    expect(splitVatId(null, "DE123456789")).toEqual({ k_stat: "DE", c_vat: "123456789" }) // prettier-ignore
    expect(splitVatId("GR", "123456789")).toEqual({ k_stat: "EL", c_vat: "123456789" }) // prettier-ignore
  })
})

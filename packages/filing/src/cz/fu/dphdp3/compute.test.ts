import { describe, expect, it } from "vitest"

import { applyDphdp3Totals, computeDphdp3Totals } from "./compute"
import { Dphdp3Schema } from "../../../model/dphdp3"

function model(input: Parameters<typeof Dphdp3Schema.parse>[0]) {
  return Dphdp3Schema.parse(input)
}

const base = {
  header: { rok: "2026", mesic: "6" },
  payer: { c_ufo: "451", dic: "CZ12345678", zkrobchjm: "ACME s.r.o." },
}

describe("computeDphdp3Totals", () => {
  it("sums ř.62 from the daň ř.1..13 columns minus ř.61", () => {
    const m = model({
      ...base,
      veta1: {
        obrat23: "100000",
        dan23: "21000",
        p_zb23: "50000",
        dan_pzb23: "10500",
      },
      veta6: { dan_vrac: "500" },
    })
    // 21000 (ř.1) + 10500 (ř.3) − 500 (ř.61) = 31000
    expect(computeDphdp3Totals(m).r62).toBe("31000")
  })

  it("sums ř.46 V plné výši from ř.40..45 and derives ř.63", () => {
    const m = model({
      ...base,
      veta4: {
        pln23: "40000",
        odp_tuz23_nar: "8400", // ř.40 V plné výši
        nar_zdp23: "50000",
        od_zdp23: "10500", // ř.43 plná
      },
    })
    const d = computeDphdp3Totals(m)
    expect(d.r46_full).toBe("18900") // 8400 + 10500
    expect(d.r63).toBe("18900") // ř.46 + 0 + 0 + 0
  })

  it("derives vlastní daň on ř.64 when daň na výstupu ≥ odpočet", () => {
    const m = model({
      ...base,
      veta1: { obrat23: "100000", dan23: "21000" },
      veta4: { pln23: "40000", odp_tuz23_nar: "8400" },
    })
    const d = computeDphdp3Totals(m)
    expect(d.r62).toBe("21000")
    expect(d.r63).toBe("8400")
    expect(d.r64).toBe("12600") // 21000 − 8400
    expect(d.r65).toBe("0")
  })

  it("derives nadměrný odpočet on ř.65 when odpočet exceeds daň na výstupu", () => {
    const m = model({
      ...base,
      veta1: { obrat23: "10000", dan23: "2100" },
      veta4: { pln23: "40000", odp_tuz23_nar: "8400" },
    })
    const d = computeDphdp3Totals(m)
    expect(d.r64).toBe("0")
    expect(d.r65).toBe("6300") // 8400 − 2100
  })

  it("treats absent lines as zero", () => {
    const d = computeDphdp3Totals(model(base))
    expect(d).toMatchObject({
      r46_full: "0",
      r46_reduced: "0",
      r62: "0",
      r63: "0",
      r64: "0",
      r65: "0",
    })
  })
})

describe("odpočet column roles", () => {
  // The `_nar` suffix is "nárok V PLNÉ VÝŠI", per the FÚ popis struktury, which
  // lists a form label per attribute; the XSD documentation is byte-identical
  // for both members of every pair and cannot settle it. Reading `_nar` as
  // "krácený" put every odpočet in the wrong column, and since ř.63 sums the
  // FULL column through ř.46 the whole deduction vanished from the return.
  it("counts _nar on ř.40/41/42/45 as V plné výši, not krácený", () => {
    const d = computeDphdp3Totals(
      model({
        ...base,
        veta4: {
          odp_tuz23_nar: "1000",
          odp_tuz5_nar: "200",
          odp_cu_nar: "30",
          odp_rez_nar: "4",
        },
      }),
    )
    expect(d.r46_full).toBe("1234")
    expect(d.r46_reduced).toBe("0")
    expect(d.r63).toBe("1234")
  })

  it("counts the bare odp_tuz/odp_cu/odp_rezim as the krácený column", () => {
    const d = computeDphdp3Totals(
      model({
        ...base,
        veta4: {
          odp_tuz23: "1000",
          odp_tuz5: "200",
          odp_cu: "30",
          odp_rezim: "4",
        },
      }),
    )
    expect(d.r46_reduced).toBe("1234")
    expect(d.r46_full).toBe("0")
    // A krácený odpočet reaches ř.63 only through ř.52, never directly.
    expect(d.r63).toBe("0")
  })

  it("swaps ř.64/65 for ř.66 on a dodatečné přiznání", () => {
    const radne = applyDphdp3Totals(
      model({
        ...base,
        veta1: { obrat23: "100000", dan23: "21000" },
        veta4: { odp_tuz23_nar: "8400" },
      }),
    )
    expect(radne.model.veta6?.dano_da).toBe("12600")
    expect(radne.model.veta6?.dano).toBeUndefined()

    const dodatecne = applyDphdp3Totals(
      model({
        ...base,
        header: { ...base.header, dapdph_forma: "D" },
        veta1: { obrat23: "100000", dan23: "21000" },
        veta4: { odp_tuz23_nar: "8400" },
      }),
    )
    expect(dodatecne.model.veta6?.dano).toBe("12600")
    expect(dodatecne.model.veta6?.dano_da).toBeUndefined()
    expect(dodatecne.model.veta6?.dano_no).toBeUndefined()
  })
})

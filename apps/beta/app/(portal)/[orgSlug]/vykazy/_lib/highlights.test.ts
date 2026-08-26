import { describe, expect, it } from "vitest"

import type { BetaStatementKind } from "@/db/schema"
import type { StatementLineView } from "@/lib/data/projections"

import { rozvahaHighlights, vzzHighlights } from "./highlights"

function line(
  statementKind: BetaStatementKind,
  values: Partial<StatementLineView> & { rowCode: string },
): StatementLineView {
  return {
    id: `line-${statementKind}-${values.rowCode}`,
    statementKind,
    ozn: null,
    rowLabel: "",
    indent: 0,
    isBold: false,
    brutto: null,
    korekce: null,
    netto: null,
    bezne: null,
    minule: null,
    ...values,
  }
}

const AKTIVA = [
  line("rozvaha_aktiva", {
    rowCode: "001",
    rowLabel: "AKTIVA CELKEM",
    netto: "3800000.00",
    brutto: "5000000.00",
    korekce: "-1200000.00",
  }),
  line("rozvaha_aktiva", {
    rowCode: "037",
    ozn: "B.II.",
    rowLabel: "Dlouhodobý hmotný majetek",
    netto: "2800000.00",
  }),
]

const PASIVA = [
  line("rozvaha_pasiva", {
    rowCode: "001",
    rowLabel: "PASIVA CELKEM",
    bezne: "3800000.00",
  }),
  line("rozvaha_pasiva", {
    rowCode: "002",
    ozn: "A.",
    rowLabel: "Vlastní kapitál",
    bezne: "1800000.00",
  }),
  line("rozvaha_pasiva", {
    rowCode: "023",
    ozn: "B.+C.",
    rowLabel: "Cizí zdroje",
    bezne: "2000000.00",
  }),
]

describe("rozvahaHighlights", () => {
  it("reads three published lines verbatim — nothing is summed", () => {
    expect(rozvahaHighlights(AKTIVA, PASIVA)).toEqual([
      { labelKey: "vykazy.highlightBilancniSuma", value: "3800000.00" },
      { labelKey: "vykazy.highlightVlastniKapital", value: "1800000.00" },
      { labelKey: "vykazy.highlightCiziZdroje", value: "2000000.00" },
    ])
  })

  it("keys the two pasiva tiles on označení, not on řádek number", () => {
    // The same lines under a completely different numbering still resolve —
    // the vyhláška prescribes označení, not řádek numbers.
    const renumbered = PASIVA.map((row, index) =>
      line("rozvaha_pasiva", {
        ...row,
        rowCode: `9${index}`,
      }),
    )
    expect(
      rozvahaHighlights(AKTIVA, renumbered).map((tile) => tile.value),
    ).toEqual(["3800000.00", "1800000.00", "2000000.00"])
  })

  it("tolerates whitespace an exporter pads označení with", () => {
    const padded = PASIVA.map((row) =>
      line("rozvaha_pasiva", { ...row, ozn: row.ozn ? ` ${row.ozn} ` : null }),
    )
    expect(rozvahaHighlights(AKTIVA, padded)).toHaveLength(3)
  })

  it("drops a tile whose line the batch does not carry — never a zero", () => {
    const shortForm = PASIVA.filter((row) => row.ozn !== "B.+C.")
    const tiles = rozvahaHighlights(AKTIVA, shortForm)

    expect(tiles.map((tile) => tile.labelKey)).toEqual([
      "vykazy.highlightBilancniSuma",
      "vykazy.highlightVlastniKapital",
    ])
  })

  it("drops a tile whose line exists with no value", () => {
    const blank = [
      line("rozvaha_pasiva", { rowCode: "002", ozn: "A.", bezne: null }),
    ]
    expect(rozvahaHighlights([], blank)).toEqual([])
  })

  it("takes bilanční suma from the FIRST aktiva line in printed order", () => {
    // The AKTIVA CELKEM row has a blank označení on the printed form, so it is
    // identified by position — documented in the module as the one convention.
    const reordered = [AKTIVA[1]!, AKTIVA[0]!]
    expect(rozvahaHighlights(reordered, [])[0]?.value).toBe("2800000.00")
  })
})

describe("vzzHighlights", () => {
  const LINES = [
    line("vzz", { rowCode: "001", ozn: "I.", bezne: "8200000.00" }),
    line("vzz", { rowCode: "049", ozn: "**", bezne: "500000.00" }),
    line("vzz", { rowCode: "055", ozn: "***", bezne: "-350000.00" }),
  ]

  it("reads výsledek hospodaření off the *** řádek, sign intact", () => {
    expect(vzzHighlights(LINES)).toEqual([
      {
        labelKey: "vykazy.highlightVysledekHospodareni",
        value: "-350000.00",
      },
    ])
  })

  it("does not confuse the ** subtotal with the *** result", () => {
    const withoutResult = LINES.filter((row) => row.ozn !== "***")
    expect(vzzHighlights(withoutResult)).toEqual([])
  })
})

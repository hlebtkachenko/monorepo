/**
 * Statutory render fidelity — the column set, the hierarchy and the cells.
 *
 * This is the assertion that a Czech rozvaha comes out as a Czech rozvaha:
 * four columns on aktiva, two on pasiva and VZZ, negative korekce intact,
 * blank cells blank, and indent/bold taken from the row rather than guessed
 * from its label. Everything here is a pure render of fixture rows — no
 * database, no Next request context — because it is the office's own numbers
 * that must not move, and that is a property of the markup.
 *
 * The Server Component is called DIRECTLY as an async function and its
 * returned element tree rendered to a string, the same technique
 * `majetek/page.test.ts` documents.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { BetaStatementKind } from "@/db/schema"
import type { StatementLineView } from "@/lib/data/projections"

vi.mock("@/i18n/translations-server", () => ({
  getBetaTranslations: async () => (key: string) => key,
}))

const { StatementTable } = await import("./statement-table")

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

async function render(
  kind: BetaStatementKind,
  lines: readonly StatementLineView[],
): Promise<string> {
  const element = await StatementTable({
    kind,
    captionKey: "vykazy.captionAktiva",
    lines,
  })
  return renderToStaticMarkup(element)
}

/** Strip the grouping spaces `Intl` emits so an assertion can name a number. */
function digits(html: string): string {
  return html.replace(/\s/g, "")
}

const AKTIVA_CELKEM = line("rozvaha_aktiva", {
  rowCode: "001",
  rowLabel: "AKTIVA CELKEM",
  isBold: true,
  brutto: "5000000.00",
  korekce: "-1200000.00",
  netto: "3800000.00",
  minule: "3500000.00",
})

describe("StatementTable — rozvaha aktiva", () => {
  it("renders all four statutory columns and no běžné column", async () => {
    const html = await render("rozvaha_aktiva", [AKTIVA_CELKEM])

    expect(html).toContain("vykazy.columnBrutto")
    expect(html).toContain("vykazy.columnKorekce")
    expect(html).toContain("vykazy.columnNetto")
    expect(html).toContain("vykazy.columnMinule")
    // Aktiva has no běžné column on the printed form, and
    // `statement_line_column_shape` refuses a value in it.
    expect(html).not.toContain("vykazy.columnBezne")
  })

  it("renders every value the office published, korekce negative", async () => {
    const html = digits(await render("rozvaha_aktiva", [AKTIVA_CELKEM]))

    expect(html).toContain("5000000,00")
    expect(html).toContain("-1200000,00")
    expect(html).toContain("3800000,00")
    expect(html).toContain("3500000,00")
  })

  it("renders netto as STORED, never as brutto − korekce", async () => {
    // A batch whose netto disagrees with the arithmetic still renders the
    // office's own number (spec §0.2) — this portal is not the authority on it.
    const disagreeing = line("rozvaha_aktiva", {
      rowCode: "001",
      brutto: "100.00",
      korekce: "-10.00",
      netto: "42.00",
    })
    const html = digits(await render("rozvaha_aktiva", [disagreeing]))

    expect(html).toContain("42,00")
    expect(html).not.toContain("90,00")
  })

  it("renders a blank cell as an absence, not as a zero", async () => {
    const sparse = line("rozvaha_aktiva", {
      rowCode: "002",
      rowLabel: "Pohledávky za upsaný základní kapitál",
      netto: "0.00",
    })
    const html = digits(await render("rozvaha_aktiva", [sparse]))

    // The row's own zero renders; the three unstated cells render as dashes.
    expect(html).toContain("0,00")
    expect(html.match(/—/g) ?? []).toHaveLength(3)
  })

  it("takes hierarchy from the row's own metadata", async () => {
    const html = await render("rozvaha_aktiva", [
      AKTIVA_CELKEM,
      line("rozvaha_aktiva", {
        rowCode: "037",
        ozn: "B.II.",
        rowLabel: "Dlouhodobý hmotný majetek",
        indent: 2,
        netto: "2800000.00",
      }),
    ])

    expect(html).toContain("B.II.")
    // Bold on the total row, and only there.
    expect(html.match(/font-semibold/g) ?? []).toHaveLength(1)
    expect(html).toContain("pl-6")
  })

  it("clamps an out-of-range indent to the flush-left class rather than emitting none", async () => {
    const html = await render("rozvaha_aktiva", [
      line("rozvaha_aktiva", { rowCode: "001", indent: 99 }),
    ])
    expect(html).toContain("pl-0")
  })
})

describe("StatementTable — rozvaha pasiva and VZZ", () => {
  const PASIVA = line("rozvaha_pasiva", {
    rowCode: "002",
    ozn: "A.",
    rowLabel: "Vlastní kapitál",
    isBold: true,
    bezne: "1800000.00",
    minule: "1600000.00",
  })

  it("renders exactly the two-column set on pasiva", async () => {
    const html = await render("rozvaha_pasiva", [PASIVA])

    expect(html).toContain("vykazy.columnBezne")
    expect(html).toContain("vykazy.columnMinule")
    for (const absent of [
      "vykazy.columnBrutto",
      "vykazy.columnKorekce",
      "vykazy.columnNetto",
    ]) {
      expect(html).not.toContain(absent)
    }
  })

  it("renders exactly the two-column set on VZZ, negative result intact", async () => {
    const html = await render("vzz", [
      line("vzz", {
        rowCode: "055",
        ozn: "***",
        rowLabel: "Výsledek hospodaření za účetní období (+/-)",
        isBold: true,
        bezne: "-350000.00",
        minule: "120000.00",
      }),
    ])

    expect(html).toContain("vykazy.columnBezne")
    expect(html).not.toContain("vykazy.columnBrutto")
    expect(digits(html)).toContain("-350000,00")
    expect(html).toContain("***")
  })

  it("renders no rows and no totals for an empty statement", async () => {
    const html = await render("vzz", [])
    // The header still renders (the reader can see WHICH statement is empty),
    // and there is no footer row for a computed total to hide in.
    expect(html).toContain("vykazy.columnBezne")
    expect(html).not.toContain("<tfoot")
  })
})

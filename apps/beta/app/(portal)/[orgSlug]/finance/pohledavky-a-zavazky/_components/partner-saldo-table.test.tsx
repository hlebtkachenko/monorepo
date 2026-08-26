/**
 * The Pohledávky a závazky table, rendered.
 *
 * WHAT A RENDER TEST IS FOR HERE. `lib/data/partners.test.ts` already proves
 * WHICH rows a client may see, what the totals are and which aging band each
 * partner falls in; this file proves what they are SHOWN — the Czech headers, a
 * cs-CZ money format, the aging chip, and the two absences that matter most:
 *
 *   1. an unstated side rendered as a DASH, never as "0 Kč" (§0.4). A measured
 *      zero and an absence look identical once the zero is printed, and only one
 *      of them is a claim the office actually made.
 *   2. no write affordance anywhere. §3.3 makes every client page read-only, and
 *      a saldokonto is not typed at all — it is published through the import
 *      spine — so a form or a button here would be a route that cannot exist.
 *
 * The Server Component is called DIRECTLY as an async function and its returned
 * element tree rendered to a string, the technique `app/_components/
 * statement-table.test.tsx` documents. `getBetaTranslations` is mocked to the
 * identity, so an assertion names the message KEY and stays readable when a
 * Czech wording changes; `lib/partner-labels.test.ts` is what proves those keys
 * resolve to real Czech.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { PartnerSaldoView } from "@/lib/data/projections"

vi.mock("@/i18n/translations-server", () => ({
  getBetaTranslations: async () => (key: string) => key,
}))

const { PartnerSaldoTable } = await import("./partner-saldo-table")

function row(overrides: Partial<PartnerSaldoView> = {}): PartnerSaldoView {
  return {
    id: "saldo-1",
    partnerId: "partner-1",
    partnerName: "Stavebniny Novák s.r.o.",
    partnerIco: "12345678",
    partnerRole: "supplier",
    receivableTotal: "12000.50",
    payableTotal: "48250.50",
    oldestDue: "2026-04-30",
    aging: "days_1_30",
    daysOverdue: 12,
    ...overrides,
  }
}

async function render(rows: readonly PartnerSaldoView[]): Promise<string> {
  return renderToStaticMarkup(await PartnerSaldoTable({ rows }))
}

/** Strip the grouping spaces `Intl` emits so an assertion can name a number. */
const digits = (html: string): string => html.replace(/\s/g, "")

describe("PartnerSaldoTable", () => {
  it("renders the §2.4 columns", async () => {
    const html = await render([row()])
    for (const key of [
      "finance.columnPartner",
      "finance.columnIco",
      "finance.columnRole",
      "finance.columnReceivable",
      "finance.columnPayable",
      "finance.columnOldestDue",
      "finance.columnAging",
    ]) {
      expect(html, key).toContain(key)
    }
  })

  it("prints the partner, both sides and the oldest splatnost", async () => {
    const html = await render([row()])
    expect(html).toContain("Stavebniny Novák s.r.o.")
    expect(html).toContain("12345678")
    expect(digits(html)).toContain("12000,50Kč")
    expect(digits(html)).toContain("48250,50Kč")
    // cs-CZ prints "30. 04. 2026"; the spaces are the format, not the value.
    expect(digits(html)).toContain("30.04.2026")
    expect(html).toContain("finance.roleSupplier")
  })

  it("renders an unstated side as a dash, never as a zero", async () => {
    // The office's export stated only what the client owes. "0 Kč" in the other
    // column would read as "this partner owes us nothing", which nobody said.
    const html = await render([row({ receivableTotal: null })])
    expect(html).toContain("—")
    expect(digits(html)).not.toContain("0,00Kč")
  })

  it("renders a MEASURED zero as a zero", async () => {
    // The mirror case, and the reason the dash above has to be conditional
    // rather than a blanket "hide small numbers": the office DID state this one.
    const html = await render([row({ receivableTotal: "0.00" })])
    expect(digits(html)).toContain("0,00Kč")
  })

  it("renders a missing splatnost and its band honestly", async () => {
    const html = await render([
      row({ oldestDue: null, aging: "unknown", daysOverdue: null }),
    ])
    expect(html).toContain("finance.agingUnknown")
    // NOT `agingNotDue`: "no date was stated" and "nothing is overdue" are
    // different facts (§0.4).
    expect(html).not.toContain("finance.agingNotDue")
  })

  it("marks each band, and shouts only at the worst one", async () => {
    const bands = [
      "unknown",
      "not_due",
      "days_1_30",
      "days_31_90",
      "days_over_90",
    ] as const

    for (const aging of bands) {
      const html = await render([row({ aging })])
      expect(html, aging).toContain(`finance.aging`)
    }

    // A page that shouted at every row would stop being read; §2.4 asks for a
    // signal, and a signal that never varies is not one.
    // Asserted on `data-variant`, not on a class name: the Badge's base classes
    // mention `destructive` in their aria-invalid rules whatever the variant, so
    // a class match would pass for every band and prove nothing.
    const worst = await render([row({ aging: "days_over_90" })])
    const fine = await render([row({ aging: "not_due" })])
    expect(worst).toContain('data-variant="destructive"')
    expect(fine).toContain('data-variant="outline"')
  })

  it("renders an empty set as an empty table, not as a zero row", async () => {
    const html = await render([])
    expect(html).toContain("finance.columnPartner")
    expect(html).not.toContain("—")
  })

  it("offers no write affordance at all", async () => {
    const html = await render([row()])
    expect(html).not.toContain("<form")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("<input")
  })

  it("ships no office-internal value", async () => {
    // The projection has no field for either, so this asserts the SHAPE holds
    // through the render — a component that reached for a wider type would show
    // up here rather than on a client's screen.
    const html = await render([row()])
    expect(html).not.toContain("external_ref")
    expect(html).not.toContain("note_internal")
  })
})

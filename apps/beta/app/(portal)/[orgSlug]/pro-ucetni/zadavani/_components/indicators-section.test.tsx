/**
 * The Ukazatele section, rendered.
 *
 * SCOPED TO WHAT IS IN THE FLOW. React's server renderer does not render portal
 * content, so nothing inside an `EntrySheet` is observable from a static render
 * — `entry-sheet.test.tsx` documents that at length, and it is exactly why the
 * plan keeps the fields as their own component. The field set is proven in
 * `indicator-fields.test.tsx`; this file proves what the PAGE shows:
 *
 *   1. the section renders the office's stated readings, formatted in Czech
 *      through `formatBetaMoney` / `formatBetaDate` — the figure is never
 *      re-derived, only printed;
 *   2. the load-bearing hint says the portal does not compute obrat, where the
 *      office would otherwise go looking for a feed;
 *   3. the delete form carries the hidden `orgSlug` its action resolves its
 *      scope from, plus the row id — a form that forgot either is an action
 *      that 404s for a reason nobody could see from the page;
 *   4. an empty book says so rather than rendering an empty table.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import type { IndicatorView } from "@/lib/data/projections"

import { IndicatorsSection } from "./indicators-section"

const ORG_SLUG = "acme-sro"

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={BETA_LOCALE}
      timeZone={BETA_TIME_ZONE}
      formats={betaFormats}
      messages={betaMessages as never}
    >
      {node}
    </NextIntlClientProvider>,
  )
}

const tight = (html: string): string => html.replace(/\s/g, "")

function indicator(
  overrides: Partial<IndicatorView & { noteInternal: string }> = {},
): IndicatorView & { noteInternal: string } {
  return {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f6",
    kind: "annual_turnover",
    amount: "2100000.00",
    asOf: "2026-06-30",
    noteInternal: "Bez plnění mimo tuzemsko.",
    updatedAt: "2026-07-01T08:00:00.000Z",
    ...overrides,
  }
}

describe("IndicatorsSection — the empty book", () => {
  it("offers the create trigger and says the table is empty", () => {
    const html = render(
      <IndicatorsSection indicators={[]} orgSlug={ORG_SLUG} />,
    )

    expect(html).toContain("Zadat ukazatel")
    expect(html).toContain("Zatím tu nic není.")
    // The hint is load-bearing: this section IS the source of obrat, and an
    // accountant hunting for the feed has to be told so here.
    expect(html).toContain("Obrat portál nepočítá")
  })
})

describe("IndicatorsSection — a stated reading", () => {
  it("prints the figure in Czech, with its as-of date and the office's note", () => {
    const html = render(
      <IndicatorsSection indicators={[indicator()]} orgSlug={ORG_SLUG} />,
    )

    expect(tight(html)).toContain("2100000,00Kč")
    expect(tight(html)).toContain("30.06.2026")
    expect(html).toContain("Obrat za 12 měsíců")
    expect(html).toContain("Bez plnění mimo tuzemsko.")
  })

  it("offers a correction trigger and a delete form per row", () => {
    const html = render(
      <IndicatorsSection indicators={[indicator()]} orgSlug={ORG_SLUG} />,
    )

    expect(html).toContain("Uložit")
    expect(html).toContain("Smazat")
    expect(html).toContain(`name="orgSlug" value="${ORG_SLUG}"`)
    expect(html).toContain(
      `name="indicatorId" value="0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f6"`,
    )
  })

  it("renders a row whose note is empty without an empty second line", () => {
    const html = render(
      <IndicatorsSection
        indicators={[indicator({ noteInternal: "" })]}
        orgSlug={ORG_SLUG}
      />,
    )

    expect(tight(html)).toContain("2100000,00Kč")
    expect(html).not.toContain('<span class="block text-xs')
  })

  it("lists every reading the office has stated, in the order it was given", () => {
    // `indicatorsForOwner` already ordered them newest-first; the component
    // re-sorts nothing — a second opinion about which figure is newest is
    // exactly the kind of drift that would disagree with the client's card.
    const html = render(
      <IndicatorsSection
        indicators={[
          indicator({ id: "a", amount: "2100000.00", asOf: "2026-06-30" }),
          indicator({ id: "b", amount: "1900000.00", asOf: "2026-05-31" }),
        ]}
        orgSlug={ORG_SLUG}
      />,
    )

    expect(tight(html).indexOf("2100000,00Kč")).toBeLessThan(
      tight(html).indexOf("1900000,00Kč"),
    )
  })
})

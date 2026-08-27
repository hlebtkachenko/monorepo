/**
 * `IndicatorFields`, rendered — the field set both Ukazatele writes share.
 *
 * IT IS TESTED HERE RATHER THAN THROUGH THE SECTION because a portal's content
 * never reaches a static render (`entry-sheet.test.tsx` documents that), which
 * is the reason the plan keeps fields as their own component in the first place.
 * What this file proves is the part `ukazatele.db.test.ts` cannot see: that the
 * form posts the names the action reads, and that the edit arm posts the row's
 * identity as hidden fields rather than as editable ones.
 *
 * THE PRE-FILL IS A CORRECTNESS ASSERTION, NOT A COSMETIC ONE. The sheet submits
 * EVERY field on every save, and `formOptionalText` reads an empty textarea as
 * the office CLEARING the note — so an unfilled note box would silently wipe it
 * on each figure correction.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import type { BetaMessageKey } from "@/i18n/messages"
import type { IndicatorView } from "@/lib/data/projections"

import { IndicatorFields } from "./indicator-fields"

type Catalog = Record<string, Record<string, string>>

/** The same resolution `useBetaTranslations` performs, without a hook. */
const t = (key: BetaMessageKey): string => {
  const [namespace, name] = key.split(".")
  return (betaMessages as unknown as Catalog)[namespace!]?.[name!] ?? key
}

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

const existing: IndicatorView & { noteInternal: string } = {
  id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f6",
  kind: "annual_turnover",
  amount: "2100000.00",
  asOf: "2026-06-30",
  noteInternal: "Bez plnění mimo tuzemsko.",
  updatedAt: "2026-07-01T08:00:00.000Z",
}

describe("the create arm", () => {
  const html = render(<IndicatorFields t={t} idPrefix="new-indicator" />)

  it("posts the four names the action reads", () => {
    for (const name of ["kind", "asOf", "amount", "noteInternal"]) {
      expect(html, name).toContain(`name="${name}"`)
    }
  })

  it("offers every kind the closed list declares", () => {
    expect(html).toContain(`value="annual_turnover"`)
    expect(html).toContain("Obrat za 12 měsíců")
  })

  it("asks for the as-of date as a real date control — §0.4, never today", () => {
    expect(html).toContain(`type="date"`)
    expect(html).toContain("Údaj k datu")
  })

  it("prefixes every id so two forms on one page do not share labels", () => {
    expect(html).toContain(`id="new-indicator-amount"`)
    expect(html).toContain(`for="new-indicator-amount"`)
  })
})

describe("the edit arm", () => {
  const html = render(
    <IndicatorFields t={t} idPrefix="indicator-1" indicator={existing} />,
  )

  it("carries kind and as_of as HIDDEN fields — they are the row's identity", () => {
    // An editable date would not MOVE the reading, it would state a second one
    // and leave the first behind. A mis-dated row is deleted and re-entered.
    expect(html).toContain(`type="hidden" name="kind" value="annual_turnover"`)
    expect(html).toContain(`type="hidden" name="asOf" value="2026-06-30"`)
    expect(html).not.toContain(`type="date"`)
    expect(html).not.toContain("<select")
  })

  it("prints the pair it will not let you change, as text", () => {
    expect(html).toContain("Obrat za 12 měsíců")
    expect(html.replace(/\s/g, "")).toContain("30.06.2026")
  })

  it("pre-fills the figure and the internal note", () => {
    expect(html).toContain(`value="2100000.00"`)
    expect(html).toContain(">Bez plnění mimo tuzemsko.</textarea>")
  })
})

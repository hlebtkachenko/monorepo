/**
 * The Dluhy a platby group card and its freshness strip, rendered.
 *
 * WHAT A RENDER TEST IS FOR HERE, and what it is not. `obligations.test.ts`
 * already proves WHICH rows a client may see and what the sums are; this file
 * proves what they are SHOWN about them — the Czech creditor heading, the
 * per-group stamp, the Po splatnosti marking, the cs-CZ money and date formats,
 * and two absences that matter more than any of it:
 *
 *   1. no write affordance anywhere (§3.3 makes every client page read-only,
 *      and a mutation affordance is added by accident far more often than a
 *      query filter is removed by accident);
 *   2. an unimplemented source rendered as ABSENT rather than as "0 Kč" (§0.4),
 *      which is the whole reason `ObligationSourceFreshness` carries
 *      `implemented` at all.
 *
 * `renderToStaticMarkup` rather than jsdom + Testing Library, following PR 12's
 * Dokumenty suite: both components are a pure function of their props, so a
 * string is enough — and it keeps the file in the `pure` vitest project, with no
 * browser environment and no Postgres behind it.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import type {
  Obligation,
  ObligationGroupSummary,
  ObligationSourceFreshness,
} from "@/lib/data/obligations"

import { ObligationGroupCard } from "@/app/_components/obligation-group-card"

import { SourceFreshness } from "./source-freshness"

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

/** cs-CZ separates with spaces of three widths; compare on the rest. */
const tight = (html: string): string => html.replace(/\s/g, "")

function obligation(overrides: Partial<Obligation> = {}): Obligation {
  return {
    key: "filing:doc-1",
    source: "filing",
    group: "fu",
    filingKind: "dph_priznani",
    label: null,
    period: null,
    amount: "31200.00",
    dueOn: "2026-03-25",
    variableSymbol: "12345678",
    overdue: false,
    daysOverdue: 0,
    asOf: "2026-03-07T10:00:00.000Z",
    ...overrides,
  }
}

function group(
  overrides: Partial<ObligationGroupSummary> = {},
): ObligationGroupSummary {
  return {
    group: "fu",
    obligations: [obligation()],
    total: "31200.00",
    overdue: "0.00",
    overdueCount: 0,
    asOf: "2026-03-07T10:00:00.000Z",
    ...overrides,
  }
}

describe("ObligationGroupCard", () => {
  it("names the creditor group in Czech and stamps it with the source's own edit", () => {
    const html = render(<ObligationGroupCard group={group()} />)

    expect(html).toContain("Finanční úřad")
    expect(html).toContain("Údaje k")
    // 10:00 UTC in March is 11:00 in Prague — the stamp is a moment, not a day.
    expect(tight(html)).toContain("07.03.202611:00")
  })

  it("renders a filing row through its Czech form name, and a manual one verbatim", () => {
    const html = render(
      <ObligationGroupCard
        group={group({
          group: "ostatni",
          obligations: [
            obligation({ key: "filing:1" }),
            obligation({
              key: "manual_liability:2",
              source: "manual_liability",
              filingKind: null,
              label: "Penále z prodlení",
              amount: "1500.50",
              variableSymbol: null,
            }),
          ],
        })}
      />,
    )

    expect(html).toContain("Přiznání k DPH")
    // A liability's titul is the office's own words and is never translated.
    expect(html).toContain("Penále z prodlení")
    // No VS on that row — an em dash, not an empty cell or "null".
    expect(html).toContain("—")
    expect(html).not.toContain("null")
  })

  it("renders cs-CZ money at full scale, and never a rounded float", () => {
    const html = render(
      <ObligationGroupCard
        group={group({
          obligations: [obligation({ amount: "1234567.89" })],
          total: "1234567.89",
        })}
      />,
    )

    expect(tight(html)).toContain("1234567,89Kč")
  })

  it("marks Po splatnosti, and does not mark what is not", () => {
    const overdue = render(
      <ObligationGroupCard
        group={group({
          obligations: [obligation({ overdue: true, daysOverdue: 10 })],
          overdue: "31200.00",
          overdueCount: 1,
        })}
      />,
    )
    expect(overdue).toContain("Po splatnosti")

    const open = render(<ObligationGroupCard group={group()} />)
    expect(open).toContain("K úhradě")
    expect(open).not.toContain("Po splatnosti")
  })

  it("shows the group's SQL total under its rows", () => {
    const html = render(
      <ObligationGroupCard
        group={group({
          obligations: [
            obligation({ key: "a", amount: "1000.00" }),
            obligation({ key: "b", amount: "250.50" }),
          ],
          total: "1250.50",
        })}
      />,
    )

    expect(html).toContain("Celkem")
    expect(tight(html)).toContain("1250,50Kč")
  })

  it("offers a client no way to change anything", () => {
    const html = render(<ObligationGroupCard group={group()} />)

    // §3.3: client pages are read-only for every role, Zadávání dat is the only
    // editing home. Nothing here may be a form, a button or an input.
    expect(html).not.toContain("<form")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("<input")
    expect(html).not.toContain("<select")
  })
})

function freshness(
  overrides: Partial<ObligationSourceFreshness>[] = [],
): ObligationSourceFreshness[] {
  const base: ObligationSourceFreshness[] = [
    {
      source: "filing",
      implemented: true,
      sourceUpdatedAt: "2026-03-07T10:00:00.000Z",
      openCount: 2,
    },
    {
      source: "partner_saldo",
      implemented: false,
      sourceUpdatedAt: null,
      openCount: 0,
    },
    {
      source: "manual_liability",
      implemented: true,
      sourceUpdatedAt: null,
      openCount: 0,
    },
  ]
  return base.map((row, index) => ({ ...row, ...overrides[index] }))
}

describe("SourceFreshness — §0.4, empty beats stale", () => {
  it("names all three feeds, whether or not they exist yet", () => {
    const html = render(<SourceFreshness freshness={freshness()} />)

    expect(html).toContain("Daňová podání")
    expect(html).toContain("Saldokonto dodavatelů")
    expect(html).toContain("Ručně zadané závazky")
  })

  it("says a missing feed is NOT CONNECTED rather than showing it as zero", () => {
    const html = render(<SourceFreshness freshness={freshness()} />)

    // The single most important string on this strip: without it, a client
    // reads the page total as everything they owe.
    expect(html).toContain("Zatím nenapojeno")
    expect(html).not.toContain("0 Kč")
  })

  it("distinguishes a connected-but-empty feed from an absent one", () => {
    const html = render(<SourceFreshness freshness={freshness()} />)

    // `manual_liability` is implemented and has no rows — a different fact from
    // `partner_saldo`, which does not exist yet.
    expect(html).toContain("Zatím nebylo nahráno")
  })

  it("stamps a fed source with its own last edit and its open count", () => {
    const html = render(<SourceFreshness freshness={freshness()} />)

    expect(tight(html)).toContain("07.03.202611:00")
    expect(html).toContain("otevřených položek")
  })

  it("is read-only, like everything else on this page", () => {
    const html = render(<SourceFreshness freshness={freshness()} />)

    expect(html).not.toContain("<form")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("<input")
  })
})

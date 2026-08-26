/**
 * The Účty a hotovost card and its sparkline, rendered.
 *
 * WHAT A RENDER TEST IS FOR HERE. `lib/data/account-balances.test.ts` already
 * proves WHICH figures reach the page; this file proves what a client is SHOWN
 * about them — the Czech kind badge, the cs-CZ money format, the period stamp —
 * and three absences that matter more than any of it:
 *
 *   1. no write affordance anywhere (§3.3 makes every client page read-only,
 *      and a mutation affordance is added by accident far more often than a
 *      query filter is removed by accident);
 *   2. an account the current předvaha does not carry rendered as a SENTENCE
 *      rather than as "0 Kč" (§0.4) — a printed zero and a measured zero are
 *      indistinguishable, and only one of them would be true;
 *   3. no chart drawn through a single point, and no line segment drawn across
 *      a period the office did not state (Advisor F18's empty chart, and §0.4's
 *      interpolation, in their chart form).
 *
 * `renderToStaticMarkup` rather than jsdom + Testing Library, following the
 * Dluhy a platby suite: both components are a pure function of their props, so
 * a string is enough — and it keeps the file in the `pure` vitest project, with
 * no browser environment and no Postgres behind it.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import type {
  AccountBalanceCard,
  AccountBalancePoint,
} from "@/lib/data/account-balances"

import { AccountCard } from "./account-card"
import { BalanceSparkline } from "./balance-sparkline"

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

let periodSeq = 0
function point(
  closingBalance: string | null,
  plotRatio: number | null,
  matchedAccounts = closingBalance === null ? 0 : 1,
): AccountBalancePoint {
  periodSeq += 1
  return {
    periodId: `period-${periodSeq}`,
    period: {
      id: `period-${periodSeq}`,
      kind: "month",
      year: 2026,
      month: ((periodSeq - 1) % 12) + 1,
      quarter: null,
      startsOn: "2026-01-01",
      endsOn: "2026-01-31",
    },
    closingBalance,
    matchedAccounts,
    plotRatio,
  }
}

function card(overrides: Partial<AccountBalanceCard> = {}): AccountBalanceCard {
  const series = overrides.series ?? [
    point("100000.00", 0),
    point("150000.50", 1),
  ]
  return {
    id: "map-1",
    accountCode: "221",
    matchKind: "exact",
    label: "Fio běžný účet",
    kind: "bank",
    closingBalance: series.at(-1)?.closingBalance ?? null,
    matchedAccounts: series.at(-1)?.matchedAccounts ?? 0,
    series,
    ...overrides,
  }
}

describe("AccountCard", () => {
  it("shows the office's label, the account code and the Czech kind", () => {
    const html = render(<AccountCard card={card()} />)
    expect(html).toContain("Fio běžný účet")
    expect(html).toContain("221")
    expect(html).toContain("Bankovní účet")
  })

  it("renders the balance in cs-CZ, from the string the office published", () => {
    const html = render(<AccountCard card={card()} />)
    expect(tight(html)).toContain(tight("150 000,50 Kč"))
    // The period the figure is AS OF (§0.4), never "k dnešnímu dni".
    expect(html).toContain("Zůstatek k")
  })

  it("labels a pokladna as one", () => {
    const html = render(
      <AccountCard card={card({ kind: "cash", accountCode: "211" })} />,
    )
    expect(html).toContain("Pokladna")
  })

  it("says how many účty a prefix card covers", () => {
    const html = render(
      <AccountCard
        card={card({
          matchKind: "prefix",
          series: [point("10.00", null, 3), point("20.00", null, 3)],
        })}
      />,
    )
    expect(html).toContain("Účet včetně analytik")
    expect(html).toContain("3")
    expect(html).toContain("účtů z předvahy")
  })

  it("says the předvaha does not list the account, and never prints a zero", () => {
    const html = render(
      <AccountCard
        card={card({ series: [point(null, null)], closingBalance: null })}
      />,
    )
    expect(html).toContain("Předvaha tento účet za dané období neuvádí.")
    expect(html).not.toContain("0,00")
  })

  it("draws no chart through a single point", () => {
    const html = render(
      <AccountCard card={card({ series: [point("5.00", null)] })} />,
    )
    expect(html).toContain("Vývoj se zobrazí po druhé zveřejněné předvaze.")
    expect(html).not.toContain("<svg")
  })

  it("draws the trend once there are two stated points", () => {
    const html = render(<AccountCard card={card()} />)
    expect(html).toContain("Vývoj zůstatku")
    expect(html).toContain("<svg")
  })

  it("offers no write affordance at all", () => {
    const html = render(<AccountCard card={card()} />)
    expect(html).not.toContain("<form")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("<input")
  })
})

describe("BalanceSparkline", () => {
  it("marks every stated point and joins them into one polyline", () => {
    const html = renderToStaticMarkup(
      <BalanceSparkline
        series={[point("1.00", 0), point("2.00", 0.5), point("3.00", 1)]}
      />,
    )
    expect(html.match(/<circle/g)).toHaveLength(3)
    expect(html.match(/<polyline/g)).toHaveLength(1)
  })

  it("breaks the line at a gap instead of drawing through it", () => {
    const html = renderToStaticMarkup(
      <BalanceSparkline
        series={[
          point("1.00", 0),
          point("2.00", 1),
          point(null, null),
          point("3.00", 0.5),
          point("4.00", 0.7),
        ]}
      />,
    )
    // Two runs of stated points, so two polylines — never one drawn across the
    // period the office did not state.
    expect(html.match(/<polyline/g)).toHaveLength(2)
    expect(html.match(/<circle/g)).toHaveLength(4)
  })

  it("puts a higher balance higher on the screen", () => {
    const html = renderToStaticMarkup(
      <BalanceSparkline series={[point("1.00", 0), point("2.00", 1)]} />,
    )
    const [, coordinates] = /points="([^"]+)"/.exec(html) ?? []
    const ys = (coordinates ?? "")
      .split(" ")
      .map((pair) => Number(pair.split(",")[1]))
    // SVG y grows downward, so the higher balance has the SMALLER y.
    expect(ys[1]).toBeLessThan(ys[0]!)
  })

  it("centres a series that never moves rather than pinning it to an edge", () => {
    const html = renderToStaticMarkup(
      <BalanceSparkline
        series={[point("42.00", null), point("42.00", null)]}
      />,
    )
    const [, coordinates] = /points="([^"]+)"/.exec(html) ?? []
    const ys = (coordinates ?? "")
      .split(" ")
      .map((pair) => Number(pair.split(",")[1]))
    expect(ys[0]).toBe(ys[1])
    expect(ys[0]).toBeGreaterThan(0)
  })

  it("renders nothing at all when no point states a balance", () => {
    expect(
      renderToStaticMarkup(
        <BalanceSparkline series={[point(null, null), point(null, null)]} />,
      ),
    ).toBe("")
  })

  it("is decorative — the card carries the same facts as text", () => {
    const html = renderToStaticMarkup(
      <BalanceSparkline series={[point("1.00", 0), point("2.00", 1)]} />,
    )
    expect(html).toContain('aria-hidden="true"')
  })
})

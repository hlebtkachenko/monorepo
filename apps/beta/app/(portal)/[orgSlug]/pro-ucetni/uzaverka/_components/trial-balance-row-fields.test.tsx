/**
 * `TrialBalanceRowFields` — the předvaha row drawer's field set (manual-entry
 * plan §3, W5). Rendered directly with `react-dom/server`, mirroring
 * `saldo-row-fields.test.tsx`.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { TrialBalanceLineView } from "@/lib/data/projections"

import { TrialBalanceRowFields } from "./trial-balance-row-fields"

const t = (key: string) => key

function line(
  overrides: Partial<TrialBalanceLineView> = {},
): TrialBalanceLineView {
  return {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5fc",
    accountCode: "221",
    accountName: "Bankovní účty",
    openingBalance: "10000.00",
    turnoverDebit: "5000.00",
    turnoverCredit: "2000.00",
    closingBalance: "13000.00",
    ...overrides,
  }
}

describe("TrialBalanceRowFields — add (no line)", () => {
  it("prefixes every id/htmlFor pair with idPrefix", () => {
    const html = renderToStaticMarkup(
      <TrialBalanceRowFields t={t} idPrefix="new-predvaha-row" />,
    )
    expect(html).toContain('id="new-predvaha-row-accountCode"')
    expect(html).toContain('for="new-predvaha-row-accountCode"')
  })

  it("renders all four money columns", () => {
    const html = renderToStaticMarkup(
      <TrialBalanceRowFields t={t} idPrefix="new-predvaha-row" />,
    )
    expect(html).toContain('name="openingBalance"')
    expect(html).toContain('name="turnoverDebit"')
    expect(html).toContain('name="turnoverCredit"')
    expect(html).toContain('name="closingBalance"')
  })

  it("carries no stored value — every input starts empty", () => {
    const html = renderToStaticMarkup(
      <TrialBalanceRowFields t={t} idPrefix="new-predvaha-row" />,
    )
    expect(html).not.toContain("Bankovní účty")
    expect(html).not.toContain('value="221"')
  })

  it("requires accountCode and accountName", () => {
    const html = renderToStaticMarkup(
      <TrialBalanceRowFields t={t} idPrefix="new-predvaha-row" />,
    )
    const accountCode = html.match(
      /id="new-predvaha-row-accountCode"[^>]*>/,
    )?.[0]
    const accountName = html.match(
      /id="new-predvaha-row-accountName"[^>]*>/,
    )?.[0]
    expect(accountCode).toContain("required")
    expect(accountName).toContain("required")
  })
})

describe("TrialBalanceRowFields — edit (an existing line)", () => {
  it("pre-fills every stored value as defaultValue", () => {
    const rowLine = line()
    const html = renderToStaticMarkup(
      <TrialBalanceRowFields
        t={t}
        idPrefix={`predvaha-row-${rowLine.id}`}
        line={rowLine}
      />,
    )
    expect(html).toContain('value="221"')
    expect(html).toContain("Bankovní účty")
    expect(html).toContain('value="10000.00"')
    expect(html).toContain('value="13000.00"')
  })

  it("scopes id/htmlFor by the row's own idPrefix, not a shared one", () => {
    const rowLine = line()
    const html = renderToStaticMarkup(
      <TrialBalanceRowFields
        t={t}
        idPrefix={`predvaha-row-${rowLine.id}`}
        line={rowLine}
      />,
    )
    expect(html).toContain(`id="predvaha-row-${rowLine.id}-accountCode"`)
    expect(html).toContain(`for="predvaha-row-${rowLine.id}-accountCode"`)
  })

  it("leaves an unstated balance EMPTY rather than rendering 0", () => {
    const rowLine = line({ turnoverCredit: null })
    const html = renderToStaticMarkup(
      <TrialBalanceRowFields
        t={t}
        idPrefix={`predvaha-row-${rowLine.id}`}
        line={rowLine}
      />,
    )
    const turnoverCredit = html.match(
      /id="predvaha-row-[^"]+-turnoverCredit"[^>]*\/>/,
    )?.[0]
    expect(turnoverCredit).toContain('value=""')
  })
})

/**
 * `StatementRowFields` — the výkazy row drawer's field set (manual-entry
 * plan §3, W5). Rendered directly with `react-dom/server`, mirroring
 * `saldo-row-fields.test.tsx`: `t` is a plain synchronous prop, so no
 * `Sheet` and no `NextIntlClientProvider` is needed.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { StatementLineView } from "@/lib/data/projections"

import { StatementRowFields } from "./statement-row-fields"

const t = (key: string) => key

function line(overrides: Partial<StatementLineView> = {}): StatementLineView {
  return {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5fc",
    statementKind: "rozvaha_aktiva",
    ozn: "B.II.",
    rowCode: "014",
    rowLabel: "Dlouhodobý hmotný majetek",
    indent: 2,
    isBold: false,
    brutto: "150000.00",
    korekce: "50000.00",
    netto: "100000.00",
    bezne: null,
    minule: "90000.00",
    ...overrides,
  }
}

describe("StatementRowFields — rozvaha_aktiva (add, no line)", () => {
  it("prefixes every id/htmlFor pair with idPrefix", () => {
    const html = renderToStaticMarkup(
      <StatementRowFields
        t={t}
        idPrefix="new-statement-row"
        kind="rozvaha_aktiva"
        defaultSortOrder={1}
      />,
    )
    expect(html).toContain('id="new-statement-row-rowCode"')
    expect(html).toContain('for="new-statement-row-rowCode"')
  })

  it("renders the four aktiva money columns, never bezne", () => {
    const html = renderToStaticMarkup(
      <StatementRowFields
        t={t}
        idPrefix="new-statement-row"
        kind="rozvaha_aktiva"
        defaultSortOrder={1}
      />,
    )
    expect(html).toContain('name="brutto"')
    expect(html).toContain('name="korekce"')
    expect(html).toContain('name="netto"')
    expect(html).toContain('name="minule"')
    expect(html).not.toContain('name="bezne"')
  })

  it("carries the computed sortOrder as the field's starting value", () => {
    const html = renderToStaticMarkup(
      <StatementRowFields
        t={t}
        idPrefix="new-statement-row"
        kind="rozvaha_aktiva"
        defaultSortOrder={7}
      />,
    )
    expect(html).toContain('value="7"')
  })

  it("carries no stored value — every input starts empty", () => {
    const html = renderToStaticMarkup(
      <StatementRowFields
        t={t}
        idPrefix="new-statement-row"
        kind="rozvaha_aktiva"
        defaultSortOrder={1}
      />,
    )
    expect(html).not.toContain("150000.00")
    expect(html).not.toContain("Dlouhodobý hmotný majetek")
  })

  it("requires rowCode and rowLabel", () => {
    const html = renderToStaticMarkup(
      <StatementRowFields
        t={t}
        idPrefix="new-statement-row"
        kind="rozvaha_aktiva"
        defaultSortOrder={1}
      />,
    )
    const rowCode = html.match(/id="new-statement-row-rowCode"[^>]*>/)?.[0]
    const rowLabel = html.match(/id="new-statement-row-rowLabel"[^>]*>/)?.[0]
    expect(rowCode).toContain("required")
    expect(rowLabel).toContain("required")
  })
})

describe("StatementRowFields — rozvaha_pasiva / vzz shape", () => {
  it("renders bezne and minule, never the aktiva columns", () => {
    const html = renderToStaticMarkup(
      <StatementRowFields
        t={t}
        idPrefix="new-statement-row"
        kind="rozvaha_pasiva"
        defaultSortOrder={1}
      />,
    )
    expect(html).toContain('name="bezne"')
    expect(html).toContain('name="minule"')
    expect(html).not.toContain('name="brutto"')
    expect(html).not.toContain('name="korekce"')
    expect(html).not.toContain('name="netto"')
  })

  it("renders the same bezne/minule shape for vzz", () => {
    const html = renderToStaticMarkup(
      <StatementRowFields
        t={t}
        idPrefix="new-statement-row"
        kind="vzz"
        defaultSortOrder={1}
      />,
    )
    expect(html).toContain('name="bezne"')
    expect(html).toContain('name="minule"')
    expect(html).not.toContain('name="brutto"')
  })
})

describe("StatementRowFields — edit (an existing line)", () => {
  it("pre-fills every stored value as defaultValue", () => {
    const rowLine = line()
    const html = renderToStaticMarkup(
      <StatementRowFields
        t={t}
        idPrefix={`statement-row-${rowLine.id}`}
        kind="rozvaha_aktiva"
        defaultSortOrder={3}
        line={rowLine}
      />,
    )
    expect(html).toContain('value="B.II."')
    expect(html).toContain('value="014"')
    expect(html).toContain("Dlouhodobý hmotný majetek")
    expect(html).toContain('value="150000.00"')
    expect(html).toContain('value="90000.00"')
  })

  it("scopes id/htmlFor by the row's own idPrefix, not a shared one", () => {
    const rowLine = line()
    const html = renderToStaticMarkup(
      <StatementRowFields
        t={t}
        idPrefix={`statement-row-${rowLine.id}`}
        kind="rozvaha_aktiva"
        defaultSortOrder={3}
        line={rowLine}
      />,
    )
    expect(html).toContain(`id="statement-row-${rowLine.id}-rowCode"`)
    expect(html).toContain(`for="statement-row-${rowLine.id}-rowCode"`)
  })

  it("leaves an unstated ozn EMPTY rather than rendering a placeholder", () => {
    const rowLine = line({ ozn: null })
    const html = renderToStaticMarkup(
      <StatementRowFields
        t={t}
        idPrefix={`statement-row-${rowLine.id}`}
        kind="rozvaha_aktiva"
        defaultSortOrder={3}
        line={rowLine}
      />,
    )
    const ozn = html.match(/id="statement-row-[^"]+-ozn"[^>]*\/>/)?.[0]
    expect(ozn).toContain('value=""')
  })

  it("checks the tučně box when the row is bold", () => {
    const rowLine = line({ isBold: true })
    const html = renderToStaticMarkup(
      <StatementRowFields
        t={t}
        idPrefix={`statement-row-${rowLine.id}`}
        kind="rozvaha_aktiva"
        defaultSortOrder={3}
        line={rowLine}
      />,
    )
    const checkbox = html.match(
      /<button[^>]*id="statement-row-[^"]+-isBold"[^>]*>/,
    )?.[0]
    expect(checkbox).toContain('data-state="checked"')
  })

  it("leaves the tučně box unchecked when the row is not bold", () => {
    const rowLine = line({ isBold: false })
    const html = renderToStaticMarkup(
      <StatementRowFields
        t={t}
        idPrefix={`statement-row-${rowLine.id}`}
        kind="rozvaha_aktiva"
        defaultSortOrder={3}
        line={rowLine}
      />,
    )
    const checkbox = html.match(
      /<button[^>]*id="statement-row-[^"]+-isBold"[^>]*>/,
    )?.[0]
    expect(checkbox).toContain('data-state="unchecked"')
  })
})

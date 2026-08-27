/**
 * `ManualBatchPeriodFields` — rendered directly with `react-dom/server`, no
 * `Sheet` and no `NextIntlClientProvider`: `t` is a plain synchronous prop
 * (the component's own doc comment states why), so neither is needed. Same
 * shape as `loan-fields.test.tsx`.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ManualBatchPeriodFields } from "./manual-batch-period-fields"

const t = (key: string) => key

describe("ManualBatchPeriodFields", () => {
  it("prefixes every id/htmlFor pair with idPrefix", () => {
    const html = renderToStaticMarkup(
      <ManualBatchPeriodFields
        t={t}
        idPrefix="start-saldokonto"
        defaultMonth={7}
        defaultYear={2026}
      />,
    )
    expect(html).toContain('id="start-saldokonto-month"')
    expect(html).toContain('for="start-saldokonto-month"')
    expect(html).toContain('id="start-saldokonto-year"')
    expect(html).toContain('for="start-saldokonto-year"')
  })

  it("scopes id/htmlFor by idPrefix, so two triggers never collide", () => {
    const html = renderToStaticMarkup(
      <ManualBatchPeriodFields
        t={t}
        idPrefix="start-saldokonto-pohledavky"
        defaultMonth={7}
        defaultYear={2026}
      />,
    )
    expect(html).toContain('id="start-saldokonto-pohledavky-month"')
    expect(html).not.toContain('id="start-saldokonto-month"')
  })

  it("pre-fills the given month and year as defaultValue", () => {
    const html = renderToStaticMarkup(
      <ManualBatchPeriodFields
        t={t}
        idPrefix="start-saldokonto"
        defaultMonth={3}
        defaultYear={2025}
      />,
    )
    expect(html).toContain('value="3"')
    expect(html).toContain('value="2025"')
  })

  it("marks both fields required — a manual batch always names a period", () => {
    const html = renderToStaticMarkup(
      <ManualBatchPeriodFields
        t={t}
        idPrefix="start-saldokonto"
        defaultMonth={7}
        defaultYear={2026}
      />,
    )
    const month = html.match(/id="start-saldokonto-month"[^>]*\/>/)?.[0]
    const year = html.match(/id="start-saldokonto-year"[^>]*\/>/)?.[0]
    expect(month).toContain("required")
    expect(year).toContain("required")
  })
})

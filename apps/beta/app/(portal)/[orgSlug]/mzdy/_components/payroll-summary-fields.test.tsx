/**
 * `PayrollSummaryFields` — the twelve-figure field set a "start a manual
 * payroll batch" `EntrySheet` posts (manual-entry plan §3, W4). Rendered
 * directly with `react-dom/server`, the same shape
 * `employee-fields.test.tsx` uses: `t` is a plain synchronous prop, no
 * `NextIntlClientProvider` needed.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { PayrollSummaryFields } from "./payroll-summary-fields"

const t = (key: string) => key

describe("PayrollSummaryFields", () => {
  it("prefixes every id/htmlFor pair with idPrefix", () => {
    const html = renderToStaticMarkup(
      <PayrollSummaryFields t={t} idPrefix="start-payroll" />,
    )
    expect(html).toContain('id="start-payroll-grossTotal"')
    expect(html).toContain('for="start-payroll-grossTotal"')
  })

  it("carries one field per PayrollSummaryInput key, none required", () => {
    const html = renderToStaticMarkup(
      <PayrollSummaryFields t={t} idPrefix="start-payroll" />,
    )
    const names = [
      "grossTotal",
      "employerSocial",
      "employerHealth",
      "employerCostTotal",
      "employeeWithholdingsTotal",
      "incomeTaxAdvance",
      "netPaidTotal",
      "paymentDueDate",
      "headcountHpp",
      "headcountDpc",
      "headcountDpp",
      "noteClient",
    ]
    for (const name of names) {
      expect(html).toContain(`name="${name}"`)
    }
    // Every field optional (spec §0.4: an unknown is not a zero).
    expect(html).not.toContain("required")
  })

  it("renders the date field as type=date and the note as a textarea", () => {
    const html = renderToStaticMarkup(
      <PayrollSummaryFields t={t} idPrefix="start-payroll" />,
    )
    expect(html).toContain('type="date"')
    expect(html).toContain('name="paymentDueDate"')
    expect(html).toMatch(/<textarea[^>]*name="noteClient"/)
  })
})

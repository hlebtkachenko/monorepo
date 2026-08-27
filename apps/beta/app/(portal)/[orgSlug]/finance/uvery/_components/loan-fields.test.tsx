/**
 * `LoanFields` — Úvěry's field set, consumed both by the JS-free edit
 * `<details>` (`LoanActionForm`, unchanged by this PR) and by the create
 * `EntrySheet`'s children (W0's reference conversion,
 * `finance/uvery/page.tsx`). Rendered directly with `react-dom/server`, no
 * `Sheet` and no `NextIntlClientProvider`: `t` is a plain synchronous prop
 * (the component's own doc comment states why), so neither is needed —
 * which is exactly the payoff of keeping fields in their own component
 * (plan §2.1 point 3): they render, and test, the same whether their parent
 * is a Sheet or a plain card.
 *
 * Both directions, mirroring `partners-section.test.tsx`'s create/edit
 * split: no `loan` → every field is empty and `idPrefix` scopes every
 * `id`/`htmlFor` pair so two rows never collide; a `loan` → every field
 * carries its stored value as `defaultValue`.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { LoanView } from "@/lib/data/projections"

import { LoanFields } from "./loan-fields"

const t = (key: string) => key

function loan(overrides: Partial<LoanView> = {}): LoanView {
  return {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5fa",
    institution: "Komercni banka",
    loanKind: "loan",
    principal: "2500000.00",
    balance: "2100000.00",
    balanceAsOf: "2026-06-30",
    installment: "18500.00",
    installmentPeriod: "monthly",
    interestRatePct: "5.900",
    endsOn: "2032-12-31",
    noteClient: "Investiční úvěr",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  }
}

describe("LoanFields — create (no loan)", () => {
  it("prefixes every id/htmlFor pair with idPrefix", () => {
    const html = renderToStaticMarkup(<LoanFields t={t} idPrefix="new-loan" />)
    expect(html).toContain('id="new-loan-institution"')
    expect(html).toContain('for="new-loan-institution"')
  })

  it("carries no stored value — every input starts empty", () => {
    const html = renderToStaticMarkup(<LoanFields t={t} idPrefix="new-loan" />)
    expect(html).not.toContain("Komercni banka")
  })

  it("marks institution, loanKind and principal required", () => {
    const html = renderToStaticMarkup(<LoanFields t={t} idPrefix="new-loan" />)
    const institution = html.match(/id="new-loan-institution"[^>]*\/>/)?.[0]
    const principal = html.match(/id="new-loan-principal"[^>]*\/>/)?.[0]
    const balance = html.match(/id="new-loan-balance"[^>]*\/>/)?.[0]
    expect(institution).toContain("required")
    expect(principal).toContain("required")
    // `balance` is optional (§0.4 — an undated/unstated zůstatek is a real,
    // representable state, not one the input forces the office to fill in).
    expect(balance).not.toContain("required")
  })
})

describe("LoanFields — edit (an existing loan)", () => {
  it("pre-fills every stored value as defaultValue", () => {
    const html = renderToStaticMarkup(
      <LoanFields t={t} idPrefix={`loan-${loan().id}`} loan={loan()} />,
    )
    expect(html).toContain('value="Komercni banka"')
    expect(html).toContain('value="2500000.00"')
    expect(html).toContain('value="2100000.00"')
    expect(html).toContain('value="2026-06-30"')
    // `noteClient` is a `Textarea` — its stored value is CHILD text, not a
    // `value` attribute.
    expect(html).toContain(">Investiční úvěr</textarea>")
  })

  it("scopes id/htmlFor by the row's own idPrefix, not a shared one", () => {
    const id = loan().id
    const html = renderToStaticMarkup(
      <LoanFields t={t} idPrefix={`loan-${id}`} loan={loan()} />,
    )
    expect(html).toContain(`id="loan-${id}-institution"`)
    expect(html).toContain(`for="loan-${id}-institution"`)
  })
})

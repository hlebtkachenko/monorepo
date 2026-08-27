/**
 * `SaldoRowFields` — the saldokonto row drawer's field set (manual-entry plan
 * §3, W2), consumed by both the "add a partner" `EntrySheet` and every row's
 * own "edit" one. Rendered directly with `react-dom/server`, mirroring
 * `loan-fields.test.tsx`: `t` is a plain synchronous prop, so no `Sheet` and
 * no `NextIntlClientProvider` is needed.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type { PartnerSaldoLineView, PartnerView } from "@/lib/data/projections"

import { SaldoRowFields } from "./saldo-row-fields"

const t = (key: string) => key

const PARTNERS: readonly PartnerView[] = [
  {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5fa",
    name: "ACME s.r.o.",
    ico: null,
    dic: null,
    role: "supplier",
    email: null,
    phone: null,
    street: null,
    houseNumber: null,
    orientationNumber: null,
    city: null,
    postalCode: null,
    countryCode: "CZ",
    legalFormCsuCode: null,
    registryFileNumber: null,
    aresFetchedAt: null,
    noteClient: null,
    source: "manual",
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
  {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5fb",
    name: "Bau Partner a.s.",
    ico: null,
    dic: null,
    role: "customer",
    email: null,
    phone: null,
    street: null,
    houseNumber: null,
    orientationNumber: null,
    city: null,
    postalCode: null,
    countryCode: "CZ",
    legalFormCsuCode: null,
    registryFileNumber: null,
    aresFetchedAt: null,
    noteClient: null,
    source: "manual",
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
]

function line(
  overrides: Partial<PartnerSaldoLineView> = {},
): PartnerSaldoLineView {
  return {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5fc",
    partnerId: PARTNERS[0]!.id,
    partnerName: PARTNERS[0]!.name,
    receivableTotal: null,
    payableTotal: "1500.50",
    oldestDue: "2026-05-01",
    ...overrides,
  }
}

describe("SaldoRowFields — add (no line)", () => {
  it("prefixes every id/htmlFor pair with idPrefix", () => {
    const html = renderToStaticMarkup(
      <SaldoRowFields t={t} idPrefix="new-saldo-row" partners={PARTNERS} />,
    )
    expect(html).toContain('id="new-saldo-row-partnerId"')
    expect(html).toContain('for="new-saldo-row-partnerId"')
  })

  it("lists every partner as an option, by id", () => {
    const html = renderToStaticMarkup(
      <SaldoRowFields t={t} idPrefix="new-saldo-row" partners={PARTNERS} />,
    )
    expect(html).toContain(`value="${PARTNERS[0]!.id}"`)
    expect(html).toContain("ACME s.r.o.")
    expect(html).toContain(`value="${PARTNERS[1]!.id}"`)
    expect(html).toContain("Bau Partner a.s.")
  })

  it("carries no stored value — every input starts empty", () => {
    const html = renderToStaticMarkup(
      <SaldoRowFields t={t} idPrefix="new-saldo-row" partners={PARTNERS} />,
    )
    expect(html).not.toContain("1500.50")
    expect(html).not.toContain('value="2026-05-01"')
  })

  it("requires the partner select", () => {
    const html = renderToStaticMarkup(
      <SaldoRowFields t={t} idPrefix="new-saldo-row" partners={PARTNERS} />,
    )
    const select = html.match(/id="new-saldo-row-partnerId"[^>]*>/)?.[0]
    expect(select).toContain("required")
  })
})

describe("SaldoRowFields — edit (an existing line)", () => {
  it("pre-fills every stored value as defaultValue", () => {
    const html = renderToStaticMarkup(
      <SaldoRowFields
        t={t}
        idPrefix={`saldo-row-${line().id}`}
        partners={PARTNERS}
        line={line()}
      />,
    )
    expect(html).toContain(`value="${PARTNERS[0]!.id}"`)
    expect(html).toContain('value="1500.50"')
    expect(html).toContain('value="2026-05-01"')
  })

  it("scopes id/htmlFor by the row's own idPrefix, not a shared one", () => {
    const rowLine = line()
    const html = renderToStaticMarkup(
      <SaldoRowFields
        t={t}
        idPrefix={`saldo-row-${rowLine.id}`}
        partners={PARTNERS}
        line={rowLine}
      />,
    )
    expect(html).toContain(`id="saldo-row-${rowLine.id}-partnerId"`)
    expect(html).toContain(`for="saldo-row-${rowLine.id}-partnerId"`)
  })

  it("leaves an unstated total's input EMPTY rather than rendering 0", () => {
    const html = renderToStaticMarkup(
      <SaldoRowFields
        t={t}
        idPrefix={`saldo-row-${line().id}`}
        partners={PARTNERS}
        line={line()}
      />,
    )
    const receivable = html.match(
      /id="saldo-row-[^"]+-receivableTotal"[^>]*\/>/,
    )?.[0]
    // `receivableTotal` is `null` on this fixture's `line()` — an absent
    // figure (spec §0.4) — and must render as an empty input, never `"0"`.
    expect(receivable).toContain('value=""')
  })
})

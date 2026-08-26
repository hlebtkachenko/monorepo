/**
 * Zadávání dat › Partneři, rendered — the form side of `_actions/partners.ts`
 * (whose own suite proves who may write and what a bad payload does), on the
 * same `renderToStaticMarkup` + `NextIntlClientProvider` terms as
 * `zadavani.test.tsx`.
 *
 * Three things this render proves that no action test can see: the create
 * card carries no `partnerId` (there is no row yet); an existing row's
 * disclosure carries its own `partnerId` AND its stored values as
 * `defaultValue`, so `<details>` opens into a form that is already filled in;
 * `note_internal` is only ever passed to this component when the caller
 * already decided the reader may have it — this file does not re-prove the
 * data-layer's own gate (`lib/data/partners.test.ts` does), it proves the
 * component renders whatever `noteInternal` it was actually handed.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import type { PartnerView } from "@/lib/data/projections"

import { PartnersSection } from "./partners-section"

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

function partner(
  overrides: Partial<PartnerView & { noteInternal?: string }> = {},
): PartnerView & { noteInternal?: string } {
  return {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f9",
    name: "Stavebniny Novák s.r.o.",
    ico: "12345678",
    dic: "CZ12345678",
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
    updatedAt: "2026-03-07T10:00:00.000Z",
    ...overrides,
  }
}

describe("PartnersSection — the create card", () => {
  it("carries orgSlug and no partnerId — there is no row yet", () => {
    const html = render(<PartnersSection partners={[]} orgSlug={ORG_SLUG} />)
    expect(html).toContain(
      `<input type="hidden" name="orgSlug" value="${ORG_SLUG}"/>`,
    )
    expect(html).not.toContain('name="partnerId"')
  })

  it("offers a lookup button and a save button, both inside the one form", () => {
    const html = render(<PartnersSection partners={[]} orgSlug={ORG_SLUG} />)
    expect(html).toContain('value="lookup" name="intent"')
    expect(html).toContain('value="save" name="intent"')
    expect(html.split("<form").length - 1).toBe(1)
  })

  it("has an empty state under the table", () => {
    const html = render(<PartnersSection partners={[]} orgSlug={ORG_SLUG} />)
    expect(html).toContain("Zatím tu nic není.")
  })
})

describe("PartnersSection — an existing partner's disclosure", () => {
  it("carries the partner's id and its stored values as defaults", () => {
    const html = render(
      <PartnersSection partners={[partner()]} orgSlug={ORG_SLUG} />,
    )
    expect(html).toContain(
      `<input type="hidden" name="partnerId" value="${partner().id}"/>`,
    )
    expect(html).toContain('value="Stavebniny Novák s.r.o."')
    expect(html).toContain('value="12345678"')
  })

  it("shows the saldokonto badge only for an imported partner", () => {
    const manual = render(
      <PartnersSection
        partners={[partner({ source: "manual" })]}
        orgSlug={ORG_SLUG}
      />,
    )
    expect(manual).not.toContain("Ze saldokonta")

    const imported = render(
      <PartnersSection
        partners={[partner({ source: "saldokonto" })]}
        orgSlug={ORG_SLUG}
      />,
    )
    expect(imported).toContain("Ze saldokonta")
  })

  it("renders the office's internal note exactly when it was handed one", () => {
    const withNote = render(
      <PartnersSection
        partners={[partner({ noteInternal: "Neplatič, hlídat." })]}
        orgSlug={ORG_SLUG}
      />,
    )
    expect(withNote).toContain("Neplatič, hlídat.")

    const withoutNote = render(
      <PartnersSection partners={[partner()]} orgSlug={ORG_SLUG} />,
    )
    expect(withoutNote).not.toContain("Neplatič")
  })
})

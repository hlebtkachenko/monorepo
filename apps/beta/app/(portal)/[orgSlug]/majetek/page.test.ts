/**
 * Přehled majetku — a smoke render against a real Postgres 18.
 *
 * `next-intl/server` (`getFormatter`) and `@/i18n/translations-server`
 * (`getBetaTranslations`) are mocked to plain, dependency-free stand-ins —
 * both rely on Next's request-scoped AsyncLocalStorage context, which only
 * exists inside a real Next.js render pass and not in a bare Vitest module
 * import. `next/headers` is mocked the same way every `lib/data` suite mocks
 * it. The Server Component is called DIRECTLY as a plain async function
 * (never as JSX) — `renderToStaticMarkup` cannot resolve an async component
 * itself, but by the time this function returns, every await has already
 * happened and what comes back is an ordinary, synchronously renderable
 * element tree, Client Components included.
 */
import type { ReactElement, ReactNode } from "react"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { afterAll, describe, expect, it, vi } from "vitest"

import { BETA_TIME_ZONE } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"

import { endFixtures, seedOrganization } from "@/tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("next-intl/server", () => ({
  getFormatter: async () => ({
    number: (value: number) => String(value),
    dateTime: (date: Date) => date.toISOString().slice(0, 10),
  }),
}))

vi.mock("@/i18n/translations-server", () => ({
  getBetaTranslations: async () => (key: string) => key,
}))

const { requireOwner, requireScope } = await import("@/lib/data/scope")
const { createAsset } = await import("@/lib/data/assets")
const MajetekOverviewPage = (await import("./page")).default

function as(headers: Headers): void {
  request.headers = headers
}

/**
 * Cast for the same reason `i18n/request.ts` does: `@workspace/ui` augments
 * next-intl's global `Messages` type with the MAIN product's catalog, and
 * beta's own shape does not satisfy that foreign type. Retyped as a plain
 * function (rather than casting the props object) so `children` stays an
 * ordinary prop and `createElement`'s overload resolution stays simple.
 */
const IntlProvider = NextIntlClientProvider as unknown as (props: {
  locale: string
  messages: unknown
  timeZone: string
  children?: ReactNode
}) => ReactElement

function render(html: ReactNode): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale: "cs", messages: betaMessages, timeZone: BETA_TIME_ZONE },
      html,
    ),
  )
}

afterAll(async () => {
  await endFixtures()
})

describe("MajetekOverviewPage — table render", () => {
  it("renders the empty state when the book has no assets", async () => {
    const org = await seedOrganization()
    as(org.members.admin.headers)

    const element = await MajetekOverviewPage({
      params: Promise.resolve({ orgSlug: org.slug }),
      searchParams: Promise.resolve({}),
    })
    const html = render(element)

    expect(html).toContain("majetek.overviewTitle")
    expect(html).toContain("majetek.emptyHeading")
    // Not the owner: no create form.
    expect(html).not.toContain("majetek.newAssetTitle")
  })

  it("renders a row per asset, the footer sum, and the owner's create form", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const owner = requireOwner(await requireScope(org.slug))
    await createAsset(owner, {
      name: "Rypadlo Komatsu",
      category: "machine",
      acquisitionCost: "1500000.00",
    })

    const element = await MajetekOverviewPage({
      params: Promise.resolve({ orgSlug: org.slug }),
      searchParams: Promise.resolve({}),
    })
    const html = render(element)

    expect(html).toContain("Rypadlo Komatsu")
    expect(html).toContain("majetek.categoryMachine")
    expect(html).toContain("majetek.footerTotal")
    expect(html).toContain("majetek.residualNotProvided")
    // The owner-only create form renders on this page (see the page's own
    // header note on why it lives here rather than a deferred Zadávání dat
    // surface).
    expect(html).toContain("majetek.newAssetTitle")
    expect(html).toContain(`value="${org.slug}"`)
  })

  it("filters by status via the query string", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const owner = requireOwner(await requireScope(org.slug))
    await createAsset(owner, {
      name: "Aktivní stroj",
      category: "tool",
      acquisitionCost: "500.00",
    })

    const element = await MajetekOverviewPage({
      params: Promise.resolve({ orgSlug: org.slug }),
      searchParams: Promise.resolve({ status: "disposed" }),
    })
    const html = render(element)

    expect(html).not.toContain("Aktivní stroj")
    expect(html).toContain("majetek.emptyHeading")
  })
})

/**
 * Karta majetku — a smoke render against a real Postgres 18. See the sibling
 * `../page.test.ts` for the mocking rationale (this file mirrors it exactly).
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
const { createAsset, addAssetEvent } = await import("@/lib/data/assets")
const MajetekDetailPage = (await import("./page")).default

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

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

function render(element: ReactNode): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale: "cs", messages: betaMessages, timeZone: BETA_TIME_ZONE },
      element,
    ),
  )
}

afterAll(async () => {
  await endFixtures()
})

describe("MajetekDetailPage — karta render", () => {
  it("renders the detail card, events and the owner's edit/dispose/add-event forms", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const owner = requireOwner(await requireScope(org.slug))
    const { id } = await createAsset(owner, {
      name: "Bagr Volvo",
      category: "machine",
      acquisitionCost: "2000000.00",
      siteRef: "Stavba Vinohrady",
    })
    await addAssetEvent(owner, id, {
      kind: "put_into_service",
      eventDate: "2026-01-10",
      amount: "2000000.00",
    })

    const element = await MajetekDetailPage({
      params: Promise.resolve({ orgSlug: org.slug, assetId: id }),
    })
    const html = render(element)

    expect(html).toContain("Bagr Volvo")
    expect(html).toContain("Stavba Vinohrady")
    expect(html).toContain("majetek.eventsTitle")
    expect(html).toContain("majetek.eventKindPutIntoService")
    expect(html).toContain("majetek.editTitle")
    expect(html).toContain("majetek.disposeTitle")
    expect(html).toContain("majetek.addEventSubmit")
  })

  it("hides every write form from a non-owner role", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const owner = requireOwner(await requireScope(org.slug))
    const { id } = await createAsset(owner, {
      name: "Kompresor",
      category: "tool",
      acquisitionCost: "3000.00",
    })

    as(org.members.guest.headers)
    const element = await MajetekDetailPage({
      params: Promise.resolve({ orgSlug: org.slug, assetId: id }),
    })
    const html = render(element)

    expect(html).toContain("Kompresor")
    expect(html).not.toContain("majetek.editTitle")
    expect(html).not.toContain("majetek.disposeTitle")
  })

  it("404s for a missing asset id", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)

    let digest: unknown = "<no throw>"
    try {
      await MajetekDetailPage({
        params: Promise.resolve({
          orgSlug: org.slug,
          assetId: "00000000-0000-7000-8000-000000000000",
        }),
      })
    } catch (error) {
      digest = (error as { digest?: unknown }).digest
    }
    expect(digest).toBe(NOT_FOUND_DIGEST)
  })

  it("404s for another organization's asset, id in hand", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()
    as(foreign.members.owner.headers)
    const foreignOwner = requireOwner(await requireScope(foreign.slug))
    const { id: foreignAssetId } = await createAsset(foreignOwner, {
      name: "Cizí majetek",
      category: "machine",
      acquisitionCost: "1.00",
    })

    as(org.members.owner.headers)
    let digest: unknown = "<no throw>"
    try {
      await MajetekDetailPage({
        params: Promise.resolve({ orgSlug: org.slug, assetId: foreignAssetId }),
      })
    } catch (error) {
      digest = (error as { digest?: unknown }).digest
    }
    expect(digest).toBe(NOT_FOUND_DIGEST)
  })
})

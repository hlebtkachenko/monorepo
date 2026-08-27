/**
 * Pro účetní › Zpracování — the queue page, rendered against a real
 * Postgres 18 (QA sweep regression: the "Částka" column printed the raw
 * `numeric(14,2)` string — `63240.00` — instead of the Czech money format
 * every other surface uses).
 *
 * The Server Component is called DIRECTLY as an async function and its tree
 * streamed to a string, the technique `finance/pohledavky-a-zavazky/page.db.test.ts`
 * documents. Wrapped in `NextIntlClientProvider` since each row's
 * `DocumentSheet` is a Client Component that reads `useBetaTranslations()`.
 */
import { createElement, type ReactElement, type ReactNode } from "react"
import { renderToReadableStream } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { afterAll, describe, expect, it, vi } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import {
  createDocumentRow,
  endFixtures,
  seedOrganization,
} from "@/tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("@/i18n/translations-server", () => ({
  getBetaTranslations: async () => (key: string) => key,
}))

const ZpracovaniPage = (await import("./page")).default
const { saveDocumentOffice } = await import("@/lib/data/documents-office")
const { requireOwner } = await import("@/lib/data/scope")
const { resolveOrgScope } = await import("../../_lib/org-scope")

function as(headers: Headers): void {
  request.headers = headers
}

const IntlProvider = NextIntlClientProvider as unknown as (props: {
  locale: string
  messages: unknown
  timeZone: string
  formats: unknown
  children?: ReactNode
}) => ReactElement

async function render(tree: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(
    createElement(
      IntlProvider,
      {
        locale: BETA_LOCALE,
        messages: betaMessages,
        timeZone: BETA_TIME_ZONE,
        formats: betaFormats,
      },
      tree,
    ),
  )
  await stream.allReady
  return new Response(stream).text()
}

async function renderFor(orgSlug: string): Promise<string> {
  return render(
    await ZpracovaniPage({
      params: Promise.resolve({ orgSlug }),
      searchParams: Promise.resolve({}),
    }),
  )
}

/** Strip the grouping spaces `Intl` emits so an assertion can name a number. */
const digits = (html: string): string => html.replace(/\s/g, "")

afterAll(async () => {
  await endFixtures()
})

describe("ZpracovaniPage — the Částka column", () => {
  it("renders a stated amount in Czech money format, never the raw numeric string", async () => {
    const org = await seedOrganization()
    const documentId = await createDocumentRow(org.organizationId)
    as(org.members.owner.headers)
    const owner = requireOwner(await resolveOrgScope(org.slug))
    const saved = await saveDocumentOffice(owner, documentId, {
      amount: "63240.00",
    })
    expect(saved.ok).toBe(true)

    const html = await renderFor(org.slug)
    expect(digits(html)).toContain("63240,00Kč")
    expect(html).not.toContain("63240.00")
  })

  it("renders the absence sentence, never 0 Kč, when no amount is stated", async () => {
    const org = await seedOrganization()
    await createDocumentRow(org.organizationId)
    as(org.members.owner.headers)

    const html = await renderFor(org.slug)
    expect(html).toContain(">—<")
    expect(digits(html)).not.toContain("0,00Kč")
  })
})

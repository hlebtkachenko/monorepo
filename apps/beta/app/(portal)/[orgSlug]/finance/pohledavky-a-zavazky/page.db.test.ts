/**
 * Finance › Pohledávky a závazky — the page, rendered against a real Postgres 18.
 *
 * `partner-saldo-table.test.tsx` already proves what a ROW looks like and
 * `lib/data/partners.test.ts` proves which rows exist; what only this file can
 * see is the PAGE's two empty states, which are DIFFERENT sentences:
 *
 *   nothing published   → "saldokonto zatím nebylo nahráno" (§0.4)
 *   published, no rows  → "v saldokontu nejsou žádní partneři"
 *
 * Only the second means "nobody owes anything". A page that collapsed them would
 * tell a client their suppliers are settled when the office simply has not sent a
 * month — the exact confidently-wrong claim §0.4 exists to prevent.
 *
 * The Server Component is called DIRECTLY as an async function and its tree
 * streamed to a string, the technique `vykazy/page.db.test.ts` documents:
 * `renderToStaticMarkup` refuses a tree that still CONTAINS async Server
 * Components, and this page's table is one.
 */
import type { ReactNode } from "react"
import { renderToReadableStream } from "react-dom/server"
import { afterAll, describe, expect, it, vi } from "vitest"

import {
  createMonthPeriod,
  createPartnerRow,
  createReportingPeriod,
  endFixtures,
  publishSaldokontoRow,
  seedOrganization,
} from "@/tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("@/i18n/translations-server", () => ({
  getBetaTranslations: async () => (key: string) => key,
}))

const PohledavkyPage = (await import("./page")).default

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

function as(headers: Headers): void {
  request.headers = headers
}

async function render(tree: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(tree)
  await stream.allReady
  return new Response(stream).text()
}

async function renderFor(orgSlug: string): Promise<string> {
  return render(await PohledavkyPage({ params: Promise.resolve({ orgSlug }) }))
}

/** Strip the grouping spaces `Intl` emits so an assertion can name a number. */
const digits = (html: string): string => html.replace(/\s/g, "")

afterAll(async () => {
  await endFixtures()
})

describe("PohledavkyAZavazkyPage", () => {
  it("says the saldokonto has not been uploaded when none is published", async () => {
    const org = await seedOrganization()
    as(org.members.admin.headers)

    const html = await renderFor(org.slug)
    expect(html).toContain("finance.pohledavkyEmptyHeading")
    // No totals card either: "0 Kč" against a feed that has never spoken is the
    // confidently-wrong figure §0.4 exists to prevent.
    expect(html).not.toContain("finance.totalPayable")
  })

  it("says the published saldokonto is empty when it names no partner", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    // A published batch with no rows: the office HAS spoken, and what it said is
    // "nobody". That is a measured emptiness and reads differently.
    await publishSaldokontoRow(org.organizationId, periodId, [])
    as(org.members.admin.headers)

    const html = await renderFor(org.slug)
    expect(html).toContain("finance.pohledavkyNoRows")
    expect(html).not.toContain("finance.pohledavkyEmptyHeading")
    expect(html).toContain("finance.totalPayable")
  })

  it("renders the rows, the totals and the period stamp", async () => {
    const org = await seedOrganization()
    const periodId = await createReportingPeriod(org.organizationId, {
      kind: "month",
      year: 2026,
      month: 7,
    })
    const partnerId = await createPartnerRow(org.organizationId, {
      name: "Stavebniny Novak s.r.o.",
      ico: "12345678",
      role: "supplier",
    })
    await publishSaldokontoRow(org.organizationId, periodId, [
      {
        partnerId,
        receivableTotal: "1000.00",
        payableTotal: "48250.50",
        oldestDue: "2026-08-31",
      },
    ])
    as(org.members.admin.headers)

    const html = await renderFor(org.slug)
    expect(html).toContain("Stavebniny Novak s.r.o.")
    // §2.4: "Stamp = import period". Both halves of it — which period, and when
    // the office stood behind it.
    expect(html).toContain("finance.saldoPeriod")
    expect(html).toContain("finance.saldoPublishedAt")
    expect(digits(html)).toContain("07/2026")
    expect(digits(html)).toContain("48250,50Kč")
  })

  it("renders read-only for every role, guest included", async () => {
    const org = await seedOrganization()
    const periodId = await createMonthPeriod(org.organizationId)
    const partnerId = await createPartnerRow(org.organizationId)
    await publishSaldokontoRow(org.organizationId, periodId, [
      { partnerId, receivableTotal: "42.00" },
    ])

    for (const role of ["owner", "admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      const html = await renderFor(org.slug)
      expect(html, `${role} sees the table`).toContain("finance.columnPartner")
      // §3.3: client pages are read-only for EVERY role, the owner included — a
      // saldokonto is published through the import spine, never typed here.
      expect(html, `${role} gets no write affordance`).not.toContain("<form")
      expect(html, `${role} gets no write affordance`).not.toContain("<button")
    }
  })

  it("answers 404 for a book the caller does not belong to", async () => {
    const mine = await seedOrganization()
    const theirs = await seedOrganization()
    const periodId = await createMonthPeriod(theirs.organizationId)
    const partnerId = await createPartnerRow(theirs.organizationId, {
      name: "Cizi dodavatel s.r.o.",
    })
    await publishSaldokontoRow(theirs.organizationId, periodId, [
      { partnerId, receivableTotal: "123456.00" },
    ])

    as(mine.members.admin.headers)
    // Not a 403: a stranger cannot tell "does not exist" from "not yours" (see
    // `lib/data/scope.ts` on why every refusal is the same 404).
    let digest: unknown = "<no throw>"
    try {
      await renderFor(theirs.slug)
    } catch (error) {
      digest = (error as { digest?: unknown }).digest ?? error
    }
    expect(digest).toBe(NOT_FOUND_DIGEST)
  })
})

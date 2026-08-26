/**
 * Finance › Úvěry a leasingy — a smoke render against a real Postgres 18.
 *
 * Same shape as `majetek/page.test.ts`: `next-intl/server` (`getFormatter`) and
 * `@/i18n/translations-server` (`getBetaTranslations`) are mocked to plain,
 * dependency-free stand-ins — both rely on Next's request-scoped
 * AsyncLocalStorage context, which only exists inside a real Next.js render
 * pass. The Server Component is called DIRECTLY as a plain async function
 * (never as JSX): `renderToStaticMarkup` cannot resolve an async component
 * itself, but by the time this function returns, every await has already
 * happened and what comes back is an ordinary, synchronously renderable element
 * tree, Client Components included.
 *
 * What it proves beyond "it renders": the owner-only write forms are ABSENT for
 * every other role (spec §3.3), the zůstatek is never printed without its as-of
 * date, and the footer refuses a partial zůstatek total.
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
const { createLoan } = await import("@/lib/data/loans")
const UveryPage = (await import("./page")).default

function as(headers: Headers): void {
  request.headers = headers
}

/**
 * Cast for the same reason `i18n/request.ts` does: `@workspace/ui` augments
 * next-intl's global `Messages` type with the MAIN product's catalog, and
 * beta's own shape does not satisfy that foreign type.
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

async function renderFor(orgSlug: string): Promise<string> {
  const element = await UveryPage({ params: Promise.resolve({ orgSlug }) })
  return render(element)
}

afterAll(async () => {
  await endFixtures()
})

describe("UveryPage", () => {
  it("renders the empty state when the book has no loans", async () => {
    const org = await seedOrganization()
    as(org.members.member.headers)

    const html = await renderFor(org.slug)
    expect(html).toContain("uvery.emptyHeading")
    expect(html).not.toContain("uvery.columnInstitution")
  })

  it("renders a contract with its zůstatek pinned to the stated as-of date", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const owner = requireOwner(await requireScope(org.slug))
    await createLoan(owner, {
      institution: "Komercni banka",
      loanKind: "loan",
      principal: "2500000.00",
      balance: "2100000.00",
      balanceAsOf: "2026-06-30",
      installment: "18500.00",
      installmentPeriod: "monthly",
      interestRatePct: "5.900",
      endsOn: "2032-12-31",
    })

    as(org.members.guest.headers)
    const html = await renderFor(org.slug)

    expect(html).toContain("Komercni banka")
    expect(html).toContain("uvery.balanceAsOfPrefix")
    expect(html).toContain("2026-06-30")
    expect(html).toContain("uvery.periodMonthly")
    expect(html).not.toContain("uvery.balanceNotProvided")
  })

  it("says so rather than printing an undated zůstatek", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const owner = requireOwner(await requireScope(org.slug))
    await createLoan(owner, {
      institution: "Kontokorent",
      loanKind: "overdraft",
      principal: "500000.00",
    })

    as(org.members.admin.headers)
    const html = await renderFor(org.slug)

    expect(html).toContain("uvery.balanceNotProvided")
    expect(html).toContain("uvery.installmentNotProvided")
    expect(html).toContain("uvery.endsOnOpen")
    // The footer refuses a zůstatek total nobody could read.
    expect(html).toContain("uvery.balanceTotalPartial")
    // ... and never sums splátky across frequencies.
    expect(html).toContain("uvery.installmentNotSummed")
  })

  it("shows the write forms to the owner and to nobody else", async () => {
    const org = await seedOrganization()
    as(org.members.owner.headers)
    const owner = requireOwner(await requireScope(org.slug))
    await createLoan(owner, {
      institution: "Moneta",
      loanKind: "lease",
      principal: "480000.00",
    })

    as(org.members.owner.headers)
    const ownerHtml = await renderFor(org.slug)
    expect(ownerHtml).toContain("uvery.newLoanTitle")
    expect(ownerHtml).toContain('name="loanId"')

    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      const html = await renderFor(org.slug)
      expect(html, `${role} sees the table`).toContain("Moneta")
      expect(html, `${role} gets no create form`).not.toContain(
        "uvery.newLoanTitle",
      )
      expect(html, `${role} gets no edit form`).not.toContain('name="loanId"')
    }
  })

  it("never leaks another organization's contracts", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()

    as(foreign.members.owner.headers)
    const foreignOwner = requireOwner(await requireScope(foreign.slug))
    await createLoan(foreignOwner, {
      institution: "Cizi banka",
      loanKind: "loan",
      principal: "1.00",
    })

    as(org.members.owner.headers)
    const html = await renderFor(org.slug)
    expect(html).not.toContain("Cizi banka")
  })
})

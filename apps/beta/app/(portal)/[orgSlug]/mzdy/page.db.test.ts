/**
 * The three Mzdy client pages this PR builds, rendered against a real
 * Postgres 18 — Přehled mezd, Platby a termíny, Podklady.
 *
 * WHAT ONLY A DB TEST CAN SEE HERE. `payroll.test.ts` already proves the
 * `payrollScope` read contract in isolation; what this file proves is that
 * each PAGE actually enforces it — a guest (linked or not; the employee-seat
 * arm does not exist yet) gets the same 404 every other refusal in this
 * application answers with, a management seat sees the office's own figures
 * unchanged, and another organization's slug answers 404 rather than its
 * numbers. The technique — calling the Server Component directly as an async
 * function and rendering the returned tree to a string — mirrors
 * `vykazy/page.db.test.ts` and `majetek/page.test.ts`.
 */
import { createElement, type ReactNode } from "react"
import { renderToReadableStream } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import {
  createDocumentRow,
  createFilingRow,
  createMonthPeriod,
  endFixtures,
  publishPayrollFixture,
  seedOrganization,
  type TestOrganization,
} from "@/tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("@/i18n/translations-server", () => ({
  getBetaTranslations: async () => (key: string) => key,
}))

const PrehledMezdPage = (await import("./page")).default
const PlatbyATerminyPage = (await import("./platby-a-terminy/page")).default
const PodkladyPage = (await import("./podklady/page")).default

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

type Role = "owner" | "admin" | "member" | "guest"
const MANAGEMENT: readonly Role[] = ["owner", "admin", "member"]

function as(headers: Headers): void {
  request.headers = headers
}

/**
 * `NextIntlClientProvider` wraps every render because `ObligationGroupCard`
 * (`@/app/_components/obligation-group-card`) is a Client Component reading
 * `useTranslations()` — real Next.js supplies that context from the root
 * layout, which this bare page-render does not run. `getBetaTranslations`
 * (server-side) is still mocked to the identity function above, so a Server
 * Component's text is its literal message key; only the one client island's
 * copy renders as real Czech, exactly as `dluhy-a-platby.test.tsx` sets up
 * for the same component.
 *
 * `createElement`, not JSX — this file stays `.test.ts` (no JSX transform),
 * the same routing every other `*.db.test.ts` file in this project relies on:
 * the `db` vitest project's globs match the `.ts` suffix literally, and a
 * `.tsx` extension here would silently move this file into the `pure`
 * project instead, which boots no database at all.
 */
async function render(tree: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(
    // `children` inside the props object, not `createElement`'s 3rd
    // positional argument: `NextIntlClientProvider`'s prop type makes
    // `children` required, and TS's `createElement` overload set does not
    // attribute a 3rd positional argument to a required `children` prop on an
    // intersection type like this component's — passing it explicitly is the
    // form every overload actually matches.
    createElement(NextIntlClientProvider, {
      locale: BETA_LOCALE,
      timeZone: BETA_TIME_ZONE,
      formats: betaFormats,
      messages: betaMessages as never,
      children: tree,
    }),
  )
  await stream.allReady
  return new Response(stream).text()
}

async function expect404(run: () => Promise<unknown>): Promise<void> {
  let digest: unknown = "<no throw>"
  try {
    await run()
  } catch (error) {
    digest = (error as { digest?: unknown }).digest ?? error
  }
  expect(digest).toBe(NOT_FOUND_DIGEST)
}

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

describe("Mzdy pages — access control (spec §2.6.1)", () => {
  it("answers 404 to a guest on all three pages — no employee link exists yet", async () => {
    as(org.members.guest.headers)
    await expect404(() =>
      PrehledMezdPage({
        params: Promise.resolve({ orgSlug: org.slug }),
        searchParams: Promise.resolve({}),
      }),
    )
    await expect404(() =>
      PlatbyATerminyPage({ params: Promise.resolve({ orgSlug: org.slug }) }),
    )
    await expect404(() =>
      PodkladyPage({ params: Promise.resolve({ orgSlug: org.slug }) }),
    )
  })

  it("renders all three pages for every management seat", async () => {
    for (const role of MANAGEMENT) {
      as(org.members[role].headers)
      expect(
        (
          await render(
            await PrehledMezdPage({
              params: Promise.resolve({ orgSlug: org.slug }),
              searchParams: Promise.resolve({}),
            }),
          )
        ).length,
        role,
      ).toBeGreaterThan(0)
      expect(
        (
          await render(
            await PlatbyATerminyPage({
              params: Promise.resolve({ orgSlug: org.slug }),
            }),
          )
        ).length,
        role,
      ).toBeGreaterThan(0)
      expect(
        (
          await render(
            await PodkladyPage({
              params: Promise.resolve({ orgSlug: org.slug }),
            }),
          )
        ).length,
        role,
      ).toBeGreaterThan(0)
    }
  })

  it("answers 404 on all three pages for another organization's slug", async () => {
    const other = await seedOrganization()
    as(org.members.owner.headers)

    await expect404(() =>
      PrehledMezdPage({
        params: Promise.resolve({ orgSlug: other.slug }),
        searchParams: Promise.resolve({}),
      }),
    )
    await expect404(() =>
      PlatbyATerminyPage({ params: Promise.resolve({ orgSlug: other.slug }) }),
    )
    await expect404(() =>
      PodkladyPage({ params: Promise.resolve({ orgSlug: other.slug }) }),
    )
  })
})

describe("Přehled mezd", () => {
  it("renders the honest empty state before anything is published", async () => {
    const fresh = await seedOrganization()
    as(fresh.members.member.headers)

    const html = await render(
      await PrehledMezdPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain("mzdy.emptyHeading")
    expect(html).not.toContain("mzdy.periodPickerLabel")
  })

  it("renders the office's own figures, unchanged, with the freshness stamp", async () => {
    const fresh = await seedOrganization()
    const periodId = await createMonthPeriod(fresh.organizationId)
    await publishPayrollFixture(fresh.organizationId, periodId, {
      summary: {
        employerCostTotal: "999111.00",
        netPaidTotal: "111222.00",
        headcountHpp: 9,
      },
    })

    as(fresh.members.admin.headers)
    const html = await render(
      await PrehledMezdPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html.replace(/\s/g, "")).toContain("999111,00")
    expect(html.replace(/\s/g, "")).toContain("111222,00")
    expect(html).toContain("mzdy.publishedAt")
    expect(html).toContain("mzdy.sourceAgent")
  })

  it("renders the manual-entry trigger for the owner only, among management seats (manual-entry plan §3, W4)", async () => {
    const fresh = await seedOrganization()

    as(fresh.members.owner.headers)
    const ownerHtml = await render(
      await PrehledMezdPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(ownerHtml).toContain("mzdyZadani.startTrigger")

    for (const role of ["admin", "member"] as const) {
      as(fresh.members[role].headers)
      const html = await render(
        await PrehledMezdPage({
          params: Promise.resolve({ orgSlug: fresh.slug }),
          searchParams: Promise.resolve({}),
        }),
      )
      expect(html, role).not.toContain("mzdyZadani.startTrigger")
    }
  })
})

describe("Platby a termíny", () => {
  it("shows the cssz_zp obligation group and the mzdove_odvody filings", async () => {
    const fresh = await seedOrganization()
    const periodId = await createMonthPeriod(fresh.organizationId)
    await createFilingRow(fresh.organizationId, periodId, {
      kind: "prehled_cssz",
      amountDue: "45000.00",
      dueInDays: 10,
    })
    // Not payroll: must not leak onto this page.
    await createFilingRow(fresh.organizationId, periodId, {
      kind: "dph_priznani",
      amountDue: "10000.00",
      dueInDays: 5,
    })

    as(fresh.members.owner.headers)
    const html = await render(
      await PlatbyATerminyPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
      }),
    )
    expect(html).toContain("dane.kindPrehledCssz")
    expect(html.replace(/\s/g, "")).toContain("45000,00")
    expect(html).not.toContain("dane.kindDphPriznani")
  })

  it("says so when nothing is outstanding", async () => {
    const fresh = await seedOrganization()
    as(fresh.members.member.headers)
    const html = await render(
      await PlatbyATerminyPage({
        params: Promise.resolve({ orgSlug: fresh.slug }),
      }),
    )
    expect(html).toContain("mzdy.platbyObligationsEmpty")
  })
})

describe("Podklady", () => {
  it("lists attendance and hr documents, and only those", async () => {
    const fresh = await seedOrganization()
    await createDocumentRow(fresh.organizationId, { docType: "attendance" })
    await createDocumentRow(fresh.organizationId, { docType: "hr" })
    await createDocumentRow(fresh.organizationId, { docType: "invoice_in" })

    as(fresh.members.member.headers)
    const html = await render(
      await PodkladyPage({ params: Promise.resolve({ orgSlug: fresh.slug }) }),
    )
    expect(html).toContain("dokumenty.typeAttendance")
    expect(html).toContain("dokumenty.typeHr")
    expect(html).not.toContain("dokumenty.typeInvoiceIn")
  })

  it("renders the checklist even with nothing uploaded yet", async () => {
    const fresh = await seedOrganization()
    as(fresh.members.owner.headers)
    const html = await render(
      await PodkladyPage({ params: Promise.resolve({ orgSlug: fresh.slug }) }),
    )
    expect(html).toContain("mzdy.podkladyDochazkaTitle")
    expect(html).toContain("mzdy.podkladyNastupTitle")
    expect(html).toContain("mzdy.podkladyUkonceniTitle")
    expect(html).toContain("mzdy.podkladyNemocenskaTitle")
    expect(html).toContain("mzdy.podkladyDocumentsEmpty")
  })
})

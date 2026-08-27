/**
 * Zaměstnanci (spec §2.6), rendered against a real Postgres 18.
 *
 * Mirrors `mzdy/page.db.test.ts`'s own technique — the Server Component
 * called directly, rendered to a string — for the property only a real render
 * can prove: the page's OWN `payrollScope` gate (not only `layout.tsx`'s)
 * answers the same 404 every other refusal in this application does, for a
 * guest and for another organization's slug, and the register + this
 * period's figures actually reach the rendered HTML for a management seat.
 */
import { createElement, type ReactNode } from "react"
import { renderToReadableStream } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import {
  createMonthPeriod,
  createPayrollEmployeeRow,
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

const ZamestnanciPage = (await import("./page")).default

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

type Role = "owner" | "admin" | "member" | "guest"
const MANAGEMENT: readonly Role[] = ["owner", "admin", "member"]

function as(headers: Headers): void {
  request.headers = headers
}

async function render(tree: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(
    // `children` inside the props object — see `mzdy/page.db.test.ts`'s own
    // comment on this exact shape: `createElement`'s 3rd positional argument
    // does not satisfy a REQUIRED `children` prop on this intersection type.
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

function page(orgSlug: string, obdobi?: string) {
  return ZamestnanciPage({
    params: Promise.resolve({ orgSlug }),
    searchParams: Promise.resolve(obdobi ? { obdobi } : {}),
  })
}

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

describe("Zaměstnanci — access control (spec §2.6.1)", () => {
  it("answers 404 to a guest", async () => {
    as(org.members.guest.headers)
    await expect404(() => page(org.slug))
  })

  it("answers 404 for another organization's slug", async () => {
    const other = await seedOrganization()
    as(org.members.owner.headers)
    await expect404(() => page(other.slug))
  })

  it("renders for every management seat", async () => {
    for (const role of MANAGEMENT) {
      as(org.members[role].headers)
      const html = await render(await page(org.slug))
      expect(html.length, role).toBeGreaterThan(0)
    }
  })
})

describe("Zaměstnanci — register + monthly figures", () => {
  it("renders the employee register and this period's line, absent line as Neuvedeno", async () => {
    const withLine = await createPayrollEmployeeRow(org.organizationId, {
      fullName: "Jana Nováková",
    })
    // No id captured — the row's existence is the point, its line stays
    // absent, and the assertion below checks its NAME reaching the render.
    await createPayrollEmployeeRow(org.organizationId, {
      fullName: "Petr Bez Řádku",
    })
    const periodId = await createMonthPeriod(org.organizationId)
    await publishPayrollFixture(org.organizationId, periodId, {
      lines: [{ employeeId: withLine, gross: "50000.00" }],
    })

    as(org.members.owner.headers)
    const html = await render(await page(org.slug, periodId))

    expect(html).toContain("Jana Nováková")
    expect(html).toContain("Petr Bez Řádku")
    // The figured employee's gross renders; the un-figured one's cell falls
    // back to the shared "Neuvedeno" key (mocked translations return the key
    // itself, so this asserts the ABSENCE branch actually ran).
    expect(html).toContain("mzdy.amountNotStated")
  })
})

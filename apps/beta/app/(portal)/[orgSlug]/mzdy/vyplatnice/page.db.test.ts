/**
 * Výplatnice (spec §2.6), rendered against a real Postgres 18.
 *
 * Same technique as the sibling `zamestnanci/page.db.test.ts`. What only a
 * real render proves here: the page's own `payrollScope` gate, that an
 * existing payslip's employee name reaches a management seat's HTML, and
 * that the bulk-upload form is owner-only — admin and member (both
 * management, per `payrollScope`) read the same payslip list but never see
 * the upload affordance.
 */
import { createElement, type ReactNode } from "react"
import { renderToReadableStream } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import {
  createDocumentRow,
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

// `PayslipBulkUploadForm` (owner-only) calls `useRouter()` for its post-upload
// `refresh()` — real Next.js supplies the App Router context this bare render
// does not, the same reason `upload-panel.test.tsx` (PR 11's own
// `useRouter`-using upload component) mocks it.
// `importOriginal` preserves `notFound` (`page.tsx`'s own gate) and every
// other real export — a bare factory here would also wipe out `notFound` for
// the WHOLE module, breaking every access-control test in this file, not
// only the render that reaches `PayslipBulkUploadForm`.
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>()
  return {
    ...actual,
    useRouter: () => ({ refresh: () => {} }),
  }
})

const VyplatnicePage = (await import("./page")).default

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

type Role = "owner" | "admin" | "member" | "guest"
const MANAGEMENT: readonly Role[] = ["owner", "admin", "member"]

function as(headers: Headers): void {
  request.headers = headers
}

/**
 * `NextIntlClientProvider` wraps every render because `PayslipBulkUploadForm`
 * is a Client Component reading `useBetaTranslations()` — the same reason
 * `mzdy/page.db.test.ts` wraps its own render for `ObligationGroupCard`.
 */
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
  return VyplatnicePage({
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

describe("Výplatnice — access control (spec §2.6.1)", () => {
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

describe("Výplatnice — payslip list and upload gate", () => {
  it("shows an existing payslip's employee name to a management seat", async () => {
    const periodId = await createMonthPeriod(org.organizationId)
    const employeeId = await createPayrollEmployeeRow(org.organizationId, {
      fullName: "Alena Krátká",
    })
    await publishPayrollFixture(org.organizationId, periodId)
    await createDocumentRow(org.organizationId, {
      docType: "payslip",
      payslipEmployeeId: employeeId,
      payslipPeriodId: periodId,
    })

    as(org.members.admin.headers)
    const html = await render(await page(org.slug, periodId))
    expect(html).toContain("Alena Krátká")
  })

  it("shows the bulk-upload form to the owner but not to admin or member", async () => {
    const periodId = await createMonthPeriod(org.organizationId)
    await publishPayrollFixture(org.organizationId, periodId)

    // `PayslipBulkUploadForm` is a Client Component reading real
    // `useBetaTranslations()` from the `NextIntlClientProvider` this render
    // wraps around it — unlike the Server Component text around it, its copy
    // is real Czech, not the mocked identity key (`mzdy/page.db.test.ts`'s
    // own comment on `ObligationGroupCard` states the same split). The ZIP
    // file input's `accept` attribute is the stable, implementation-level
    // marker `payslip-bulk-upload-form.test.tsx`'s own initial-render
    // assertions already key on.
    const UPLOAD_FORM_MARKER = 'accept=".zip,application/zip"'

    as(org.members.owner.headers)
    const ownerHtml = await render(await page(org.slug, periodId))
    expect(ownerHtml).toContain(UPLOAD_FORM_MARKER)

    for (const role of ["admin", "member"] as const) {
      as(org.members[role].headers)
      const html = await render(await page(org.slug, periodId))
      expect(html, role).not.toContain(UPLOAD_FORM_MARKER)
    }
  })
})

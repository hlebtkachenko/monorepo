/**
 * The Zadávání dat page's own gate and reads.
 *
 * `loadZadavani` is everything `page.tsx` does before it renders, which is why
 * it exists as a function: the page component itself cannot be invoked in a
 * test runner (it resolves next-intl's catalog, which needs a request), and
 * "a non-owner gets a 404 from this page" is exactly the assertion that must
 * not be left to a convention.
 *
 * Three gates protect this surface and each is tested where it lives:
 *   - the section layout (`pro-ucetni/layout.tsx`) — `scope.test.ts` proves
 *     `requireOwner` 404s every non-owner;
 *   - the page (here);
 *   - each Server Action (`_actions/zadavani.db.test.ts`).
 * The middle one is not redundant with the first: a page reached outside its
 * layout — a future route group move, a partial prerender — would otherwise
 * read the whole book for whoever asked.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createFilingRow,
  createLiabilityRow,
  createMonthPeriod,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../../../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { loadZadavani } = await import("./load-zadavani")
const { forbiddenClientKeys } = await import("@/lib/data/projections")

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

function as(headers: Headers): void {
  request.headers = headers
}

async function expect404(
  run: () => Promise<unknown>,
  because: string,
): Promise<void> {
  let digest: unknown = "<no throw>"
  try {
    await run()
  } catch (error) {
    digest = (error as { digest?: unknown }).digest ?? error
  }
  expect(digest, because).toBe(NOT_FOUND_DIGEST)
}

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

describe("loadZadavani — owner only", () => {
  it("404s admin, member and guest", async () => {
    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      await expect404(
        () => loadZadavani(org.slug),
        `${role} may not open Zadávání dat`,
      )
    }
  })

  it("404s a signed-out visitor, and an owner of another book", async () => {
    const foreign = await seedOrganization()

    as(new Headers())
    await expect404(() => loadZadavani(org.slug), "no session")

    as(org.members.owner.headers)
    await expect404(
      () => loadZadavani(foreign.slug),
      "an owner elsewhere is a stranger here",
    )
  })

  it("404s a malformed or unknown slug rather than raising", async () => {
    as(org.members.owner.headers)
    for (const slug of ["", "NOT A SLUG", "../admin", "neexistuje"]) {
      await expect404(() => loadZadavani(slug), `slug ${JSON.stringify(slug)}`)
    }
  })
})

describe("loadZadavani — what the owner gets", () => {
  it("returns this book's filings and liabilities, paid ones included", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      amountDue: "1000.00",
    })
    await createLiabilityRow(target.organizationId, { label: "Otevreny" })
    await createLiabilityRow(target.organizationId, {
      label: "Zaplaceny",
      paidAt: new Date(),
    })

    as(target.members.owner.headers)
    const data = await loadZadavani(target.slug)

    expect(data.orgSlug).toBe(target.slug)
    expect(data.filings).toHaveLength(1)
    // The EDITING surface, so a paid row is still here — an accountant who
    // mis-keyed a payment has to be able to find it again. Dluhy a platby hides
    // them, because that page is a list of debts.
    expect(data.liabilities.map((l) => l.label).sort()).toEqual([
      "Otevreny",
      "Zaplaceny",
    ])
  })

  it("never carries another book's rows", async () => {
    const foreign = await seedOrganization()
    const foreignPeriod = await createMonthPeriod(foreign.organizationId)
    await createFilingRow(foreign.organizationId, foreignPeriod, {
      amountDue: "999999.00",
    })
    await createLiabilityRow(foreign.organizationId, { amount: "888888.00" })

    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId, { amount: "1.00" })

    as(target.members.owner.headers)
    const data = await loadZadavani(target.slug)

    expect(data.filings).toEqual([])
    expect(data.liabilities).toHaveLength(1)
    expect(JSON.stringify(data)).not.toContain("999999")
    expect(JSON.stringify(data)).not.toContain("888888")
  })

  it("hands the page projections, not rows — no office-internal column", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      amountDue: "1000.00",
      noteInternal: "Interni k podani",
    })
    await createLiabilityRow(target.organizationId, {
      noteInternal: "Interni k zavazku",
    })

    as(target.members.owner.headers)
    const data = await loadZadavani(target.slug)

    // The OWNER is the accountant and may read the internal layer — but not
    // through THIS surface: `note_internal` is on CLIENT_FORBIDDEN_COLUMNS and
    // neither projection selects it, so a row can never reach a client bundle
    // by way of a page that happened to be owner-only.
    expect(forbiddenClientKeys(data)).toEqual([])
    expect(JSON.stringify(data)).not.toContain("Interni")
  })

  it("is empty rather than absent for a book with nothing entered yet", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    expect(await loadZadavani(target.slug)).toEqual({
      orgSlug: target.slug,
      filings: [],
      liabilities: [],
      accounts: [],
    })
  })
})

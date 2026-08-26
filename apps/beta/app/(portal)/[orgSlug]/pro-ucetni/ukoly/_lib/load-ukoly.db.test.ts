/**
 * The Úkoly klientovi page's own gate and reads.
 *
 * `loadUkoly` is everything `page.tsx` does before it renders — see
 * `load-zadavani.db.test.ts`'s own header for why this exists as a function
 * and why "a non-owner gets a 404 from this page" has to be an assertion, not
 * a convention.
 *
 * Three gates protect this surface and each is tested where it lives:
 *   - the section layout (`pro-ucetni/layout.tsx`) — `scope.test.ts` proves
 *     `requireOwner` 404s every non-owner;
 *   - the page (here);
 *   - each Server Action (`_actions/client-tasks.db.test.ts`).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createClientTaskRow,
  createClientTaskTemplateRow,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../../../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { loadUkoly } = await import("./load-ukoly")
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

describe("loadUkoly — owner only", () => {
  it("404s admin, member and guest", async () => {
    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      await expect404(
        () => loadUkoly(org.slug),
        `${role} may not open Úkoly klientovi`,
      )
    }
  })

  it("404s a signed-out visitor, and an owner of another book", async () => {
    const foreign = await seedOrganization()

    as(new Headers())
    await expect404(() => loadUkoly(org.slug), "no session")

    as(org.members.owner.headers)
    await expect404(
      () => loadUkoly(foreign.slug),
      "an owner elsewhere is a stranger here",
    )
  })

  it("404s a malformed or unknown slug rather than raising", async () => {
    as(org.members.owner.headers)
    for (const slug of ["", "NOT A SLUG", "../admin", "neexistuje"]) {
      await expect404(() => loadUkoly(slug), `slug ${JSON.stringify(slug)}`)
    }
  })
})

describe("loadUkoly — what the owner gets", () => {
  it("returns this book's tasks and templates, split by is_template", async () => {
    const target = await seedOrganization()
    await createClientTaskRow(target.organizationId, { title: "Ukol" })
    await createClientTaskRow(target.organizationId, {
      title: "Hotovo",
      status: "done",
      doneAt: new Date(),
    })
    await createClientTaskTemplateRow(target.organizationId, {
      title: "Sablona",
    })

    as(target.members.owner.headers)
    const data = await loadUkoly(target.slug)

    expect(data.orgSlug).toBe(target.slug)
    expect(data.tasks.map((t) => t.title).sort()).toEqual(["Hotovo", "Ukol"])
    expect(data.templates.map((t) => t.title)).toEqual(["Sablona"])
  })

  it("never carries another book's rows", async () => {
    const foreign = await seedOrganization()
    await createClientTaskRow(foreign.organizationId, { title: "Cizi ukol" })
    await createClientTaskTemplateRow(foreign.organizationId, {
      title: "Cizi sablona",
    })

    const target = await seedOrganization()
    await createClientTaskRow(target.organizationId, { title: "Moje" })

    as(target.members.owner.headers)
    const data = await loadUkoly(target.slug)

    expect(data.tasks.map((t) => t.title)).toEqual(["Moje"])
    expect(data.templates).toEqual([])
    expect(JSON.stringify(data)).not.toContain("Cizi")
  })

  it("hands the page projections, not rows — no office-internal column", async () => {
    const target = await seedOrganization()
    await createClientTaskRow(target.organizationId)
    await createClientTaskTemplateRow(target.organizationId)

    as(target.members.owner.headers)
    const data = await loadUkoly(target.slug)

    expect(forbiddenClientKeys(data)).toEqual([])
  })

  it("is empty rather than absent for a book with nothing entered yet", async () => {
    const target = await seedOrganization()
    as(target.members.owner.headers)

    expect(await loadUkoly(target.slug)).toEqual({
      orgSlug: target.slug,
      tasks: [],
      templates: [],
    })
  })
})

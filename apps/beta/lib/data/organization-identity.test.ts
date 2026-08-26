/**
 * The identity-card data layer: who may read it, who may write it, and that a
 * write is scoped to the handle it was given.
 *
 * `company.db.test.ts` covers the ACTIONS (the public POST surface). This file
 * covers the layer underneath — the one a future page or agent endpoint would
 * reach for directly — so "only an owner writes" holds even if a caller forgets
 * a gate: `updateOrganizationIdentity` takes an `OwnerScope`, which only
 * `requireOwner` can mint.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  archiveOrganization,
  endFixtures,
  seedOrganization,
  type TestAccount,
  type TestOrganization,
} from "../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { organizationIdentity, stampAresFetched, updateOrganizationIdentity } =
  await import("./organization-identity")
const { requireOwner, requireScope } = await import("./scope")

afterAll(async () => {
  await endFixtures()
})

function as(account: TestAccount): void {
  request.headers = account.headers
}

let org: TestOrganization
let other: TestOrganization

beforeEach(async () => {
  org = await seedOrganization()
  other = await seedOrganization()
})

describe("organizationIdentity — every role reads the card", () => {
  it("returns the card for owner, admin, member and guest alike", async () => {
    for (const role of ["owner", "admin", "member", "guest"] as const) {
      as(org.members[role])
      const identity = await organizationIdentity(await requireScope(org.slug))
      expect(identity, role).not.toBeNull()
      expect(identity!.slug).toBe(org.slug)
      expect(identity!.legalName).toBe("Testovací s.r.o.")
    }
  })

  it("returns null once the book is archived", async () => {
    as(org.members.owner)
    const scope = await requireScope(org.slug)
    await archiveOrganization(org.organizationId)

    // The scope proved the book was live when the request started; the office
    // can withdraw it mid-render, and a page must not print withdrawn data.
    expect(await organizationIdentity(scope)).toBeNull()
  })
})

describe("updateOrganizationIdentity — owner-scoped by type", () => {
  it("refuses to mint an owner handle for a non-owner", async () => {
    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role])
      const scope = await requireScope(org.slug)
      expect(() => requireOwner(scope), role).toThrow()
    }
  })

  it("writes only the fields the patch names", async () => {
    as(org.members.owner)
    const owner = requireOwner(await requireScope(org.slug))

    await updateOrganizationIdentity(owner, {
      legalName: "Stavby Novák s.r.o.",
      registeredCity: "Praha",
      contactEmail: "info@novak.example",
    })
    await updateOrganizationIdentity(owner, { registeredCity: "Brno" })

    const identity = await organizationIdentity(owner)
    expect(identity!.registeredCity).toBe("Brno")
    // Untouched keys are untouched, not reset.
    expect(identity!.legalName).toBe("Stavby Novák s.r.o.")
    expect(identity!.contactEmail).toBe("info@novak.example")
  })

  it("clears a nullable column when the patch says null", async () => {
    as(org.members.owner)
    const owner = requireOwner(await requireScope(org.slug))

    await updateOrganizationIdentity(owner, { dic: "CZ12345678" })
    expect((await organizationIdentity(owner))!.dic).toBe("CZ12345678")

    await updateOrganizationIdentity(owner, { dic: null })
    expect((await organizationIdentity(owner))!.dic).toBeNull()
  })

  it("falls back to CZ rather than failing on the NOT NULL country column", async () => {
    as(org.members.owner)
    const owner = requireOwner(await requireScope(org.slug))

    await updateOrganizationIdentity(owner, { registeredCountryCode: "SK" })
    expect((await organizationIdentity(owner))!.registeredCountryCode).toBe(
      "SK",
    )

    await updateOrganizationIdentity(owner, { registeredCountryCode: null })
    expect((await organizationIdentity(owner))!.registeredCountryCode).toBe(
      "CZ",
    )
  })

  it("is a no-op for an empty patch", async () => {
    as(org.members.owner)
    const owner = requireOwner(await requireScope(org.slug))
    const before = await organizationIdentity(owner)

    expect(await updateOrganizationIdentity(owner, {})).toBe(true)
    expect(await organizationIdentity(owner)).toEqual(before)
  })

  it("writes only its OWN organization", async () => {
    as(org.members.owner)
    const owner = requireOwner(await requireScope(org.slug))
    await updateOrganizationIdentity(owner, { legalName: "Jen moje s.r.o." })

    // The neighbouring book, read through its own owner, is untouched.
    as(other.members.owner)
    const neighbour = await organizationIdentity(await requireScope(other.slug))
    expect(neighbour!.legalName).toBe("Testovací s.r.o.")
  })

  it("reports false rather than silently writing nothing when the book is archived", async () => {
    as(org.members.owner)
    const owner = requireOwner(await requireScope(org.slug))
    await archiveOrganization(org.organizationId)

    expect(
      await updateOrganizationIdentity(owner, { legalName: "Pozdě s.r.o." }),
    ).toBe(false)
  })
})

describe("stampAresFetched", () => {
  it("records the moment ARES was consulted, and nothing else", async () => {
    as(org.members.owner)
    const owner = requireOwner(await requireScope(org.slug))
    await updateOrganizationIdentity(owner, {
      legalName: "Stavby Novák s.r.o.",
    })

    expect((await organizationIdentity(owner))!.aresFetchedAt).toBeNull()

    const at = new Date("2026-08-26T09:30:00.000Z")
    await stampAresFetched(owner, at)

    const identity = await organizationIdentity(owner)
    expect(identity!.aresFetchedAt).toBe(at.toISOString())
    expect(identity!.legalName).toBe("Stavby Novák s.r.o.")
  })

  it("does not stamp a book that has been archived", async () => {
    as(org.members.owner)
    const owner = requireOwner(await requireScope(org.slug))
    await archiveOrganization(org.organizationId)

    // No throw, no write: the caller's next read returns null anyway.
    await expect(stampAresFetched(owner)).resolves.toBeUndefined()
  })
})

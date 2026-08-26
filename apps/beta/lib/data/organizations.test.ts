/**
 * The organization reads, against a real Postgres 18.
 *
 * `organizationForScope` has been exercised indirectly since PR 7 (every org
 * page's layout calls it); what this file adds with PR 20 is the WIDER read —
 * `organizationCardForScope`, the identity card of spec §2.1 item 5 — and the
 * three properties both share, stated once where they can be asserted rather
 * than argued: the scope decides which book is read, an archived book is read by
 * neither, and what comes back is a projection.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  archiveOrganization,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { requireScope } = await import("./scope")
const { organizationCardForScope, organizationForScope } =
  await import("./organizations")
const { forbiddenClientKeys } = await import("./projections")
const { betaDb } = await import("@/db/client")
const { organization } = await import("@/db/schema")
const { eq } = await import("drizzle-orm")

const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

function as(headers: Headers): void {
  request.headers = headers
}

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
  // The card's own columns are nullable and empty on a fresh seed; fill them
  // once, here, so every assertion below is about the READ rather than about a
  // fixture that happened to leave a column null.
  await betaDb()
    .update(organization)
    .set({
      ico: "12345678",
      dic: "CZ12345678",
      registered_street: "Dlouha",
      registered_house_number: "123",
      registered_orientation_number: "45",
      registered_city: "Praha 1",
      registered_postal_code: "110 00",
      data_box_id: "abc1234",
      court_file_number: "C 12345",
      tax_office_code: "001",
      bank_account_prefix: "19",
      bank_account_number: "2000145399",
      bank_code: "0800",
      ares_fetched_at: new Date("2026-08-01T06:00:00Z"),
    })
    .where(eq(organization.id, org.organizationId))
})

afterAll(async () => {
  await endFixtures()
})

describe("organizationCardForScope — spec §2.1 item 5", () => {
  it("returns every field the karta prints", async () => {
    as(org.members.admin.headers)
    const card = await organizationCardForScope(await requireScope(org.slug))

    expect(card).toMatchObject({
      id: org.organizationId,
      slug: org.slug,
      ico: "12345678",
      dic: "CZ12345678",
      registeredStreet: "Dlouha",
      registeredHouseNumber: "123",
      registeredOrientationNumber: "45",
      registeredCity: "Praha 1",
      registeredPostalCode: "110 00",
      registeredCountryCode: "CZ",
      dataBoxId: "abc1234",
      courtFileNumber: "C 12345",
      taxOfficeCode: "001",
      bankAccountPrefix: "19",
      bankAccountNumber: "2000145399",
      bankCode: "0800",
      iban: null,
      bic: null,
    })
    // The §2.10 ARES cache stamp, as an ISO instant rather than a Date.
    expect(card.aresFetchedAt).toBe("2026-08-01T06:00:00.000Z")
  })

  it("is a projection — no forbidden column, no raw row", async () => {
    as(org.members.owner.headers)
    const card = await organizationCardForScope(await requireScope(org.slug))

    expect(forbiddenClientKeys(card)).toEqual([])
    // `archived_at` is absent by construction: a page holding this object is by
    // construction looking at a live book.
    expect(card).not.toHaveProperty("archivedAt")
    expect(card).not.toHaveProperty("contactEmail")
  })

  it("is readable by every role, guest included (§5)", async () => {
    for (const role of ["owner", "admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      const card = await organizationCardForScope(await requireScope(org.slug))
      expect(card.ico).toBe("12345678")
    }
  })

  it("leaves an empty book's fields null rather than inventing them", async () => {
    const fresh = await seedOrganization()
    as(fresh.members.admin.headers)
    const card = await organizationCardForScope(await requireScope(fresh.slug))

    expect(card.ico).toBeNull()
    expect(card.registeredCity).toBeNull()
    expect(card.bankAccountNumber).toBeNull()
    expect(card.aresFetchedAt).toBeNull()
    // The one thing a fresh book always has.
    expect(card.legalName.length).toBeGreaterThan(0)
  })

  it("never reads another organization's card", async () => {
    const other = await seedOrganization()

    // The scope is the only thing that decides which book is read, and it is
    // resolved from the SLUG plus this viewer's membership — an admin of `org`
    // cannot resolve one for `other` at all.
    as(org.members.admin.headers)
    let digest: unknown = "<no throw>"
    try {
      await requireScope(other.slug)
    } catch (error) {
      digest = (error as { digest?: unknown }).digest ?? error
    }
    expect(digest).toBe(NOT_FOUND_DIGEST)
  })

  it("404s on a book archived after the scope was resolved", async () => {
    const doomed = await seedOrganization()
    as(doomed.members.admin.headers)
    const scope = await requireScope(doomed.slug)

    await archiveOrganization(doomed.organizationId)

    for (const read of [organizationForScope, organizationCardForScope]) {
      let digest: unknown = "<no throw>"
      try {
        await read(scope)
      } catch (error) {
        digest = (error as { digest?: unknown }).digest ?? error
      }
      expect(digest).toBe(NOT_FOUND_DIGEST)
    }
  })
})

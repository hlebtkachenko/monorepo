/**
 * `activeMembershipsForViewer` — the pre-scope membership list behind the root
 * picker and the header org switcher.
 *
 * Same shape as `scope.test.ts`: real Better Auth sessions against a real
 * Postgres 18, `next/headers` mocked because there is no HTTP request in a
 * test runner to read headers from.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  addMembership,
  archiveOrganization,
  createAccount,
  endFixtures,
  seedOrganization,
  setMembershipActive,
  setStaff,
  type TestOrganization,
} from "../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { activeMembershipsForViewer } = await import("./memberships")
const { forbiddenClientKeys } = await import("./projections")

function as(headers: Headers): void {
  request.headers = headers
}

let orgA: TestOrganization
let orgB: TestOrganization

beforeAll(async () => {
  ;[orgA, orgB] = await Promise.all([seedOrganization(), seedOrganization()])
})

afterAll(async () => {
  await endFixtures()
})

describe("activeMembershipsForViewer", () => {
  it("returns zero memberships and isStaff=false for a stranger", async () => {
    const stranger = await createAccount()
    as(stranger.headers)

    const result = await activeMembershipsForViewer()
    expect(result.memberships).toEqual([])
    expect(result.isStaff).toBe(false)
    expect(result.viewer.userId).toBe(stranger.userId)
  })

  it("returns zero memberships and isStaff=true for staff with no grant", async () => {
    const staff = await createAccount({ staff: true })
    as(staff.headers)

    const result = await activeMembershipsForViewer()
    expect(result.memberships).toEqual([])
    expect(result.isStaff).toBe(true)
  })

  it("returns exactly one membership for a single-org viewer", async () => {
    as(orgA.members.member.headers)

    const { memberships } = await activeMembershipsForViewer()
    expect(memberships).toHaveLength(1)
    expect(memberships[0]?.slug).toBe(orgA.slug)
    expect(memberships[0]?.role).toBe("member")
  })

  it("returns every active organization for a multi-org viewer, and none it does not belong to", async () => {
    const person = await createAccount()
    await addMembership(orgA.organizationId, person.userId, "guest")
    await addMembership(orgB.organizationId, person.userId, "admin")
    as(person.headers)

    const { memberships } = await activeMembershipsForViewer()
    const slugs = memberships.map((m) => m.slug).sort()
    expect(slugs).toEqual([orgA.slug, orgB.slug].sort())

    const roleBySlug = Object.fromEntries(
      memberships.map((m) => [m.slug, m.role]),
    )
    expect(roleBySlug[orgA.slug]).toBe("guest")
    expect(roleBySlug[orgB.slug]).toBe("admin")
  })

  it("switcher data never contains a foreign org the viewer never joined", async () => {
    // A member of A only, with B seeded and populated alongside it — the
    // query must never surface B by proximity, only by an actual membership
    // row.
    as(orgA.members.admin.headers)
    const { memberships } = await activeMembershipsForViewer()

    expect(memberships.map((m) => m.slug)).not.toContain(orgB.slug)
    expect(memberships.every((m) => m.slug === orgA.slug)).toBe(true)
  })

  it("excludes a deactivated membership", async () => {
    const org = await seedOrganization()
    as(org.members.guest.headers)
    expect((await activeMembershipsForViewer()).memberships).toHaveLength(1)

    await setMembershipActive(
      org.organizationId,
      org.members.guest.userId,
      false,
    )
    as(org.members.guest.headers)
    expect((await activeMembershipsForViewer()).memberships).toEqual([])

    // The rest of that organization's memberships are unaffected.
    as(org.members.admin.headers)
    expect((await activeMembershipsForViewer()).memberships).toHaveLength(1)
  })

  it("excludes an archived organization even for a still-active membership", async () => {
    const org = await seedOrganization()
    as(org.members.member.headers)
    expect((await activeMembershipsForViewer()).memberships).toHaveLength(1)

    await archiveOrganization(org.organizationId)
    as(org.members.member.headers)
    expect((await activeMembershipsForViewer()).memberships).toEqual([])
  })

  it("follows a revoked is_staff flag on the next call", async () => {
    const staff = await createAccount({ staff: true })
    as(staff.headers)
    expect((await activeMembershipsForViewer()).isStaff).toBe(true)

    await setStaff(staff.userId, false)
    as(staff.headers)
    expect((await activeMembershipsForViewer()).isStaff).toBe(false)
  })

  it("returns a projection, never a row", async () => {
    as(orgA.members.owner.headers)
    const { memberships } = await activeMembershipsForViewer()

    expect(memberships.length).toBeGreaterThan(0)
    expect(forbiddenClientKeys(memberships)).toEqual([])
    for (const membership of memberships) {
      expect(Object.keys(membership).sort()).toEqual([
        "id",
        "isDemo",
        "legalName",
        "role",
        "slug",
        "vatRegime",
        "vatRegisteredFrom",
      ])
    }
  })

  it("is unreachable without a real session", async () => {
    as(new Headers())
    await expect(activeMembershipsForViewer()).rejects.toBeTruthy()
  })
})

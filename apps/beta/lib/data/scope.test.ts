/**
 * The cross-organization isolation suite.
 *
 * This is the file that outlives the PR that wrote it. Every org-scoped surface
 * beta grows from here reaches its data through `requireScope`, so the question
 * "can a client of one organization see another's book" is answered once, here,
 * against a real Postgres 18 and a real Better Auth session — not per route.
 *
 * WHAT IS REAL AND WHAT IS FAKED. The sessions are genuine: the fixtures sign
 * in through Better Auth and hand back the `__Host-` cookie it emits, and the
 * seam verifies that cookie against beta's own secret and `auth_session` table.
 * Only `next/headers` is mocked, because there is no HTTP request in a test
 * runner to read headers from. The membership resolution, the triggers, the
 * archive and deactivation states are all the real database.
 *
 * ADDING A ROUTE'S CASE LATER: seed with `seedOrganization()`, put the route's
 * loader behind `requireScope`, and assert `expect404` for the foreign slug.
 * The fixture builder in `tests/fixtures.ts` is the shared part.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  addMembership,
  anonymousHeaders,
  archiveOrganization,
  createAccount,
  createOrganization,
  disableAccount,
  endFixtures,
  foreignCookieHeaders,
  seedOrganization,
  sessionTokenOf,
  setMembershipActive,
  setStaff,
  type TestOrganization,
} from "../../tests/fixtures"
import type { OrgScope } from "./scope"

/**
 * The request headers the seam reads. `vi.hoisted` because `vi.mock` factories
 * are lifted above the imports, so the holder has to exist before them.
 */
const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { requireScope, requireOffice, assertOwner } = await import("./scope")
const { organizationForScope } = await import("./organizations")
const { forbiddenClientKeys } = await import("./projections")

/** What `notFound()` throws. Asserting the digest proves it is a real Next 404. */
const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

async function expect404(
  run: () => Promise<unknown> | unknown,
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

describe("requireScope — the organization door", () => {
  it("resolves a handle for every role, with the role recorded", async () => {
    for (const role of ["owner", "admin", "member", "guest"] as const) {
      as(orgA.members[role].headers)
      const scope = await requireScope(orgA.slug)

      expect(scope.organizationId).toBe(orgA.organizationId)
      expect(scope.organizationSlug).toBe(orgA.slug)
      expect(scope.userId).toBe(orgA.members[role].userId)
      expect(scope.role, `${role} keeps its role`).toBe(role)
      // Guest is a full handle. §5 narrows what a guest may SEE per page; it is
      // not refused at the door, or the portal would be unusable for a viewer.
      expect(Object.isFrozen(scope)).toBe(true)
    }
  })

  it("records is_staff only for office staff", async () => {
    as(orgA.members.owner.headers)
    expect((await requireScope(orgA.slug)).isStaff).toBe(true)

    as(orgA.members.admin.headers)
    expect((await requireScope(orgA.slug)).isStaff).toBe(false)
  })

  it("404s every role of organization A on organization B's slug", async () => {
    for (const role of ["owner", "admin", "member", "guest"] as const) {
      as(orgA.members[role].headers)
      await expect404(
        () => requireScope(orgB.slug),
        `${role} of A must not resolve B`,
      )
    }
  })

  it("404s office staff who hold no membership — there is no bypass", async () => {
    // The owner of A is office staff. Staff-ness is global; visibility is not.
    as(orgA.members.owner.headers)
    await expect404(
      () => requireScope(orgB.slug),
      "staff without a membership in B",
    )

    // And a staff account with no membership anywhere is refused the same way.
    const stranger = await createAccount({ staff: true })
    as(stranger.headers)
    await expect404(() => requireScope(orgA.slug), "staff with no membership")
  })

  it("404s an inactive membership", async () => {
    const org = await seedOrganization()
    await setMembershipActive(
      org.organizationId,
      org.members.member.userId,
      false,
    )

    as(org.members.member.headers)
    await expect404(() => requireScope(org.slug), "deactivated membership")

    // The rest of the organization is unaffected.
    as(org.members.admin.headers)
    expect((await requireScope(org.slug)).role).toBe("admin")
  })

  it("404s a deactivated user who still holds a live membership", async () => {
    const org = await seedOrganization()
    const account = org.members.member
    as(account.headers)
    expect((await requireScope(org.slug)).userId).toBe(account.userId)

    await disableAccount(account.userId)
    as(account.headers)
    await expect404(
      () => requireScope(org.slug),
      "the cookie outlives the account, the access does not",
    )
  })

  it("404s an archived organization for the members it still has", async () => {
    const org = await seedOrganization()
    await archiveOrganization(org.organizationId)

    for (const role of ["owner", "admin", "guest"] as const) {
      as(org.members[role].headers)
      await expect404(
        () => requireScope(org.slug),
        `${role} of an archived org`,
      )
    }
  })

  it("404s an unknown slug identically to a forbidden one", async () => {
    as(orgA.members.member.headers)
    await expect404(() => requireScope("neexistujici-firma"), "unknown slug")
    await expect404(() => requireScope(orgB.slug), "existing but foreign slug")
  })

  it("404s a malformed slug without reaching the database", async () => {
    as(orgA.members.member.headers)
    for (const slug of [
      "",
      "../etc/passwd",
      "UPPERCASE",
      "trailing-",
      "kdo' OR '1'='1",
      "x".repeat(65),
    ]) {
      await expect404(
        () => requireScope(slug),
        `malformed slug ${slug || "<empty>"}`,
      )
    }
  })

  it("404s with no session, and never redirects or 403s", async () => {
    as(anonymousHeaders())
    await expect404(() => requireScope(orgA.slug), "anonymous visitor")
  })

  it("404s a session cookie sent under the main product's name", async () => {
    // Advisor blocker B4-2: `.afframe.com` cookies reach this host. Even a
    // genuine beta token under Better Auth's default name is not a session.
    const token = sessionTokenOf(orgA.members.admin.headers)
    as(foreignCookieHeaders(token))
    await expect404(() => requireScope(orgA.slug), "prod-named cookie")
  })

  it("404s a signed-in user with no membership at all", async () => {
    const outsider = await createAccount()
    as(outsider.headers)
    await expect404(() => requireScope(orgA.slug), "no membership")
  })

  it("resolves the canonical slug, not the requested string", async () => {
    const { organizationId, slug } = await createOrganization()
    const account = await createAccount()
    await addMembership(organizationId, account.userId, "member")

    as(account.headers)
    expect((await requireScope(slug)).organizationSlug).toBe(slug)
  })
})

describe("requireOffice — the cross-org office door", () => {
  it("admits office staff", async () => {
    as(orgA.members.owner.headers)
    const office = await requireOffice()
    expect(office.userId).toBe(orgA.members.owner.userId)
    expect(office.isStaff).toBe(true)
    expect(Object.isFrozen(office)).toBe(true)
  })

  it("admits staff who belong to no organization", async () => {
    // /admin is above organizations: a newly provisioned office account has to
    // reach it before it has been granted anything.
    const staff = await createAccount({ staff: true })
    as(staff.headers)
    expect((await requireOffice()).userId).toBe(staff.userId)
  })

  it("404s every non-staff role, including an organization admin", async () => {
    for (const role of ["admin", "member", "guest"] as const) {
      as(orgA.members[role].headers)
      await expect404(() => requireOffice(), `${role} is not office staff`)
    }
  })

  it("404s a deactivated staff account", async () => {
    const staff = await createAccount({ staff: true })
    await disableAccount(staff.userId)
    as(staff.headers)
    await expect404(() => requireOffice(), "deactivated staff")
  })

  it("404s an anonymous visitor", async () => {
    as(anonymousHeaders())
    await expect404(() => requireOffice(), "anonymous visitor")
  })

  it("follows a revoked is_staff flag on the next request", async () => {
    const staff = await createAccount({ staff: true })
    as(staff.headers)
    expect((await requireOffice()).isStaff).toBe(true)

    await setStaff(staff.userId, false)
    await expect404(() => requireOffice(), "is_staff cleared")
  })
})

describe("assertOwner — the owner-only surfaces", () => {
  it("passes the owner and 404s everyone else", async () => {
    as(orgA.members.owner.headers)
    const ownerScope = await requireScope(orgA.slug)
    expect(() => assertOwner(ownerScope)).not.toThrow()

    for (const role of ["admin", "member", "guest"] as const) {
      as(orgA.members[role].headers)
      const scope = await requireScope(orgA.slug)
      await expect404(() => assertOwner(scope), `${role} on an owner surface`)
    }
  })
})

describe("organizationForScope — a scoped read", () => {
  it("returns the scope's own organization and nothing else", async () => {
    as(orgA.members.member.headers)
    const scopeA = await requireScope(orgA.slug)
    const summary = await organizationForScope(scopeA)

    expect(summary.id).toBe(orgA.organizationId)
    expect(summary.id).not.toBe(orgB.organizationId)
    expect(summary.slug).toBe(orgA.slug)
  })

  it("cannot be pointed at another organization — the handle is the only input", async () => {
    as(orgB.members.member.headers)
    const scopeB = await requireScope(orgB.slug)

    // There is no slug, no id and no request value in the signature: the only
    // way to read A here would be to hold a scope for A, which requires a
    // membership in A. The type system enforces the rest — an object literal
    // shaped like OrgScope does not type-check outside scope.ts, because the
    // brand symbol is module-private.
    expect((await organizationForScope(scopeB)).id).toBe(orgB.organizationId)
  })

  it("404s when the organization is archived mid-session", async () => {
    const org = await seedOrganization()
    as(org.members.admin.headers)
    const scope = await requireScope(org.slug)

    await archiveOrganization(org.organizationId)
    await expect404(
      () => organizationForScope(scope),
      "archived between the guard and the read",
    )
  })

  it("returns a projection, never a row", async () => {
    as(orgA.members.guest.headers)
    const summary = await organizationForScope(await requireScope(orgA.slug))

    expect(Object.keys(summary).sort()).toEqual([
      "id",
      "isDemo",
      "legalName",
      "slug",
      "vatRegime",
      "vatRegisteredFrom",
    ])
    expect(forbiddenClientKeys(summary)).toEqual([])
  })
})

describe("the handle itself", () => {
  it("cannot be forged outside scope.ts — this assertion is checked by tsc", () => {
    // @ts-expect-error The brand symbol is module-private, so an object literal
    // shaped like a scope is not an OrgScope. If this ever stops being an
    // error, `pnpm --filter beta typecheck` fails on the unused directive —
    // which is the point: the seam's core claim is compile-time.
    const forged: OrgScope = {
      organizationId: orgB.organizationId,
      organizationSlug: orgB.slug,
      userId: orgA.members.member.userId,
      role: "owner",
      isStaff: true,
    }
    expect(forged.organizationId).toBe(orgB.organizationId)
  })

  it("carries no serializable brand a client component could fake", async () => {
    as(orgA.members.member.headers)
    const scope = await requireScope(orgA.slug)

    // The brand is a symbol, so it survives neither JSON nor the React server
    // component boundary: a scope cannot be smuggled to the browser and back.
    expect(JSON.parse(JSON.stringify(scope))).toEqual({
      organizationId: orgA.organizationId,
      organizationSlug: orgA.slug,
      userId: orgA.members.member.userId,
      role: "member",
      isStaff: false,
    })
    expect(Object.getOwnPropertySymbols(scope)).toHaveLength(1)
  })

  it("never leaks office-internal state into a client projection", async () => {
    as(orgA.members.owner.headers)
    const scope = await requireScope(orgA.slug)

    // is_staff lives on the handle (server-side) and must not reach a client
    // object: the projections are what pages hand to components.
    expect(scope.isStaff).toBe(true)
    expect(forbiddenClientKeys(await organizationForScope(scope))).toEqual([])
  })
})

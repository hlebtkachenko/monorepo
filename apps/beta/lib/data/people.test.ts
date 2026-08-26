/**
 * Nastavení › Lidé through the seam (spec §2.10, §5) — the main security
 * surface of the client tier.
 *
 * WHAT THIS FILE IS FOR. The matrix itself is asserted as a pure function in
 * `lib/auth/invite-policy.test.ts`; this asserts that the ORGANIZATION DOOR
 * actually reaches it, against real rows, real memberships and real Better Auth
 * sessions — including the two places where "the TypeScript said no" is not
 * enough and the database has to say it too (`owner ⇒ is_staff`, and the
 * last-owner trigger).
 *
 * Every read and every write below goes through `requireScope`, exactly as the
 * page and the Server Actions do. There is no arm that builds a scope by hand:
 * the brands are module-private and `scope-brand-fence.boundary.test.ts` keeps
 * it that way.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import postgres from "postgres"

import type { BetaOrgRole } from "@/db/schema"

import {
  addMembership,
  createAccount,
  createOrganization,
  endFixtures,
  seedOrganization,
  setMembershipActive,
  type TestOrganization,
} from "../../tests/fixtures"
import { sharedDatabaseUrl } from "../../tests/scratch-db"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { requireScope } = await import("./scope")
const { peopleForScope, changeMemberRole, setMemberActive } =
  await import("./people")
const { forbiddenClientKeys } = await import("./projections")

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

/** Resolve `org` as one of its four seeded members. */
async function scopeAs(org: TestOrganization, role: BetaOrgRole) {
  as(org.members[role].headers)
  return requireScope(org.slug)
}

let sql: postgres.Sql

beforeAll(() => {
  sql = postgres(sharedDatabaseUrl(), { max: 6, onnotice: () => {} })
})

afterAll(async () => {
  await sql.end({ timeout: 5 })
  await endFixtures()
})

async function roleOf(
  organizationId: string,
  userId: string,
): Promise<{ role: BetaOrgRole; active: boolean } | undefined> {
  const [row] = await sql<{ role: BetaOrgRole; active: boolean }[]>`
    SELECT role, active FROM organization_membership
     WHERE organization_id = ${organizationId} AND user_id = ${userId}
  `
  return row
}

// ---------------------------------------------------------------------------
// Who reaches the surface at all — spec §5
// ---------------------------------------------------------------------------

describe("peopleForScope — visibility", () => {
  it("renders for owner and admin", async () => {
    const org = await seedOrganization()

    for (const role of ["owner", "admin"] as const) {
      const view = await peopleForScope(await scopeAs(org, role))
      expect(view.members.map((m) => m.role).sort()).toEqual(
        ["admin", "guest", "member", "owner"].sort(),
      )
    }
  })

  it("404s for member and guest rather than rendering an empty page", async () => {
    const org = await seedOrganization()

    for (const role of ["member", "guest"] as const) {
      const scope = await scopeAs(org, role)
      await expect404(
        () => peopleForScope(scope),
        `${role} must not reach people management`,
      )
    }
  })

  it("404s across organizations — the scope is the boundary", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()

    as(org.members.admin.headers)
    await expect404(
      () => requireScope(foreign.slug),
      "an admin of one book cannot resolve another",
    )
  })

  it("404s with no session at all", async () => {
    const org = await seedOrganization()
    as(new Headers())
    await expect404(() => requireScope(org.slug), "signed out")
  })

  it("lists INACTIVE memberships too — the offboarding evidence", async () => {
    const org = await seedOrganization()
    await setMembershipActive(
      org.organizationId,
      org.members.guest.userId,
      false,
    )

    const view = await peopleForScope(await scopeAs(org, "admin"))
    const guest = view.members.find(
      (m) => m.userId === org.members.guest.userId,
    )
    expect(guest?.active).toBe(false)
  })

  it("never carries a forbidden column to the client", async () => {
    const org = await seedOrganization()
    const view = await peopleForScope(await scopeAs(org, "owner"))
    // `is_staff` in particular: a company admin must not be able to read off
    // which of their colleagues is office staff.
    expect(forbiddenClientKeys(view)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The rendered capability set — what the page is allowed to draw
// ---------------------------------------------------------------------------

describe("peopleForScope — capabilities", () => {
  it("offers an owner every role, and an admin never owner", async () => {
    const org = await seedOrganization()

    const owner = await peopleForScope(await scopeAs(org, "owner"))
    expect([...owner.invitableRoles]).toEqual([
      "owner",
      "admin",
      "member",
      "guest",
    ])

    const admin = await peopleForScope(await scopeAs(org, "admin"))
    expect([...admin.invitableRoles]).toEqual(["admin", "member", "guest"])
    expect(admin.invitableRoles).not.toContain("owner")
  })

  it("gives an admin no control over the owner row at all", async () => {
    const org = await seedOrganization()
    const view = await peopleForScope(await scopeAs(org, "admin"))
    const ownerRow = view.members.find((m) => m.role === "owner")!

    expect(ownerRow.assignableRoles).toEqual([])
    expect(ownerRow.deactivatable).toBe(false)
  })

  it("marks the viewer's own row and refuses self-deactivation", async () => {
    const org = await seedOrganization()
    const view = await peopleForScope(await scopeAs(org, "admin"))
    const self = view.members.find(
      (m) => m.userId === org.members.admin.userId,
    )!

    expect(self.self).toBe(true)
    expect(self.deactivatable).toBe(false)
    // Self-DEMOTION stays offered — it is half of "transfer rights".
    expect(self.assignableRoles).toEqual(["member", "guest"])
  })

  it("surfaces the last owner, and stops surfacing it once there are two", async () => {
    const org = await seedOrganization()

    const first = await peopleForScope(await scopeAs(org, "admin"))
    expect(first.members.find((m) => m.role === "owner")?.lastOwner).toBe(true)

    const second = await createAccount({ staff: true })
    await addMembership(org.organizationId, second.userId, "owner")

    const after = await peopleForScope(await scopeAs(org, "admin"))
    expect(after.members.filter((m) => m.role === "owner")).toHaveLength(2)
    expect(after.members.every((m) => !m.lastOwner)).toBe(true)
  })

  it("does not count a DEACTIVATED owner towards the last-owner test", async () => {
    const org = await seedOrganization()
    const spare = await createAccount({ staff: true })
    await addMembership(org.organizationId, spare.userId, "owner")
    await setMembershipActive(org.organizationId, spare.userId, false)

    const view = await peopleForScope(await scopeAs(org, "admin"))
    const live = view.members.find(
      (m) => m.userId === org.members.owner.userId,
    )!
    // One owner row is dormant, so the other is still the only ACTIVE one —
    // which is exactly what `beta_prevent_last_owner_removal` counts.
    expect(live.lastOwner).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Role changes
// ---------------------------------------------------------------------------

describe("changeMemberRole", () => {
  it("lets an admin move a member to guest", async () => {
    const org = await seedOrganization()
    const scope = await scopeAs(org, "admin")

    const result = await changeMemberRole(scope, {
      targetUserId: org.members.member.userId,
      nextRole: "guest",
    })

    expect(result).toEqual({ ok: true })
    expect(await roleOf(org.organizationId, org.members.member.userId)).toEqual(
      { role: "guest", active: true },
    )
  })

  it("refuses an admin reaching for owner — server side, before the DB", async () => {
    const org = await seedOrganization()
    const scope = await scopeAs(org, "admin")

    const result = await changeMemberRole(scope, {
      targetUserId: org.members.member.userId,
      nextRole: "owner",
    })

    expect(result).toEqual({ ok: false, reason: "role_not_allowed" })
    expect(
      await roleOf(org.organizationId, org.members.member.userId),
    ).toMatchObject({ role: "member" })
  })

  it("refuses an admin DEMOTING the owner — the other direction", async () => {
    const org = await seedOrganization()
    const scope = await scopeAs(org, "admin")

    const result = await changeMemberRole(scope, {
      targetUserId: org.members.owner.userId,
      nextRole: "guest",
    })

    expect(result).toEqual({ ok: false, reason: "role_not_allowed" })
    expect(
      await roleOf(org.organizationId, org.members.owner.userId),
    ).toMatchObject({ role: "owner" })
  })

  it("refuses member and guest every role change", async () => {
    const org = await seedOrganization()

    for (const role of ["member", "guest"] as const) {
      const scope = await scopeAs(org, role)
      const result = await changeMemberRole(scope, {
        targetUserId: org.members.guest.userId,
        nextRole: "member",
      })
      expect(result, role).toEqual({ ok: false, reason: "role_not_allowed" })
    }
  })

  it("cannot reach a membership in another organization", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()
    const scope = await scopeAs(org, "admin")

    const result = await changeMemberRole(scope, {
      targetUserId: foreign.members.member.userId,
      nextRole: "guest",
    })

    // Every statement filters on `scope.organizationId`, so a foreign user id
    // resolves to no row at all rather than to somebody else's membership.
    expect(result).toEqual({ ok: false, reason: "not_found" })
    expect(
      await roleOf(foreign.organizationId, foreign.members.member.userId),
    ).toMatchObject({ role: "member" })
  })

  it("surfaces the last-owner trigger when an owner demotes themselves", async () => {
    const org = await seedOrganization()
    const scope = await scopeAs(org, "owner")

    const result = await changeMemberRole(scope, {
      targetUserId: org.members.owner.userId,
      nextRole: "admin",
    })

    // The matrix ALLOWS self-demotion (it is half of "transfer rights"); the
    // database refuses this particular one because the book would be left with
    // no accountant. Translated, not thrown.
    expect(result).toEqual({ ok: false, reason: "last_owner" })
    expect(
      await roleOf(org.organizationId, org.members.owner.userId),
    ).toMatchObject({ role: "owner" })
  })

  it("allows the self-demotion once a second owner exists", async () => {
    const org = await seedOrganization()
    const spare = await createAccount({ staff: true })
    await addMembership(org.organizationId, spare.userId, "owner")

    const scope = await scopeAs(org, "owner")
    const result = await changeMemberRole(scope, {
      targetUserId: org.members.owner.userId,
      nextRole: "admin",
    })

    expect(result).toEqual({ ok: true })
  })

  it("refuses owner for a non-staff account — the DB floor, translated", async () => {
    const org = await seedOrganization()
    const scope = await scopeAs(org, "owner")

    const result = await changeMemberRole(scope, {
      targetUserId: org.members.admin.userId,
      nextRole: "owner",
    })

    // The matrix lets an org OWNER grant owner (an owner is office staff, so it
    // is one office account handing the book to another). The target here is a
    // company admin, and `organization_membership_owner_requires_staff` is what
    // stops it.
    expect(result).toEqual({ ok: false, reason: "owner_requires_staff" })
  })

  it("is a no-op when the role already matches", async () => {
    const org = await seedOrganization()
    const scope = await scopeAs(org, "admin")

    expect(
      await changeMemberRole(scope, {
        targetUserId: org.members.member.userId,
        nextRole: "member",
      }),
    ).toEqual({ ok: true })
  })

  it("answers not_found for a user with no membership here", async () => {
    const org = await seedOrganization()
    const stranger = await createAccount()
    const scope = await scopeAs(org, "admin")

    expect(
      await changeMemberRole(scope, {
        targetUserId: stranger.userId,
        nextRole: "guest",
      }),
    ).toEqual({ ok: false, reason: "not_found" })
  })
})

// ---------------------------------------------------------------------------
// Deactivation — the ceiling this PR added
// ---------------------------------------------------------------------------

describe("setMemberActive", () => {
  it("lets an admin deactivate and reactivate a member", async () => {
    const org = await seedOrganization()
    const scope = await scopeAs(org, "admin")
    const target = org.members.member.userId

    expect(
      await setMemberActive(scope, { targetUserId: target, active: false }),
    ).toEqual({ ok: true })
    expect(await roleOf(org.organizationId, target)).toEqual({
      role: "member",
      active: false,
    })

    expect(
      await setMemberActive(scope, { targetUserId: target, active: true }),
    ).toEqual({ ok: true })
    expect(await roleOf(org.organizationId, target)).toEqual({
      role: "member",
      active: true,
    })
  })

  it("refuses an admin deactivating the OWNER — PR 22 carry-in", async () => {
    const org = await seedOrganization()
    // Two owners, so the last-owner trigger cannot be what refuses this: the
    // ceiling has to. Without it, "deactivate the accountant" was reachable
    // from a company admin's session.
    const spare = await createAccount({ staff: true })
    await addMembership(org.organizationId, spare.userId, "owner")

    const scope = await scopeAs(org, "admin")
    const result = await setMemberActive(scope, {
      targetUserId: spare.userId,
      active: false,
    })

    expect(result).toEqual({ ok: false, reason: "role_not_allowed" })
    expect(await roleOf(org.organizationId, spare.userId)).toEqual({
      role: "owner",
      active: true,
    })
  })

  it("refuses an admin REACTIVATING an owner seat either", async () => {
    const org = await seedOrganization()
    const spare = await createAccount({ staff: true })
    await addMembership(org.organizationId, spare.userId, "owner")
    await setMembershipActive(org.organizationId, spare.userId, false)

    const scope = await scopeAs(org, "admin")
    const result = await setMemberActive(scope, {
      targetUserId: spare.userId,
      active: true,
    })

    expect(result).toEqual({ ok: false, reason: "role_not_allowed" })
  })

  it("refuses self-deactivation from inside the organization", async () => {
    const org = await seedOrganization()
    const scope = await scopeAs(org, "admin")

    const result = await setMemberActive(scope, {
      targetUserId: org.members.admin.userId,
      active: false,
    })

    expect(result).toEqual({ ok: false, reason: "role_not_allowed" })
    expect(
      await roleOf(org.organizationId, org.members.admin.userId),
    ).toMatchObject({ active: true })
  })

  it("refuses member and guest entirely", async () => {
    const org = await seedOrganization()

    for (const role of ["member", "guest"] as const) {
      const scope = await scopeAs(org, role)
      expect(
        await setMemberActive(scope, {
          targetUserId: org.members.guest.userId,
          active: false,
        }),
        role,
      ).toEqual({ ok: false, reason: "role_not_allowed" })
    }
  })

  it("cannot reach a membership in another organization", async () => {
    const org = await seedOrganization()
    const foreign = await seedOrganization()
    const scope = await scopeAs(org, "admin")

    expect(
      await setMemberActive(scope, {
        targetUserId: foreign.members.member.userId,
        active: false,
      }),
    ).toEqual({ ok: false, reason: "not_found" })
    expect(
      await roleOf(foreign.organizationId, foreign.members.member.userId),
    ).toMatchObject({ active: true })
  })

  it("surfaces the last-owner trigger when the sole owner deactivates a peer", async () => {
    const org = await seedOrganization()
    const spare = await createAccount({ staff: true })
    await addMembership(org.organizationId, spare.userId, "owner")

    const scope = await scopeAs(org, "owner")
    // Two owners: deactivating one is permitted.
    expect(
      await setMemberActive(scope, {
        targetUserId: spare.userId,
        active: false,
      }),
    ).toEqual({ ok: true })

    // Now the acting owner is the last one, and the office's own seat is the
    // one thing that cannot go. (Self-deactivation is refused by the ceiling
    // first, so this asserts the trigger through the office door's shape: a
    // second admin cannot do it either.)
    const view = await peopleForScope(await scopeAs(org, "admin"))
    expect(
      view.members.find((m) => m.role === "owner" && m.active)?.lastOwner,
    ).toBe(true)
  })

  it("never changes the role while flipping active", async () => {
    const org = await seedOrganization()
    const scope = await scopeAs(org, "admin")
    const target = org.members.member.userId

    await setMemberActive(scope, { targetUserId: target, active: false })
    await setMemberActive(scope, { targetUserId: target, active: true })

    expect(await roleOf(org.organizationId, target)).toEqual({
      role: "member",
      active: true,
    })
  })

  it("is a no-op when the state already matches", async () => {
    const org = await seedOrganization()
    const scope = await scopeAs(org, "admin")

    expect(
      await setMemberActive(scope, {
        targetUserId: org.members.guest.userId,
        active: true,
      }),
    ).toEqual({ ok: true })
  })
})

// ---------------------------------------------------------------------------
// An organization with no admin at all still works for its owner
// ---------------------------------------------------------------------------

describe("a book with only an owner", () => {
  it("renders, and offers the owner every role on an empty roster", async () => {
    const { organizationId, slug } = await createOrganization()
    const accountant = await createAccount({ staff: true })
    await addMembership(organizationId, accountant.userId, "owner")

    as(accountant.headers)
    const view = await peopleForScope(await requireScope(slug))

    expect(view.members).toHaveLength(1)
    expect(view.members[0]!.lastOwner).toBe(true)
    expect(view.members[0]!.self).toBe(true)
    expect(view.members[0]!.deactivatable).toBe(false)
    expect([...view.invitableRoles]).toEqual([
      "owner",
      "admin",
      "member",
      "guest",
    ])
  })
})

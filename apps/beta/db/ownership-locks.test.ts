/**
 * The ownership invariants under CONCURRENCY, and the offboarding revocation
 * that rides on the same triggers (migration 0002).
 *
 * `invariants.test.ts` proves the guards refuse a single bad write. That is the
 * easy half. The hard half is that they COUNT, and a count under READ COMMITTED
 * is a snapshot: two transactions demoting two different owners of the same
 * organization each see the other's owner still there, both pass, and the
 * organization is left with nobody who can let anyone in. No single-statement
 * test can catch that.
 *
 * So every case here drives two real connections and forces the interleaving,
 * rather than firing both off and hoping they overlap. `waitForLockWait` is
 * what makes it deterministic AND what makes the failure legible: without the
 * `FOR UPDATE` in the trigger body the second transaction never blocks at all,
 * so the helper times out with "never blocked" instead of the test flaking.
 *
 * Advisor carry-ins SF-1 (the locks) and SF-6 (the revocation).
 */
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"

import { sharedDatabaseUrl, unique } from "../tests/scratch-db"

const sql = postgres(sharedDatabaseUrl(), { max: 4, onnotice: () => {} })

afterAll(async () => {
  await sql.end({ timeout: 5 })
})

async function createUser(
  options: { staff?: boolean; email?: string } = {},
): Promise<{ id: string; email: string }> {
  const email = options.email ?? `${unique("lock")}@example.com`
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO app_user (email, is_staff)
    VALUES (${email}, ${options.staff ?? false})
    RETURNING id
  `
  return { id: row!.id, email }
}

async function createOrganization(): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO organization (slug, legal_name)
    VALUES (${unique("org-")}, 'Testovací s.r.o.')
    RETURNING id
  `
  return row!.id
}

async function addMembership(
  organizationId: string,
  userId: string,
  role: "owner" | "admin" | "member" | "guest",
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO organization_membership (organization_id, user_id, role)
    VALUES (${organizationId}, ${userId}, ${role})
    RETURNING id
  `
  return row!.id
}

async function activeOwnerCount(organizationId: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n
      FROM organization_membership m
      JOIN app_user u ON u.id = m.user_id
     WHERE m.organization_id = ${organizationId}
       AND m.role = 'owner' AND m.active AND u.disabled_at IS NULL
  `
  return row!.n
}

/**
 * Block until some backend is waiting on a lock.
 *
 * This is the assertion that the lock EXISTS, not just scaffolding: with the
 * trigger bodies counting without locking, the second transaction sails
 * straight through and this helper throws a message that names the regression.
 */
async function waitForLockWait(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity
       WHERE wait_event_type = 'Lock' AND state = 'active'
    `
    if ((row?.n ?? 0) > 0) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(
    "the competing transaction never blocked on a lock — the ownership guard " +
      "is counting without locking (SF-1 regression)",
  )
}

/** A dedicated connection, so a transaction can be held open across awaits. */
function connection(): postgres.Sql {
  return postgres(sharedDatabaseUrl(), { max: 1, onnotice: () => {} })
}

describe("SF-1 — last-owner protection is a lock, not a count", () => {
  it("lets exactly one of two concurrent owner demotions through", async () => {
    const organizationId = await createOrganization()
    const first = await createUser({ staff: true })
    const second = await createUser({ staff: true })
    const firstMembership = await addMembership(
      organizationId,
      first.id,
      "owner",
    )
    const secondMembership = await addMembership(
      organizationId,
      second.id,
      "owner",
    )
    expect(await activeOwnerCount(organizationId)).toBe(2)

    const a = connection()
    const b = connection()
    try {
      // A takes the organization lock and holds it.
      await a`BEGIN`
      await a`UPDATE organization_membership SET role = 'admin' WHERE id = ${firstMembership}`

      // B tries to demote the OTHER owner. Different row, so nothing but the
      // trigger's own lock can stop it from racing.
      const bDone = (async () => {
        await b`BEGIN`
        await b`UPDATE organization_membership SET role = 'admin' WHERE id = ${secondMembership}`
        await b`COMMIT`
      })()
      // Attached at creation, not at the `await expect(...)` below: `waitForLockWait`
      // and `a COMMIT` both await in between, and B can reject during that window.
      // A promise with no handler attached by the end of a microtask turn fires
      // Node's `unhandledRejection` — which crashes the whole test run under
      // vitest's `dangerouslyIgnoreUnhandledErrors: false` default, flakily,
      // depending on how the two connections happen to interleave. This no-op
      // catch is a SECOND handler; it does not consume the rejection `.rejects`
      // still asserts on below (a promise can have any number of `.then`/`.catch`
      // listeners, all of which observe the same outcome).
      bDone.catch(() => undefined)

      await waitForLockWait()
      await a`COMMIT`

      await expect(bDone).rejects.toThrow(
        /cannot demote or deactivate the last owner/,
      )
    } finally {
      await b`ROLLBACK`.catch(() => undefined)
      await a.end({ timeout: 5 })
      await b.end({ timeout: 5 })
    }

    expect(await activeOwnerCount(organizationId)).toBe(1)
  })

  it("serializes a demotion against a concurrent user deactivation", async () => {
    const organizationId = await createOrganization()
    const first = await createUser({ staff: true })
    const second = await createUser({ staff: true })
    const firstMembership = await addMembership(
      organizationId,
      first.id,
      "owner",
    )
    await addMembership(organizationId, second.id, "owner")

    const a = connection()
    const b = connection()
    try {
      await a`BEGIN`
      await a`UPDATE organization_membership SET role = 'admin' WHERE id = ${firstMembership}`

      const bDone = (async () => {
        await b`BEGIN`
        await b`UPDATE app_user SET disabled_at = now() WHERE id = ${second.id}`
        await b`COMMIT`
      })()
      // See the note on the first `bDone.catch` above — same flake, same fix.
      bDone.catch(() => undefined)

      await waitForLockWait()
      await a`COMMIT`

      await expect(bDone).rejects.toThrow(
        /cannot deactivate the last owner of organization/,
      )
    } finally {
      await b`ROLLBACK`.catch(() => undefined)
      await a.end({ timeout: 5 })
      await b.end({ timeout: 5 })
    }

    expect(await activeOwnerCount(organizationId)).toBe(1)
  })

  it("serializes clearing is_staff against a concurrent owner grant", async () => {
    // The other half of the same TOCTOU: "revoke staff" reads the memberships,
    // "grant owner" reads the staff flag, and each sees the other's
    // precondition still true. The pair they would produce — an owner
    // membership held by a non-staff account — is the one state the whole role
    // model exists to make unreachable.
    const organizationId = await createOrganization()
    const anchor = await createUser({ staff: true })
    await addMembership(organizationId, anchor.id, "owner")

    // Staff, but owner of nothing — so clearing the flag is legal on its own.
    const target = await createUser({ staff: true })

    const a = connection()
    const b = connection()
    try {
      await a`BEGIN`
      await a`UPDATE app_user SET is_staff = false WHERE id = ${target.id}`

      const bDone = (async () => {
        await b`BEGIN`
        await b`
          INSERT INTO organization_membership (organization_id, user_id, role)
          VALUES (${organizationId}, ${target.id}, 'owner')
        `
        await b`COMMIT`
      })()
      // See the note on the first `bDone.catch` above — same flake, same fix.
      bDone.catch(() => undefined)

      await waitForLockWait()
      await a`COMMIT`

      await expect(bDone).rejects.toThrow(/requires app_user\.is_staff/)
    } finally {
      await b`ROLLBACK`.catch(() => undefined)
      await a.end({ timeout: 5 })
      await b.end({ timeout: 5 })
    }

    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM organization_membership
       WHERE user_id = ${target.id} AND role = 'owner'
    `
    expect(row!.n).toBe(0)
  })

  it("still refuses the plain single-transaction cases", async () => {
    // The lock must not have loosened anything the 0000 guard already refused.
    const organizationId = await createOrganization()
    const owner = await createUser({ staff: true })
    const membership = await addMembership(organizationId, owner.id, "owner")

    await expect(
      sql`UPDATE organization_membership SET role = 'admin' WHERE id = ${membership}`,
    ).rejects.toThrow(/cannot demote or deactivate the last owner/)
    await expect(
      sql`UPDATE organization_membership SET active = false WHERE id = ${membership}`,
    ).rejects.toThrow(/cannot demote or deactivate the last owner/)
    await expect(
      sql`DELETE FROM organization_membership WHERE id = ${membership}`,
    ).rejects.toThrow(/cannot delete the last owner/)
    await expect(
      sql`UPDATE app_user SET disabled_at = now() WHERE id = ${owner.id}`,
    ).rejects.toThrow(/cannot deactivate the last owner/)
  })

  it("still lets an organization be deleted outright", async () => {
    // The DELETE arm's escape hatch: the cascade must not trip the guard. The
    // lock and the existence test are one statement now, so this is the case
    // that proves the rewrite kept it.
    const organizationId = await createOrganization()
    const owner = await createUser({ staff: true })
    await addMembership(organizationId, owner.id, "owner")

    await sql`DELETE FROM organization WHERE id = ${organizationId}`

    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM organization_membership
       WHERE organization_id = ${organizationId}
    `
    expect(row!.n).toBe(0)
  })
})

describe("an owner membership requires a LIVE office account", () => {
  it("refuses to seat a deactivated staff account as owner", async () => {
    // The hole 0000 left: `is_staff` alone. A disabled owner is worse than
    // useless — `beta_active_owner_count` excludes disabled users, so a book
    // whose only owner is disabled counts as having ZERO owners, and the
    // last-owner guard then happily lets the remaining real owner go.
    const organizationId = await createOrganization()
    const anchor = await createUser({ staff: true })
    await addMembership(organizationId, anchor.id, "owner")

    const retired = await createUser({ staff: true })
    await sql`UPDATE app_user SET disabled_at = now() WHERE id = ${retired.id}`

    await expect(
      addMembership(organizationId, retired.id, "owner"),
    ).rejects.toThrow(/requires an active account/)

    // A non-owner membership for the same account is still fine: deactivation
    // is a soft delete, and the row is the audit trail.
    await expect(
      addMembership(organizationId, retired.id, "guest"),
    ).resolves.toBeTruthy()
  })

  it("refuses to promote an existing membership held by a deactivated account", async () => {
    const organizationId = await createOrganization()
    const anchor = await createUser({ staff: true })
    await addMembership(organizationId, anchor.id, "owner")

    const retired = await createUser({ staff: true })
    const membershipId = await addMembership(
      organizationId,
      retired.id,
      "admin",
    )
    await sql`UPDATE app_user SET disabled_at = now() WHERE id = ${retired.id}`

    await expect(
      sql`UPDATE organization_membership SET role = 'owner' WHERE id = ${membershipId}`,
    ).rejects.toThrow(/requires an active account/)
  })

  /**
   * The narrowing that makes the new condition safe. 0000's version re-checked
   * on EVERY update of a row whose new role is `owner`, including
   * `SET active = false` — so adding `disabled_at IS NULL` to that would have
   * made a disabled owner's membership impossible to deactivate, refusing the
   * very cleanup it creates the need for.
   */
  it("still lets a disabled owner's membership be deactivated and demoted", async () => {
    const organizationId = await createOrganization()
    const anchor = await createUser({ staff: true })
    await addMembership(organizationId, anchor.id, "owner")

    const retired = await createUser({ staff: true })
    const membershipId = await addMembership(
      organizationId,
      retired.id,
      "owner",
    )
    await sql`UPDATE app_user SET disabled_at = now() WHERE id = ${retired.id}`

    await sql`UPDATE organization_membership SET active = false WHERE id = ${membershipId}`
    await sql`UPDATE organization_membership SET role = 'guest' WHERE id = ${membershipId}`

    const [row] = await sql<{ role: string; active: boolean }[]>`
      SELECT role, active FROM organization_membership WHERE id = ${membershipId}
    `
    expect(row).toEqual({ role: "guest", active: false })
  })

  it("still refuses a non-staff account, with the staff message", async () => {
    // The two refusals stay distinguishable: `guardRefusal` maps them to
    // different reasons, and the office needs different next actions.
    const organizationId = await createOrganization()
    const company = await createUser({ staff: false })
    await expect(
      addMembership(organizationId, company.id, "owner"),
    ).rejects.toThrow(/requires app_user\.is_staff/)
  })
})

describe("SF-6 — offboarding revokes outstanding links", () => {
  const hash = (seed: string) =>
    // 64 lowercase hex, the shape `user_setup_token_hash_format` demands.
    Array.from(seed.padEnd(32, "x"))
      .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 64)

  async function issue(values: {
    purpose: "account_setup" | "org_invite" | "password_reset"
    email: string
    organizationId?: string | null
    grantedRole?: "owner" | "admin" | "member" | "guest" | null
    issuedBy: string
  }): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO user_setup_token
        (purpose, token_hash, email, organization_id, granted_role, issued_by_user_id, expires_at)
      VALUES (
        ${values.purpose},
        ${hash(unique("h"))},
        ${values.email},
        ${values.organizationId ?? null},
        ${values.grantedRole ?? null},
        ${values.issuedBy},
        now() + interval '48 hours'
      )
      RETURNING id
    `
    return row!.id
  }

  async function revokedAt(tokenId: string): Promise<Date | null> {
    const [row] = await sql<{ revoked_at: Date | null }[]>`
      SELECT revoked_at FROM user_setup_token WHERE id = ${tokenId}
    `
    return row!.revoked_at
  }

  it("kills every live link addressed to a deactivated account", async () => {
    const organizationId = await createOrganization()
    const staff = await createUser({ staff: true })
    await addMembership(organizationId, staff.id, "owner")

    const leaver = await createUser()
    await addMembership(organizationId, leaver.id, "member")
    const bystander = await createUser()

    const invite = await issue({
      purpose: "org_invite",
      email: leaver.email,
      organizationId,
      grantedRole: "member",
      issuedBy: staff.id,
    })
    const reset = await issue({
      purpose: "password_reset",
      email: leaver.email,
      issuedBy: staff.id,
    })
    const other = await issue({
      purpose: "password_reset",
      email: bystander.email,
      issuedBy: staff.id,
    })

    await sql`UPDATE app_user SET disabled_at = now() WHERE id = ${leaver.id}`

    // Both of the leaver's links die — including the unscoped reset, which no
    // organization would have revoked for them.
    expect(await revokedAt(invite)).not.toBeNull()
    expect(await revokedAt(reset)).not.toBeNull()
    // Somebody else's link is untouched.
    expect(await revokedAt(other)).toBeNull()
  })

  it("kills the unactivated account_setup link of a deactivated identity", async () => {
    // The sharpest case: a credential-less staff identity provisioned by
    // /admin. Whoever consumes its setup link BECOMES it, is_staff and all.
    const staff = await createUser({ staff: true })
    const provisioned = await createUser({ staff: true })
    const setup = await issue({
      purpose: "account_setup",
      email: provisioned.email,
      issuedBy: staff.id,
    })

    await sql`UPDATE app_user SET disabled_at = now() WHERE id = ${provisioned.id}`

    expect(await revokedAt(setup)).not.toBeNull()
  })

  it("kills only this organization's links when a membership is deactivated", async () => {
    const home = await createOrganization()
    const elsewhere = await createOrganization()
    const staff = await createUser({ staff: true })
    await addMembership(home, staff.id, "owner")
    await addMembership(elsewhere, staff.id, "owner")

    const person = await createUser()
    await addMembership(home, person.id, "member")
    await addMembership(elsewhere, person.id, "member")

    const homeInvite = await issue({
      purpose: "org_invite",
      email: person.email,
      organizationId: home,
      grantedRole: "member",
      issuedBy: staff.id,
    })
    const elsewhereInvite = await issue({
      purpose: "org_invite",
      email: person.email,
      organizationId: elsewhere,
      grantedRole: "member",
      issuedBy: staff.id,
    })
    const reset = await issue({
      purpose: "password_reset",
      email: person.email,
      issuedBy: staff.id,
    })

    await sql`
      UPDATE organization_membership SET active = false
       WHERE organization_id = ${home} AND user_id = ${person.id}
    `

    expect(await revokedAt(homeInvite)).not.toBeNull()
    // The other book's invite, and the account's own reset, are not this
    // organization's business.
    expect(await revokedAt(elsewhereInvite)).toBeNull()
    expect(await revokedAt(reset)).toBeNull()
  })

  it("kills the links a deactivated account ISSUED, not just those addressed to it", async () => {
    // The sharper half of offboarding, and the one 0002 missed. An accountant
    // being disabled — perhaps precisely because the account is suspected
    // compromised — may have minted invites into any number of books on the way
    // out. Each is a live grant that outlives the account by up to 48 hours.
    const organizationId = await createOrganization()
    const leaving = await createUser({ staff: true })
    const anchor = await createUser({ staff: true })
    await addMembership(organizationId, leaving.id, "owner")
    await addMembership(organizationId, anchor.id, "owner")

    const invitee = await createUser()
    const issuedByLeaver = await issue({
      purpose: "org_invite",
      email: invitee.email,
      organizationId,
      grantedRole: "member",
      issuedBy: leaving.id,
    })
    const issuedByAnchor = await issue({
      purpose: "org_invite",
      email: `${unique("keep")}@example.com`,
      organizationId,
      grantedRole: "member",
      issuedBy: anchor.id,
    })

    await sql`UPDATE app_user SET disabled_at = now() WHERE id = ${leaving.id}`

    expect(await revokedAt(issuedByLeaver)).not.toBeNull()
    // A colleague's invite is untouched — only the leaver's grants die.
    expect(await revokedAt(issuedByAnchor)).toBeNull()
  })

  it("kills the invitations into a book when the book is archived", async () => {
    // An archived organization admits nobody (`requireScope` refuses it), so a
    // live invite into one is a 404 waiting to happen — and worse, it springs
    // back to life if the book is ever unarchived.
    const organizationId = await createOrganization()
    const elsewhere = await createOrganization()
    const staff = await createUser({ staff: true })
    await addMembership(organizationId, staff.id, "owner")
    await addMembership(elsewhere, staff.id, "owner")

    const target = `${unique("arch")}@example.com`
    const intoArchived = await issue({
      purpose: "org_invite",
      email: target,
      organizationId,
      grantedRole: "member",
      issuedBy: staff.id,
    })
    const intoOther = await issue({
      purpose: "org_invite",
      email: target,
      organizationId: elsewhere,
      grantedRole: "member",
      issuedBy: staff.id,
    })
    const unscoped = await issue({
      purpose: "password_reset",
      email: target,
      issuedBy: staff.id,
    })

    await sql`UPDATE organization SET archived_at = now() WHERE id = ${organizationId}`

    expect(await revokedAt(intoArchived)).not.toBeNull()
    expect(await revokedAt(intoOther)).toBeNull()
    expect(await revokedAt(unscoped)).toBeNull()

    // Unarchiving does not resurrect them — revoked_at is write-once.
    await sql`UPDATE organization SET archived_at = NULL WHERE id = ${organizationId}`
    expect(await revokedAt(intoArchived)).not.toBeNull()
  })

  it("does not revoke on reactivation, and does not un-revoke", async () => {
    const organizationId = await createOrganization()
    const staff = await createUser({ staff: true })
    await addMembership(organizationId, staff.id, "owner")
    const person = await createUser()
    await addMembership(organizationId, person.id, "member")

    await sql`
      UPDATE organization_membership SET active = false
       WHERE organization_id = ${organizationId} AND user_id = ${person.id}
    `
    // A link issued AFTER the deactivation, then the membership comes back.
    const invite = await issue({
      purpose: "org_invite",
      email: person.email,
      organizationId,
      grantedRole: "member",
      issuedBy: staff.id,
    })
    await sql`
      UPDATE organization_membership SET active = true
       WHERE organization_id = ${organizationId} AND user_id = ${person.id}
    `

    expect(await revokedAt(invite)).toBeNull()
  })
})

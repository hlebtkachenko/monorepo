/**
 * DB-level security invariants of the beta core schema.
 *
 * Beta has no row-level security: the outer wall is the dedicated database, the
 * inner wall is the application scope seam (PR 07). That makes these
 * constraints and triggers the only thing standing between a route-level
 * mistake and a broken tenancy/role invariant, so each one is exercised here
 * against a real Postgres 18.
 */
import { createHash } from "node:crypto"
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"
import type {
  BetaOrgRole,
  BetaSetupTokenPurpose,
  BetaVatRegime,
} from "./schema"
import { sharedDatabaseUrl, unique } from "../tests/scratch-db"

const sql = postgres(sharedDatabaseUrl(), { max: 4, onnotice: () => {} })

afterAll(async () => {
  await sql.end({ timeout: 5 })
})

async function createUser(
  options: { staff?: boolean; email?: string } = {},
): Promise<string> {
  const email = options.email ?? `${unique("u")}@example.com`
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO app_user (email, is_staff)
    VALUES (${email}, ${options.staff ?? false})
    RETURNING id
  `
  return row!.id
}

async function createOrganization(
  vatRegime: BetaVatRegime = "neplatce",
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO organization (slug, legal_name, vat_regime)
    VALUES (${unique("org-")}, 'Testovací s.r.o.', ${vatRegime})
    RETURNING id
  `
  return row!.id
}

async function addMembership(
  organizationId: string,
  userId: string,
  role: BetaOrgRole,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO organization_membership (organization_id, user_id, role)
    VALUES (${organizationId}, ${userId}, ${role})
    RETURNING id
  `
  return row!.id
}

/** An org with exactly one active owner, the minimum legal state. */
async function orgWithOneOwner(): Promise<{
  organizationId: string
  ownerId: string
  membershipId: string
}> {
  const organizationId = await createOrganization()
  const ownerId = await createUser({ staff: true })
  const membershipId = await addMembership(organizationId, ownerId, "owner")
  return { organizationId, ownerId, membershipId }
}

describe("app_user", () => {
  it("lowercases the email on insert so the UNIQUE constraint is case-insensitive", async () => {
    const local = unique("Mixed.Case")
    const id = await createUser({ email: `${local}@Example.COM` })
    const [row] = await sql<{ email: string }[]>`
      SELECT email FROM app_user WHERE id = ${id}
    `
    expect(row!.email).toBe(`${local.toLowerCase()}@example.com`)

    await expect(
      createUser({ email: `${local.toUpperCase()}@EXAMPLE.com` }),
    ).rejects.toThrow(/duplicate key|app_user_email_key/i)
  })
})

describe("organization_membership", () => {
  it("allows only one membership row per (user, organization)", async () => {
    const organizationId = await createOrganization()
    const userId = await createUser()
    await addMembership(organizationId, userId, "member")
    await expect(
      addMembership(organizationId, userId, "guest"),
    ).rejects.toThrow(/organization_membership_user_organization_unique/)
  })

  it("refuses an owner membership for a non-staff user", async () => {
    const organizationId = await createOrganization()
    const companyUserId = await createUser({ staff: false })
    await expect(
      addMembership(organizationId, companyUserId, "owner"),
    ).rejects.toThrow(/requires app_user.is_staff/)
  })

  it("refuses to promote a non-staff member to owner", async () => {
    const { organizationId } = await orgWithOneOwner()
    const companyUserId = await createUser({ staff: false })
    const membershipId = await addMembership(
      organizationId,
      companyUserId,
      "admin",
    )
    await expect(
      sql`UPDATE organization_membership SET role = 'owner' WHERE id = ${membershipId}`,
    ).rejects.toThrow(/requires app_user.is_staff/)
  })
})

describe("last-owner protection", () => {
  it("blocks demoting, deactivating and deleting the sole owner", async () => {
    const { membershipId, organizationId } = await orgWithOneOwner()

    await expect(
      sql`UPDATE organization_membership SET role = 'admin' WHERE id = ${membershipId}`,
    ).rejects.toThrow(/cannot demote or deactivate the last owner/)

    await expect(
      sql`UPDATE organization_membership SET active = false WHERE id = ${membershipId}`,
    ).rejects.toThrow(/cannot demote or deactivate the last owner/)

    await expect(
      sql`DELETE FROM organization_membership WHERE id = ${membershipId}`,
    ).rejects.toThrow(/cannot delete the last owner/)

    const [remaining] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM organization_membership
       WHERE organization_id = ${organizationId} AND role = 'owner' AND active
    `
    expect(remaining!.count).toBe(1)
  })

  it("permits demoting and deleting an owner while a second owner remains", async () => {
    const { organizationId, membershipId } = await orgWithOneOwner()
    const secondOwnerId = await createUser({ staff: true })
    const secondMembershipId = await addMembership(
      organizationId,
      secondOwnerId,
      "owner",
    )

    await sql`UPDATE organization_membership SET role = 'admin' WHERE id = ${membershipId}`
    await expect(
      sql`DELETE FROM organization_membership WHERE id = ${secondMembershipId}`,
    ).rejects.toThrow(/cannot delete the last owner/)
  })

  it("does not block deleting the organization itself", async () => {
    const { organizationId } = await orgWithOneOwner()
    await sql`DELETE FROM organization WHERE id = ${organizationId}`
    const [row] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM organization_membership
       WHERE organization_id = ${organizationId}
    `
    expect(row!.count).toBe(0)
  })

  it("blocks deactivating the user who is an organization's sole owner", async () => {
    const { organizationId, ownerId } = await orgWithOneOwner()

    await expect(
      sql`UPDATE app_user SET disabled_at = now() WHERE id = ${ownerId}`,
    ).rejects.toThrow(/cannot deactivate the last owner/)

    const secondOwnerId = await createUser({ staff: true })
    await addMembership(organizationId, secondOwnerId, "owner")
    await sql`UPDATE app_user SET disabled_at = now() WHERE id = ${ownerId}`

    // The deactivated owner no longer counts, so the remaining one is now sole.
    await expect(
      sql`UPDATE app_user SET disabled_at = now() WHERE id = ${secondOwnerId}`,
    ).rejects.toThrow(/cannot deactivate the last owner/)
  })

  it("blocks clearing is_staff while the user holds an active owner membership", async () => {
    const { ownerId } = await orgWithOneOwner()
    await expect(
      sql`UPDATE app_user SET is_staff = false WHERE id = ${ownerId}`,
    ).rejects.toThrow(/cannot clear is_staff/)
  })
})

describe("user_setup_token", () => {
  /** What the app stores: sha256 hex of the raw link secret, never the secret. */
  const hash = (seed: string) => createHash("sha256").update(seed).digest("hex")

  async function issue(values: {
    purpose: BetaSetupTokenPurpose
    email?: string
    organizationId?: string | null
    grantedRole?: BetaOrgRole | null
    issuedBy?: string | null
    ttl?: string
    tokenHash?: string
  }): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO user_setup_token
        (purpose, token_hash, email, organization_id, granted_role, issued_by_user_id, expires_at)
      VALUES (
        ${values.purpose},
        ${values.tokenHash ?? hash(unique("f"))},
        ${values.email ?? `${unique("t")}@example.com`},
        ${values.organizationId ?? null},
        ${values.grantedRole ?? null},
        ${values.issuedBy ?? null},
        now() + ${values.ttl ?? "71 hours"}::interval
      )
      RETURNING id
    `
    return row!.id
  }

  it("rejects a token_hash that is not 64 lowercase hex characters", async () => {
    const { ownerId } = await orgWithOneOwner()
    await expect(
      issue({
        purpose: "password_reset",
        issuedBy: ownerId,
        tokenHash: "NOT-A-SHA256".padEnd(64, "z"),
      }),
    ).rejects.toThrow(/user_setup_token_hash_format|value too long/)
  })

  it("caps the TTL at 72 hours", async () => {
    const { ownerId } = await orgWithOneOwner()
    await expect(
      issue({ purpose: "password_reset", issuedBy: ownerId, ttl: "73 hours" }),
    ).rejects.toThrow(/user_setup_token_ttl_max_72h/)
    await expect(
      issue({ purpose: "password_reset", issuedBy: ownerId, ttl: "-1 hours" }),
    ).rejects.toThrow(/user_setup_token_ttl_max_72h/)
    await expect(
      issue({ purpose: "password_reset", issuedBy: ownerId, ttl: "72 hours" }),
    ).resolves.toBeTruthy()
  })

  it("pairs organization scope with a granted role, both ways", async () => {
    const { organizationId, ownerId } = await orgWithOneOwner()
    await expect(
      issue({
        purpose: "org_invite",
        organizationId,
        grantedRole: null,
        issuedBy: ownerId,
      }),
    ).rejects.toThrow(/user_setup_token_scope_pairing/)
    await expect(
      issue({
        purpose: "org_invite",
        organizationId: null,
        grantedRole: "member",
        issuedBy: ownerId,
      }),
    ).rejects.toThrow(/user_setup_token_scope_pairing/)
  })

  it("never lets a password reset be organization-scoped", async () => {
    const { organizationId, ownerId } = await orgWithOneOwner()
    await expect(
      issue({
        purpose: "password_reset",
        organizationId,
        grantedRole: "member",
        issuedBy: ownerId,
      }),
    ).rejects.toThrow(/user_setup_token_password_reset_unscoped/)
  })

  it("lets only office staff mint an owner grant or a password reset", async () => {
    const { organizationId, ownerId } = await orgWithOneOwner()
    const companyAdminId = await createUser({ staff: false })
    await addMembership(organizationId, companyAdminId, "admin")

    await expect(
      issue({
        purpose: "org_invite",
        organizationId,
        grantedRole: "owner",
        issuedBy: companyAdminId,
      }),
    ).rejects.toThrow(/only office staff may issue an owner grant/)

    await expect(
      issue({ purpose: "password_reset", issuedBy: companyAdminId }),
    ).rejects.toThrow(/only office staff may issue a password_reset link/)

    await expect(
      issue({
        purpose: "org_invite",
        organizationId,
        grantedRole: "owner",
        issuedBy: ownerId,
      }),
    ).resolves.toBeTruthy()
  })

  it("lets a company admin invite into their own organization but not another", async () => {
    const home = await orgWithOneOwner()
    const foreign = await orgWithOneOwner()
    const companyAdminId = await createUser({ staff: false })
    await addMembership(home.organizationId, companyAdminId, "admin")

    await expect(
      issue({
        purpose: "org_invite",
        organizationId: home.organizationId,
        grantedRole: "member",
        issuedBy: companyAdminId,
      }),
    ).resolves.toBeTruthy()

    await expect(
      issue({
        purpose: "org_invite",
        organizationId: foreign.organizationId,
        grantedRole: "member",
        issuedBy: companyAdminId,
      }),
    ).rejects.toThrow(/may not invite into organization/)
  })

  it("refuses an org-scoped invite with no issuer at all", async () => {
    const { organizationId } = await orgWithOneOwner()
    await expect(
      issue({
        purpose: "account_setup",
        organizationId,
        grantedRole: "member",
        issuedBy: null,
      }),
    ).rejects.toThrow(/may not invite into organization/)
  })

  it("lowercases the token email", async () => {
    const { ownerId } = await orgWithOneOwner()
    const local = unique("Invited.Person")
    const id = await issue({
      purpose: "password_reset",
      email: `${local}@Example.COM`,
      issuedBy: ownerId,
    })
    const [row] = await sql<{ email: string }[]>`
      SELECT email FROM user_setup_token WHERE id = ${id}
    `
    expect(row!.email).toBe(`${local.toLowerCase()}@example.com`)
  })

  it("consumes atomically — two concurrent claims, exactly one winner", async () => {
    const { ownerId } = await orgWithOneOwner()
    const tokenHash = hash(unique("c"))
    await issue({ purpose: "password_reset", issuedBy: ownerId, tokenHash })

    const claim = (client: postgres.Sql) => client`
      UPDATE user_setup_token
         SET consumed_at = now(), consumed_ip = '203.0.113.7'
       WHERE token_hash = ${tokenHash}
         AND consumed_at IS NULL
         AND revoked_at IS NULL
         AND expires_at > now()
      RETURNING id, purpose, email
    `

    const a = postgres(sharedDatabaseUrl(), { max: 1, onnotice: () => {} })
    const b = postgres(sharedDatabaseUrl(), { max: 1, onnotice: () => {} })
    try {
      const results = await Promise.all([claim(a), claim(b)])
      expect(results.map((r) => r.length).sort()).toEqual([0, 1])
    } finally {
      await a.end({ timeout: 5 })
      await b.end({ timeout: 5 })
    }

    // And a later claim of the same link finds nothing — the route must answer
    // consumed / expired / revoked / unknown with one uniform error.
    const replay = await claim(sql)
    expect(replay).toHaveLength(0)
  })

  it("revokes the live siblings of a consumed token", async () => {
    const { organizationId, ownerId } = await orgWithOneOwner()
    const email = `${unique("s")}@example.com`
    const winnerHash = hash(unique("w"))

    const winner = await issue({
      purpose: "org_invite",
      email,
      organizationId,
      grantedRole: "member",
      issuedBy: ownerId,
      tokenHash: winnerHash,
    })
    const sibling = await issue({
      purpose: "org_invite",
      email,
      organizationId,
      grantedRole: "member",
      issuedBy: ownerId,
    })
    // Different purpose + different org: neither is a sibling.
    const otherPurpose = await issue({
      purpose: "password_reset",
      email,
      issuedBy: ownerId,
    })

    await sql.begin(async (tx) => {
      const [claimed] = await tx<{ id: string }[]>`
        UPDATE user_setup_token SET consumed_at = now()
         WHERE token_hash = ${winnerHash}
           AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > now()
        RETURNING id
      `
      await tx`
        UPDATE user_setup_token SET revoked_at = now()
         WHERE purpose = 'org_invite'
           AND email = ${email}
           AND organization_id IS NOT DISTINCT FROM ${organizationId}
           AND id <> ${claimed!.id}
           AND consumed_at IS NULL AND revoked_at IS NULL
      `
    })

    const rows = await sql<{ id: string; revoked_at: Date | null }[]>`
      SELECT id, revoked_at FROM user_setup_token
       WHERE id IN (${winner}, ${sibling}, ${otherPurpose})
    `
    const byId = new Map(rows.map((r) => [r.id, r.revoked_at]))
    expect(byId.get(winner)).toBeNull()
    expect(byId.get(sibling)).not.toBeNull()
    expect(byId.get(otherPurpose)).toBeNull()
  })
})

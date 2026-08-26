/**
 * The setup-link consume, end to end against a real Postgres 18.
 *
 * This is the only door into the portal, so the suite is written around the
 * ways a door gets forced: a link used twice, two clicks racing, an expired or
 * revoked link, an older link for the same address, a link for a purpose the
 * caller did not expect, and an invite pointed at an address that already has
 * an account.
 */
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"

import { sharedDatabaseUrl, unique } from "../../tests/scratch-db"
import type { BetaOrgRole, BetaSetupTokenPurpose } from "@/db/schema"

// Must be set before `lib/auth/server` is evaluated, hence the dynamic imports
// below. DATABASE_URL arrives the same way, from tests/global-setup.ts.
process.env["BETTER_AUTH_SECRET"] ??= `beta-test-secret-${"x".repeat(40)}`
process.env["BETTER_AUTH_URL"] ??= "http://localhost:3200"

const {
  consumeSetupToken,
  generateSetupToken,
  hashSetupToken,
  peekSetupToken,
  setupUserPayload,
  SETUP_USER_ALLOWED_FIELDS,
  SETUP_USER_FORBIDDEN_FIELDS,
} = await import("./setup-token")
const { betaAuth } = await import("./server")

const sql = postgres(sharedDatabaseUrl(), { max: 6, onnotice: () => {} })

afterAll(async () => {
  await sql.end({ timeout: 5 })
})

const PASSWORD = "Beta-Heslo-2026!"
const NEW_PASSWORD = "Nove-Heslo-2026!"

async function createUser(staff: boolean, email?: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO app_user (email, is_staff)
    VALUES (${email ?? `${unique("u")}@example.com`}, ${staff})
    RETURNING id
  `
  return row!.id
}

/** An organization with the one active staff owner the schema requires. */
async function orgWithOwner(): Promise<{ orgId: string; staffId: string }> {
  const [org] = await sql<{ id: string }[]>`
    INSERT INTO organization (slug, legal_name)
    VALUES (${unique("org-")}, 'Testovací s.r.o.')
    RETURNING id
  `
  const staffId = await createUser(true)
  await sql`
    INSERT INTO organization_membership (organization_id, user_id, role)
    VALUES (${org!.id}, ${staffId}, 'owner')
  `
  return { orgId: org!.id, staffId }
}

type IssueOptions = {
  purpose: BetaSetupTokenPurpose
  email: string
  issuedBy: string
  organizationId?: string | null
  grantedRole?: BetaOrgRole | null
  /** Backdated pair used to build an already-expired link. */
  expired?: boolean
}

async function issue(
  options: IssueOptions,
): Promise<{ raw: string; id: string }> {
  const raw = generateSetupToken()
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO user_setup_token
      (purpose, token_hash, email, organization_id, granted_role,
       issued_by_user_id, created_at, expires_at)
    VALUES (
      ${options.purpose},
      ${hashSetupToken(raw)},
      ${options.email},
      ${options.organizationId ?? null},
      ${options.grantedRole ?? null},
      ${options.issuedBy},
      ${options.expired ? sql`now() - interval '80 hours'` : sql`now()`},
      ${options.expired ? sql`now() - interval '10 hours'` : sql`now() + interval '71 hours'`}
    )
    RETURNING id
  `
  return { raw, id: row!.id }
}

function consume(raw: string, overrides: Record<string, unknown> = {}) {
  return consumeSetupToken({
    rawToken: raw,
    password: PASSWORD,
    ip: "203.0.113.7",
    userAgent: "vitest",
    ...overrides,
  })
}

async function tokenRow(id: string) {
  const [row] = await sql<
    {
      consumed_at: Date | null
      consumed_ip: string | null
      consumed_user_agent: string | null
      consumed_user_id: string | null
      revoked_at: Date | null
    }[]
  >`
    SELECT consumed_at, consumed_ip, consumed_user_agent, consumed_user_id, revoked_at
      FROM user_setup_token WHERE id = ${id}
  `
  return row!
}

async function credentialHash(userId: string): Promise<string | null> {
  const [row] = await sql<{ password: string | null }[]>`
    SELECT password FROM auth_account
     WHERE user_id = ${userId} AND provider_id = 'credential'
  `
  return row?.password ?? null
}

describe("account_setup", () => {
  it("creates the account, its credential and the membership, and stamps the link", async () => {
    const { orgId, staffId } = await orgWithOwner()
    const email = `${unique("new")}@example.com`
    const { raw, id } = await issue({
      purpose: "account_setup",
      email,
      issuedBy: staffId,
      organizationId: orgId,
      grantedRole: "member",
    })

    const result = await consume(raw, { name: "Jan Novák" })
    expect(result).toMatchObject({ ok: true, email, passwordSet: true })

    const [user] = await sql<
      {
        id: string
        email: string
        name: string
        is_staff: boolean
        email_verified: boolean
        disabled_at: Date | null
      }[]
    >`
      SELECT id, email, name, is_staff, email_verified, disabled_at
        FROM app_user WHERE email = ${email}
    `
    expect(user!.name).toBe("Jan Novák")
    // SF-3: nothing privileged can ride in on the consume payload.
    expect(user!.is_staff).toBe(false)
    expect(user!.email_verified).toBe(false)
    expect(user!.disabled_at).toBeNull()

    const [membership] = await sql<{ role: string; active: boolean }[]>`
      SELECT role, active FROM organization_membership
       WHERE organization_id = ${orgId} AND user_id = ${user!.id}
    `
    expect(membership).toMatchObject({ role: "member", active: true })

    const token = await tokenRow(id)
    expect(token.consumed_at).not.toBeNull()
    expect(token.consumed_ip).toBe("203.0.113.7")
    expect(token.consumed_user_agent).toBe("vitest")
    expect(token.consumed_user_id).toBe(user!.id)
  })

  it("produces a credential Better Auth can actually sign in with", async () => {
    const { orgId, staffId } = await orgWithOwner()
    const email = `${unique("signin")}@example.com`
    const { raw } = await issue({
      purpose: "account_setup",
      email,
      issuedBy: staffId,
      organizationId: orgId,
      grantedRole: "guest",
    })
    await consume(raw)

    const session = await betaAuth().api.signInEmail({
      body: { email, password: PASSWORD },
    })
    expect(session.user.email).toBe(email)
  })

  it("takes the address from the link, never from the form", async () => {
    const { staffId } = await orgWithOwner()
    const email = `${unique("fixed")}@example.com`
    const { raw } = await issue({
      purpose: "account_setup",
      email,
      issuedBy: staffId,
    })
    // `name` is the only free-text field, and it cannot become an identity.
    await consume(raw, { name: "attacker@evil.example" })

    const [row] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM app_user WHERE email = 'attacker@evil.example'
    `
    expect(row!.count).toBe(0)
  })

  it("refuses a link for an address that already has a usable account", async () => {
    const { staffId } = await orgWithOwner()
    const email = `${unique("dup")}@example.com`
    const first = await issue({
      purpose: "account_setup",
      email,
      issuedBy: staffId,
    })
    await consume(first.raw)

    const second = await issue({
      purpose: "account_setup",
      email,
      issuedBy: staffId,
    })
    expect(await consume(second.raw)).toEqual({ ok: false, reason: "invalid" })
  })
})

describe("a spent link is spent", () => {
  it("refuses a second consume", async () => {
    const { staffId } = await orgWithOwner()
    const { raw } = await issue({
      purpose: "account_setup",
      email: `${unique("twice")}@example.com`,
      issuedBy: staffId,
    })
    expect((await consume(raw)).ok).toBe(true)
    expect(await consume(raw)).toEqual({ ok: false, reason: "invalid" })
  })

  it("lets exactly one of two concurrent consumes win", async () => {
    const { staffId } = await orgWithOwner()
    const { raw } = await issue({
      purpose: "account_setup",
      email: `${unique("race")}@example.com`,
      issuedBy: staffId,
    })

    const results = await Promise.all([consume(raw), consume(raw)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toHaveLength(1)
  })

  it("refuses an expired link", async () => {
    const { staffId } = await orgWithOwner()
    const { raw, id } = await issue({
      purpose: "account_setup",
      email: `${unique("old")}@example.com`,
      issuedBy: staffId,
      expired: true,
    })
    expect(await consume(raw)).toEqual({ ok: false, reason: "invalid" })
    // And a refused attempt must not look like a consume.
    expect((await tokenRow(id)).consumed_at).toBeNull()
  })

  it("refuses a revoked link", async () => {
    const { staffId } = await orgWithOwner()
    const { raw, id } = await issue({
      purpose: "account_setup",
      email: `${unique("rev")}@example.com`,
      issuedBy: staffId,
    })
    await sql`UPDATE user_setup_token SET revoked_at = now() WHERE id = ${id}`
    expect(await consume(raw)).toEqual({ ok: false, reason: "invalid" })
  })

  it("refuses an unknown token", async () => {
    expect(await consume(generateSetupToken())).toEqual({
      ok: false,
      reason: "invalid",
    })
  })
})

describe("sibling invalidation", () => {
  it("kills the other live links for the same purpose, address and organization", async () => {
    const { orgId, staffId } = await orgWithOwner()
    const email = `${unique("sib")}@example.com`

    const winner = await issue({
      purpose: "org_invite",
      email,
      issuedBy: staffId,
      organizationId: orgId,
      grantedRole: "member",
    })
    const sibling = await issue({
      purpose: "org_invite",
      email,
      issuedBy: staffId,
      organizationId: orgId,
      grantedRole: "guest",
    })
    // Different purpose: not a sibling, must survive.
    const reset = await issue({
      purpose: "password_reset",
      email,
      issuedBy: staffId,
    })

    expect((await consume(winner.raw)).ok).toBe(true)

    expect((await tokenRow(sibling.id)).revoked_at).not.toBeNull()
    expect((await tokenRow(reset.id)).revoked_at).toBeNull()
    // The winner is consumed, not revoked.
    expect((await tokenRow(winner.id)).revoked_at).toBeNull()
  })
})

describe("org_invite", () => {
  it("creates the account when the address is new", async () => {
    const { orgId, staffId } = await orgWithOwner()
    const email = `${unique("inv")}@example.com`
    const { raw } = await issue({
      purpose: "org_invite",
      email,
      issuedBy: staffId,
      organizationId: orgId,
      grantedRole: "admin",
    })

    expect((await consume(raw)).ok).toBe(true)
    const [membership] = await sql<{ role: string }[]>`
      SELECT m.role FROM organization_membership m
        JOIN app_user u ON u.id = m.user_id
       WHERE m.organization_id = ${orgId} AND u.email = ${email}
    `
    expect(membership!.role).toBe("admin")
  })

  it("will not set a password on an account that already exists", async () => {
    // Otherwise anyone holding an invite for a known address could take it
    // over (Advisor blocker B4-4).
    const { orgId, staffId } = await orgWithOwner()
    const email = `${unique("takeover")}@example.com`
    const setup = await issue({
      purpose: "account_setup",
      email,
      issuedBy: staffId,
    })
    await consume(setup.raw)
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM app_user WHERE email = ${email}
    `
    const before = await credentialHash(existing!.id)

    const invite = await issue({
      purpose: "org_invite",
      email,
      issuedBy: staffId,
      organizationId: orgId,
      grantedRole: "member",
    })
    const result = await consume(invite.raw, { password: NEW_PASSWORD })

    expect(result).toEqual({ ok: false, reason: "signin_required", email })
    expect(await credentialHash(existing!.id)).toBe(before)
    // The link survives: the invitee signs in and opens it again.
    expect((await tokenRow(invite.id)).consumed_at).toBeNull()
  })

  it("grants the membership once the invited account proves it is signed in", async () => {
    const { orgId, staffId } = await orgWithOwner()
    const email = `${unique("proved")}@example.com`
    const setup = await issue({
      purpose: "account_setup",
      email,
      issuedBy: staffId,
    })
    await consume(setup.raw)
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM app_user WHERE email = ${email}
    `
    const before = await credentialHash(existing!.id)

    const invite = await issue({
      purpose: "org_invite",
      email,
      issuedBy: staffId,
      organizationId: orgId,
      grantedRole: "member",
    })
    const result = await consume(invite.raw, {
      password: undefined,
      sessionUserId: existing!.id,
    })

    expect(result).toMatchObject({ ok: true, passwordSet: false })
    expect(await credentialHash(existing!.id)).toBe(before)
    const [membership] = await sql<{ role: string }[]>`
      SELECT role FROM organization_membership
       WHERE organization_id = ${orgId} AND user_id = ${existing!.id}
    `
    expect(membership!.role).toBe("member")
  })

  it("never demotes a live membership", async () => {
    // An admin may issue `guest` invites. Re-sending one to a colleague who
    // already holds a higher role must not be a demotion primitive.
    const { orgId, staffId } = await orgWithOwner()
    const email = `${unique("keep")}@example.com`
    const first = await issue({
      purpose: "org_invite",
      email,
      issuedBy: staffId,
      organizationId: orgId,
      grantedRole: "admin",
    })
    await consume(first.raw)
    const [user] = await sql<{ id: string }[]>`
      SELECT id FROM app_user WHERE email = ${email}
    `

    const second = await issue({
      purpose: "org_invite",
      email,
      issuedBy: staffId,
      organizationId: orgId,
      grantedRole: "guest",
    })
    await consume(second.raw, { sessionUserId: user!.id })

    const [membership] = await sql<{ role: string }[]>`
      SELECT role FROM organization_membership
       WHERE organization_id = ${orgId} AND user_id = ${user!.id}
    `
    expect(membership!.role).toBe("admin")
  })

  it("cannot mint an owner for an account that is not office staff", async () => {
    // The DB floor: `owner` requires `app_user.is_staff`, which a consume can
    // never set. A staff-issued owner invite for a brand-new address therefore
    // fails as a whole rather than half-creating anything.
    const { orgId, staffId } = await orgWithOwner()
    const email = `${unique("owner")}@example.com`
    const { raw } = await issue({
      purpose: "org_invite",
      email,
      issuedBy: staffId,
      organizationId: orgId,
      grantedRole: "owner",
    })

    expect(await consume(raw)).toEqual({ ok: false, reason: "invalid" })
    const [row] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM organization_membership m
        JOIN app_user u ON u.id = m.user_id
       WHERE m.organization_id = ${orgId} AND u.email = ${email}
    `
    expect(row!.count).toBe(0)
  })
})

describe("claiming an identity that already exists", () => {
  /**
   * The sharp edge of `account_setup` resumability.
   *
   * A credential-less `app_user` row is an identity nobody can sign in as — and
   * it may already be `is_staff`, provisioned through /admin and not yet
   * activated. Whoever sets its first password becomes it, with /admin and
   * cross-org reach. The migration guards do NOT close this: they stop a
   * non-staff issuer from granting `owner`, from issuing a `password_reset` and
   * from issuing an org-less `account_setup`, but a company admin may still
   * issue an ORG-SCOPED link for any address at all.
   */
  async function unactivatedStaffIdentity(): Promise<{
    email: string
    id: string
  }> {
    const email = `${unique("unactivated")}@example.com`
    const id = await createUser(true, email)
    return { email, id }
  }

  /** A Majitel: non-staff, but an active admin of their own organization. */
  async function companyAdmin(orgId: string): Promise<string> {
    const id = await createUser(false)
    await sql`
      INSERT INTO organization_membership (organization_id, user_id, role)
      VALUES (${orgId}, ${id}, 'admin')
    `
    return id
  }

  it("refuses a non-staff-issued account_setup aimed at an existing identity, and does not burn the link", async () => {
    const { orgId } = await orgWithOwner()
    const adminId = await companyAdmin(orgId)
    const target = await unactivatedStaffIdentity()

    const { raw, id } = await issue({
      purpose: "account_setup",
      email: target.email,
      issuedBy: adminId,
      organizationId: orgId,
      grantedRole: "member",
    })

    expect(await consume(raw)).toEqual({ ok: false, reason: "invalid" })

    // No credential was minted for the staff identity...
    expect(await credentialHash(target.id)).toBeNull()
    // ...it gained no membership in the admin's organization...
    const [membership] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM organization_membership
       WHERE organization_id = ${orgId} AND user_id = ${target.id}
    `
    expect(membership!.count).toBe(0)
    // ...it is still office staff, and still cannot be signed in as...
    const [row] = await sql<{ is_staff: boolean }[]>`
      SELECT is_staff FROM app_user WHERE id = ${target.id}
    `
    expect(row!.is_staff).toBe(true)
    // ...and a refused attempt does not spend the link.
    expect((await tokenRow(id)).consumed_at).toBeNull()
  })

  it("still lets an office-staff issuer finish an interrupted setup", async () => {
    // The resumable case the refusal above must not take away: the identity
    // exists with no credential because an earlier consume died mid-flight.
    const { orgId, staffId } = await orgWithOwner()
    const target = await unactivatedStaffIdentity()

    const { raw } = await issue({
      purpose: "account_setup",
      email: target.email,
      issuedBy: staffId,
      organizationId: orgId,
      grantedRole: "member",
    })

    expect(await consume(raw)).toMatchObject({ ok: true, passwordSet: true })
    expect(await credentialHash(target.id)).not.toBeNull()
    const session = await betaAuth().api.signInEmail({
      body: { email: target.email, password: PASSWORD },
    })
    expect(session.user.id).toBe(target.id)
  })

  it("refuses an org_invite aimed at an existing credential-less identity", async () => {
    // Same attack through the other purpose: an invite must never mint the
    // first credential for an identity, so this needs a session it can never
    // have (a credential-less identity cannot sign in).
    const { orgId } = await orgWithOwner()
    const adminId = await companyAdmin(orgId)
    const target = await unactivatedStaffIdentity()

    const { raw, id } = await issue({
      purpose: "org_invite",
      email: target.email,
      issuedBy: adminId,
      organizationId: orgId,
      grantedRole: "member",
    })

    expect(await consume(raw)).toEqual({
      ok: false,
      reason: "signin_required",
      email: target.email,
    })
    expect(await credentialHash(target.id)).toBeNull()
    expect((await tokenRow(id)).consumed_at).toBeNull()
  })
})

describe("password_reset", () => {
  it("replaces the password and drops every existing session", async () => {
    const { staffId } = await orgWithOwner()
    const email = `${unique("reset")}@example.com`
    const setup = await issue({
      purpose: "account_setup",
      email,
      issuedBy: staffId,
    })
    await consume(setup.raw)
    const [user] = await sql<{ id: string }[]>`
      SELECT id FROM app_user WHERE email = ${email}
    `

    await betaAuth().api.signInEmail({ body: { email, password: PASSWORD } })
    const [before] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM auth_session WHERE user_id = ${user!.id}
    `
    expect(before!.count).toBeGreaterThan(0)

    const reset = await issue({
      purpose: "password_reset",
      email,
      issuedBy: staffId,
    })
    expect((await consume(reset.raw, { password: NEW_PASSWORD })).ok).toBe(true)

    const [after] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM auth_session WHERE user_id = ${user!.id}
    `
    expect(after!.count).toBe(0)

    await expect(
      betaAuth().api.signInEmail({ body: { email, password: PASSWORD } }),
    ).rejects.toThrow()
    const session = await betaAuth().api.signInEmail({
      body: { email, password: NEW_PASSWORD },
    })
    expect(session.user.email).toBe(email)
  })

  it("refuses a reset for an address with no account", async () => {
    const { staffId } = await orgWithOwner()
    const { raw } = await issue({
      purpose: "password_reset",
      email: `${unique("ghost")}@example.com`,
      issuedBy: staffId,
    })
    expect(await consume(raw, { password: NEW_PASSWORD })).toEqual({
      ok: false,
      reason: "invalid",
    })
  })
})

describe("deactivated accounts", () => {
  it("cannot be re-opened by any link", async () => {
    const { staffId } = await orgWithOwner()
    const email = `${unique("off")}@example.com`
    const setup = await issue({
      purpose: "account_setup",
      email,
      issuedBy: staffId,
    })
    await consume(setup.raw)
    await sql`UPDATE app_user SET disabled_at = now() WHERE email = ${email}`

    const reset = await issue({
      purpose: "password_reset",
      email,
      issuedBy: staffId,
    })
    expect(await consume(reset.raw, { password: NEW_PASSWORD })).toEqual({
      ok: false,
      reason: "invalid",
    })
  })
})

describe("peek (what a GET renders)", () => {
  it("reads a live link without consuming it", async () => {
    const { orgId, staffId } = await orgWithOwner()
    const email = `${unique("peek")}@example.com`
    const { raw, id } = await issue({
      purpose: "org_invite",
      email,
      issuedBy: staffId,
      organizationId: orgId,
      grantedRole: "member",
    })

    const view = await peekSetupToken(raw)
    expect(view).toMatchObject({
      purpose: "org_invite",
      email,
      organizationName: "Testovací s.r.o.",
    })
    // The route branches on `purpose`, which is how /setup rejects a reset link
    // and /reset rejects an invite — without either of them burning it.
    expect((await tokenRow(id)).consumed_at).toBeNull()
  })

  it("returns nothing for consumed, expired, revoked and unknown alike", async () => {
    const { staffId } = await orgWithOwner()
    const email = `${unique("gone")}@example.com`

    const expired = await issue({
      purpose: "account_setup",
      email,
      issuedBy: staffId,
      expired: true,
    })
    expect(await peekSetupToken(expired.raw)).toBeNull()

    const revoked = await issue({
      purpose: "account_setup",
      email,
      issuedBy: staffId,
    })
    await sql`UPDATE user_setup_token SET revoked_at = now() WHERE id = ${revoked.id}`
    expect(await peekSetupToken(revoked.raw)).toBeNull()

    expect(await peekSetupToken(generateSetupToken())).toBeNull()
  })
})

describe("SF-3 — the app_user write allowlist", () => {
  it("builds the payload by explicit pick, not by spread", () => {
    const hostile = {
      email: "person@example.com",
      name: "Jan",
      is_staff: true,
      disabled_at: null,
      email_verified: true,
    }
    expect(setupUserPayload(hostile)).toEqual({
      email: "person@example.com",
      name: "Jan",
    })
  })

  it("never allows a privileged column", () => {
    for (const field of SETUP_USER_FORBIDDEN_FIELDS) {
      expect(SETUP_USER_ALLOWED_FIELDS).not.toContain(field)
    }
    expect(SETUP_USER_ALLOWED_FIELDS).toEqual(["email", "name"])
  })

  it("stores only the sha256 of a link, never the link", async () => {
    const { staffId } = await orgWithOwner()
    const raw = generateSetupToken()
    const [row] = await sql<{ token_hash: string }[]>`
      INSERT INTO user_setup_token
        (purpose, token_hash, email, issued_by_user_id, expires_at)
      VALUES ('password_reset', ${hashSetupToken(raw)},
              ${`${unique("hash")}@example.com`}, ${staffId},
              now() + interval '71 hours')
      RETURNING token_hash
    `
    expect(row!.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row!.token_hash).not.toContain(raw)
  })
})

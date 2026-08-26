/**
 * Migration 0001 — the two Advisor carry-ins from the PR 05 gate.
 *
 * SF-2: an issued setup link is an immutable grant, and a spent one stays
 * spent. The issuance checks in 0000 are BEFORE INSERT only, so without this an
 * UPDATE could turn a used guest invite into a fresh owner grant.
 *
 * SF-5: minting an account_setup link with no organization is an office-staff
 * act — that shape creates a portal identity no organization owner can see.
 */
import { createHash } from "node:crypto"
import postgres from "postgres"
import { afterAll, describe, expect, it } from "vitest"

import { sharedDatabaseUrl, unique } from "../tests/scratch-db"
import type { BetaOrgRole, BetaSetupTokenPurpose } from "./schema"

const sql = postgres(sharedDatabaseUrl(), { max: 4, onnotice: () => {} })

afterAll(async () => {
  await sql.end({ timeout: 5 })
})

const hash = (seed: string) => createHash("sha256").update(seed).digest("hex")

async function createUser(staff: boolean): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO app_user (email, is_staff)
    VALUES (${`${unique("g")}@example.com`}, ${staff})
    RETURNING id
  `
  return row!.id
}

async function createOrganization(): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO organization (slug, legal_name)
    VALUES (${unique("org-")}, 'Testovací s.r.o.')
    RETURNING id
  `
  return row!.id
}

async function issue(values: {
  purpose: BetaSetupTokenPurpose
  email?: string
  organizationId?: string | null
  grantedRole?: BetaOrgRole | null
  issuedBy?: string | null
  tokenHash?: string
}): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO user_setup_token
      (purpose, token_hash, email, organization_id, granted_role, issued_by_user_id, expires_at)
    VALUES (
      ${values.purpose},
      ${values.tokenHash ?? hash(unique("h"))},
      ${values.email ?? `${unique("t")}@example.com`},
      ${values.organizationId ?? null},
      ${values.grantedRole ?? null},
      ${values.issuedBy ?? null},
      now() + interval '71 hours'
    )
    RETURNING id
  `
  return row!.id
}

/** A staff-issued, org-scoped invite: the shape most fields can be tested on. */
async function issuedInvite(): Promise<{ id: string; organizationId: string }> {
  const staffId = await createUser(true)
  const organizationId = await createOrganization()
  await sql`
    INSERT INTO organization_membership (organization_id, user_id, role)
    VALUES (${organizationId}, ${staffId}, 'owner')
  `
  const id = await issue({
    purpose: "org_invite",
    organizationId,
    grantedRole: "member",
    issuedBy: staffId,
  })
  return { id, organizationId }
}

describe("SF-2 — an issued grant is immutable", () => {
  it.each([
    ["purpose", "purpose = 'password_reset'"],
    ["token_hash", `token_hash = '${hash("rewritten")}'`],
    ["email", "email = 'someone.else@example.com'"],
    ["organization_id", "organization_id = NULL, granted_role = NULL"],
    ["granted_role", "granted_role = 'owner'"],
    ["expires_at", "expires_at = now() + interval '71 hours'"],
    ["issued_by_user_id", "issued_by_user_id = NULL"],
    ["issued_ip", "issued_ip = '203.0.113.9'"],
    ["issued_user_agent", "issued_user_agent = 'rewritten'"],
    ["created_at", "created_at = now() - interval '1 hour'"],
  ])("refuses to rewrite %s", async (_field, assignment) => {
    const { id } = await issuedInvite()
    await expect(
      sql.unsafe(`UPDATE user_setup_token SET ${assignment} WHERE id = $1`, [
        id,
      ]),
    ).rejects.toThrow(/immutable grant/)
  })

  it("lets the consume stamp be written exactly once", async () => {
    const { id } = await issuedInvite()
    const consumerId = await createUser(false)

    await sql`
      UPDATE user_setup_token
         SET consumed_at = now(), consumed_ip = '203.0.113.7', consumed_user_agent = 'ua'
       WHERE id = ${id}
    `
    // The consumer id is filled in after the account it created exists — the
    // second write of the same transaction, and a legal NULL -> value move.
    await sql`
      UPDATE user_setup_token SET consumed_user_id = ${consumerId} WHERE id = ${id}
    `

    const [row] = await sql<{ consumed_user_id: string }[]>`
      SELECT consumed_user_id FROM user_setup_token WHERE id = ${id}
    `
    expect(row!.consumed_user_id).toBe(consumerId)
  })

  it("refuses to un-consume a spent link (the replay attempt)", async () => {
    const { id } = await issuedInvite()
    await sql`UPDATE user_setup_token SET consumed_at = now() WHERE id = ${id}`

    await expect(
      sql`UPDATE user_setup_token SET consumed_at = NULL WHERE id = ${id}`,
    ).rejects.toThrow(/consumed_at is write-once/)

    await expect(
      sql`UPDATE user_setup_token SET consumed_at = now() + interval '1 second' WHERE id = ${id}`,
    ).rejects.toThrow(/consumed_at is write-once/)
  })

  it("refuses to repoint a consumed link at a second consumer", async () => {
    const { id } = await issuedInvite()
    const first = await createUser(false)
    const second = await createUser(false)
    await sql`
      UPDATE user_setup_token
         SET consumed_at = now(), consumed_ip = '203.0.113.7',
             consumed_user_agent = 'ua', consumed_user_id = ${first}
       WHERE id = ${id}
    `

    await expect(
      sql`UPDATE user_setup_token SET consumed_user_id = ${second} WHERE id = ${id}`,
    ).rejects.toThrow(/consumed_user_id is write-once/)
    await expect(
      sql`UPDATE user_setup_token SET consumed_ip = '198.51.100.4' WHERE id = ${id}`,
    ).rejects.toThrow(/consumed_ip is write-once/)
    await expect(
      sql`UPDATE user_setup_token SET consumed_user_agent = 'other' WHERE id = ${id}`,
    ).rejects.toThrow(/consumed_user_agent is write-once/)
  })

  it("refuses to un-revoke a revoked link", async () => {
    const { id } = await issuedInvite()
    await sql`UPDATE user_setup_token SET revoked_at = now() WHERE id = ${id}`
    await expect(
      sql`UPDATE user_setup_token SET revoked_at = NULL WHERE id = ${id}`,
    ).rejects.toThrow(/revoked_at is write-once/)
  })

  it("still allows revoking a live sibling", async () => {
    const { id } = await issuedInvite()
    await sql`UPDATE user_setup_token SET revoked_at = now() WHERE id = ${id}`
    const [row] = await sql<{ revoked_at: Date }[]>`
      SELECT revoked_at FROM user_setup_token WHERE id = ${id}
    `
    expect(row!.revoked_at).not.toBeNull()
  })
})

describe("SF-5 — an org-less account_setup link is an office act", () => {
  it("refuses a non-staff issuer", async () => {
    const companyUserId = await createUser(false)
    await expect(
      issue({
        purpose: "account_setup",
        organizationId: null,
        issuedBy: companyUserId,
      }),
    ).rejects.toThrow(/account_setup link with no organization/)
  })

  it("allows office staff", async () => {
    const staffId = await createUser(true)
    await expect(
      issue({
        purpose: "account_setup",
        organizationId: null,
        issuedBy: staffId,
      }),
    ).resolves.toBeTruthy()
  })

  it("keeps the NULL-issuer bootstrap seed open", async () => {
    // The very first office account is minted before any user exists to issue
    // it. Closing this would make the database unbootstrappable.
    await expect(
      issue({
        purpose: "account_setup",
        organizationId: null,
        issuedBy: null,
      }),
    ).resolves.toBeTruthy()
  })
})

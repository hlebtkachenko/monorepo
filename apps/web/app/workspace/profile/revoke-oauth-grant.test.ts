/**
 * Integration test for the OAuth-grant revoke performed by
 * `revokeOwnOAuthGrantAction` (actions.ts).
 *
 * The server action reads the user id from the session (not testable without a
 * live session), so — following the repo convention (resolve-membership.test.ts)
 * — this replicates the exact DB effect the action runs and pins the
 * security-critical invariant: the revoke is scoped to the acting user, so one
 * user can never disconnect another user's application.
 *
 * The effect under test:
 *   1. every non-revoked refresh token for (user, client) gets `revoked = now()`
 *   2. the consent row is deleted
 *   both predicated on `user_id = <acting user>`.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { and, eq, isNull } from "drizzle-orm"
import postgres from "postgres"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"

let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]
let withAdminBypass: (typeof import("@workspace/db"))["withAdminBypass"]
let oauth_consent: (typeof import("@workspace/db/schema"))["oauth_consent"]
let oauth_refresh_token: (typeof import("@workspace/db/schema"))["oauth_refresh_token"]
let sql: postgres.Sql

/** Mirror of the action's revoke effect, scoped to `userId`. Returns rows hit. */
async function revokeGrant(input: { userId: string; consentId: string }) {
  return withAdminBypass(async (db) => {
    const consent = (
      await db
        .select({ clientId: oauth_consent.clientId })
        .from(oauth_consent)
        .where(
          and(
            eq(oauth_consent.id, input.consentId),
            eq(oauth_consent.userId, input.userId),
          ),
        )
        .limit(1)
    )[0]
    if (!consent) return { found: false as const }

    await db
      .update(oauth_refresh_token)
      .set({ revoked: new Date() })
      .where(
        and(
          eq(oauth_refresh_token.userId, input.userId),
          eq(oauth_refresh_token.clientId, consent.clientId),
          isNull(oauth_refresh_token.revoked),
        ),
      )
    await db
      .delete(oauth_consent)
      .where(
        and(
          eq(oauth_consent.id, input.consentId),
          eq(oauth_consent.userId, input.userId),
        ),
      )
    return { found: true as const }
  })
}

beforeAll(async () => {
  ;({ adminClient, truncateAll } = await import("@workspace/db/tests/fixtures"))
  ;({ withAdminBypass } = await import("@workspace/db"))
  ;({ oauth_consent, oauth_refresh_token } =
    await import("@workspace/db/schema"))
  sql = adminClient()
  await truncateAll(sql)
}, 30_000)

afterAll(async () => {
  await truncateAll(sql)
  await sql.end({ timeout: 5 })
})

beforeEach(async () => {
  await truncateAll(sql)
})

async function seedUser(email: string): Promise<string> {
  const [row] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${email}, 'Grant Test', 'user')
    RETURNING id
  `
  if (!row) throw new Error("user insert failed")
  return row.id
}

/** One authorized app (client + consent + one live refresh token) for a user. */
async function seedGrant(userId: string): Promise<{
  consentId: string
  clientId: string
  refreshId: string
}> {
  const clientId = `client-${userId.slice(0, 8)}-${Math.round(
    performance.now() * 1000,
  )}`
  await sql`
    INSERT INTO oauth_client (id, client_id, name, redirect_uris)
    VALUES (gen_random_uuid(), ${clientId}, 'Claude Code (afframe-mcp)', ARRAY['https://mcp.afframe.com/'])
  `
  const [consent] = await sql<Array<{ id: string }>>`
    INSERT INTO oauth_consent (id, client_id, user_id, reference_id, scopes)
    VALUES (gen_random_uuid(), ${clientId}, ${userId}, NULL, ARRAY['accounting:read'])
    RETURNING id
  `
  const [refresh] = await sql<Array<{ id: string }>>`
    INSERT INTO oauth_refresh_token (id, token, client_id, user_id, scopes)
    VALUES (gen_random_uuid(), ${`tok-${clientId}`}, ${clientId}, ${userId}, ARRAY['accounting:read'])
    RETURNING id
  `
  if (!consent || !refresh) throw new Error("grant insert failed")
  return { consentId: consent.id, clientId, refreshId: refresh.id }
}

async function consentExists(id: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM oauth_consent WHERE id = ${id} LIMIT 1`
  return rows.length > 0
}

async function refreshRevoked(id: string): Promise<boolean> {
  const rows = await sql<Array<{ revoked: Date | null }>>`
    SELECT revoked FROM oauth_refresh_token WHERE id = ${id} LIMIT 1
  `
  return rows[0]?.revoked != null
}

describe("revokeOwnOAuthGrantAction (DB effect + ownership boundary)", () => {
  it("revokes the owner's refresh token and deletes the consent", async () => {
    const user = await seedUser(`owner-${Date.now()}@grant-test.invalid`)
    const grant = await seedGrant(user)

    const result = await revokeGrant({
      userId: user,
      consentId: grant.consentId,
    })

    expect(result.found).toBe(true)
    expect(await consentExists(grant.consentId)).toBe(false)
    expect(await refreshRevoked(grant.refreshId)).toBe(true)
  })

  it("cannot disconnect another user's application (scoped to the acting user)", async () => {
    const attacker = await seedUser(`attacker-${Date.now()}@grant-test.invalid`)
    const victim = await seedUser(`victim-${Date.now()}@grant-test.invalid`)
    const victimGrant = await seedGrant(victim)

    // Attacker passes the victim's consent id but acts as themselves.
    const result = await revokeGrant({
      userId: attacker,
      consentId: victimGrant.consentId,
    })

    expect(result.found).toBe(false)
    expect(await consentExists(victimGrant.consentId)).toBe(true)
    expect(await refreshRevoked(victimGrant.refreshId)).toBe(false)
  })

  it("leaves other users' grants untouched when revoking your own", async () => {
    const a = await seedUser(`a-${Date.now()}@grant-test.invalid`)
    const b = await seedUser(`b-${Date.now()}@grant-test.invalid`)
    const grantA = await seedGrant(a)
    const grantB = await seedGrant(b)

    await revokeGrant({ userId: a, consentId: grantA.consentId })

    expect(await consentExists(grantA.consentId)).toBe(false)
    expect(await refreshRevoked(grantA.refreshId)).toBe(true)
    // B's grant is fully intact.
    expect(await consentExists(grantB.consentId)).toBe(true)
    expect(await refreshRevoked(grantB.refreshId)).toBe(false)
  })
})

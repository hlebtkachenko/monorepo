/**
 * Integration tests for materializeInvite.
 *
 * AFF-119 / E7b (rewritten for ADR-0022 — invite state lives on
 * auth_token, kind='inv', not the dropped auth_invite table).
 *
 * Tests run against the live Postgres 18 testcontainer booted by
 * apps/web/tests/global-setup.ts. All imports of db/auth modules are
 * dynamic (after env vars are set by globalSetup).
 *
 * The "server-only" import in materialize-invite.ts is neutralized by
 * the `server-only -> empty.js` alias in vitest.config.ts.
 *
 * Covered behaviors:
 *   - successful invite redemption: workspace_membership +
 *     organization_membership are materialized; org slug is returned;
 *     the auth_token row flips to status='consumed'
 *   - idempotent workspace_membership: a second accept for the same
 *     workspace reuses the existing membership row rather than inserting
 *     a duplicate
 *   - conflict (already-consumed): second call throws invite-not-found
 *     because consumeToken only updates status='pending' rows
 *   - expiry: an expired token cannot be consumed; throws invite-not-found
 *   - unknown token: throws invite-not-found
 *   - email-mismatch defense: a different user's ID cannot steal the invite
 *   - workspace cross-check (F7): a tampered invite whose workspace_id does
 *     not match the organization's workspace_id throws organization-not-found
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import postgres from "postgres"

// DATABASE_URL is set by globalSetup before this module is evaluated.
// BETTER_AUTH_SECRET must be present before the auth singleton is constructed.
process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"
process.env["AUTH_TOKEN_ENV"] = process.env["AUTH_TOKEN_ENV"] ?? "dev"

let sql: postgres.Sql

// Dynamically imported after env is set by globalSetup
let materializeInvite: (typeof import("./materialize-invite"))["materializeInvite"]
let InviteAcceptError: (typeof import("./materialize-invite"))["InviteAcceptError"]
let mintToken: (typeof import("@workspace/auth/tokens"))["mintToken"]
let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]

beforeAll(async () => {
  ;({ adminClient, truncateAll } = await import("@workspace/db/tests/fixtures"))
  ;({ mintToken } = await import("@workspace/auth/tokens"))
  ;({ materializeInvite, InviteAcceptError } =
    await import("./materialize-invite"))

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Seed the minimal graph for a materializable invite:
 *   - owning workspace + owner membership
 *   - one organization under that workspace
 *   - a pending auth_token row (kind='inv') with payload
 *   - the invitee app_user row
 *
 * Returns everything the test needs to call materializeInvite.
 */
async function seedInviteScenario(opts?: {
  inviteeEmail?: string
  ttlSeconds?: number
  role?: "owner" | "admin" | "member" | "agent" | "guest"
}) {
  const ownerEmail = `owner-${Date.now()}@invite-test.invalid`
  const inviteeEmail =
    opts?.inviteeEmail ?? `invitee-${Date.now()}@invite-test.invalid`
  const role = opts?.role ?? "member"
  const ttlSeconds = opts?.ttlSeconds ?? 60 * 60

  // Owner
  const [owner] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${ownerEmail}, 'Owner', 'user')
    RETURNING id
  `
  if (!owner) throw new Error("owner insert failed")

  // Workspace
  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Test Workspace', ${owner.id}::uuid)
    RETURNING id
  `
  if (!ws) throw new Error("workspace insert failed")
  const workspaceId = ws.id

  // Owner membership (requires app_admin role due to last-owner-demotion trigger)
  await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE app_admin`)
    await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
    await tx.unsafe(
      `INSERT INTO workspace_membership (workspace_id, user_id, role)
       VALUES ('${workspaceId}'::uuid, '${owner.id}'::uuid, 'owner')`,
    )
  })

  // Organization
  const [org] = await sql<Array<{ id: string; slug: string }>>`
    INSERT INTO organization (
      organization_id, workspace_id, slug, legal_name,
      person_kind, legal_subject_kind
    )
    VALUES (uuidv7(), ${workspaceId}::uuid, 'test-org', 'Test Org',
            'legal_entity', 'for_profit')
    RETURNING id, slug
  `
  if (!org) throw new Error("org insert failed")
  await sql`UPDATE organization SET organization_id = id WHERE id = ${org.id}::uuid`

  // Invitee app_user
  const [invitee] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${inviteeEmail}, 'Invitee', 'user')
    RETURNING id
  `
  if (!invitee) throw new Error("invitee insert failed")

  // Pending invite as an auth_token row.
  const minted = await mintToken({
    kind: "inv",
    payload: {
      email: inviteeEmail,
      organizationId: org.id,
      workspaceId,
      role,
    },
    ttlSeconds,
  })

  return {
    workspaceId,
    orgId: org.id,
    orgSlug: org.slug,
    ownerId: owner.id,
    inviteeId: invitee.id,
    inviteeEmail,
    rawToken: minted.rawToken,
    tokenId: minted.id,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("materializeInvite", () => {
  it("materializes workspace_membership + organization_membership on success", async () => {
    const seed = await seedInviteScenario()

    const orgSlug = await materializeInvite({
      userId: seed.inviteeId,
      inviteRawToken: seed.rawToken,
    })

    // Returns the org slug for redirect.
    expect(orgSlug).toBe(seed.orgSlug)

    // auth_token row flipped to 'consumed'.
    const [tokenRow] = await sql<Array<{ status: string }>>`
      SELECT status FROM auth_token WHERE id = ${seed.tokenId}::uuid
    `
    expect(tokenRow!.status).toBe("consumed")

    // workspace_membership created.
    const wsMemberships = await sql<Array<{ role: string; active: boolean }>>`
      SELECT role, active FROM workspace_membership
      WHERE workspace_id = ${seed.workspaceId}::uuid
        AND user_id = ${seed.inviteeId}::uuid
    `
    expect(wsMemberships).toHaveLength(1)
    expect(wsMemberships[0]!.role).toBe("member")
    expect(wsMemberships[0]!.active).toBe(true)

    // organization_membership created.
    const orgMemberships = await sql<Array<{ role: string; active: boolean }>>`
      SELECT role, active FROM organization_membership
      WHERE organization_id = ${seed.orgId}::uuid
        AND user_id = ${seed.inviteeId}::uuid
    `
    expect(orgMemberships).toHaveLength(1)
    expect(orgMemberships[0]!.role).toBe("member")
    expect(orgMemberships[0]!.active).toBe(true)
  }, 30_000)

  it("reuses existing workspace_membership when the invitee already belongs to the workspace", async () => {
    const seed = await seedInviteScenario()

    // Pre-create a workspace_membership for the invitee (simulates a
    // second org invite in the same workspace).
    const existingWsM = await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE app_admin`)
      await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
      const rows = (await tx.unsafe(
        `INSERT INTO workspace_membership (workspace_id, user_id, role)
         VALUES ('${seed.workspaceId}'::uuid, '${seed.inviteeId}'::uuid, 'member')
         RETURNING id`,
      )) as unknown as Array<{ id: string }>
      return rows[0]!
    })

    await materializeInvite({
      userId: seed.inviteeId,
      inviteRawToken: seed.rawToken,
    })

    // Still exactly one workspace_membership — no duplicate inserted.
    const wsMemberships = await sql<Array<{ id: string }>>`
      SELECT id FROM workspace_membership
      WHERE workspace_id = ${seed.workspaceId}::uuid
        AND user_id = ${seed.inviteeId}::uuid
        AND active = true
    `
    expect(wsMemberships).toHaveLength(1)
    expect(wsMemberships[0]!.id).toBe(existingWsM.id)
  }, 30_000)

  it("throws invite-not-found on a second redemption attempt", async () => {
    const seed = await seedInviteScenario()

    // First redemption succeeds.
    await materializeInvite({
      userId: seed.inviteeId,
      inviteRawToken: seed.rawToken,
    })

    // Second attempt must throw — consumeToken sees status='consumed'
    // and returns null. We surface the generic invite-not-found.
    await expect(
      materializeInvite({
        userId: seed.inviteeId,
        inviteRawToken: seed.rawToken,
      }),
    ).rejects.toSatisfy(
      (err) =>
        err instanceof InviteAcceptError && err.code === "invite-not-found",
    )
  }, 30_000)

  it("throws invite-not-found when expires_at is in the past", async () => {
    const seed = await seedInviteScenario()

    // Backdate expires_at so consumeToken's `expires_at > now()` predicate
    // refuses the row. Bypass append-only trigger (refuses past expires_at)
    // via session_replication_role=replica.
    await sql.unsafe(`
      SET LOCAL session_replication_role = replica;
      UPDATE auth_token
      SET expires_at = now() - interval '1 second'
      WHERE id = '${seed.tokenId}';
    `)

    await expect(
      materializeInvite({
        userId: seed.inviteeId,
        inviteRawToken: seed.rawToken,
      }),
    ).rejects.toSatisfy(
      (err) =>
        err instanceof InviteAcceptError && err.code === "invite-not-found",
    )

    // Token row must NOT have flipped to 'consumed' — the WHERE clause
    // refused it. The expired row stays 'pending' (the cleanup worker
    // would flip it to 'expired' later).
    const [tokenRow] = await sql<Array<{ status: string }>>`
      SELECT status FROM auth_token WHERE id = ${seed.tokenId}::uuid
    `
    expect(tokenRow!.status).toBe("pending")
  }, 30_000)

  it("throws invite-not-found for a completely unknown token", async () => {
    const [user] = await sql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('nobody@invite-test.invalid', 'Nobody', 'user')
      RETURNING id
    `
    // Mint a token but discard the seed graph — it points at no real
    // org/workspace.
    const orphan = await mintToken({
      kind: "inv",
      payload: {
        email: "ghost@invite-test.invalid",
        organizationId: "00000000-0000-0000-0000-000000000000",
        workspaceId: "00000000-0000-0000-0000-000000000000",
        role: "member",
      },
      ttlSeconds: 60,
    })
    // Revoke it so consumeToken returns null.
    await sql`UPDATE auth_token SET status = 'revoked' WHERE id = ${orphan.id}::uuid`

    await expect(
      materializeInvite({
        userId: user!.id,
        inviteRawToken: orphan.rawToken,
      }),
    ).rejects.toSatisfy(
      (err) =>
        err instanceof InviteAcceptError && err.code === "invite-not-found",
    )
  }, 30_000)

  it("email-mismatch defense: a different user cannot redeem the invite", async () => {
    const seed = await seedInviteScenario({
      inviteeEmail: "correct@invite-test.invalid",
    })

    // Attacker's email differs from the invite recipient email.
    const [attacker] = await sql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('attacker@invite-test.invalid', 'Attacker', 'user')
      RETURNING id
    `

    await expect(
      materializeInvite({
        userId: attacker!.id,
        inviteRawToken: seed.rawToken,
      }),
    ).rejects.toSatisfy(
      (err) =>
        err instanceof InviteAcceptError && err.code === "invite-not-found",
    )

    // The auth_token row has already flipped to 'consumed' (consumeToken
    // ran before the email check). That is the documented trade-off: an
    // attacker burning their own access to a known token does not help
    // them — they still can't materialize memberships because the
    // post-consume defence-in-depth blocks the write. No memberships
    // exist.
    const wsMemberships = await sql<Array<{ id: string }>>`
      SELECT id FROM workspace_membership
      WHERE workspace_id = ${seed.workspaceId}::uuid
        AND user_id = ${attacker!.id}::uuid
    `
    expect(wsMemberships).toHaveLength(0)

    const orgMemberships = await sql<Array<{ id: string }>>`
      SELECT id FROM organization_membership
      WHERE organization_id = ${seed.orgId}::uuid
        AND user_id = ${attacker!.id}::uuid
    `
    expect(orgMemberships).toHaveLength(0)
  }, 30_000)

  it("workspace cross-check (F7): mismatched workspace_id throws organization-not-found", async () => {
    const seed = await seedInviteScenario()

    // Create a second unrelated workspace.
    const [extraOwner] = await sql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('extra-owner@invite-test.invalid', 'Extra Owner', 'user')
      RETURNING id
    `
    const [anotherWs] = await sql<Array<{ id: string }>>`
      INSERT INTO workspace (display_name, created_by_user_id)
      VALUES ('Another Workspace', ${extraOwner!.id}::uuid)
      RETURNING id
    `

    // Tamper the invite payload: workspaceId now points to the unrelated
    // workspace while the organization still belongs to the original
    // workspace_id. Bypass append-only trigger (refuses payload mutation
    // on every row) via session_replication_role=replica.
    await sql.unsafe(`
      SET LOCAL session_replication_role = replica;
      UPDATE auth_token
      SET payload = jsonb_set(payload, '{workspaceId}', to_jsonb('${anotherWs!.id}'::text))
      WHERE id = '${seed.tokenId}';
    `)

    await expect(
      materializeInvite({
        userId: seed.inviteeId,
        inviteRawToken: seed.rawToken,
      }),
    ).rejects.toSatisfy(
      (err) =>
        err instanceof InviteAcceptError &&
        err.code === "organization-not-found",
    )
  }, 30_000)
})

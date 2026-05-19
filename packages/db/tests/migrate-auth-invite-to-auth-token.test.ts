/**
 * Migration 0018 — auth_invite → auth_token backfill (ADR-0022 D2).
 *
 * Verifies that the INSERT SELECT statement in migration 0018:
 *   - copies pending auth_invite rows into auth_token with kind='inv'
 *   - skips terminal-state rows (accepted / revoked / expired)
 *   - is idempotent (ON CONFLICT DO NOTHING on token_hash)
 *
 * The migration itself is applied once at testcontainer boot. Each test
 * here seeds fresh auth_invite rows after the migration has run, then
 * re-executes the body of the migration as a one-shot SQL block and
 * checks the resulting auth_token rows.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import postgres from "postgres"
import { adminClient, truncateAll } from "./fixtures"

let sql: postgres.Sql
let seededOrgId: string
let seededWorkspaceId: string

const BACKFILL_SQL = `
INSERT INTO auth_token (
  token_hash,
  kind,
  env,
  payload,
  expires_at,
  status,
  issued_at,
  issued_to_user_id,
  issued_to_ip,
  issued_user_agent_hash
)
SELECT
  i.token_hash,
  'inv'::text,
  COALESCE(NULLIF(current_setting('app.auth_token_env', true), ''), 'dev'),
  jsonb_build_object(
    'email',           i.email,
    'organizationId',  i.organization_id::text,
    'workspaceId',     i.workspace_id::text,
    'role',            i.role,
    'issuedByUserId',  COALESCE(i.issued_by_user_id::text, '')
  ),
  i.expires_at,
  'pending'::text,
  i.issued_at,
  i.issued_by_user_id,
  NULL,
  NULL
FROM auth_invite i
WHERE i.status = 'pending'
ON CONFLICT (token_hash) DO NOTHING;
`

async function seedOrgAndWorkspace(client: postgres.Sql): Promise<void> {
  // Minimal app_user + workspace + organization triple so auth_invite FK
  // constraints are satisfied. The auth_invite FK chain demands a real
  // workspace + organization id; we don't need a Better Auth session, only
  // the table rows.
  const [user] = await client<Array<{ id: string }>>`
    INSERT INTO app_user (email)
    VALUES ('mig-seed@test.invalid')
    RETURNING id
  `
  if (!user) throw new Error("app_user seed failed")

  const [ws] = await client<Array<{ id: string }>>`
    INSERT INTO workspace (created_by_user_id, display_name)
    VALUES (${user.id}::uuid, 'Migration test ws')
    RETURNING id
  `
  if (!ws) throw new Error("workspace seed failed")
  seededWorkspaceId = ws.id

  // `organization_id = id` is enforced by trigger; compute the uuid once
  // and use it for both columns.
  const [org] = await client<Array<{ id: string }>>`
    WITH new_id AS (SELECT uuidv7() AS uid)
    INSERT INTO organization (
      id, organization_id, workspace_id, slug, legal_name,
      person_kind, legal_subject_kind
    )
    SELECT
      uid, uid, ${seededWorkspaceId}::uuid,
      'mig-test-org', 'Migration test org',
      'legal_entity', 'for_profit'
    FROM new_id
    RETURNING id
  `
  if (!org) throw new Error("organization seed failed")
  seededOrgId = org.id
}

async function seedInvite(
  client: postgres.Sql,
  overrides: {
    tokenHash?: string
    status?: "pending" | "accepted" | "revoked" | "expired"
    email?: string
  } = {},
): Promise<void> {
  const tokenHash =
    overrides.tokenHash ??
    `mig-test-${Math.random().toString(36).slice(2)}${Date.now()}`
  const status = overrides.status ?? "pending"
  const email = overrides.email ?? "member@example.com"
  await client.unsafe(`
    INSERT INTO auth_invite (
      organization_id, workspace_id, token_hash, email, role,
      status, issued_at, expires_at
    ) VALUES (
      '${seededOrgId}', '${seededWorkspaceId}',
      '${tokenHash}', '${email}', 'member',
      '${status}', now(), now() + interval '7 days'
    )
  `)
}

beforeAll(async () => {
  sql = adminClient()
  await truncateAll(sql)
})

afterAll(async () => {
  await truncateAll(sql)
  await sql.end({ timeout: 5 })
})

beforeEach(async () => {
  await truncateAll(sql)
  await seedOrgAndWorkspace(sql)
})

describe("migration 0018: auth_invite → auth_token backfill", () => {
  it("copies pending auth_invite rows into auth_token with kind='inv'", async () => {
    await seedInvite(sql, { tokenHash: "hash-pending-1", status: "pending" })
    await seedInvite(sql, { tokenHash: "hash-pending-2", status: "pending" })

    await sql.unsafe(BACKFILL_SQL)

    const rows = await sql<
      Array<{
        token_hash: string
        kind: string
        status: string
        payload: { email: string; organizationId: string }
      }>
    >`SELECT token_hash, kind, status, payload FROM auth_token ORDER BY token_hash`

    expect(rows).toHaveLength(2)
    expect(rows[0]?.token_hash).toBe("hash-pending-1")
    expect(rows[0]?.kind).toBe("inv")
    expect(rows[0]?.status).toBe("pending")
    expect(rows[0]?.payload.email).toBe("member@example.com")
    expect(rows[1]?.token_hash).toBe("hash-pending-2")
  })

  it("skips accepted / revoked / expired invite rows", async () => {
    await seedInvite(sql, { tokenHash: "hash-pending", status: "pending" })
    await seedInvite(sql, { tokenHash: "hash-accepted", status: "accepted" })
    await seedInvite(sql, { tokenHash: "hash-revoked", status: "revoked" })
    await seedInvite(sql, { tokenHash: "hash-expired", status: "expired" })

    await sql.unsafe(BACKFILL_SQL)

    const rows = await sql<
      Array<{ token_hash: string }>
    >`SELECT token_hash FROM auth_token ORDER BY token_hash`

    expect(rows).toHaveLength(1)
    expect(rows[0]?.token_hash).toBe("hash-pending")
  })

  it("is idempotent (re-running does not duplicate)", async () => {
    await seedInvite(sql, { tokenHash: "hash-idem", status: "pending" })

    await sql.unsafe(BACKFILL_SQL)
    await sql.unsafe(BACKFILL_SQL)
    await sql.unsafe(BACKFILL_SQL)

    const rows = await sql<
      Array<{ token_hash: string }>
    >`SELECT token_hash FROM auth_token WHERE token_hash = 'hash-idem'`

    expect(rows).toHaveLength(1)
  })

  it("does not overwrite an existing auth_token row with the same hash", async () => {
    // Pre-create a row in auth_token with a different payload, then run
    // the backfill — ON CONFLICT must NOT replace the existing row.
    await sql.unsafe(`
      INSERT INTO auth_token (token_hash, kind, env, payload, expires_at, status)
      VALUES (
        'hash-collide', 'inv', 'dev',
        '{"preserved": true}'::jsonb,
        now() + interval '1 day',
        'pending'
      )
    `)
    await seedInvite(sql, {
      tokenHash: "hash-collide",
      status: "pending",
      email: "different@example.com",
    })

    await sql.unsafe(BACKFILL_SQL)

    const [row] = await sql<
      Array<{ payload: { preserved?: boolean; email?: string } }>
    >`SELECT payload FROM auth_token WHERE token_hash = 'hash-collide'`
    expect(row?.payload.preserved).toBe(true)
    expect(row?.payload.email).toBeUndefined()
  })
})

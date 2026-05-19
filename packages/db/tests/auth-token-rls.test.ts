/**
 * auth_token RLS + append-only enforcement (ADR-0022, migration 0017).
 *
 * Verifies:
 *   1. RLS default-deny — app_user cannot SELECT or INSERT (BYPASSRLS via
 *      app_admin / SET LOCAL ROLE is the only path, but this test uses the
 *      app_user connection client directly to prove the deny policy bites).
 *   2. Append-only contract:
 *        - DELETE refuses status='pending'
 *        - DELETE allows terminal states (consumed/revoked/expired)
 *        - UPDATE refuses immutable columns (id, token_hash, kind, env,
 *          payload, expires_at, issued_at, issued_*)
 *        - UPDATE allows status + consumed_* columns
 *        - TRUNCATE is blocked unconditionally
 *
 * Tests run as superuser (adminClient) for trigger verification because
 * BEFORE row triggers fire for all roles including app_admin; the RLS
 * subset uses userClient.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import postgres from "postgres"

import { adminClient, userClient, truncateAll } from "./fixtures"

let sql: postgres.Sql
let user: postgres.Sql

async function seedToken(
  client: postgres.Sql,
  overrides: Partial<{
    status: string
    kind: string
    env: string
    expiresAt: Date
    tokenHash: string
  }> = {},
): Promise<string> {
  const tokenHash =
    overrides.tokenHash ??
    `test-hash-${Math.random().toString(36).slice(2)}${Date.now()}`
  const status = overrides.status ?? "pending"
  const kind = overrides.kind ?? "sig"
  const env = overrides.env ?? "dev"
  const expiresAt = overrides.expiresAt ?? new Date(Date.now() + 60_000)
  const [row] = await client<Array<{ id: string }>>`
    INSERT INTO auth_token (token_hash, kind, env, payload, expires_at, status)
    VALUES (
      ${tokenHash},
      ${kind},
      ${env},
      '{}'::jsonb,
      ${expiresAt}::timestamptz,
      ${status}
    )
    RETURNING id
  `
  if (!row) throw new Error("seedToken: insert returned no row")
  return row.id
}

beforeAll(async () => {
  sql = adminClient()
  user = userClient()
  await truncateAll(sql)
})

afterAll(async () => {
  await truncateAll(sql)
  await sql.end({ timeout: 5 })
  await user.end({ timeout: 5 })
})

describe("auth_token RLS default-deny", () => {
  it("blocks SELECT from app_user without SET LOCAL ROLE app_admin", async () => {
    const id = await seedToken(sql)
    const rows = await user<
      Array<{ id: string }>
    >`SELECT id FROM auth_token WHERE id = ${id}::uuid`
    // RLS deny policy returns zero rows.
    expect(rows).toHaveLength(0)
  })

  it("blocks INSERT from app_user without SET LOCAL ROLE app_admin", async () => {
    await expect(
      user`
        INSERT INTO auth_token (token_hash, kind, env, expires_at)
        VALUES ('rls-bypass-attempt', 'sig', 'dev', now() + interval '1 minute')
      `,
    ).rejects.toThrow(/violates row-level security|RLS/i)
  })

  it("allows SELECT from app_user after SET LOCAL ROLE app_admin", async () => {
    const id = await seedToken(sql)
    const rows = await user.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE app_admin`)
      return await tx<Array<{ id: string }>>`
        SELECT id FROM auth_token WHERE id = ${id}::uuid
      `
    })
    expect(rows).toHaveLength(1)
  })
})

describe("auth_token append-only", () => {
  it("blocks DELETE of a pending row with check_violation", async () => {
    const id = await seedToken(sql, { status: "pending" })
    await expect(
      sql.unsafe(`DELETE FROM auth_token WHERE id = '${id}'::uuid`),
    ).rejects.toThrow(/check_violation|pending/i)
  })

  it("allows DELETE of a consumed row", async () => {
    const id = await seedToken(sql, { status: "consumed" })
    await expect(
      sql.unsafe(`DELETE FROM auth_token WHERE id = '${id}'::uuid`),
    ).resolves.not.toThrow()
  })

  it("allows DELETE of a revoked row", async () => {
    const id = await seedToken(sql, { status: "revoked" })
    await expect(
      sql.unsafe(`DELETE FROM auth_token WHERE id = '${id}'::uuid`),
    ).resolves.not.toThrow()
  })

  it("allows DELETE of an expired row", async () => {
    const id = await seedToken(sql, { status: "expired" })
    await expect(
      sql.unsafe(`DELETE FROM auth_token WHERE id = '${id}'::uuid`),
    ).resolves.not.toThrow()
  })

  it("blocks UPDATE of token_hash (immutable column)", async () => {
    const id = await seedToken(sql)
    await expect(
      sql.unsafe(
        `UPDATE auth_token SET token_hash = 'tamper' WHERE id = '${id}'::uuid`,
      ),
    ).rejects.toThrow(/check_violation|immutable/i)
  })

  it("blocks UPDATE of kind (immutable column)", async () => {
    const id = await seedToken(sql)
    await expect(
      sql.unsafe(`UPDATE auth_token SET kind = 'inv' WHERE id = '${id}'::uuid`),
    ).rejects.toThrow(/check_violation|immutable/i)
  })

  it("blocks UPDATE of env (immutable column)", async () => {
    const id = await seedToken(sql)
    await expect(
      sql.unsafe(`UPDATE auth_token SET env = 'prd' WHERE id = '${id}'::uuid`),
    ).rejects.toThrow(/check_violation|immutable/i)
  })

  it("blocks UPDATE of payload (immutable column)", async () => {
    const id = await seedToken(sql)
    await expect(
      sql.unsafe(
        `UPDATE auth_token SET payload = '{"x":1}'::jsonb WHERE id = '${id}'::uuid`,
      ),
    ).rejects.toThrow(/check_violation|immutable/i)
  })

  it("blocks UPDATE of expires_at (immutable column)", async () => {
    const id = await seedToken(sql)
    await expect(
      sql.unsafe(
        `UPDATE auth_token SET expires_at = now() + interval '1 day' WHERE id = '${id}'::uuid`,
      ),
    ).rejects.toThrow(/check_violation|immutable/i)
  })

  it("allows UPDATE of status to consumed (the redemption path)", async () => {
    const id = await seedToken(sql)
    await expect(
      sql.unsafe(
        `UPDATE auth_token SET status = 'consumed', consumed_at = now() WHERE id = '${id}'::uuid`,
      ),
    ).resolves.not.toThrow()
  })

  it("allows UPDATE of consumed_from_ip + consumed_user_agent_hash", async () => {
    const id = await seedToken(sql)
    await expect(
      sql.unsafe(
        `UPDATE auth_token SET status = 'consumed', consumed_at = now(),
           consumed_from_ip = '192.0.2.0/24', consumed_user_agent_hash = 'abc'
         WHERE id = '${id}'::uuid`,
      ),
    ).resolves.not.toThrow()
  })

  it("blocks TRUNCATE auth_token", async () => {
    await expect(sql.unsafe(`TRUNCATE auth_token`)).rejects.toThrow(
      /append-only|feature_not_supported/i,
    )
  })
})

describe("auth_token CHECK constraints", () => {
  it("rejects an invalid status", async () => {
    await expect(
      sql`
        INSERT INTO auth_token (token_hash, kind, env, expires_at, status)
        VALUES ('chk-status', 'sig', 'dev', now() + interval '1 minute', 'bogus')
      `,
    ).rejects.toThrow(/auth_token_status_valid|check constraint/i)
  })

  it("rejects an invalid env", async () => {
    await expect(
      sql`
        INSERT INTO auth_token (token_hash, kind, env, expires_at)
        VALUES ('chk-env', 'sig', 'qa', now() + interval '1 minute')
      `,
    ).rejects.toThrow(/auth_token_env_valid|check constraint/i)
  })

  it("rejects a non-object payload", async () => {
    await expect(
      sql`
        INSERT INTO auth_token (token_hash, kind, env, payload, expires_at)
        VALUES ('chk-payload', 'sig', 'dev', '"string"'::jsonb, now() + interval '1 minute')
      `,
    ).rejects.toThrow(/auth_token_payload_is_object|check constraint/i)
  })

  it("rejects duplicate token_hash", async () => {
    const hash = "dup-test-hash"
    await sql`
      INSERT INTO auth_token (token_hash, kind, env, expires_at)
      VALUES (${hash}, 'sig', 'dev', now() + interval '1 minute')
    `
    await expect(
      sql`
        INSERT INTO auth_token (token_hash, kind, env, expires_at)
        VALUES (${hash}, 'inv', 'dev', now() + interval '1 minute')
      `,
    ).rejects.toThrow(/duplicate key|unique/i)
  })
})

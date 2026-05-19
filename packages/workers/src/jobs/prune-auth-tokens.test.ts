/**
 * prune-auth-tokens job tests.
 *
 * Boots a Postgres 18 testcontainer and exercises the full pipeline:
 *   1. expireDueAuthTokens flips pending+past-expiry rows to 'expired'
 *   2. pruneTerminalAuthTokens deletes terminal-state rows older than the
 *      retention cutoff while preserving pending and fresh terminal rows.
 *
 * Mirrors packages/auth/src/tokens/auth-token.test.ts in containerization,
 * but exercises the worker entry point.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { bootPostgres18 } from "@workspace/testcontainers"
import type { BootResult } from "@workspace/testcontainers"

process.env["NODE_ENV"] = process.env["NODE_ENV"] ?? "test"
process.env["AUTH_TOKEN_ENV"] = "dev"

// Cold testcontainer boot + first-call DB pool init can drift over the
// default 5 s per-test budget on a busy CI runner.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

let boot: BootResult

beforeAll(async () => {
  boot = await bootPostgres18()
  process.env["DATABASE_URL"] = boot.userUrl
  process.env["DATABASE_DIRECT_URL"] = boot.adminUrl
}, 120_000)

afterAll(async () => {
  if (boot?.container) await boot.container.stop()
})

beforeEach(async () => {
  const { adminClient, truncateAll } =
    await import("@workspace/db/tests/fixtures")
  const sql = adminClient()
  try {
    await truncateAll(sql)
  } finally {
    await sql.end({ timeout: 5 })
  }
})

describe("handlePruneAuthTokens", () => {
  it("expires past-due pending rows and prunes old terminal rows", async () => {
    const { mintToken, consumeToken } = await import("@workspace/auth/tokens")
    const { handlePruneAuthTokens } = await import("./prune-auth-tokens")
    const { adminClient } = await import("@workspace/db/tests/fixtures")
    const sql = adminClient()
    try {
      const oldConsumed = await mintToken({ kind: "sig" })
      await consumeToken({
        rawToken: oldConsumed.rawToken,
        expectedKind: "sig",
      })

      const freshConsumed = await mintToken({ kind: "sig" })
      await consumeToken({
        rawToken: freshConsumed.rawToken,
        expectedKind: "sig",
      })

      const pendingFuture = await mintToken({ kind: "sig" })
      const pendingPast = await mintToken({ kind: "sig", ttlSeconds: 60 })

      // Backdate oldConsumed.issued_at past the 90-day cutoff. Backdate
      // pendingPast.expires_at into the past so expireDue flips it.
      await sql.unsafe(`
        SET LOCAL session_replication_role = replica;
        UPDATE auth_token SET issued_at = now() - interval '120 days'
          WHERE id = '${oldConsumed.id}';
        UPDATE auth_token SET expires_at = now() - interval '1 minute'
          WHERE id = '${pendingPast.id}';
      `)

      const result = await handlePruneAuthTokens()
      expect(result.expired).toBe(1) // pendingPast → expired
      expect(result.pruned).toBe(1) // oldConsumed deleted; pendingPast keeps its 90-day grace

      const ids = await sql<
        Array<{ id: string }>
      >`SELECT id FROM auth_token ORDER BY issued_at`
      const present = ids.map((r) => r.id)
      expect(present).toContain(freshConsumed.id)
      expect(present).toContain(pendingFuture.id)
      expect(present).toContain(pendingPast.id)
      expect(present).not.toContain(oldConsumed.id)
    } finally {
      await sql.end({ timeout: 5 })
    }
  })

  it("rejects a non-positive retentionDays override", async () => {
    const { handlePruneAuthTokens } = await import("./prune-auth-tokens")
    await expect(handlePruneAuthTokens({ retentionDays: 0 })).rejects.toThrow(
      /positive number/i,
    )
    await expect(handlePruneAuthTokens({ retentionDays: -1 })).rejects.toThrow(
      /positive number/i,
    )
  })

  it("honors an injected clock for deterministic cutoffs", async () => {
    const { mintToken, consumeToken } = await import("@workspace/auth/tokens")
    const { handlePruneAuthTokens } = await import("./prune-auth-tokens")
    const { adminClient } = await import("@workspace/db/tests/fixtures")
    const sql = adminClient()
    try {
      const m = await mintToken({ kind: "sig" })
      await consumeToken({ rawToken: m.rawToken, expectedKind: "sig" })
      await sql.unsafe(`
        SET LOCAL session_replication_role = replica;
        UPDATE auth_token SET issued_at = '2026-01-01T00:00:00Z'::timestamptz
          WHERE id = '${m.id}';
      `)

      // Cutoff 100 days after issued_at — row is old enough.
      const result = await handlePruneAuthTokens({
        retentionDays: 1,
        now: () => new Date("2026-05-01T00:00:00Z"),
      })
      expect(result.pruned).toBe(1)
    } finally {
      await sql.end({ timeout: 5 })
    }
  })
})

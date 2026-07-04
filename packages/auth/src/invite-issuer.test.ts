/**
 * Integration tests for invite-issuer.ts (AFF-127, rewritten for
 * ADR-0022 — invite state lives on auth_token, kind='inv', not the
 * dropped auth_invite table).
 *
 * Every function in invite-issuer.ts reaches the DB via `withAdminBypass`.
 * These tests boot a real Postgres 18 testcontainer so assertions reflect
 * actual row state and index constraints, not mocks.
 *
 * Email transport: NODE_ENV=test forces ConsoleTransport, which is a no-op
 * logger — no mocking required.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { bootPostgres18 } from "@workspace/testcontainers"
import type { BootResult } from "@workspace/testcontainers"

// ConsoleTransport is selected when NODE_ENV !== 'production'.
process.env["NODE_ENV"] = process.env["NODE_ENV"] ?? "test"
// Better Auth requires a ≥32-byte secret at module construction time.
process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "invite-issuer-test-secret-0123456789abcd"
process.env["AUTH_TOKEN_ENV"] = process.env["AUTH_TOKEN_ENV"] ?? "dev"

let boot: BootResult

beforeAll(async () => {
  boot = await bootPostgres18()
  // db / withAdminBypass bind DATABASE_URL lazily — set before dynamic imports.
  process.env["DATABASE_URL"] = boot.userUrl
  process.env["DATABASE_DIRECT_URL"] = boot.adminUrl
}, 120_000)

afterAll(async () => {
  if (boot?.container) await boot.container.stop()
})

// ---------------------------------------------------------------------------
// issueInvite
// ---------------------------------------------------------------------------
describe("issueInvite", () => {
  it("inserts a pending auth_token row (kind='inv') and returns a valid id + url", async () => {
    const { adminClient, seedWorkspaceWithOwner, truncateAll } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp } = await import("./test-support")
    const { issueInvite } = await import("./invite-issuer")

    const sql = adminClient()
    try {
      await truncateAll(sql)
      const seed = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "invite-issuer-owner@test.invalid",
        password: "IssuerPassw0rd!",
      })

      const result = await issueInvite({
        email: "Invited.User@test.INVALID",
        organizationId: seed.organizationId,
        role: "member",
        issuedByUserId: seed.userId,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      })

      expect(result.inviteId).toBeTruthy()
      expect(result.url).toContain("/auth/invite?token=")
      expect(result.expiresAt).toBeInstanceOf(Date)
      // TTL was 3600 s — expiresAt should be roughly 1 hour from now.
      const diffMs = result.expiresAt.getTime() - Date.now()
      expect(diffMs).toBeGreaterThan(3_500_000) // > 58 min
      expect(diffMs).toBeLessThan(3_700_000) // < ~61 min

      // Verify the actual DB row.
      const [row] = await sql<
        Array<{
          id: string
          kind: string
          status: string
          payload: {
            email: string
            organizationId: string
            workspaceId: string
            role: string
          }
        }>
      >`SELECT id, kind, status, payload
          FROM auth_token
         WHERE id = ${result.inviteId}::uuid`

      expect(row).toBeDefined()
      expect(row!.kind).toBe("inv")
      expect(row!.status).toBe("pending")
      expect(row!.payload.role).toBe("member")
      // Email is normalised to lowercase on write.
      expect(row!.payload.email).toBe("invited.user@test.invalid")
      expect(row!.payload.organizationId).toBe(seed.organizationId)
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)

  it("throws when the organizationId does not exist", async () => {
    const { adminClient } = await import("@workspace/db/tests/fixtures")
    const { issueInvite } = await import("./invite-issuer")

    const sql = adminClient()
    try {
      await expect(
        issueInvite({
          email: "nobody@test.invalid",
          organizationId: "00000000-0000-0000-0000-000000000000",
          role: "member",
          issuedByUserId: null,
          baseUrl: "http://localhost:3000",
          brandName: "TestBrand",
        }),
      ).rejects.toThrow(
        "Organization 00000000-0000-0000-0000-000000000000 not found",
      )
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)

  it("rejects a duplicate pending invite for the same (org, email) — exactly one row (#509)", async () => {
    const { adminClient, seedWorkspaceWithOwner, truncateAll } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp } = await import("./test-support")
    const { issueInvite, DuplicatePendingInviteError } =
      await import("./invite-issuer")

    const sql = adminClient()
    try {
      await truncateAll(sql)
      const seed = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "dup-guard-owner@test.invalid",
        password: "DupGuardPassw0rd!",
      })

      const base = {
        organizationId: seed.organizationId,
        role: "member" as const,
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      }

      await issueInvite({ email: "dup@test.invalid", ...base })

      // Second sequential invite to the same recipient — case variant. issueInvite
      // lowercases input, so the pre-insert SELECT catches this; the index's own
      // lower() folding is proven directly in the "pending-invite unique index" block.
      await expect(
        issueInvite({ email: "DUP@test.INVALID", ...base }),
      ).rejects.toBeInstanceOf(DuplicatePendingInviteError)

      const rows = await sql<Array<{ id: string }>>`
        SELECT id FROM auth_token
         WHERE kind = 'inv' AND status = 'pending'
           AND payload->>'organizationId' = ${seed.organizationId}
           AND lower(payload->>'email') = 'dup@test.invalid'
      `
      expect(rows).toHaveLength(1)
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)

  it("closes the concurrent double-invite race: one wins, one DuplicatePendingInviteError (#509)", async () => {
    const { adminClient, seedWorkspaceWithOwner, truncateAll } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp } = await import("./test-support")
    const { issueInvite, DuplicatePendingInviteError } =
      await import("./invite-issuer")

    const sql = adminClient()
    try {
      await truncateAll(sql)
      const seed = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "race-owner@test.invalid",
        password: "RacePassw0rd!",
      })

      const invite = () =>
        issueInvite({
          email: "race@test.invalid",
          organizationId: seed.organizationId,
          role: "member",
          issuedByUserId: null,
          baseUrl: "http://localhost:3000",
          brandName: "TestBrand",
          ttlSeconds: 3600,
        })

      // Fire both concurrently — issueInvite must yield exactly one winner and
      // one typed DuplicatePendingInviteError, whichever guard rejects the loser
      // (the pre-insert SELECT, or the index's 23505 mapped by the catch). The
      // index-level guarantee is proven directly in the "pending-invite unique
      // index" block; this asserts the caller-facing contract.
      const settled = await Promise.allSettled([invite(), invite()])
      const fulfilled = settled.filter((r) => r.status === "fulfilled")
      const rejected = settled.filter((r) => r.status === "rejected")

      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        DuplicatePendingInviteError,
      )

      const rows = await sql<Array<{ id: string }>>`
        SELECT id FROM auth_token
         WHERE kind = 'inv' AND status = 'pending'
           AND payload->>'organizationId' = ${seed.organizationId}
           AND lower(payload->>'email') = 'race@test.invalid'
      `
      expect(rows).toHaveLength(1)
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)

  it("allows re-inviting the same (org, email) once the prior invite is revoked (#509)", async () => {
    const { adminClient, seedWorkspaceWithOwner, truncateAll } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp } = await import("./test-support")
    const { issueInvite, revokePendingInvites } =
      await import("./invite-issuer")

    const sql = adminClient()
    try {
      await truncateAll(sql)
      const seed = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "reinvite-owner@test.invalid",
        password: "ReinvitePassw0rd!",
      })

      const base = {
        email: "reinvite@test.invalid",
        organizationId: seed.organizationId,
        role: "member" as const,
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      }

      await issueInvite(base)
      await revokePendingInvites({
        organizationId: seed.organizationId,
        email: "reinvite@test.invalid",
      })

      // Revoke moves the prior invite out of 'pending', so both the pre-check
      // and the index (which each only scope status='pending') let a fresh
      // invite through. The index-only proof is in the direct block below.
      const reissued = await issueInvite(base)
      expect(reissued.inviteId).toBeTruthy()

      const pending = await sql<Array<{ id: string }>>`
        SELECT id FROM auth_token
         WHERE kind = 'inv' AND status = 'pending'
           AND payload->>'organizationId' = ${seed.organizationId}
           AND lower(payload->>'email') = 'reinvite@test.invalid'
      `
      expect(pending).toHaveLength(1)
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)
})

// ---------------------------------------------------------------------------
// pending-invite unique index — direct, index-level proofs (#509)
//
// These drive mintToken directly, bypassing issueInvite's pre-insert SELECT, so
// the assertions exercise the partial UNIQUE index itself (migration 0043), not
// the pre-check. Each uses a fresh random organizationId so it can't collide
// with other tests' inv rows (no truncate needed). Payloads are free-form JSONB
// (mintToken does no FK check on organizationId), so no org seed is required.
// ---------------------------------------------------------------------------
describe("pending-invite unique index (direct)", () => {
  it("rejects a second pending invite for the same key; the mapper matches the drizzle-wrapped 23505", async () => {
    const { randomUUID } = await import("node:crypto")
    const { mintToken } = await import("./tokens/auth-token")
    const { isPendingInviteUniqueViolation } = await import("./invite-issuer")
    const { adminClient } = await import("@workspace/db/tests/fixtures")

    const sql = adminClient()
    try {
      const org = randomUUID()
      const payload = { organizationId: org, email: "idx@test.invalid" }
      await mintToken({ kind: "inv", payload, ttlSeconds: 3600 })

      let caught: unknown
      try {
        await mintToken({ kind: "inv", payload, ttlSeconds: 3600 })
      } catch (e) {
        caught = e
      }

      expect(caught).toBeDefined()
      // The driver 23505 lives on `.cause` (drizzle wraps it) — the mapper walks
      // the cause chain. A top-level-only check would return false here.
      expect((caught as { code?: unknown }).code).toBeUndefined()
      expect(isPendingInviteUniqueViolation(caught)).toBe(true)

      // Negative cases: the mapper must NOT claim unrelated errors. A non-PG
      // error is false; a 23505 on a DIFFERENT constraint (e.g. the token_hash
      // unique) is false too, so it is never mis-mapped to a duplicate invite.
      expect(isPendingInviteUniqueViolation(new Error("unrelated"))).toBe(false)
      expect(
        isPendingInviteUniqueViolation(
          new Error("other", {
            cause: {
              code: "23505",
              constraint_name: "auth_token_token_hash_key",
            },
          }),
        ),
      ).toBe(false)

      const rows = await sql<Array<{ id: string }>>`
        SELECT id FROM auth_token
         WHERE kind = 'inv' AND status = 'pending'
           AND payload->>'organizationId' = ${org}
           AND lower(payload->>'email') = 'idx@test.invalid'
      `
      expect(rows).toHaveLength(1)
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)

  it("folds email case in the index: a mixed-case payload collides with a lowercase one", async () => {
    const { randomUUID } = await import("node:crypto")
    const { mintToken } = await import("./tokens/auth-token")
    const { isPendingInviteUniqueViolation } = await import("./invite-issuer")

    const org = randomUUID()
    await mintToken({
      kind: "inv",
      payload: { organizationId: org, email: "case@test.invalid" },
      ttlSeconds: 3600,
    })

    let caught: unknown
    try {
      await mintToken({
        kind: "inv",
        payload: { organizationId: org, email: "CASE@TEST.INVALID" },
        ttlSeconds: 3600,
      })
    } catch (e) {
      caught = e
    }
    // Same key after lower() folding — the index rejects it even though the raw
    // payload strings differ.
    expect(isPendingInviteUniqueViolation(caught)).toBe(true)
  }, 120_000)

  it("scopes the index to pending: a revoked row does not block a fresh pending invite for the same key", async () => {
    const { randomUUID } = await import("node:crypto")
    const { mintToken, revokeTokenById } = await import("./tokens/auth-token")

    const org = randomUUID()
    const payload = { organizationId: org, email: "revoked-idx@test.invalid" }
    const first = await mintToken({ kind: "inv", payload, ttlSeconds: 3600 })

    // Move the first row out of 'pending' — the index's WHERE clause excludes it.
    expect(await revokeTokenById(first.id)).toBe(true)

    // A fresh pending invite for the same key now inserts without violating the
    // index (proving the partial WHERE status='pending' scoping, at the index).
    const second = await mintToken({ kind: "inv", payload, ttlSeconds: 3600 })
    expect(second.id).toBeTruthy()
    expect(second.id).not.toBe(first.id)
  }, 120_000)
})

// ---------------------------------------------------------------------------
// readInviteByRawToken
// ---------------------------------------------------------------------------
describe("readInviteByRawToken", () => {
  it("returns full claims for a valid pending invite", async () => {
    const { adminClient, seedWorkspaceWithOwner, truncateAll } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp } = await import("./test-support")
    const { issueInvite, readInviteByRawToken } =
      await import("./invite-issuer")

    const sql = adminClient()
    try {
      await truncateAll(sql)
      const seed = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "read-valid-owner@test.invalid",
        password: "ReadValidPassw0rd!",
      })

      const issued = await issueInvite({
        email: "pending-invite@test.invalid",
        organizationId: seed.organizationId,
        role: "admin",
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      })

      // Extract the raw token from the URL.
      const url = new URL(issued.url)
      const rawToken = url.searchParams.get("token")!
      expect(rawToken).toBeTruthy()

      const record = await readInviteByRawToken(rawToken)

      expect(record).not.toBeNull()
      expect(record!.id).toBe(issued.inviteId)
      expect(record!.email).toBe("pending-invite@test.invalid")
      expect(record!.organizationId).toBe(seed.organizationId)
      expect(record!.workspaceId).toBe(seed.workspaceId)
      expect(record!.role).toBe("admin")
      expect(record!.status).toBe("pending")
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)

  it("returns null for an unknown token (no enumeration leak)", async () => {
    const { readInviteByRawToken } = await import("./invite-issuer")
    const { mintToken } = await import("./tokens/auth-token")

    // Mint a valid token, never insert it as a known invite — but the
    // mint itself writes a row. So instead, mint an inv row then delete
    // it; readInviteByRawToken returns null on the missing row.
    const minted = await mintToken({
      kind: "inv",
      payload: { email: "lost@test.invalid" },
      ttlSeconds: 60,
    })
    const { adminClient } = await import("@workspace/db/tests/fixtures")
    const sql = adminClient()
    try {
      // Bypass DELETE guard trigger (pending rows can't be deleted via the
      // app path). Tests need raw lifecycle access to set up "row vanished".
      await sql.unsafe(`
        SET LOCAL session_replication_role = replica;
        DELETE FROM auth_token WHERE id = '${minted.id}';
      `)
      const result = await readInviteByRawToken(minted.rawToken)
      expect(result).toBeNull()
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)

  it("returns null for an empty token without hitting the DB", async () => {
    const { readInviteByRawToken } = await import("./invite-issuer")
    const result = await readInviteByRawToken("")
    expect(result).toBeNull()
  }, 30_000)

  it("soft-expires a pending invite whose expires_at is in the past", async () => {
    // issueInvite always sets expires_at in the future. We backdate it via SQL
    // to simulate a row the cleanup worker hasn't processed yet.
    const { adminClient, seedWorkspaceWithOwner, truncateAll } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp } = await import("./test-support")
    const { issueInvite, readInviteByRawToken } =
      await import("./invite-issuer")

    const sql = adminClient()
    try {
      await truncateAll(sql)
      const seed = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "soft-expire-owner@test.invalid",
        password: "SoftExpirePassw0rd!",
      })

      const issued = await issueInvite({
        email: "expired-invite@test.invalid",
        organizationId: seed.organizationId,
        role: "member",
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      })

      // Backdate expires_at to 1 second ago — row stays 'pending' in DB.
      // Bypass append-only trigger via session_replication_role=replica
      // so the test can write a past expires_at (production code is gated
      // by the trigger to refuse past-future values).
      await sql.unsafe(`
        SET LOCAL session_replication_role = replica;
        UPDATE auth_token
           SET expires_at = now() - interval '1 second'
         WHERE id = '${issued.inviteId}';
      `)

      // Verify the row is still 'pending' in the DB (cleanup worker hasn't run).
      const [dbRow] = await sql<Array<{ status: string }>>`
        SELECT status FROM auth_token WHERE id = ${issued.inviteId}::uuid
      `
      expect(dbRow!.status).toBe("pending")

      const url = new URL(issued.url)
      const rawToken = url.searchParams.get("token")!
      const record = await readInviteByRawToken(rawToken)

      // readInviteByRawToken soft-expires the row in memory.
      expect(record).not.toBeNull()
      expect(record!.status).toBe("expired")
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)

  it("returns status=revoked for a revoked invite", async () => {
    const { adminClient, seedWorkspaceWithOwner, truncateAll } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp } = await import("./test-support")
    const { issueInvite, revokePendingInvites, readInviteByRawToken } =
      await import("./invite-issuer")

    const sql = adminClient()
    try {
      await truncateAll(sql)
      const seed = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "revoked-read-owner@test.invalid",
        password: "RevokedReadPassw0rd!",
      })

      const issued = await issueInvite({
        email: "revoked-invite@test.invalid",
        organizationId: seed.organizationId,
        role: "member",
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      })

      await revokePendingInvites({
        organizationId: seed.organizationId,
        email: "revoked-invite@test.invalid",
      })

      const url = new URL(issued.url)
      const rawToken = url.searchParams.get("token")!
      const record = await readInviteByRawToken(rawToken)

      expect(record).not.toBeNull()
      expect(record!.status).toBe("revoked")
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)
})

// ---------------------------------------------------------------------------
// revokePendingInvites
// ---------------------------------------------------------------------------
describe("revokePendingInvites", () => {
  it("marks the pending invite for (org, email) as revoked and returns count", async () => {
    const { adminClient, seedWorkspaceWithOwner, truncateAll } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp } = await import("./test-support")
    const { issueInvite, revokePendingInvites } =
      await import("./invite-issuer")

    const sql = adminClient()
    try {
      await truncateAll(sql)
      const seed = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "revoke-owner@test.invalid",
        password: "RevokeOwnerPassw0rd!",
      })

      // A single pending invite — the partial unique index (migration 0043)
      // forbids a second pending row for the same (org, email), so at most one
      // ever exists to revoke.
      await issueInvite({
        email: "multi-invite@test.invalid",
        organizationId: seed.organizationId,
        role: "member",
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      })

      const revokedCount = await revokePendingInvites({
        organizationId: seed.organizationId,
        email: "multi-invite@test.invalid",
      })

      expect(revokedCount).toBe(1)

      // Confirm the row is now 'revoked' in the DB.
      const rows = await sql<Array<{ status: string }>>`
        SELECT status FROM auth_token
         WHERE kind = 'inv'
           AND payload->>'organizationId' = ${seed.organizationId}
           AND payload->>'email' = 'multi-invite@test.invalid'
      `
      expect(rows).toHaveLength(1)
      for (const row of rows) {
        expect(row.status).toBe("revoked")
      }
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)

  it("is case-insensitive: revokes invite created with a different email case", async () => {
    const { adminClient, seedWorkspaceWithOwner, truncateAll } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp } = await import("./test-support")
    const { issueInvite, revokePendingInvites } =
      await import("./invite-issuer")

    const sql = adminClient()
    try {
      await truncateAll(sql)
      const seed = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "case-owner@test.invalid",
        password: "CaseOwnerPassw0rd!",
      })

      // Issue with mixed-case email — stored lowercase after normalization.
      const issued = await issueInvite({
        email: "Case.User@TEST.INVALID",
        organizationId: seed.organizationId,
        role: "member",
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      })

      // Revoke using a different case variant.
      const revokedCount = await revokePendingInvites({
        organizationId: seed.organizationId,
        email: "CASE.USER@test.invalid",
      })

      expect(revokedCount).toBe(1)

      const [row] = await sql<Array<{ status: string }>>`
        SELECT status FROM auth_token WHERE id = ${issued.inviteId}::uuid
      `
      expect(row!.status).toBe("revoked")
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)

  it("does not touch already-revoked invites (returns 0)", async () => {
    const { adminClient, seedWorkspaceWithOwner, truncateAll } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp } = await import("./test-support")
    const { issueInvite, revokePendingInvites } =
      await import("./invite-issuer")

    const sql = adminClient()
    try {
      await truncateAll(sql)
      const seed = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "already-revoked-owner@test.invalid",
        password: "AlreadyRevokedPassw0rd!",
      })

      await issueInvite({
        email: "already-revoked@test.invalid",
        organizationId: seed.organizationId,
        role: "member",
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      })

      // First revoke.
      const first = await revokePendingInvites({
        organizationId: seed.organizationId,
        email: "already-revoked@test.invalid",
      })
      expect(first).toBe(1)

      // Second revoke — no pending rows remain.
      const second = await revokePendingInvites({
        organizationId: seed.organizationId,
        email: "already-revoked@test.invalid",
      })
      expect(second).toBe(0)
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)

  it("does not revoke invites for a different organization", async () => {
    const { adminClient, seedWorkspaceWithOwner, truncateAll } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp } = await import("./test-support")
    const { issueInvite, revokePendingInvites } =
      await import("./invite-issuer")

    const sql = adminClient()
    try {
      await truncateAll(sql)
      const seedA = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "org-a-owner@test.invalid",
        password: "OrgAOwnerPassw0rd!",
      })
      const seedB = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "org-b-owner@test.invalid",
        password: "OrgBOwnerPassw0rd!",
      })

      // Issue invite in org A.
      const issuedA = await issueInvite({
        email: "shared-recipient@test.invalid",
        organizationId: seedA.organizationId,
        role: "member",
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      })

      // Issue invite in org B for the same email.
      const issuedB = await issueInvite({
        email: "shared-recipient@test.invalid",
        organizationId: seedB.organizationId,
        role: "member",
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      })

      // Revoke only for org A.
      const revokedCount = await revokePendingInvites({
        organizationId: seedA.organizationId,
        email: "shared-recipient@test.invalid",
      })
      expect(revokedCount).toBe(1)

      // Org A invite is revoked.
      const [rowA] = await sql<Array<{ status: string }>>`
        SELECT status FROM auth_token WHERE id = ${issuedA.inviteId}::uuid
      `
      expect(rowA!.status).toBe("revoked")

      // Org B invite is still pending.
      const [rowB] = await sql<Array<{ status: string }>>`
        SELECT status FROM auth_token WHERE id = ${issuedB.inviteId}::uuid
      `
      expect(rowB!.status).toBe("pending")
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)
})

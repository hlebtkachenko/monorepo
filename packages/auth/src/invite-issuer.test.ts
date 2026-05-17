/**
 * Integration tests for invite-issuer.ts — AFF-127 / E7e.
 *
 * Every function in invite-issuer.ts reaches the DB via `withAdminBypass`.
 * These tests boot a real Postgres 18 testcontainer (same pattern as
 * seed-loginable-user.test.ts) so assertions reflect actual row state and
 * index constraints, not mocks.
 *
 * Email transport: NODE_ENV=test forces ConsoleTransport, which is a no-op
 * logger — no mocking required.
 *
 * Container start: ~10–20 s cold, ~4–6 s warm (image cached). Each test
 * group runs within the same container; `truncateAll` wipes tables between
 * groups so seed state doesn't bleed.
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
  it("inserts a pending auth_invite row and returns a valid inviteId + url", async () => {
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
      expect(result.url).toContain("/auth/invite/start?token=")
      expect(result.expiresAt).toBeInstanceOf(Date)
      // TTL was 3600 s — expiresAt should be roughly 1 hour from now.
      const diffMs = result.expiresAt.getTime() - Date.now()
      expect(diffMs).toBeGreaterThan(3_500_000) // > 58 min
      expect(diffMs).toBeLessThan(3_700_000) // < ~61 min

      // Verify the actual DB row.
      const [row] = await sql<
        Array<{
          id: string
          email: string
          status: string
          role: string
          organization_id: string
        }>
      >`SELECT id, email, status, role, organization_id
          FROM auth_invite
         WHERE id = ${result.inviteId}::uuid`

      expect(row).toBeDefined()
      expect(row!.status).toBe("pending")
      expect(row!.role).toBe("member")
      // Email is normalised to lowercase on write.
      expect(row!.email).toBe("invited.user@test.invalid")
      expect(row!.organization_id).toBe(seed.organizationId)
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

  it("rejects a duplicate token_hash (unique constraint on auth_invite.token_hash)", async () => {
    // Two separate issueInvite calls mint two different random tokens, so a
    // hash collision cannot happen in practice. We verify the unique constraint
    // directly by manually inserting a row with a known hash and then trying
    // to insert the same hash again via raw SQL — this confirms the DB-level
    // guard exists and is enforced.
    const { adminClient, seedWorkspaceWithOwner, truncateAll } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp } = await import("./test-support")

    const sql = adminClient()
    try {
      await truncateAll(sql)
      const seed = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "invite-dup-owner@test.invalid",
        password: "DupInvitePassw0rd!",
      })

      const fixedHash = "a".repeat(64) // deterministic SHA-256 hex placeholder
      const expiresAt = new Date(Date.now() + 3_600_000).toISOString()

      // First insert succeeds.
      await sql`
        INSERT INTO auth_invite (organization_id, workspace_id, token_hash, email, role, expires_at)
        VALUES (
          ${seed.organizationId}::uuid,
          ${seed.workspaceId}::uuid,
          ${fixedHash},
          'dup-target@test.invalid',
          'member',
          ${expiresAt}::timestamptz
        )
      `

      // Second insert with the same token_hash must violate the unique constraint.
      await expect(
        sql`
          INSERT INTO auth_invite (organization_id, workspace_id, token_hash, email, role, expires_at)
          VALUES (
            ${seed.organizationId}::uuid,
            ${seed.workspaceId}::uuid,
            ${fixedHash},
            'other@test.invalid',
            'member',
            ${expiresAt}::timestamptz
          )
        `,
      ).rejects.toThrow()
    } finally {
      await sql.end({ timeout: 5 })
    }
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
    const { generateRawInviteToken } = await import("./tokens/invite")

    const fakeToken = generateRawInviteToken()
    const result = await readInviteByRawToken(fakeToken)
    expect(result).toBeNull()
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
      await sql`
        UPDATE auth_invite
           SET expires_at = now() - interval '1 second'
         WHERE id = ${issued.inviteId}::uuid
      `

      // Verify the row is still 'pending' in the DB (cleanup worker hasn't run).
      const [dbRow] = await sql<Array<{ status: string }>>`
        SELECT status FROM auth_invite WHERE id = ${issued.inviteId}::uuid
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
  it("marks pending invites for (org, email) as revoked and returns count", async () => {
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

      // Issue two invites to the same email in the same org.
      await issueInvite({
        email: "multi-invite@test.invalid",
        organizationId: seed.organizationId,
        role: "member",
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      })
      await issueInvite({
        email: "multi-invite@test.invalid",
        organizationId: seed.organizationId,
        role: "admin",
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      })

      const revokedCount = await revokePendingInvites({
        organizationId: seed.organizationId,
        email: "multi-invite@test.invalid",
      })

      expect(revokedCount).toBe(2)

      // Confirm both rows are now 'revoked' in the DB.
      const rows = await sql<Array<{ status: string }>>`
        SELECT status FROM auth_invite
         WHERE organization_id = ${seed.organizationId}::uuid
           AND email = 'multi-invite@test.invalid'
      `
      expect(rows).toHaveLength(2)
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
        SELECT status FROM auth_invite WHERE id = ${issued.inviteId}::uuid
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
        SELECT status FROM auth_invite WHERE id = ${issuedA.inviteId}::uuid
      `
      expect(rowA!.status).toBe("revoked")

      // Org B invite is still pending.
      const [rowB] = await sql<Array<{ status: string }>>`
        SELECT status FROM auth_invite WHERE id = ${issuedB.inviteId}::uuid
      `
      expect(rowB!.status).toBe("pending")
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)
})

// ---------------------------------------------------------------------------
// expireDuePendingInvites
// ---------------------------------------------------------------------------
describe("expireDuePendingInvites", () => {
  it("flips due pending invites to expired and returns the count", async () => {
    const { adminClient, seedWorkspaceWithOwner, truncateAll } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp } = await import("./test-support")
    const { issueInvite, expireDuePendingInvites } =
      await import("./invite-issuer")

    const sql = adminClient()
    try {
      await truncateAll(sql)
      const seed = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "expire-worker-owner@test.invalid",
        password: "ExpireWorkerPassw0rd!",
      })

      // Two invites that will be backdated (due).
      const due1 = await issueInvite({
        email: "expire-due-1@test.invalid",
        organizationId: seed.organizationId,
        role: "member",
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      })
      const due2 = await issueInvite({
        email: "expire-due-2@test.invalid",
        organizationId: seed.organizationId,
        role: "member",
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      })

      // One invite that is still valid (expires in the future).
      const still_valid = await issueInvite({
        email: "expire-still-valid@test.invalid",
        organizationId: seed.organizationId,
        role: "member",
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      })

      // Backdate the two "due" invites.
      await sql`
        UPDATE auth_invite
           SET expires_at = now() - interval '1 second'
         WHERE id IN (${due1.inviteId}::uuid, ${due2.inviteId}::uuid)
      `

      const expiredCount = await expireDuePendingInvites()

      // Must be at least 2 (other test runs could have left dues if truncateAll
      // wasn't called — but we did call it above, so expect exactly 2).
      expect(expiredCount).toBe(2)

      // Verify DB state.
      const [row1] = await sql<Array<{ status: string }>>`
        SELECT status FROM auth_invite WHERE id = ${due1.inviteId}::uuid
      `
      const [row2] = await sql<Array<{ status: string }>>`
        SELECT status FROM auth_invite WHERE id = ${due2.inviteId}::uuid
      `
      const [rowValid] = await sql<Array<{ status: string }>>`
        SELECT status FROM auth_invite WHERE id = ${still_valid.inviteId}::uuid
      `
      expect(row1!.status).toBe("expired")
      expect(row2!.status).toBe("expired")
      expect(rowValid!.status).toBe("pending")
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)

  it("returns 0 when no pending invites are due", async () => {
    const { adminClient, truncateAll } =
      await import("@workspace/db/tests/fixtures")
    const { expireDuePendingInvites } = await import("./invite-issuer")

    const sql = adminClient()
    try {
      await truncateAll(sql)
      // No rows in auth_invite — nothing to expire.
      const count = await expireDuePendingInvites()
      expect(count).toBe(0)
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)

  it("does not touch already-expired or revoked rows", async () => {
    const { adminClient, seedWorkspaceWithOwner, truncateAll } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp } = await import("./test-support")
    const { issueInvite, revokePendingInvites, expireDuePendingInvites } =
      await import("./invite-issuer")

    const sql = adminClient()
    try {
      await truncateAll(sql)
      const seed = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "no-double-expire-owner@test.invalid",
        password: "NoDoubleExpirePassw0rd!",
      })

      const invite = await issueInvite({
        email: "already-revoked-status@test.invalid",
        organizationId: seed.organizationId,
        role: "member",
        issuedByUserId: null,
        baseUrl: "http://localhost:3000",
        brandName: "TestBrand",
        ttlSeconds: 3600,
      })

      // Revoke it first.
      await revokePendingInvites({
        organizationId: seed.organizationId,
        email: "already-revoked-status@test.invalid",
      })

      // Backdate expires_at to simulate a due row — but status is already revoked.
      await sql`
        UPDATE auth_invite
           SET expires_at = now() - interval '1 second'
         WHERE id = ${invite.inviteId}::uuid
      `

      // expireDuePendingInvites only touches status='pending'.
      const count = await expireDuePendingInvites()
      expect(count).toBe(0)

      // Status remains revoked.
      const [row] = await sql<Array<{ status: string }>>`
        SELECT status FROM auth_invite WHERE id = ${invite.inviteId}::uuid
      `
      expect(row!.status).toBe("revoked")
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)
})

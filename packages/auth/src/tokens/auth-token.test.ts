/**
 * Integration tests for mintToken / consumeToken / revoke / expire / prune
 * — ADR-0022 §"Verification flow", §"Mandatory companions".
 *
 * Boots a real Postgres 18 testcontainer so the atomic UPDATE-WHERE-RETURNING
 * semantics and the append-only triggers are tested end-to-end, not mocked.
 *
 * AUTH_TOKEN_ENV is pinned to 'dev' for deterministic checksum derivation
 * across tests.
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
// default 5 s per-test budget on a busy CI runner. Match the limits used
// by invite-issuer.test.ts and seed-loginable-user.test.ts.
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

describe("mintToken", () => {
  it("returns a raw token matching the public regex", async () => {
    const { mintToken } = await import("./auth-token")
    const { AFKEY_REGEX } = await import("./format")
    const minted = await mintToken({ kind: "sig", payload: { email: "x@y.z" } })
    expect(minted.rawToken).toMatch(AFKEY_REGEX)
    expect(minted.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(minted.expiresAt).toBeInstanceOf(Date)
  })

  it("inserts a row with status='pending' and the expected payload", async () => {
    const { mintToken } = await import("./auth-token")
    const { adminClient } = await import("@workspace/db/tests/fixtures")
    const sql = adminClient()
    try {
      const minted = await mintToken({
        kind: "sig",
        payload: { email: "owner@test.invalid", workspace: "Acme" },
      })
      const [row] = await sql<
        Array<{
          status: string
          kind: string
          env: string
          payload: { email: string; workspace: string }
        }>
      >`SELECT status, kind, env, payload FROM auth_token WHERE id = ${minted.id}::uuid`
      expect(row?.status).toBe("pending")
      expect(row?.kind).toBe("sig")
      expect(row?.env).toBe("dev")
      expect(row?.payload).toEqual({
        email: "owner@test.invalid",
        workspace: "Acme",
      })
    } finally {
      await sql.end({ timeout: 5 })
    }
  })

  it("respects ttlSecondsOverride", async () => {
    const { mintToken } = await import("./auth-token")
    const minted = await mintToken({
      kind: "lem",
      ttlSeconds: 60,
    })
    const diffMs = minted.expiresAt.getTime() - Date.now()
    expect(diffMs).toBeGreaterThan(50_000)
    expect(diffMs).toBeLessThan(70_000)
  })

  it("stores truncated IP and hashed UA when ctx is provided", async () => {
    const { mintToken } = await import("./auth-token")
    const { adminClient } = await import("@workspace/db/tests/fixtures")
    const sql = adminClient()
    try {
      const minted = await mintToken({
        kind: "sig",
        ctx: { ip: "203.0.113.42", userAgent: "Mozilla/5.0 (test)" },
      })
      const [row] = await sql<
        Array<{
          issued_to_ip: string | null
          issued_user_agent_hash: string | null
        }>
      >`SELECT issued_to_ip, issued_user_agent_hash FROM auth_token WHERE id = ${minted.id}::uuid`
      expect(row?.issued_to_ip).toBe("203.0.113.0/24")
      expect(row?.issued_user_agent_hash).toMatch(/^[0-9a-f]{64}$/)
    } finally {
      await sql.end({ timeout: 5 })
    }
  })
})

describe("consumeToken — happy path", () => {
  it("returns the payload and flips status to 'consumed'", async () => {
    const { mintToken, consumeToken } = await import("./auth-token")
    const { adminClient } = await import("@workspace/db/tests/fixtures")
    const sql = adminClient()
    try {
      const minted = await mintToken({
        kind: "sig",
        payload: { email: "happy@test.invalid", workspace: "Acme" },
      })

      const consumed = await consumeToken<{
        email: string
        workspace: string
      }>({
        rawToken: minted.rawToken,
        expectedKind: "sig",
        ctx: { ip: "198.51.100.99", userAgent: "ua-string" },
      })

      expect(consumed).not.toBeNull()
      expect(consumed?.payload.email).toBe("happy@test.invalid")
      expect(consumed?.payload.workspace).toBe("Acme")

      const [row] = await sql<
        Array<{
          status: string
          consumed_from_ip: string | null
          consumed_user_agent_hash: string | null
        }>
      >`SELECT status, consumed_from_ip, consumed_user_agent_hash FROM auth_token WHERE id = ${minted.id}::uuid`
      expect(row?.status).toBe("consumed")
      expect(row?.consumed_from_ip).toBe("198.51.100.0/24")
      expect(row?.consumed_user_agent_hash).toMatch(/^[0-9a-f]{64}$/)
    } finally {
      await sql.end({ timeout: 5 })
    }
  })
})

describe("consumeToken — failure paths return null (single generic INVALID)", () => {
  it("returns null for a malformed raw token", async () => {
    const { consumeToken } = await import("./auth-token")
    const result = await consumeToken({
      rawToken: "not-a-real-token",
      expectedKind: "sig",
    })
    expect(result).toBeNull()
  })

  it("returns null when consumed twice (replay defense)", async () => {
    const { mintToken, consumeToken } = await import("./auth-token")
    const minted = await mintToken({ kind: "sig" })
    const first = await consumeToken({
      rawToken: minted.rawToken,
      expectedKind: "sig",
    })
    expect(first).not.toBeNull()
    const second = await consumeToken({
      rawToken: minted.rawToken,
      expectedKind: "sig",
    })
    expect(second).toBeNull()
  })

  it("returns null with the wrong expected kind (checksum mismatch)", async () => {
    const { mintToken, consumeToken } = await import("./auth-token")
    const minted = await mintToken({ kind: "sig" })
    const result = await consumeToken({
      rawToken: minted.rawToken,
      expectedKind: "inv",
    })
    expect(result).toBeNull()
  })

  it("returns null for an expired token", async () => {
    const { mintToken, consumeToken } = await import("./auth-token")
    const { adminClient } = await import("@workspace/db/tests/fixtures")
    const sql = adminClient()
    try {
      const minted = await mintToken({ kind: "sig", ttlSeconds: 60 })
      // Push expires_at into the past. Bypasses the limited-update trigger by
      // session_replication_role=replica, which only an admin can do.
      await sql.unsafe(`
        SET LOCAL session_replication_role = replica;
        UPDATE auth_token
          SET expires_at = now() - interval '1 minute'
          WHERE id = '${minted.id}';
      `)
      const result = await consumeToken({
        rawToken: minted.rawToken,
        expectedKind: "sig",
      })
      expect(result).toBeNull()
    } finally {
      await sql.end({ timeout: 5 })
    }
  })

  it("returns null for a revoked token", async () => {
    const { mintToken, consumeToken, revokeToken } =
      await import("./auth-token")
    const minted = await mintToken({ kind: "sig" })
    const revoked = await revokeToken(minted.rawToken)
    expect(revoked).toBe(true)
    const result = await consumeToken({
      rawToken: minted.rawToken,
      expectedKind: "sig",
    })
    expect(result).toBeNull()
  })
})

describe("consumeToken — atomic UPDATE under concurrent redemption", () => {
  it("only the first of two parallel consumers succeeds", async () => {
    const { mintToken, consumeToken } = await import("./auth-token")
    const minted = await mintToken({ kind: "sig" })

    const [a, b] = await Promise.all([
      consumeToken({ rawToken: minted.rawToken, expectedKind: "sig" }),
      consumeToken({ rawToken: minted.rawToken, expectedKind: "sig" }),
    ])

    const winners = [a, b].filter((x) => x !== null)
    const losers = [a, b].filter((x) => x === null)
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
  })
})

describe("revokeToken / revokeTokenById / expireDueAuthTokens", () => {
  it("revokeToken flips a pending row to 'revoked' and returns true", async () => {
    const { mintToken, revokeToken } = await import("./auth-token")
    const { adminClient } = await import("@workspace/db/tests/fixtures")
    const sql = adminClient()
    try {
      const minted = await mintToken({ kind: "inv" })
      expect(await revokeToken(minted.rawToken)).toBe(true)
      const [row] = await sql<
        Array<{ status: string }>
      >`SELECT status FROM auth_token WHERE id = ${minted.id}::uuid`
      expect(row?.status).toBe("revoked")
    } finally {
      await sql.end({ timeout: 5 })
    }
  })

  it("revokeToken returns false for an already-non-pending row", async () => {
    const { mintToken, consumeToken, revokeToken } =
      await import("./auth-token")
    const minted = await mintToken({ kind: "sig" })
    await consumeToken({ rawToken: minted.rawToken, expectedKind: "sig" })
    expect(await revokeToken(minted.rawToken)).toBe(false)
  })

  it("revokeTokenById flips a pending row by uuid", async () => {
    const { mintToken, revokeTokenById } = await import("./auth-token")
    const minted = await mintToken({ kind: "inv" })
    expect(await revokeTokenById(minted.id)).toBe(true)
  })

  it("expireDueAuthTokens transitions only past-expiry pending rows", async () => {
    const { mintToken, expireDueAuthTokens } = await import("./auth-token")
    const { adminClient } = await import("@workspace/db/tests/fixtures")
    const sql = adminClient()
    try {
      const past = await mintToken({ kind: "sig", ttlSeconds: 60 })
      const future = await mintToken({ kind: "sig", ttlSeconds: 3600 })
      // Backdate `past` so it crosses expires_at <= now().
      await sql.unsafe(`
        SET LOCAL session_replication_role = replica;
        UPDATE auth_token SET expires_at = now() - interval '1 minute'
          WHERE id = '${past.id}';
      `)

      const flipped = await expireDueAuthTokens()
      expect(flipped).toBe(1)

      const [pastRow] = await sql<
        Array<{ status: string }>
      >`SELECT status FROM auth_token WHERE id = ${past.id}::uuid`
      const [futureRow] = await sql<
        Array<{ status: string }>
      >`SELECT status FROM auth_token WHERE id = ${future.id}::uuid`
      expect(pastRow?.status).toBe("expired")
      expect(futureRow?.status).toBe("pending")
    } finally {
      await sql.end({ timeout: 5 })
    }
  })
})

describe("pruneTerminalAuthTokens", () => {
  it("deletes terminal-state rows older than the cutoff and preserves pending", async () => {
    const { mintToken, consumeToken, pruneTerminalAuthTokens } =
      await import("./auth-token")
    const { adminClient } = await import("@workspace/db/tests/fixtures")
    const sql = adminClient()
    try {
      const old = await mintToken({ kind: "sig" })
      await consumeToken({ rawToken: old.rawToken, expectedKind: "sig" })

      const fresh = await mintToken({ kind: "sig" })
      await consumeToken({ rawToken: fresh.rawToken, expectedKind: "sig" })

      const pending = await mintToken({ kind: "sig" })

      // Backdate the `old` row's issued_at deep into the past.
      await sql.unsafe(`
        SET LOCAL session_replication_role = replica;
        UPDATE auth_token SET issued_at = now() - interval '120 days'
          WHERE id = '${old.id}';
      `)

      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      const pruned = await pruneTerminalAuthTokens({ olderThan: cutoff })
      expect(pruned).toBe(1)

      const ids = await sql<
        Array<{ id: string }>
      >`SELECT id FROM auth_token ORDER BY issued_at`
      const present = ids.map((r) => r.id)
      expect(present).toContain(fresh.id)
      expect(present).toContain(pending.id)
      expect(present).not.toContain(old.id)
    } finally {
      await sql.end({ timeout: 5 })
    }
  })
})

describe("forensic helpers", () => {
  it("truncateIp /24 IPv4", async () => {
    const { truncateIp } = await import("./auth-token")
    expect(truncateIp("203.0.113.42")).toBe("203.0.113.0/24")
    expect(truncateIp("10.0.0.1")).toBe("10.0.0.0/24")
    expect(truncateIp(null)).toBeNull()
    expect(truncateIp("")).toBeNull()
    expect(truncateIp("not.an.ip.value")).toBeNull()
    expect(truncateIp("999.0.0.1")).toBeNull()
  })

  it("truncateIp /48 IPv6", async () => {
    const { truncateIp } = await import("./auth-token")
    expect(truncateIp("2001:db8:1234:5678:9abc:def0:1234:5678")).toBe(
      "2001:db8:1234::/48",
    )
    expect(truncateIp("2001:db8::1")).toBe("2001:db8:0::/48")
    expect(truncateIp("fe80::1%eth0")).toBe("fe80:0:0::/48")
  })

  it("hashUserAgent returns sha256 hex", async () => {
    const { hashUserAgent } = await import("./auth-token")
    const h = hashUserAgent("Mozilla/5.0")
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashUserAgent(null)).toBeNull()
    expect(hashUserAgent("")).toBeNull()
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

import { API_KEY_PREFIX, hashApiKey } from "./tokens/api-key"

/**
 * Unit test for `verifyApiKey` decision logic. The DB layer is mocked: the
 * test drives the rows `withAdminBypass` would return and asserts the
 * verifier's branch for each (valid / revoked / expired / unknown / bad
 * prefix). The real RLS path is exercised by the db-tier integration tests.
 */

interface ApiKeyRow {
  id: string
  organizationId: string
  workspaceId: string
  createdByUserId: string | null
  scopes: readonly string[]
  expiresAt: Date | null
  revokedAt: Date | null
}

let mockRows: ApiKeyRow[] = []
let updateShouldThrow = false
const updateWhere = vi.fn()

const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(mockRows),
      }),
    }),
  }),
  update: () => ({
    set: () => ({
      where: (...args: unknown[]) => {
        updateWhere(...args)
        if (updateShouldThrow) {
          return Promise.reject(new Error("last_used_at write failed"))
        }
        return Promise.resolve()
      },
    }),
  }),
}

vi.mock("@workspace/db", () => ({
  withAdminBypass: (fn: (db: typeof fakeDb) => unknown) => fn(fakeDb),
}))
vi.mock("@workspace/db/schema", () => ({
  api_key: { id: "id", key_hash: "key_hash" },
}))
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }))

const { verifyApiKey } = await import("./api-key-verifier")

const VALID_KEY = `${API_KEY_PREFIX}testtoken000000000000000000000000000000000`

function row(overrides: Partial<ApiKeyRow> = {}): ApiKeyRow {
  return {
    id: "key-1",
    organizationId: "org-1",
    workspaceId: "ws-1",
    createdByUserId: "user-1",
    scopes: ["read"],
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  }
}

describe("verifyApiKey", () => {
  beforeEach(() => {
    mockRows = []
    updateShouldThrow = false
    updateWhere.mockClear()
  })

  it("rejects a key without the affk_ prefix without touching the DB", async () => {
    mockRows = [row()]
    expect(await verifyApiKey("not-an-api-key")).toBeNull()
    // The DB was never consulted — last_used_at was not touched.
    expect(updateWhere).not.toHaveBeenCalled()
  })

  it("returns null for an unknown key", async () => {
    mockRows = []
    expect(await verifyApiKey(VALID_KEY)).toBeNull()
  })

  it("returns null for a revoked key", async () => {
    mockRows = [row({ revokedAt: new Date("2026-01-01") })]
    expect(await verifyApiKey(VALID_KEY)).toBeNull()
  })

  it("returns null for an expired key", async () => {
    mockRows = [row({ expiresAt: new Date(Date.now() - 1000) })]
    expect(await verifyApiKey(VALID_KEY)).toBeNull()
  })

  it("resolves a valid key into a principal and touches last_used_at", async () => {
    mockRows = [row({ expiresAt: new Date(Date.now() + 60_000) })]
    const principal = await verifyApiKey(VALID_KEY)
    expect(principal).toEqual({
      userId: "user-1",
      organizationId: "org-1",
      workspaceId: "ws-1",
      scopes: ["read"],
    })
    expect(updateWhere).toHaveBeenCalledTimes(1)
  })

  it("still resolves the principal when the last_used_at touch fails", async () => {
    mockRows = [row()]
    updateShouldThrow = true
    const principal = await verifyApiKey(VALID_KEY)
    // Best-effort: a failed audit-timestamp write must not reject a valid key.
    expect(principal?.organizationId).toBe("org-1")
    expect(updateWhere).toHaveBeenCalledTimes(1)
  })

  it("carries a null userId through for a key with no creating user", async () => {
    mockRows = [row({ createdByUserId: null })]
    const principal = await verifyApiKey(VALID_KEY)
    expect(principal?.userId).toBeNull()
  })

  it("hashApiKey is a stable 64-char sha256 hex", () => {
    const hash = hashApiKey(VALID_KEY)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashApiKey(VALID_KEY)).toBe(hash)
  })
})

/**
 * Unit tests for permissions-drain lane.
 *
 * Use a FakeOpenFgaClient + an in-memory transaction mock instead of a
 * real OpenFGA + Postgres. Real-DB integration is covered by the
 * three-layer AuthGuard tests in apps/api/tests/authz/ (Commit 10).
 *
 * These tests pin the payload-transform contract from ADR-0018:
 *   { op, object, relation, user, subject_id, condition? }
 * and the idempotency + error-budget semantics.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { drainBatch } from "../lanes/permissions-drain"

// Mock withAdminBypass so the test runs without a database.
const txExecute = vi.fn()

vi.mock("@workspace/db/tenancy", () => ({
  withAdminBypass: async (fn: (tx: { execute: typeof txExecute }) => unknown) =>
    fn({ execute: txExecute }),
}))

interface FakeClient {
  write: ReturnType<typeof vi.fn>
}

function makeClient(): FakeClient {
  return { write: vi.fn(async () => undefined) }
}

const NOW = new Date("2026-05-14T12:00:00Z")

beforeEach(() => {
  txExecute.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("permissions-drain — drainBatch", () => {
  it("transforms a write op into an OpenFGA write tuple", async () => {
    const client = makeClient()
    txExecute
      .mockResolvedValueOnce([
        {
          id: "00000000-0000-7000-8000-000000000001",
          payload: {
            op: "write",
            object: "invoice:inv-1",
            relation: "viewer",
            user: "user:alice",
            subject_id: "00000000-0000-7000-8000-00000000beef",
          },
          attempts: 0,
        },
      ])
      .mockResolvedValueOnce([]) // UPDATE returns 0 rows in pg

    const result = await drainBatch({
      client: client as unknown as Parameters<typeof drainBatch>[0]["client"],
      now: () => NOW,
    })

    expect(result).toEqual({ processed: 1, failed: 0 })
    expect(client.write).toHaveBeenCalledWith({
      writes: [
        {
          user: "user:alice",
          relation: "viewer",
          object: "invoice:inv-1",
        },
      ],
    })
  })

  it("transforms a delete op into an OpenFGA delete tuple", async () => {
    const client = makeClient()
    txExecute
      .mockResolvedValueOnce([
        {
          id: "00000000-0000-7000-8000-000000000002",
          payload: {
            op: "delete",
            object: "file:f-1",
            relation: "editor",
            user: "user:bob",
            subject_id: "00000000-0000-7000-8000-00000000beef",
          },
          attempts: 0,
        },
      ])
      .mockResolvedValueOnce([])

    await drainBatch({
      client: client as unknown as Parameters<typeof drainBatch>[0]["client"],
      now: () => NOW,
    })

    expect(client.write).toHaveBeenCalledWith({
      deletes: [{ user: "user:bob", relation: "editor", object: "file:f-1" }],
    })
  })

  it("forwards an ABAC condition when present on the payload", async () => {
    const client = makeClient()
    txExecute
      .mockResolvedValueOnce([
        {
          id: "00000000-0000-7000-8000-000000000003",
          payload: {
            op: "write",
            object: "invoice:inv-2",
            relation: "viewer",
            user: "user:auditor",
            subject_id: "00000000-0000-7000-8000-00000000beef",
            condition: {
              name: "expires_at",
              context: { iso8601: "2026-12-31T00:00:00Z" },
            },
          },
          attempts: 0,
        },
      ])
      .mockResolvedValueOnce([])

    await drainBatch({
      client: client as unknown as Parameters<typeof drainBatch>[0]["client"],
      now: () => NOW,
    })

    expect(client.write).toHaveBeenCalledWith({
      writes: [
        {
          user: "user:auditor",
          relation: "viewer",
          object: "invoice:inv-2",
          condition: {
            name: "expires_at",
            context: { iso8601: "2026-12-31T00:00:00Z" },
          },
        },
      ],
    })
  })

  it("bumps attempts + last_error when the SDK throws", async () => {
    const client = makeClient()
    client.write.mockRejectedValueOnce(new Error("openfga unreachable"))
    txExecute
      .mockResolvedValueOnce([
        {
          id: "00000000-0000-7000-8000-000000000004",
          payload: {
            op: "write",
            object: "invoice:inv-3",
            relation: "viewer",
            user: "user:carol",
            subject_id: "00000000-0000-7000-8000-00000000beef",
          },
          attempts: 0,
        },
      ])
      .mockResolvedValueOnce([])

    const result = await drainBatch({
      client: client as unknown as Parameters<typeof drainBatch>[0]["client"],
      now: () => NOW,
    })

    expect(result).toEqual({ processed: 0, failed: 0 })
    const updateCall = txExecute.mock.calls[1]?.[0] as {
      queryChunks: unknown[]
    }
    const sqlText = JSON.stringify(updateCall)
    expect(sqlText).toContain("openfga unreachable")
    // attempts went 0 -> 1; not failed yet.
    expect(sqlText).toContain("1")
  })

  it("marks failed_at after MAX_ATTEMPTS retries", async () => {
    const client = makeClient()
    client.write.mockRejectedValueOnce(new Error("still failing"))
    txExecute
      .mockResolvedValueOnce([
        {
          id: "00000000-0000-7000-8000-000000000005",
          payload: {
            op: "write",
            object: "invoice:inv-4",
            relation: "viewer",
            user: "user:dave",
            subject_id: "00000000-0000-7000-8000-00000000beef",
          },
          attempts: 4, // next attempt is the 5th, hits MAX
        },
      ])
      .mockResolvedValueOnce([])

    const result = await drainBatch({
      client: client as unknown as Parameters<typeof drainBatch>[0]["client"],
      now: () => NOW,
    })

    expect(result).toEqual({ processed: 0, failed: 1 })
  })

  it("rejects malformed payloads with a clear error budget", async () => {
    const client = makeClient()
    txExecute
      .mockResolvedValueOnce([
        {
          id: "00000000-0000-7000-8000-000000000006",
          payload: { op: "write" }, // missing required fields
          attempts: 0,
        },
      ])
      .mockResolvedValueOnce([])

    const result = await drainBatch({
      client: client as unknown as Parameters<typeof drainBatch>[0]["client"],
      now: () => NOW,
    })

    // Bad payload counts as a retryable error; same as SDK throw. The bad
    // row will exhaust attempts and dead-letter to failed_at after 5 cycles.
    expect(result).toEqual({ processed: 0, failed: 0 })
    expect(client.write).not.toHaveBeenCalled()
  })

  it("returns 0 processed when no rows are ready", async () => {
    const client = makeClient()
    txExecute.mockResolvedValueOnce([])

    const result = await drainBatch({
      client: client as unknown as Parameters<typeof drainBatch>[0]["client"],
      now: () => NOW,
    })

    expect(result).toEqual({ processed: 0, failed: 0 })
    expect(client.write).not.toHaveBeenCalled()
  })
})

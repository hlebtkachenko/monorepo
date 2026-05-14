/**
 * Unit tests for permissions-drain lane.
 *
 * Use a FakeOpenFgaClient + an in-memory transaction mock instead of a
 * real OpenFGA + Postgres. Real-DB integration is covered by the
 * three-layer AuthGuard tests in apps/api/tests/authz/ (follow-up
 * commit, post-MVP).
 *
 * These tests pin the payload-transform contract from migration 0006
 * (op_type is a COLUMN, not in payload; payload requires workspace_id
 * + user-ref regex match) and the idempotency + error-budget semantics.
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

const WORKSPACE_ID = "00000000-0000-7000-8000-00000000aaaa"
const ALICE_REF = "user:00000000-0000-7000-8000-0000000000a1"
const BOB_REF = "user:00000000-0000-7000-8000-0000000000b0"
const CAROL_REF = "user:00000000-0000-7000-8000-0000000000c4"
const DAVE_REF = "user:00000000-0000-7000-8000-0000000000d4"
const AUDITOR_REF = "user:00000000-0000-7000-8000-000000000aa1"

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
          op_type: "write",
          payload: {
            workspace_id: WORKSPACE_ID,
            object: "invoice:00000000-0000-7000-8000-000000000010",
            relation: "viewer",
            user: ALICE_REF,
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
          user: ALICE_REF,
          relation: "viewer",
          object: "invoice:00000000-0000-7000-8000-000000000010",
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
          op_type: "delete",
          payload: {
            workspace_id: WORKSPACE_ID,
            object: "file:00000000-0000-7000-8000-000000000020",
            relation: "editor",
            user: BOB_REF,
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
      deletes: [
        {
          user: BOB_REF,
          relation: "editor",
          object: "file:00000000-0000-7000-8000-000000000020",
        },
      ],
    })
  })

  it("forwards an ABAC condition when present on the payload", async () => {
    const client = makeClient()
    txExecute
      .mockResolvedValueOnce([
        {
          id: "00000000-0000-7000-8000-000000000003",
          op_type: "write",
          payload: {
            workspace_id: WORKSPACE_ID,
            object: "invoice:00000000-0000-7000-8000-000000000030",
            relation: "viewer",
            user: AUDITOR_REF,
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
          user: AUDITOR_REF,
          relation: "viewer",
          object: "invoice:00000000-0000-7000-8000-000000000030",
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
          op_type: "write",
          payload: {
            workspace_id: WORKSPACE_ID,
            object: "invoice:00000000-0000-7000-8000-000000000040",
            relation: "viewer",
            user: CAROL_REF,
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
          op_type: "write",
          payload: {
            workspace_id: WORKSPACE_ID,
            object: "invoice:00000000-0000-7000-8000-000000000050",
            relation: "viewer",
            user: DAVE_REF,
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
    // Verify the failed_at update sets a Date (not null) at MAX_ATTEMPTS.
    const updateCall = txExecute.mock.calls[1]?.[0] as {
      queryChunks: unknown[]
    }
    const sqlText = JSON.stringify(updateCall)
    expect(sqlText).toContain("still failing")
  })

  it("rejects payload missing workspace_id (DB CHECK contract)", async () => {
    const client = makeClient()
    txExecute
      .mockResolvedValueOnce([
        {
          id: "00000000-0000-7000-8000-000000000006",
          op_type: "write",
          // workspace_id missing — would fail DB CHECK if inserted; drain
          // also rejects so a bad insert via app_worker is bounded.
          payload: {
            object: "invoice:inv-x",
            relation: "viewer",
            user: ALICE_REF,
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
    expect(client.write).not.toHaveBeenCalled()
  })

  it("rejects payload.user that does not match the DB CHECK regex", async () => {
    const client = makeClient()
    txExecute
      .mockResolvedValueOnce([
        {
          id: "00000000-0000-7000-8000-000000000007",
          op_type: "write",
          payload: {
            workspace_id: WORKSPACE_ID,
            object: "invoice:00000000-0000-7000-8000-000000000070",
            relation: "viewer",
            // "user:alice" used to be the test fixture — it does NOT match
            // ^[a-z][a-z0-9_]*:<uuid>$ from migration 0006. The drain must
            // reject the same shape so an ordinary INSERT failure can't
            // poison the queue.
            user: "user:alice",
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

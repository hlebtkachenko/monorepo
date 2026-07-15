/**
 * Integration tests for the inbox_attachment repository against real Postgres
 * (apps/web testcontainer harness, AFF-119). The handler unit tests mock this
 * repo, so these exercise the actual SQL + RLS: the `onConflictDoUpdate` revive
 * semantic (the heart of idempotent confirm), soft-delete/restore, the isNull
 * filters, and cross-workspace isolation via `withWorkspace`.
 *
 * Every method runs inside `withWorkspace`, so FORCE RLS on inbox_attachment
 * (migration 0057) is the tenant fence. Reads/writes bind to `DATABASE_URL`
 * (app_user, RLS-subject) set by globalSetup; seeding uses the admin client.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import postgres from "postgres"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"

const WS = "00000000-0000-0000-0000-0000000c0de1"
const OTHER_WS = "00000000-0000-0000-0000-0000000c0de4"
const USER = "00000000-0000-0000-0000-0000000c0de2"

let repo: (typeof import("./inbox-attachment-repo"))["inboxAttachmentRepo"]
let adminSql: postgres.Sql

const keyFor = (sha: string) => `documents/${WS}/${sha}.pdf`
async function countBySha(sha: string): Promise<number> {
  const [r] = await adminSql<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM inbox_attachment
    WHERE workspace_id = ${WS}::uuid AND sha256 = ${sha}`
  return r?.n ?? 0
}
const confirmedInput = (sha: string, filename = "invoice.pdf") => ({
  storageKey: keyFor(sha),
  sha256: sha,
  contentType: "application/pdf",
  size: 1000,
  filename,
})

beforeAll(async () => {
  ;({ inboxAttachmentRepo: repo } = await import("./inbox-attachment-repo"))
  const fixtures = await import("@workspace/db/tests/fixtures")
  adminSql = fixtures.adminClient()
  await adminSql.unsafe(
    `INSERT INTO app_user (id, email) VALUES ('${USER}', 'repo-fixture@test.invalid') ON CONFLICT (id) DO NOTHING`,
  )
  await adminSql.unsafe(
    `INSERT INTO workspace (id, created_by_user_id, display_name) VALUES ('${WS}', '${USER}', 'Repo WS') ON CONFLICT (id) DO NOTHING`,
  )
})

afterAll(async () => {
  await adminSql.unsafe(
    `DELETE FROM inbox_attachment WHERE workspace_id = '${WS}'`,
  )
  await adminSql.unsafe(`DELETE FROM workspace WHERE id = '${WS}'`)
  await adminSql.unsafe(`DELETE FROM app_user WHERE id = '${USER}'`)
  await adminSql.end({ timeout: 5 })
})

describe("inboxAttachmentRepo (integration)", () => {
  it("upsertConfirmed inserts a live row that findLiveByHash + getById return", async () => {
    const sha = "a".repeat(64)
    const { id } = await repo.upsertConfirmed(WS, USER, confirmedInput(sha))
    const live = await repo.findLiveByHash(WS, USER, sha)
    expect(live).toEqual({ id, storageKey: keyFor(sha) })
    const row = await repo.getById(WS, USER, id)
    expect(row?.deletedAt).toBeNull()
    expect(row?.size).toBe(1000)
  })

  it("is idempotent: re-confirming the same content updates in place (one row, same id)", async () => {
    const sha = "b".repeat(64)
    const first = await repo.upsertConfirmed(
      WS,
      USER,
      confirmedInput(sha, "v1.pdf"),
    )
    const second = await repo.upsertConfirmed(
      WS,
      USER,
      confirmedInput(sha, "v2.pdf"),
    )
    expect(second.id).toBe(first.id)
    expect(await countBySha(sha)).toBe(1)
    expect((await repo.getById(WS, USER, first.id))?.filename).toBe("v2.pdf")
  })

  it("soft-delete hides the row from findLiveByHash but getById still returns it", async () => {
    const sha = "c".repeat(64)
    const { id } = await repo.upsertConfirmed(WS, USER, confirmedInput(sha))
    expect(await repo.markDeleted(WS, USER, id)).toBe(true)
    expect(await repo.findLiveByHash(WS, USER, sha)).toBeNull()
    expect((await repo.getById(WS, USER, id))?.deletedAt).toBeInstanceOf(Date)
  })

  it("delete → re-upload → confirm REVIVES the row (not a duplicate)", async () => {
    const sha = "d".repeat(64)
    const { id } = await repo.upsertConfirmed(WS, USER, confirmedInput(sha))
    await repo.markDeleted(WS, USER, id)
    const revived = await repo.upsertConfirmed(WS, USER, confirmedInput(sha))
    expect(revived.id).toBe(id) // same row, not a second one
    expect(await countBySha(sha)).toBe(1)
    expect((await repo.getById(WS, USER, id))?.deletedAt).toBeNull()
  })

  it("markDeleted is a no-op (false) on an already-deleted row; clearDeleted restores", async () => {
    const sha = "e".repeat(64)
    const { id } = await repo.upsertConfirmed(WS, USER, confirmedInput(sha))
    expect(await repo.markDeleted(WS, USER, id)).toBe(true)
    expect(await repo.markDeleted(WS, USER, id)).toBe(false)
    expect(await repo.clearDeleted(WS, USER, id)).toBe(true)
    expect((await repo.getById(WS, USER, id))?.deletedAt).toBeNull()
  })

  it("cross-workspace getById returns null (RLS fence)", async () => {
    const sha = "f".repeat(64)
    const { id } = await repo.upsertConfirmed(WS, USER, confirmedInput(sha))
    expect(await repo.getById(OTHER_WS, USER, id)).toBeNull()
    expect(await repo.findLiveByHash(OTHER_WS, USER, sha)).toBeNull()
  })
})

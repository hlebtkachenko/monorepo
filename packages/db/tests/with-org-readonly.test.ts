import { afterAll, beforeAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { sql } from "drizzle-orm"
import { withOrgReadonly } from "../src/tenancy.js"
import { truncateAll } from "./fixtures.js"

/**
 * withOrgReadonly binds the same org-tier GUCs as withOrganization (ADR-0010)
 * but additionally runs the transaction READ ONLY.
 *
 * Proves three things against a real Postgres:
 *   1. `app.organization_id` + derived `app.workspace_id` are bound inside `fn`
 *      (identical binding to withOrganization — same rows, tenant boundary).
 *   2. `SHOW transaction_read_only` is `on` inside `fn` (SET TRANSACTION READ
 *      ONLY took effect and did not reject the subsequent set_config binds).
 *   3. A write inside `fn` is rejected by the read-only transaction — the
 *      callback provably cannot mutate.
 */

let adminSql: postgres.Sql

const getAdminUrl = () => {
  const url = process.env["DATABASE_DIRECT_URL"]
  if (!url) throw new Error("DATABASE_DIRECT_URL not set")
  return url
}

/** Flatten an error's `.cause` chain into one searchable string. */
function errorChainText(err: unknown): string {
  const parts: string[] = []
  let cur: unknown = err
  for (let depth = 0; cur != null && depth < 6; depth++) {
    if (cur instanceof Error) {
      parts.push(cur.message)
      cur = (cur as { cause?: unknown }).cause
    } else {
      parts.push(String(cur))
      break
    }
  }
  return parts.join(" | ")
}

async function seedOrg(prefix: string): Promise<{
  orgId: string
  workspaceId: string
  userId: string
}> {
  const [creator] = await adminSql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${`${prefix}-creator@test.invalid`}, ${`${prefix} Creator`}, 'user')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `
  if (!creator) throw new Error("Failed to create creator user")

  const [workspace] = await adminSql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES (${`${prefix} Workspace`}, ${creator.id})
    RETURNING id
  `
  if (!workspace) throw new Error("Failed to create workspace")

  const [org] = await adminSql<Array<{ id: string }>>`
    INSERT INTO organization (organization_id, workspace_id, slug, legal_name, person_kind, legal_subject_kind)
    VALUES (uuidv7(), ${workspace.id}, ${prefix}, ${`${prefix} Org`}, 'legal_entity', 'for_profit')
    RETURNING id
  `
  if (!org) throw new Error("Failed to create organization")
  // organization_id must equal id (trigger enforces this invariant).
  await adminSql`UPDATE organization SET organization_id = id WHERE id = ${org.id}::uuid`

  const [user] = await adminSql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${`${prefix}-user@test.invalid`}, ${`${prefix} User`}, 'user')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `
  if (!user) throw new Error("Failed to create user")

  return { orgId: org.id, workspaceId: workspace.id, userId: user.id }
}

beforeAll(() => {
  adminSql = postgres(getAdminUrl(), {
    prepare: false,
    max: 1,
    onnotice: () => {},
  })
})

afterAll(async () => {
  await truncateAll(adminSql)
  await adminSql.end({ timeout: 5 })
})

describe("withOrgReadonly", () => {
  it("binds app.organization_id + derived app.workspace_id and runs READ ONLY", async () => {
    const { orgId, workspaceId, userId } = await seedOrg("readonly-bind")

    const observed = await withOrgReadonly(orgId, userId, async (boundDb) => {
      const rows = (await boundDb.execute(
        sql`SELECT
              current_setting('app.organization_id', true) AS oid,
              current_setting('app.workspace_id', true)    AS ws,
              current_setting('app.user_id', true)         AS uid,
              current_setting('transaction_read_only')     AS ro`,
      )) as unknown as Array<{
        oid: string
        ws: string
        uid: string
        ro: string
      }>
      return rows[0] ?? null
    })

    expect(observed?.oid).toBe(orgId)
    expect(observed?.ws).toBe(workspaceId)
    expect(observed?.uid).toBe(userId)
    expect(observed?.ro).toBe("on")
  })

  it("rejects a write inside the read-only transaction", async () => {
    const { orgId, userId } = await seedOrg("readonly-write")

    let caught: unknown
    try {
      await withOrgReadonly(orgId, userId, async (boundDb) => {
        // Global table (no org RLS), so the failure is the read-only guard, not
        // a policy or grant. A read-only transaction blocks any INSERT.
        await boundDb.execute(
          sql`INSERT INTO app_user (email, name, role)
              VALUES ('readonly-write-blocked@test.invalid', 'blocked', 'user')`,
        )
      })
    } catch (err) {
      caught = err
    }

    // Drizzle wraps the driver error ("Failed query: ...") and puts the real
    // Postgres "cannot execute INSERT in a read-only transaction" (SQLSTATE
    // 25006) on the cause chain — walk it.
    expect(caught).toBeDefined()
    expect(errorChainText(caught)).toMatch(/read-only transaction/i)
  })

  it("throws when the organization is not found", async () => {
    const fakeOrgId = "00000000-0000-0000-0000-000000000000"

    await expect(
      withOrgReadonly(fakeOrgId, null, async () => "should not reach"),
    ).rejects.toThrow(`withOrgReadonly: organization not found: ${fakeOrgId}`)
  })
})

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { sql } from "drizzle-orm"
import { withOrganization, withWorkspace } from "../src/tenancy.js"
import { truncateAll } from "./fixtures.js"

/**
 * withWorkspace + withOrganization set app.app_user_role_name per transaction.
 *
 * RDS rejects ALTER ROLE/DATABASE SET for custom GUCs (requires true SUPERUSER;
 * rds_superuser is not enough), so connection-level defaults from
 * init.d/00-roles.sql cannot be applied. The helpers SET LOCAL the GUC on
 * entry so the `app_prevent_last_owner_demotion` trigger sees a non-NULL value
 * on every workspace_membership write that flows through them.
 */

let adminSql: postgres.Sql

const getAdminUrl = () => {
  const url = process.env["DATABASE_DIRECT_URL"]
  if (!url) throw new Error("DATABASE_DIRECT_URL not set")
  return url
}

beforeAll(async () => {
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

describe("withWorkspace — sets app.app_user_role_name GUC", () => {
  it("exposes 'app_user' inside the callback", async () => {
    const [creator] = await adminSql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('role-guc-ws-creator@test.invalid', 'Role GUC WS Creator', 'user')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `
    if (!creator) throw new Error("Failed to create creator user")

    const [workspace] = await adminSql<Array<{ id: string }>>`
      INSERT INTO workspace (display_name, created_by_user_id)
      VALUES ('Role GUC WS Workspace', ${creator.id})
      RETURNING id
    `
    if (!workspace) throw new Error("Failed to create workspace")

    const observed = await withWorkspace(
      workspace.id,
      creator.id,
      async (boundDb) => {
        const rows = (await boundDb.execute<{ role_name: string }>(
          sql`SELECT current_setting('app.app_user_role_name', true) AS role_name`,
        )) as unknown as Array<{ role_name: string }>
        return rows[0]?.role_name ?? null
      },
    )

    expect(observed).toBe("app_user")
  })
})

describe("withOrganization — sets app.app_user_role_name GUC", () => {
  it("exposes 'app_user' inside the callback", async () => {
    const [creator] = await adminSql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('role-guc-org-creator@test.invalid', 'Role GUC Org Creator', 'user')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `
    if (!creator) throw new Error("Failed to create creator user")

    const [workspace] = await adminSql<Array<{ id: string }>>`
      INSERT INTO workspace (display_name, created_by_user_id)
      VALUES ('Role GUC Org Workspace', ${creator.id})
      RETURNING id
    `
    if (!workspace) throw new Error("Failed to create workspace")

    const [org] = await adminSql<Array<{ id: string }>>`
      INSERT INTO organization (organization_id, workspace_id, slug, legal_name, person_kind, legal_subject_kind)
      VALUES (uuidv7(), ${workspace.id}, 'role-guc-org', 'Role GUC Org', 'legal_entity', 'for_profit')
      RETURNING id
    `
    if (!org) throw new Error("Failed to create org")
    await adminSql`UPDATE organization SET organization_id = id WHERE id = ${org.id}::uuid`

    const observed = await withOrganization(
      org.id,
      creator.id,
      async (boundDb) => {
        const rows = (await boundDb.execute<{ role_name: string }>(
          sql`SELECT current_setting('app.app_user_role_name', true) AS role_name`,
        )) as unknown as Array<{ role_name: string }>
        return rows[0]?.role_name ?? null
      },
    )

    expect(observed).toBe("app_user")
  })
})

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { sql } from "drizzle-orm"
import { withOrganization } from "../src/tenancy.js"
import { truncateAll } from "./fixtures.js"

/**
 * withOrganization derives workspace_id from the organization row (ADR-0010).
 *
 * Verifies that calling `withOrganization(orgId, userId, ...)` automatically
 * sets `app.workspace_id` to the value found on the organization row, without
 * the caller providing the workspace ID explicitly.
 *
 * This is a load-bearing behavior: workspace-tier RLS policies use
 * `app.workspace_id`. If `withOrganization` fails to derive and set it, any
 * workspace-scoped policy on a table accessed inside `fn` will silently
 * return no rows instead of raising an error, breaking tenant isolation in
 * the workspace tier.
 */

let adminSql: postgres.Sql
let userSql: postgres.Sql

const getAdminUrl = () => {
  const url = process.env["DATABASE_DIRECT_URL"]
  if (!url) throw new Error("DATABASE_DIRECT_URL not set")
  return url
}

const getUserUrl = () => {
  const url = process.env["DATABASE_URL"]
  if (!url) throw new Error("DATABASE_URL not set")
  return url
}

beforeAll(async () => {
  adminSql = postgres(getAdminUrl(), {
    prepare: false,
    max: 1,
    onnotice: () => {},
  })
  userSql = postgres(getUserUrl(), {
    prepare: false,
    max: 1,
    onnotice: () => {},
  })

  // Set the app_user_role_name GUC on the connection so the last-owner
  // demotion trigger resolves correctly (it reads this GUC to distinguish
  // app_user from app_admin). Without it the trigger fails closed.
  await userSql.unsafe(`SET app.app_user_role_name = 'app_user'`)
})

afterAll(async () => {
  await truncateAll(adminSql)
  await adminSql.end({ timeout: 5 })
  await userSql.end({ timeout: 5 })
})

describe("withOrganization — workspace derivation", () => {
  it("sets app.workspace_id inside the callback to the organization workspace_id", async () => {
    // Seed: creator user
    const [creator] = await adminSql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('derives-workspace-creator@test.invalid', 'Derives Workspace Creator', 'user')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `
    if (!creator) throw new Error("Failed to create creator user")

    // Seed: workspace
    const [workspace] = await adminSql<Array<{ id: string }>>`
      INSERT INTO workspace (display_name, created_by_user_id)
      VALUES ('Derives-Workspace Test Workspace', ${creator.id})
      RETURNING id
    `
    if (!workspace) throw new Error("Failed to create workspace")
    const workspaceId = workspace.id

    // Seed: organization linked to the workspace
    // person_kind='legal_entity' requires legal_subject_kind NOT NULL
    // (CONSTRAINT organization_person_subject_consistency in 0003_rls_force.sql)
    const [org] = await adminSql<Array<{ id: string }>>`
      INSERT INTO organization (organization_id, workspace_id, slug, legal_name, person_kind, legal_subject_kind)
      VALUES (uuidv7(), ${workspaceId}, 'derives-ws-org', 'Derives Workspace Org', 'legal_entity', 'for_profit')
      RETURNING id
    `
    if (!org) throw new Error("Failed to create organization")
    const orgId = org.id

    // Enforce: organization_id must equal id (trigger enforces this invariant)
    await adminSql`
      UPDATE organization SET organization_id = id WHERE id = ${orgId}::uuid
    `

    // Seed: user with workspace membership (needed for workspace-tier policies)
    const [user] = await adminSql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('derives-workspace-user@test.invalid', 'Derives Workspace User', 'user')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `
    if (!user) throw new Error("Failed to create user")
    const userId = user.id

    // Act: call withOrganization and read back the derived GUC from inside the callback
    const derivedWorkspaceId = await withOrganization(
      orgId,
      userId,
      async (boundDb) => {
        const rows = (await boundDb.execute<{ ws: string }>(
          sql`SELECT current_setting('app.workspace_id', true) AS ws`,
        )) as unknown as Array<{ ws: string }>
        return rows[0]?.ws ?? null
      },
    )

    expect(derivedWorkspaceId).toBe(workspaceId)
  })

  it("sets app.organization_id inside the callback", async () => {
    // Seed: creator
    const [creator] = await adminSql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('org-id-check-creator@test.invalid', 'OrgId Check Creator', 'user')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `
    if (!creator) throw new Error("Failed to create creator")

    const [workspace] = await adminSql<Array<{ id: string }>>`
      INSERT INTO workspace (display_name, created_by_user_id)
      VALUES ('OrgId Check Workspace', ${creator.id})
      RETURNING id
    `
    if (!workspace) throw new Error("Failed to create workspace")

    // person_kind='legal_entity' requires legal_subject_kind NOT NULL
    const [org] = await adminSql<Array<{ id: string }>>`
      INSERT INTO organization (organization_id, workspace_id, slug, legal_name, person_kind, legal_subject_kind)
      VALUES (uuidv7(), ${workspace.id}, 'org-id-check', 'OrgId Check Org', 'legal_entity', 'for_profit')
      RETURNING id
    `
    if (!org) throw new Error("Failed to create org")
    await adminSql`UPDATE organization SET organization_id = id WHERE id = ${org.id}::uuid`

    const [user] = await adminSql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('org-id-check-user@test.invalid', 'OrgId Check User', 'user')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `
    if (!user) throw new Error("Failed to create user")

    const observedOrgId = await withOrganization(
      org.id,
      user.id,
      async (boundDb) => {
        const rows = (await boundDb.execute<{ oid: string }>(
          sql`SELECT current_setting('app.organization_id', true) AS oid`,
        )) as unknown as Array<{ oid: string }>
        return rows[0]?.oid ?? null
      },
    )

    expect(observedOrgId).toBe(org.id)
  })

  it("throws when organization is not found", async () => {
    const fakeOrgId = "00000000-0000-0000-0000-000000000000"

    await expect(
      withOrganization(fakeOrgId, null, async () => {
        return "should not reach"
      }),
    ).rejects.toThrow(`withOrganization: organization not found: ${fakeOrgId}`)
  })
})

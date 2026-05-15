/**
 * Onboarding flow integration tests.
 *
 * Walks the exact DB sequence the apps/web owner + member onboarding
 * actions perform, against a live Postgres 18 testcontainer:
 *
 *   - schema sanity: migration 0013 added workspace.plan, dropped
 *     workspace_billing.plan, kept all four enums from migration 0012
 *   - owner wizard: step 1 → step 7 writes against app_user + workspace +
 *     workspace_membership land on the right columns + timestamps
 *   - member wizard: invite-accept materializes workspace_membership +
 *     organization_membership for an existing organization
 *
 * The tests use the admin (superuser) client so RLS does not gate seeding
 * — onboarding actions in apps/web run under `withAdminBypass` for the
 * pre-tenancy steps, which is equivalent.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import postgres from "postgres"
import { adminClient, truncateAll } from "./fixtures.js"

let sql: postgres.Sql

beforeAll(async () => {
  sql = adminClient()
})

afterAll(async () => {
  await truncateAll(sql)
  await sql.end({ timeout: 5 })
})

beforeEach(async () => {
  await truncateAll(sql)
})

describe("schema — migration 0013_workspace_plan_column", () => {
  it("workspace.plan column exists with billing_plan type + 'starter' default", async () => {
    const rows = await sql<
      Array<{
        data_type: string
        udt_name: string
        column_default: string | null
      }>
    >`
      SELECT data_type, udt_name, column_default
      FROM information_schema.columns
      WHERE table_name = 'workspace' AND column_name = 'plan'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]!.udt_name).toBe("billing_plan")
    expect(rows[0]!.column_default).toContain("starter")
  })

  it("workspace_billing.plan column was dropped", async () => {
    const rows = await sql<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'workspace_billing' AND column_name = 'plan'
    `
    expect(rows).toHaveLength(0)
  })

  it("workspace.use_case + team_size columns exist with their enums", async () => {
    const rows = await sql<Array<{ column_name: string; udt_name: string }>>`
      SELECT column_name, udt_name
      FROM information_schema.columns
      WHERE table_name = 'workspace'
        AND column_name IN ('use_case', 'team_size')
      ORDER BY column_name
    `
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      column_name: "team_size",
      udt_name: "workspace_team_size",
    })
    expect(rows[1]).toEqual({
      column_name: "use_case",
      udt_name: "workspace_use_case",
    })
  })

  it("app_user.experience column exists with app_user_experience enum", async () => {
    const rows = await sql<Array<{ udt_name: string }>>`
      SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'app_user' AND column_name = 'experience'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]!.udt_name).toBe("app_user_experience")
  })
})

describe("owner onboarding — DB write sequence", () => {
  it("walks step 1 → step 7 with the right column writes and timestamps", async () => {
    // Step 3 outcome: BA creates app_user. Simulate with a direct INSERT.
    const [user] = await sql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('owner@onboarding.invalid', 'Owner User', 'user')
      RETURNING id
    `
    expect(user).toBeDefined()
    const userId = user!.id

    // After step 3, the action writes profile + experience + display_name +
    // phone + locale + timezone + profile_completed_at = now() to app_user.
    await sql`
      UPDATE app_user
      SET
        display_name = 'Owner User',
        phone = '+420123456789',
        locale = 'en',
        timezone = 'Europe/Prague',
        experience = 'accountant',
        profile_completed_at = now(),
        updated_at = now()
      WHERE id = ${userId}::uuid
    `

    const [afterStep3] = await sql<
      Array<{
        experience: string | null
        profile_completed_at: Date | null
        locale: string
        timezone: string
        phone: string | null
      }>
    >`
      SELECT experience, profile_completed_at, locale, timezone, phone
      FROM app_user WHERE id = ${userId}::uuid
    `
    expect(afterStep3!.experience).toBe("accountant")
    expect(afterStep3!.profile_completed_at).not.toBeNull()
    expect(afterStep3!.locale).toBe("en")
    expect(afterStep3!.timezone).toBe("Europe/Prague")
    expect(afterStep3!.phone).toBe("+420123456789")

    // Step 4: INSERT workspace + owner workspace_membership.
    const [workspaceRow] = await sql<Array<{ id: string }>>`
      INSERT INTO workspace (
        display_name, contact_email, use_case, team_size,
        created_by_user_id, step_1_completed_at
      )
      VALUES (
        'Northwind Accounting',
        'owner@onboarding.invalid',
        'firm',
        'sm',
        ${userId}::uuid,
        now()
      )
      RETURNING id
    `
    expect(workspaceRow).toBeDefined()
    const workspaceId = workspaceRow!.id

    // Trigger requires app.app_user_role_name GUC + non-app_user role for
    // owner inserts. Apps/web takes this path via `withAdminBypass` which
    // SET LOCAL ROLE app_admin. Mirror it here.
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE app_admin`)
      await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
      await tx.unsafe(
        `INSERT INTO workspace_membership (workspace_id, user_id, role)
         VALUES ('${workspaceId}'::uuid, '${userId}'::uuid, 'owner')`,
      )
    })

    const [afterStep4] = await sql<
      Array<{
        display_name: string
        use_case: string | null
        team_size: string | null
        plan: string
        step_1_completed_at: Date | null
      }>
    >`
      SELECT display_name, use_case, team_size, plan, step_1_completed_at
      FROM workspace WHERE id = ${workspaceId}::uuid
    `
    expect(afterStep4!.display_name).toBe("Northwind Accounting")
    expect(afterStep4!.use_case).toBe("firm")
    expect(afterStep4!.team_size).toBe("sm")
    expect(afterStep4!.plan).toBe("starter") // default from migration 0013
    expect(afterStep4!.step_1_completed_at).not.toBeNull()

    // Step 5: update workspace.plan + step_2_completed_at.
    await sql`
      UPDATE workspace
      SET plan = 'growth', step_2_completed_at = now(), updated_at = now()
      WHERE id = ${workspaceId}::uuid
    `
    const [afterStep5] = await sql<
      Array<{ plan: string; step_2_completed_at: Date | null }>
    >`
      SELECT plan, step_2_completed_at FROM workspace
      WHERE id = ${workspaceId}::uuid
    `
    expect(afterStep5!.plan).toBe("growth")
    expect(afterStep5!.step_2_completed_at).not.toBeNull()

    // Step 6: validate-only (no auth_invite write yet — no organization
    // exists during owner onboarding); just mark step_3_completed_at.
    await sql`
      UPDATE workspace
      SET step_3_completed_at = now(), updated_at = now()
      WHERE id = ${workspaceId}::uuid
    `

    // Step 7: mark step_4_completed_at + onboarding_completed_at.
    await sql`
      UPDATE workspace
      SET step_4_completed_at = now(),
          onboarding_completed_at = now(),
          updated_at = now()
      WHERE id = ${workspaceId}::uuid
    `

    const [final] = await sql<
      Array<{
        step_3_completed_at: Date | null
        step_4_completed_at: Date | null
        onboarding_completed_at: Date | null
      }>
    >`
      SELECT step_3_completed_at, step_4_completed_at, onboarding_completed_at
      FROM workspace WHERE id = ${workspaceId}::uuid
    `
    expect(final!.step_3_completed_at).not.toBeNull()
    expect(final!.step_4_completed_at).not.toBeNull()
    expect(final!.onboarding_completed_at).not.toBeNull()

    // Final invariant: owner has exactly one active workspace_membership.
    const memberships = await sql<Array<{ role: string; active: boolean }>>`
      SELECT role, active FROM workspace_membership
      WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${userId}::uuid
    `
    expect(memberships).toHaveLength(1)
    expect(memberships[0]!.role).toBe("owner")
    expect(memberships[0]!.active).toBe(true)
  })

  it("billing_plan enum rejects values outside ('starter','growth','scale')", async () => {
    const [user] = await sql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('enum-test@onboarding.invalid', 'Enum Test', 'user')
      RETURNING id
    `
    await expect(
      sql.unsafe(`
        INSERT INTO workspace (display_name, created_by_user_id, plan)
        VALUES ('Bad Plan', '${user!.id}', 'enterprise')
      `),
    ).rejects.toThrow(/invalid input value for enum/i)
  })
})

describe("member onboarding — invite materialization", () => {
  it("creates workspace_membership + organization_membership for an invitee", async () => {
    // Seed the owner workspace + an organization to invite into.
    const [owner] = await sql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('owner@invite.invalid', 'Owner', 'user')
      RETURNING id
    `
    const ownerId = owner!.id

    const [ws] = await sql<Array<{ id: string }>>`
      INSERT INTO workspace (display_name, created_by_user_id)
      VALUES ('Owner Workspace', ${ownerId}::uuid)
      RETURNING id
    `
    const workspaceId = ws!.id

    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE app_admin`)
      await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
      await tx.unsafe(
        `INSERT INTO workspace_membership (workspace_id, user_id, role)
         VALUES ('${workspaceId}'::uuid, '${ownerId}'::uuid, 'owner')`,
      )
    })

    const [org] = await sql<Array<{ id: string; slug: string }>>`
      INSERT INTO organization (
        organization_id, workspace_id, slug, legal_name,
        person_kind, legal_subject_kind
      )
      VALUES (uuidv7(), ${workspaceId}::uuid, 'owner-org',
              'Owner Org', 'legal_entity', 'for_profit')
      RETURNING id, slug
    `
    await sql`UPDATE organization SET organization_id = id WHERE id = ${org!.id}::uuid`
    const orgId = org!.id

    // Member completes onboarding: BA creates app_user, then materialize
    // workspace + organization membership.
    const [member] = await sql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('member@invite.invalid', 'Member', 'user')
      RETURNING id
    `
    const memberId = member!.id

    const wsMembership = await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE app_admin`)
      await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
      const rows = (await tx.unsafe(
        `INSERT INTO workspace_membership (workspace_id, user_id, role)
         VALUES ('${workspaceId}'::uuid, '${memberId}'::uuid, 'member')
         RETURNING id`,
      )) as unknown as Array<{ id: string }>
      return rows[0]!
    })
    expect(wsMembership).toBeDefined()

    await sql`
      INSERT INTO organization_membership (
        organization_id, workspace_id, user_id,
        workspace_membership_id, role
      )
      VALUES (
        ${orgId}::uuid, ${workspaceId}::uuid, ${memberId}::uuid,
        ${wsMembership!.id}::uuid, 'member'
      )
    `

    const orgMemberships = await sql<Array<{ role: string }>>`
      SELECT role FROM organization_membership
      WHERE organization_id = ${orgId}::uuid AND user_id = ${memberId}::uuid
    `
    expect(orgMemberships).toHaveLength(1)
    expect(orgMemberships[0]!.role).toBe("member")

    const wsMemberships = await sql<Array<{ role: string; active: boolean }>>`
      SELECT role, active FROM workspace_membership
      WHERE workspace_id = ${workspaceId}::uuid AND user_id = ${memberId}::uuid
    `
    expect(wsMemberships).toHaveLength(1)
    expect(wsMemberships[0]!.role).toBe("member")
    expect(wsMemberships[0]!.active).toBe(true)
  })
})

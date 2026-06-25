/**
 * Integration tests for `getHeaderOrgData` — the org-switcher header data
 * fetched by the org-scoped layout.
 *
 * AFF-119 / E7b — apps/web integration tests. The helper + its transitive
 * `@workspace/db` imports are loaded dynamically in `beforeAll` so the DB
 * singletons bind AFTER globalSetup has set DATABASE_URL.
 *
 * Covered behaviors:
 *   - memberCount counts ACTIVE memberships of the current org only
 *   - otherOrgs lists the user's other active orgs, excluding the current one
 *   - otherOrgs spans workspaces (cross-workspace org is included)
 *   - otherOrgs excludes orgs the user is not a member of
 *   - otherOrgs excludes inactive memberships
 *   - otherOrgs is capped at 3 and ordered by legal_name
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import postgres from "postgres"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"

let getHeaderOrgData: (typeof import("./header-org"))["getHeaderOrgData"]
let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]

let sql: postgres.Sql

// ---------------------------------------------------------------------------
// Seed helpers (raw SQL via the superuser admin client)
// ---------------------------------------------------------------------------

let seq = 0

async function seedUser(): Promise<string> {
  seq += 1
  const [user] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${`header-org-${Date.now()}-${seq}@test.invalid`}, 'User', 'user')
    RETURNING id
  `
  if (!user) throw new Error("user insert failed")
  return user.id
}

async function seedWorkspace(creatorId: string): Promise<string> {
  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Header Org Test Workspace', ${creatorId}::uuid)
    RETURNING id
  `
  if (!ws) throw new Error("workspace insert failed")
  return ws.id
}

async function seedOrg(opts: {
  workspaceId: string
  slug: string
  legalName: string
}): Promise<string> {
  const [org] = await sql<Array<{ id: string }>>`
    INSERT INTO organization (
      organization_id, workspace_id, slug, legal_name,
      person_kind, legal_subject_kind
    )
    VALUES (
      uuidv7(), ${opts.workspaceId}::uuid, ${opts.slug}, ${opts.legalName},
      'legal_entity', 'for_profit'
    )
    RETURNING id
  `
  if (!org) throw new Error("org insert failed")
  await sql`UPDATE organization SET organization_id = id WHERE id = ${org.id}::uuid`
  return org.id
}

/**
 * One active workspace_membership exists per (workspace, user) — reuse it across
 * every org the user belongs to in that workspace. Insert is gated by the
 * last-owner trigger → elevate to app_admin.
 */
async function ensureWorkspaceMembership(
  workspaceId: string,
  userId: string,
): Promise<string> {
  const [existing] = await sql<Array<{ id: string }>>`
    SELECT id FROM workspace_membership
    WHERE workspace_id = ${workspaceId}::uuid
      AND user_id = ${userId}::uuid
      AND active = true
    LIMIT 1
  `
  if (existing) return existing.id

  return await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE app_admin`)
    await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
    const rows = (await tx.unsafe(
      `INSERT INTO workspace_membership (workspace_id, user_id, role)
       VALUES ('${workspaceId}'::uuid, '${userId}'::uuid, 'member')
       RETURNING id`,
    )) as unknown as Array<{ id: string }>
    if (!rows[0]) throw new Error("workspace_membership insert failed")
    return rows[0].id
  })
}

/** Give a user an active/inactive org membership (+ the backing workspace membership). */
async function addOrgMember(opts: {
  orgId: string
  workspaceId: string
  userId: string
  active?: boolean
  role?: "owner" | "admin" | "member" | "agent" | "guest"
}): Promise<void> {
  const active = opts.active ?? true
  const role = opts.role ?? "member"

  const wsMembershipId = await ensureWorkspaceMembership(
    opts.workspaceId,
    opts.userId,
  )

  const [orgM] = await sql<Array<{ id: string }>>`
    INSERT INTO organization_membership (
      organization_id, workspace_id, user_id,
      workspace_membership_id, role
    ) VALUES (
      ${opts.orgId}::uuid, ${opts.workspaceId}::uuid, ${opts.userId}::uuid,
      ${wsMembershipId}::uuid, ${role}
    )
    RETURNING id
  `
  if (!orgM) throw new Error("organization_membership insert failed")

  if (!active) {
    await sql`UPDATE organization_membership SET active = false WHERE id = ${orgM.id}::uuid`
  }
}

beforeAll(async () => {
  ;({ adminClient, truncateAll } = await import("@workspace/db/tests/fixtures"))
  ;({ getHeaderOrgData } = await import("./header-org"))
  sql = adminClient()
  await truncateAll(sql)
}, 30_000)

afterAll(async () => {
  await truncateAll(sql)
  await sql.end({ timeout: 5 })
})

beforeEach(async () => {
  await truncateAll(sql)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getHeaderOrgData", () => {
  it("counts only ACTIVE memberships of the current org", async () => {
    const subject = await seedUser()
    const ws = await seedWorkspace(subject)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "current",
      legalName: "Current Org",
    })

    await addOrgMember({
      orgId: org,
      workspaceId: ws,
      userId: subject,
      role: "owner",
    })
    await addOrgMember({
      orgId: org,
      workspaceId: ws,
      userId: await seedUser(),
    })
    await addOrgMember({
      orgId: org,
      workspaceId: ws,
      userId: await seedUser(),
    })
    // Inactive member — must be excluded from the count.
    await addOrgMember({
      orgId: org,
      workspaceId: ws,
      userId: await seedUser(),
      active: false,
    })

    const data = await getHeaderOrgData({
      organizationId: org,
      userId: subject,
    })

    expect(data.memberCount).toBe(3)
  }, 30_000)

  it("lists other orgs (cross-workspace), excluding the current one", async () => {
    const subject = await seedUser()
    const ws1 = await seedWorkspace(subject)
    const current = await seedOrg({
      workspaceId: ws1,
      slug: "current",
      legalName: "Current Org",
    })
    const sibling = await seedOrg({
      workspaceId: ws1,
      slug: "sibling",
      legalName: "Sibling Org",
    })

    // A second workspace with another org the same user belongs to.
    const ws2 = await seedWorkspace(subject)
    const crossWs = await seedOrg({
      workspaceId: ws2,
      slug: "across",
      legalName: "Across Org",
    })

    await addOrgMember({
      orgId: current,
      workspaceId: ws1,
      userId: subject,
      role: "owner",
    })
    await addOrgMember({ orgId: sibling, workspaceId: ws1, userId: subject })
    await addOrgMember({ orgId: crossWs, workspaceId: ws2, userId: subject })

    const data = await getHeaderOrgData({
      organizationId: current,
      userId: subject,
    })

    const ids = data.otherOrgs.map((o) => o.id)
    expect(ids).not.toContain(current)
    expect(ids).toContain(sibling)
    expect(ids).toContain(crossWs)
    expect(data.otherOrgs).toHaveLength(2)
    // Ordered by legal_name: "Across Org" before "Sibling Org".
    expect(data.otherOrgs.map((o) => o.name)).toEqual([
      "Across Org",
      "Sibling Org",
    ])
  }, 30_000)

  it("excludes orgs the user is not a member of and inactive memberships", async () => {
    const subject = await seedUser()
    const stranger = await seedUser()
    const ws = await seedWorkspace(subject)
    const current = await seedOrg({
      workspaceId: ws,
      slug: "current",
      legalName: "Current Org",
    })
    const notMine = await seedOrg({
      workspaceId: ws,
      slug: "notmine",
      legalName: "Not Mine Org",
    })
    const inactiveOrg = await seedOrg({
      workspaceId: ws,
      slug: "inactive",
      legalName: "Inactive Org",
    })

    await addOrgMember({
      orgId: current,
      workspaceId: ws,
      userId: subject,
      role: "owner",
    })
    // subject is NOT a member of notMine (only stranger is).
    await addOrgMember({ orgId: notMine, workspaceId: ws, userId: stranger })
    // subject's membership in inactiveOrg is inactive.
    await addOrgMember({
      orgId: inactiveOrg,
      workspaceId: ws,
      userId: subject,
      active: false,
    })

    const data = await getHeaderOrgData({
      organizationId: current,
      userId: subject,
    })

    expect(data.otherOrgs).toHaveLength(0)
  }, 30_000)

  it("caps the other-orgs list at 3, ordered by legal_name", async () => {
    const subject = await seedUser()
    const ws = await seedWorkspace(subject)
    const current = await seedOrg({
      workspaceId: ws,
      slug: "current",
      legalName: "Current Org",
    })
    await addOrgMember({
      orgId: current,
      workspaceId: ws,
      userId: subject,
      role: "owner",
    })

    // Five sibling orgs, named so the alphabetical top-3 is deterministic.
    for (const name of ["Bravo", "Echo", "Alpha", "Delta", "Charlie"]) {
      const org = await seedOrg({
        workspaceId: ws,
        slug: `org-${name.toLowerCase()}`,
        legalName: name,
      })
      await addOrgMember({ orgId: org, workspaceId: ws, userId: subject })
    }

    const data = await getHeaderOrgData({
      organizationId: current,
      userId: subject,
    })

    expect(data.otherOrgs).toHaveLength(3)
    expect(data.otherOrgs.map((o) => o.name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ])
  }, 30_000)
})

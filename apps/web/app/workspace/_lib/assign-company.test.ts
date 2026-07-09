/**
 * Tests for the company-assignment gate + DB contract behind
 * `setCompanyAssigneeAction` (`../actions.ts`).
 *
 * `setCompanyAssigneeAction` itself is a "use server" function that calls
 * `headers()` / `auth.api.getSession()`, only available inside the Next.js
 * RSC runtime — same deferred-scope reasoning as
 * `apps/web/app/onboarding/actions.test.ts` and `archiveOrgAction`'s (untested)
 * pattern in `organizations/actions.ts`. The action is a thin wrapper around
 * pieces that ARE fully testable outside that runtime, all exercised here:
 *   1. `canAssignCompanies` — the pure owner/admin role gate, unit-tested
 *      directly (no DB).
 *   2. `setCompanyAssignee` — the DB-level validation + write (org-workspace
 *      match, active-member check), integration-tested against a real DB,
 *      mirroring `manage-orgs.ts`'s `setOrgArchived` contract test approach.
 *   3. `loadOrgAssignees` / `loadAssignableMembers` — the batch readers shared
 *      by the Companies list and the Legislation board, integration-tested
 *      via `withAdminBypass` directly (same real-DB harness).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import postgres from "postgres"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"

let canAssignCompanies: (typeof import("./assign-company"))["canAssignCompanies"]
let setCompanyAssignee: (typeof import("./assign-company"))["setCompanyAssignee"]
let loadOrgAssignees: (typeof import("./assign-company"))["loadOrgAssignees"]
let loadAssignableMembers: (typeof import("./assign-company"))["loadAssignableMembers"]
let withAdminBypass: (typeof import("@workspace/db"))["withAdminBypass"]
let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]

let sql: postgres.Sql

// ---------------------------------------------------------------------------
// Seed helpers (raw SQL via the superuser admin client) — mirrors
// closing-data.test.ts / tax-profile.test.ts
// ---------------------------------------------------------------------------

let seq = 0

async function seedUser(): Promise<string> {
  seq += 1
  const [user] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${`assign-company-${Date.now()}-${seq}@test.invalid`}, 'User', 'user')
    RETURNING id
  `
  if (!user) throw new Error("user insert failed")
  return user.id
}

async function seedWorkspace(creatorId: string): Promise<string> {
  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Assign Company Test Workspace', ${creatorId}::uuid)
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
 * One active workspace_membership exists per (workspace, user) — insert is
 * gated by the last-owner trigger, so elevate to app_admin for the write.
 */
async function ensureWorkspaceMembership(
  workspaceId: string,
  userId: string,
  role: "owner" | "admin" | "member" = "member",
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
       VALUES ('${workspaceId}'::uuid, '${userId}'::uuid, '${role}')
       RETURNING id`,
    )) as unknown as Array<{ id: string }>
    if (!rows[0]) throw new Error("workspace_membership insert failed")
    return rows[0].id
  })
}

/** Deactivate an active membership (same elevation pattern as the insert above). */
async function deactivateMembership(
  workspaceId: string,
  userId: string,
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE app_admin`)
    await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
    await tx.unsafe(
      `UPDATE workspace_membership SET active = false
       WHERE workspace_id = '${workspaceId}'::uuid AND user_id = '${userId}'::uuid`,
    )
  })
}

async function responsibleUserId(orgId: string): Promise<string | null> {
  const [row] = await sql<Array<{ responsible_user_id: string | null }>>`
    SELECT responsible_user_id FROM organization WHERE id = ${orgId}::uuid
  `
  return row?.responsible_user_id ?? null
}

async function cleanup(): Promise<void> {
  await truncateAll(sql)
}

beforeAll(async () => {
  ;({ adminClient, truncateAll } = await import("@workspace/db/tests/fixtures"))
  ;({ withAdminBypass } = await import("@workspace/db"))
  ;({
    canAssignCompanies,
    setCompanyAssignee,
    loadOrgAssignees,
    loadAssignableMembers,
  } = await import("./assign-company"))
  sql = adminClient()
  await cleanup()
}, 30_000)

afterAll(async () => {
  await cleanup()
  await sql.end({ timeout: 5 })
})

beforeEach(async () => {
  await cleanup()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("canAssignCompanies", () => {
  it("owner and admin may assign; a plain member may not", () => {
    expect(canAssignCompanies("owner")).toBe(true)
    expect(canAssignCompanies("admin")).toBe(true)
    expect(canAssignCompanies("member")).toBe(false)
  })
})

describe("setCompanyAssignee", () => {
  it("assigns an active workspace member as the responsible accountant", async () => {
    const owner = await seedUser()
    const ws = await seedWorkspace(owner)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "assign-happy",
      legalName: "Assign Happy s.r.o.",
    })
    const accountant = await seedUser()
    await ensureWorkspaceMembership(ws, accountant)

    const result = await setCompanyAssignee(ws, "assign-happy", accountant)

    expect(result).toEqual({ ok: true })
    expect(await responsibleUserId(org)).toBe(accountant)
  }, 30_000)

  it("rejects a userId that is not an active member of the same workspace", async () => {
    const owner = await seedUser()
    const ws = await seedWorkspace(owner)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "assign-invalid",
      legalName: "Assign Invalid s.r.o.",
    })
    const outsider = await seedUser() // never joined this workspace

    const result = await setCompanyAssignee(ws, "assign-invalid", outsider)

    expect(result).toEqual({ ok: false, errorKey: "invalidAssignee" })
    expect(await responsibleUserId(org)).toBeNull()
  }, 30_000)

  it("rejects an org slug that belongs to a DIFFERENT workspace", async () => {
    const owner = await seedUser()
    const ws = await seedWorkspace(owner)
    await seedOrg({
      workspaceId: ws,
      slug: "assign-scope",
      legalName: "Assign Scope s.r.o.",
    })
    const otherWs = await seedWorkspace(owner)

    const result = await setCompanyAssignee(otherWs, "assign-scope", owner)

    expect(result).toEqual({ ok: false, errorKey: "notFound" })
  }, 30_000)

  it("clears the assignee when userId is null", async () => {
    const owner = await seedUser()
    const ws = await seedWorkspace(owner)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "assign-clear",
      legalName: "Assign Clear s.r.o.",
    })
    await ensureWorkspaceMembership(ws, owner, "owner")
    await setCompanyAssignee(ws, "assign-clear", owner)
    expect(await responsibleUserId(org)).toBe(owner)

    const result = await setCompanyAssignee(ws, "assign-clear", null)

    expect(result).toEqual({ ok: true })
    expect(await responsibleUserId(org)).toBeNull()
  }, 30_000)

  it("rejects an invalid assignee at the database boundary", async () => {
    const owner = await seedUser()
    const ws = await seedWorkspace(owner)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "assign-db-guard",
      legalName: "Assign DB Guard s.r.o.",
    })
    const outsider = await seedUser()

    await expect(
      sql`UPDATE organization
             SET responsible_user_id = ${outsider}::uuid
           WHERE id = ${org}::uuid`,
    ).rejects.toThrow(/active member/)
  }, 30_000)

  it("requires responsibility to be cleared before membership deactivation", async () => {
    const owner = await seedUser()
    const ws = await seedWorkspace(owner)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "assign-deactivate",
      legalName: "Assign Deactivate s.r.o.",
    })
    const accountant = await seedUser()
    await ensureWorkspaceMembership(ws, accountant)
    await setCompanyAssignee(ws, "assign-deactivate", accountant)

    await expect(deactivateMembership(ws, accountant)).rejects.toThrow(
      /must be unassigned/,
    )
    expect(await responsibleUserId(org)).toBe(accountant)

    await setCompanyAssignee(ws, "assign-deactivate", null)
    await deactivateMembership(ws, accountant)
    expect(await responsibleUserId(org)).toBeNull()
  }, 30_000)

  it("serializes assignment against an in-flight membership deactivation", async () => {
    const owner = await seedUser()
    const ws = await seedWorkspace(owner)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "assign-race",
      legalName: "Assign Race s.r.o.",
    })
    const accountant = await seedUser()
    await ensureWorkspaceMembership(ws, accountant)

    let deactivationReady: (() => void) | undefined
    const deactivationReached = new Promise<void>((resolve) => {
      deactivationReady = resolve
    })
    let releaseDeactivation: (() => void) | undefined
    const mayCommitDeactivation = new Promise<void>((resolve) => {
      releaseDeactivation = resolve
    })

    const deactivation = sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE app_admin`)
      await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
      await tx`
        SELECT public.app_lock_workspace_member(
          ${ws}::uuid,
          ${accountant}::uuid
        )
      `
      await tx`
        UPDATE workspace_membership
           SET active = false
         WHERE workspace_id = ${ws}::uuid
           AND user_id = ${accountant}::uuid
      `
      deactivationReady?.()
      await mayCommitDeactivation
    })

    await deactivationReached

    const assignmentSql = adminClient()
    let assignmentSettled = false
    const assignment = assignmentSql`
      UPDATE organization
         SET responsible_user_id = ${accountant}::uuid
       WHERE id = ${org}::uuid
    `
      .then(
        () => ({ ok: true as const, error: null }),
        (error: unknown) => ({ ok: false as const, error }),
      )
      .finally(() => {
        assignmentSettled = true
      })

    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(assignmentSettled).toBe(false)

    releaseDeactivation?.()
    await deactivation
    const assignmentResult = await assignment

    expect(assignmentResult.ok).toBe(false)
    expect(String(assignmentResult.error)).toMatch(/active member/)
    expect(await responsibleUserId(org)).toBeNull()
    await assignmentSql.end({ timeout: 5 })
  }, 30_000)

  it("avoids deadlock when assignment reaches the shared lock first", async () => {
    const owner = await seedUser()
    const ws = await seedWorkspace(owner)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "assign-lock-order",
      legalName: "Assign Lock Order s.r.o.",
    })
    const accountant = await seedUser()
    await ensureWorkspaceMembership(ws, accountant)

    let assignmentReady: (() => void) | undefined
    const assignmentReached = new Promise<void>((resolve) => {
      assignmentReady = resolve
    })
    let releaseAssignment: (() => void) | undefined
    const mayCommitAssignment = new Promise<void>((resolve) => {
      releaseAssignment = resolve
    })

    const assignment = sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE app_admin`)
      await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
      await tx`
        SELECT public.app_lock_workspace_member(
          ${ws}::uuid,
          ${accountant}::uuid
        )
      `
      await tx`
        UPDATE organization
           SET responsible_user_id = ${accountant}::uuid
         WHERE id = ${org}::uuid
      `
      assignmentReady?.()
      await mayCommitAssignment
    })

    await assignmentReached
    let deactivationSettled = false
    const deactivation = deactivateMembership(ws, accountant)
      .then(
        () => ({ ok: true as const, error: null }),
        (error: unknown) => ({ ok: false as const, error }),
      )
      .finally(() => {
        deactivationSettled = true
      })

    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(deactivationSettled).toBe(false)

    releaseAssignment?.()
    await assignment
    const deactivationResult = await deactivation
    expect(deactivationResult.ok).toBe(false)
    expect(String(deactivationResult.error)).toMatch(/must be unassigned/)
    expect(await responsibleUserId(org)).toBe(accountant)
  }, 30_000)
})

describe("loadOrgAssignees", () => {
  it('returns only the assigned org, with the displayName || name || "Member" fallback', async () => {
    const owner = await seedUser()
    const ws = await seedWorkspace(owner)
    const assignedOrg = await seedOrg({
      workspaceId: ws,
      slug: "load-assignees-assigned",
      legalName: "Assigned s.r.o.",
    })
    const unassignedOrg = await seedOrg({
      workspaceId: ws,
      slug: "load-assignees-unassigned",
      legalName: "Unassigned s.r.o.",
    })
    const accountant = await seedUser()
    await ensureWorkspaceMembership(ws, accountant)
    await setCompanyAssignee(ws, "load-assignees-assigned", accountant)

    const map = await withAdminBypass((db) =>
      loadOrgAssignees(db, [assignedOrg, unassignedOrg]),
    )

    expect(map.size).toBe(1)
    expect(map.get(assignedOrg)).toEqual({
      userId: accountant,
      name: "User", // seedUser sets no display_name -> falls back to `name`
      image: undefined,
    })
    expect(map.has(unassignedOrg)).toBe(false)
  }, 30_000)
})

describe("loadAssignableMembers", () => {
  it("returns only active workspace members", async () => {
    const owner = await seedUser()
    const ws = await seedWorkspace(owner)
    await ensureWorkspaceMembership(ws, owner, "owner")
    const activeMember = await seedUser()
    await ensureWorkspaceMembership(ws, activeMember)
    const formerMember = await seedUser()
    await ensureWorkspaceMembership(ws, formerMember)
    await deactivateMembership(ws, formerMember)

    const members = await withAdminBypass((db) => loadAssignableMembers(db, ws))

    const ids = members.map((m) => m.userId)
    expect(ids).toEqual(expect.arrayContaining([owner, activeMember]))
    expect(ids).not.toContain(formerMember)
  }, 30_000)
})

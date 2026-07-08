/**
 * Integration test for `getOrgAccountingContext` — proves the PR1 fix: the org
 * page now resolves the ACTIVE accounting period (cookie → newest OPEN →
 * newest, same resolution as the header switcher) instead of unconditionally
 * the newest period regardless of status.
 *
 * Mirrors `header-periods.test.ts` / `header-org.test.ts` (AFF-119 / E7b): the
 * module under test + its transitive `@workspace/db` imports are loaded
 * dynamically in `beforeAll` so the DB singletons bind AFTER globalSetup has
 * set DATABASE_URL. `next/headers` (`cookies`) and the local `./request-session`
 * module are `vi.mock`ed so the test controls the active-period cookie and the
 * signed-in user without a real Next.js request/response.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import postgres from "postgres"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"

// ---------------------------------------------------------------------------
// Mocks — controlled per-test via these mutable variables
// ---------------------------------------------------------------------------

let cookieValue: string | undefined
let sessionUserId: string | undefined

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        cookieValue !== undefined ? { name, value: cookieValue } : undefined,
    }),
}))

vi.mock("./request-session", () => ({
  getRequestSession: () =>
    Promise.resolve(sessionUserId ? { user: { id: sessionUserId } } : null),
}))

let getOrgAccountingContext: (typeof import("./accounting-data"))["getOrgAccountingContext"]
let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]

let sql: postgres.Sql

// ---------------------------------------------------------------------------
// Seed helpers (raw SQL via the superuser admin client) — mirrors
// header-org.test.ts + header-periods.test.ts
// ---------------------------------------------------------------------------

let seq = 0

async function seedUser(): Promise<string> {
  seq += 1
  const [user] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${`accounting-data-${Date.now()}-${seq}@test.invalid`}, 'User', 'user')
    RETURNING id
  `
  if (!user) throw new Error("user insert failed")
  return user.id
}

async function seedWorkspace(creatorId: string): Promise<string> {
  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Accounting Data Test Workspace', ${creatorId}::uuid)
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

/** Give a user an active org membership (+ the backing workspace membership). */
async function addOrgMember(opts: {
  orgId: string
  workspaceId: string
  userId: string
  role?: "owner" | "admin" | "member" | "agent" | "guest"
}): Promise<void> {
  const role = opts.role ?? "owner"
  const wsMembershipId = await ensureWorkspaceMembership(
    opts.workspaceId,
    opts.userId,
  )

  const [orgM] = await sql<Array<{ id: string }>>`
    INSERT INTO organization_membership (
      organization_id, workspace_id, user_id,
      workspace_membership_id, role, active
    ) VALUES (
      ${opts.orgId}::uuid, ${opts.workspaceId}::uuid, ${opts.userId}::uuid,
      ${wsMembershipId}::uuid, ${role}, true
    )
    RETURNING id
  `
  if (!orgM) throw new Error("organization_membership insert failed")
}

/**
 * Insert one accounting period. regime_code + accounting_currency reference
 * the migration-seeded reference data (DOUBLE_ENTRY regime, CZK functional
 * currency); accounting_size_code stays null (assessed later).
 */
async function seedPeriod(opts: {
  orgId: string
  start: string
  end: string
  status: "OPEN" | "CLOSED"
}): Promise<string> {
  const [period] = await sql<Array<{ id: string }>>`
    INSERT INTO accounting_period (
      organization_id, period_start, period_end, status,
      regime_code, accounting_currency
    )
    VALUES (
      ${opts.orgId}::uuid, ${opts.start}, ${opts.end}, ${opts.status},
      'DOUBLE_ENTRY', 'CZK'
    )
    RETURNING id
  `
  if (!period) throw new Error("accounting_period insert failed")
  return period.id
}

async function cleanup(): Promise<void> {
  // truncateAll does not touch accounting_period; clear the child table first
  // (FK to organization), then the rest.
  await sql`DELETE FROM accounting_period`
  await truncateAll(sql)
}

beforeAll(async () => {
  ;({ adminClient, truncateAll } = await import("@workspace/db/tests/fixtures"))
  ;({ getOrgAccountingContext } = await import("./accounting-data"))
  sql = adminClient()
  await cleanup()
}, 30_000)

afterAll(async () => {
  await cleanup()
  await sql.end({ timeout: 5 })
})

beforeEach(async () => {
  await cleanup()
  cookieValue = undefined
  sessionUserId = undefined
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getOrgAccountingContext", () => {
  it("with no cookie, resolves the newest OPEN period — NOT simply the newest period overall", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "acme",
      legalName: "Acme",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })

    // Newest period (2026) is CLOSED; the older 2025 period is OPEN. The old
    // `order by period_start desc limit 1` implementation would have picked
    // 2026 regardless of status — the bug this test guards against.
    await seedPeriod({
      orgId: org,
      start: "2025-01-01",
      end: "2025-12-31",
      status: "OPEN",
    })
    const period2026 = await seedPeriod({
      orgId: org,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "CLOSED",
    })

    sessionUserId = user
    cookieValue = undefined

    const ctx = await getOrgAccountingContext("acme")

    expect(ctx).not.toBeNull()
    expect(ctx?.periodStart).toBe("2025-01-01")
    expect(ctx?.periodEnd).toBe("2025-12-31")
    expect(ctx?.periodId).not.toBe(period2026)
  }, 30_000)

  it("honors the afframe_period cookie over the newest-OPEN default", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "acme2",
      legalName: "Acme Two",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })

    await seedPeriod({
      orgId: org,
      start: "2025-01-01",
      end: "2025-12-31",
      status: "OPEN",
    })
    const period2026 = await seedPeriod({
      orgId: org,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "CLOSED",
    })

    sessionUserId = user
    cookieValue = period2026

    const ctx = await getOrgAccountingContext("acme2")

    expect(ctx?.periodId).toBe(period2026)
    expect(ctx?.periodStart).toBe("2026-01-01")
    expect(ctx?.periodEnd).toBe("2026-12-31")
  }, 30_000)
})

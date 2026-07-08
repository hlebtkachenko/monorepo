/**
 * Integration test for the Closing Year-end loader — `getFinancialStatements`.
 * Mirrors `vat-data.test.ts` / `closing-data.test.ts` / `income-tax-data.test.ts`
 * (AFF-119 / E7b): the module under test + its transitive `@workspace/db`
 * imports are loaded dynamically in `beforeAll` so the DB singletons bind
 * AFTER globalSetup has set DATABASE_URL. `next/headers` (`cookies`) and the
 * `../../../_lib/request-session` module (imported by `accounting-data.ts`,
 * which `year-end-data.ts` calls into via `getOrgAccountingContext`) are
 * `vi.mock`ed so the test controls the active-period cookie and the
 * signed-in user without a real Next.js request/response.
 *
 * `buildZaverka` / `buildStatementLayout` read the read-model
 * (account_period_balance) — an accounting period with no postings still
 * returns a real, zeroed totals + empty lines/layout (COALESCE(..., 0) /
 * empty result set in the builder SQL), so this test seeds only the org +
 * period, not a full posted period, and asserts status "ok" + the fixed
 * shape rather than exact non-zero figures.
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

// Resolves to the SAME module `accounting-data.ts` imports via
// "./request-session" (apps/web/app/[orgSlug]/_lib/request-session.ts).
vi.mock("../../../_lib/request-session", () => ({
  getRequestSession: () =>
    Promise.resolve(sessionUserId ? { user: { id: sessionUserId } } : null),
}))

let getFinancialStatements: (typeof import("./year-end-data"))["getFinancialStatements"]
let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]

let sql: postgres.Sql

// ---------------------------------------------------------------------------
// Seed helpers (raw SQL via the superuser admin client) — mirrors
// vat-data.test.ts / closing-data.test.ts / income-tax-data.test.ts
// ---------------------------------------------------------------------------

let seq = 0

async function seedUser(): Promise<string> {
  seq += 1
  const [user] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${`year-end-data-${Date.now()}-${seq}@test.invalid`}, 'User', 'user')
    RETURNING id
  `
  if (!user) throw new Error("user insert failed")
  return user.id
}

async function seedWorkspace(creatorId: string): Promise<string> {
  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Year End Data Test Workspace', ${creatorId}::uuid)
    RETURNING id
  `
  if (!ws) throw new Error("workspace insert failed")
  return ws.id
}

async function seedOrg(opts: {
  workspaceId: string
  slug: string
  legalName: string
  personKind?: "legal_entity" | "natural_person"
}): Promise<string> {
  const personKind = opts.personKind ?? "legal_entity"
  // organization_person_subject_consistency (0003_rls_force.sql) requires
  // legal_subject_kind IS NULL for a natural_person, NOT NULL for a legal_entity.
  const legalSubjectKind = personKind === "legal_entity" ? "for_profit" : null
  const [org] = await sql<Array<{ id: string }>>`
    INSERT INTO organization (
      organization_id, workspace_id, slug, legal_name,
      person_kind, legal_subject_kind
    )
    VALUES (
      uuidv7(), ${opts.workspaceId}::uuid, ${opts.slug}, ${opts.legalName},
      ${personKind}, ${legalSubjectKind}
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

/** Insert one accounting period (regime + currency reference migration-seeded rows). */
async function seedPeriod(opts: {
  orgId: string
  start: string
  end: string
  status: "OPEN" | "CLOSED"
  regimeCode?: "DOUBLE_ENTRY" | "SINGLE_ENTRY" | "TAX_RECORDS"
}): Promise<string> {
  const [period] = await sql<Array<{ id: string }>>`
    INSERT INTO accounting_period (
      organization_id, period_start, period_end, status,
      regime_code, accounting_currency
    )
    VALUES (
      ${opts.orgId}::uuid, ${opts.start}, ${opts.end}, ${opts.status},
      ${opts.regimeCode ?? "DOUBLE_ENTRY"}, 'CZK'
    )
    RETURNING id
  `
  if (!period) throw new Error("accounting_period insert failed")
  return period.id
}

async function cleanup(): Promise<void> {
  await sql`DELETE FROM accounting_period`
  await truncateAll(sql)
}

beforeAll(async () => {
  ;({ adminClient, truncateAll } = await import("@workspace/db/tests/fixtures"))
  ;({ getFinancialStatements } = await import("./year-end-data"))
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

describe("getFinancialStatements", () => {
  it("LEGAL org, DOUBLE_ENTRY period -> ok, real (zeroed) závěrka + layout shape", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "statements-double-entry-ok",
      legalName: "Statements Double Entry s.r.o.",
      personKind: "legal_entity",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })
    await seedPeriod({
      orgId: org,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
      regimeCode: "DOUBLE_ENTRY",
    })

    sessionUserId = user
    cookieValue = undefined

    const result = await getFinancialStatements("statements-double-entry-ok")

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.zaverka.type).toBe("FINANCIAL_STATEMENTS")
    expect(result.zaverka.aktiva).toBe("0.0000")
    expect(result.zaverka.pasiva).toBe("0.0000")
    expect(result.zaverka.vysledek).toBe("0.0000")
    expect(result.zaverka.lines).toEqual([])
    expect(result.layout.type).toBe("STATEMENT_LAYOUT")
    expect(result.layout.aktiva).toEqual([])
    expect(result.layout.pasiva).toEqual([])
    expect(result.layout.vzz).toEqual([])
  }, 30_000)

  it("TAX_RECORDS period -> not-applicable (financial statements are a double-entry concern)", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "statements-tax-records-na",
      legalName: "Statements Tax Records OSVC",
      personKind: "natural_person",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })
    await seedPeriod({
      orgId: org,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
      regimeCode: "TAX_RECORDS",
    })

    sessionUserId = user
    cookieValue = undefined

    const result = await getFinancialStatements("statements-tax-records-na")

    expect(result.status).toBe("not-applicable")
    if (result.status !== "not-applicable") return
    expect(result.reason).toContain("double-entry")
  }, 30_000)

  it("org with no accounting_period -> no-period", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "statements-no-period",
      legalName: "Statements No Period s.r.o.",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })

    sessionUserId = user
    cookieValue = undefined

    const result = await getFinancialStatements("statements-no-period")

    expect(result.status).toBe("no-period")
  }, 30_000)
})

/**
 * Integration test for `getClosingObligations` — the Closing Overview +
 * Calendar pages' server-side loader. Mirrors `_lib/accounting-data.test.ts`
 * (AFF-119 / E7b): the module under test + its transitive `@workspace/db`
 * imports are loaded dynamically in `beforeAll` so the DB singletons bind
 * AFTER globalSetup has set DATABASE_URL. `next/headers` (`cookies`) and the
 * `../../_lib/request-session` module (imported by `accounting-data.ts`,
 * which `closing-data.ts` calls into via `getOrgAccountingContext`) are
 * `vi.mock`ed so the test controls the active-period cookie and the
 * signed-in user without a real Next.js request/response.
 *
 * Also unit-tests the pure `deriveObligationStatus` helper.
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

// Resolves to the SAME module `accounting-data.ts` imports via "@/lib/org/request-session"
// (apps/web/app/[orgSlug]/_lib/request-session.ts) — Vitest mocks by resolved
// module id, so this cross-directory relative path lands on that file.
vi.mock("@/lib/org/request-session", () => ({
  getRequestSession: () =>
    Promise.resolve(sessionUserId ? { user: { id: sessionUserId } } : null),
}))

let getClosingObligations: (typeof import("./closing-data"))["getClosingObligations"]
let deriveObligationStatus: (typeof import("./closing-data"))["deriveObligationStatus"]
let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]

let sql: postgres.Sql

function obligationWithDueDate(dueDate: string) {
  return {
    kind: "VAT_RETURN" as const,
    category: "VAT" as const,
    title: "VAT return",
    periodLabel: "June 2026",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    dueDate,
    applicability: {
      status: "APPLICABLE" as const,
      reason: "Configured statutory schedule applies.",
    },
  }
}

// ---------------------------------------------------------------------------
// Seed helpers (raw SQL via the superuser admin client) — mirrors
// accounting-data.test.ts
// ---------------------------------------------------------------------------

let seq = 0

async function seedUser(): Promise<string> {
  seq += 1
  const [user] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${`closing-data-${Date.now()}-${seq}@test.invalid`}, 'User', 'user')
    RETURNING id
  `
  if (!user) throw new Error("user insert failed")
  return user.id
}

async function seedWorkspace(creatorId: string): Promise<string> {
  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Closing Data Test Workspace', ${creatorId}::uuid)
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

/** Insert a vat_status row. `validTo` omitted (or null) = current (open-ended). */
async function seedVatStatus(opts: {
  orgId: string
  vatRegimeCode: "NON_PAYER" | "PAYER" | "IDENTIFIED_PERSON"
  validFrom: string
  validTo?: string | null
  filingPeriod: "MONTHLY" | "QUARTERLY" | null
}): Promise<void> {
  await sql`
    INSERT INTO vat_status (organization_id, vat_regime_code, valid_from, valid_to, filing_period)
    VALUES (${opts.orgId}::uuid, ${opts.vatRegimeCode}, ${opts.validFrom}, ${opts.validTo ?? null}, ${opts.filingPeriod})
  `
}

async function cleanup(): Promise<void> {
  // truncateAll does not touch accounting_period / vat_status; clear the
  // child tables first (FK to organization), then the rest.
  await sql`DELETE FROM vat_status`
  await sql`DELETE FROM accounting_period`
  await truncateAll(sql)
}

beforeAll(async () => {
  ;({ adminClient, truncateAll } = await import("@workspace/db/tests/fixtures"))
  ;({ getClosingObligations, deriveObligationStatus } =
    await import("./closing-data"))
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

describe("getClosingObligations", () => {
  it("PAYER + MONTHLY org with no VAT activity -> only the 12 standing VAT returns", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "closing-payer-monthly",
      legalName: "Payer Monthly s.r.o.",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })
    await seedPeriod({
      orgId: org,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
    })
    await seedVatStatus({
      orgId: org,
      vatRegimeCode: "PAYER",
      validFrom: "2026-01-01",
      filingPeriod: "MONTHLY",
    })

    sessionUserId = user
    cookieValue = undefined

    const result = await getClosingObligations("closing-payer-monthly")

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.periodStart).toBe("2026-01-01")
    expect(result.periodEnd).toBe("2026-12-31")
    expect(result.obligations).toHaveLength(12)
    expect(
      result.obligations.filter((o) => o.kind === "VAT_RETURN"),
    ).toHaveLength(12)
    expect(
      result.obligations.filter((o) => o.kind === "CONTROL_STATEMENT"),
    ).toHaveLength(0)
    expect(
      result.obligations.filter((o) => o.kind === "EC_SALES_LIST"),
    ).toHaveLength(0)
    expect(
      result.obligations.filter((o) => o.category === "PAYROLL"),
    ).toHaveLength(0)
    // Every row carries a derived display status.
    for (const o of result.obligations) {
      expect(["Past due date", "Due soon", "Upcoming"]).toContain(o.status)
    }
  }, 30_000)

  it("PAYER with filing_period NULL -> explicit missing-cadence issue (no throw)", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "closing-payer-unconfigured",
      legalName: "Payer Unconfigured s.r.o.",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })
    await seedPeriod({
      orgId: org,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
    })
    await seedVatStatus({
      orgId: org,
      vatRegimeCode: "PAYER",
      validFrom: "2026-01-01",
      filingPeriod: null,
    })

    sessionUserId = user
    cookieValue = undefined

    const result = await getClosingObligations("closing-payer-unconfigured")

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.periodLabel).toContain("2026")
    expect(result.obligations.filter((o) => o.category === "VAT")).toEqual([])
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VAT_FILING_PERIOD_MISSING" }),
      ]),
    )
  }, 30_000)

  it("org with no accounting_period -> no-period", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "closing-no-period",
      legalName: "No Period s.r.o.",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })

    sessionUserId = user
    cookieValue = undefined

    const result = await getClosingObligations("closing-no-period")

    expect(result.status).toBe("no-period")
  }, 30_000)

  it("NON_PAYER org, open period -> ok with obligations: [] (honest empty state)", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "closing-non-payer",
      legalName: "Non Payer s.r.o.",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })
    await seedPeriod({
      orgId: org,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
    })
    await seedVatStatus({
      orgId: org,
      vatRegimeCode: "NON_PAYER",
      validFrom: "2026-01-01",
      filingPeriod: null,
    })

    sessionUserId = user
    cookieValue = undefined

    const result = await getClosingObligations("closing-non-payer")

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.obligations).toHaveLength(0)
  }, 30_000)

  it("period-effective vat_status: a historical (2025) period reports its OWN regime, not the org's current one", async () => {
    // Two vat_status rows on the SAME org: NON_PAYER through end-2025, PAYER
    // from 2026 onward. `vat_status_no_overlap` (M8) is a gist EXCLUDE with
    // INCLUSIVE bounds on both ends (daterange(..., '[]')), so the boundary
    // dates must not both land on 2026-01-01 — the NON_PAYER row's valid_to
    // is the last day of 2025.
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "closing-regime-change",
      legalName: "Regime Change s.r.o.",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })

    const period2025 = await seedPeriod({
      orgId: org,
      start: "2025-01-01",
      end: "2025-12-31",
      status: "CLOSED",
    })
    const period2026 = await seedPeriod({
      orgId: org,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
    })

    await seedVatStatus({
      orgId: org,
      vatRegimeCode: "NON_PAYER",
      validFrom: "2025-01-01",
      validTo: "2025-12-31",
      filingPeriod: null,
    })
    await seedVatStatus({
      orgId: org,
      vatRegimeCode: "PAYER",
      validFrom: "2026-01-01",
      filingPeriod: "MONTHLY",
    })

    sessionUserId = user

    cookieValue = period2025
    const result2025 = await getClosingObligations("closing-regime-change")
    expect(result2025.status).toBe("ok")
    if (result2025.status === "ok") {
      expect(result2025.obligations).toHaveLength(0)
    }

    cookieValue = period2026
    const result2026 = await getClosingObligations("closing-regime-change")
    expect(result2026.status).toBe("ok")
    if (result2026.status === "ok") {
      expect(result2026.obligations).toHaveLength(12)
    }
  }, 30_000)

  it("NATURAL person + PAYER/QUARTERLY with no activity -> 4 standing VAT returns", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "closing-natural-quarterly",
      legalName: "Natural Quarterly OSVC",
      personKind: "natural_person",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })
    await seedPeriod({
      orgId: org,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
    })
    await seedVatStatus({
      orgId: org,
      vatRegimeCode: "PAYER",
      validFrom: "2026-01-01",
      filingPeriod: "QUARTERLY",
    })

    sessionUserId = user
    cookieValue = undefined

    const result = await getClosingObligations("closing-natural-quarterly")

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(
      result.obligations.filter((o) => o.kind === "VAT_RETURN"),
    ).toHaveLength(4)
    expect(
      result.obligations.filter((o) => o.kind === "CONTROL_STATEMENT"),
    ).toHaveLength(0)
    expect(
      result.obligations.filter((o) => o.kind === "EC_SALES_LIST"),
    ).toHaveLength(0)
  }, 30_000)
})

describe("deriveObligationStatus", () => {
  const today = "2026-07-08"

  it("a due date in the past is Past due date without asserting non-compliance", () => {
    expect(
      deriveObligationStatus(obligationWithDueDate("2026-07-01"), today),
    ).toBe("Past due date")
  })

  it("a due date within the next 14 days (inclusive) is Due soon", () => {
    expect(
      deriveObligationStatus(obligationWithDueDate("2026-07-08"), today),
    ).toBe("Due soon")
    expect(
      deriveObligationStatus(obligationWithDueDate("2026-07-15"), today),
    ).toBe("Due soon")
    expect(
      deriveObligationStatus(obligationWithDueDate("2026-07-22"), today),
    ).toBe("Due soon")
  })

  it("a due date beyond 14 days out is Upcoming", () => {
    expect(
      deriveObligationStatus(obligationWithDueDate("2026-07-23"), today),
    ).toBe("Upcoming")
    expect(
      deriveObligationStatus(obligationWithDueDate("2026-09-01"), today),
    ).toBe("Upcoming")
  })
})

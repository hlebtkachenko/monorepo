/**
 * Integration test for the Tax profile settings loader (`loadTaxProfile`) AND
 * the payroll-obligation gating it feeds into (`getClosingObligations` in
 * `../closing/_lib/closing-data.ts`, via `resolvePeriodProfile`'s
 * period-effective `organization_tax_profile` read). Mirrors
 * `closing/_lib/closing-data.test.ts` / `closing/income-tax/_lib/income-tax-data.test.ts`
 * (AFF-119 / E7b): the modules under test + their transitive `@workspace/db`
 * imports are loaded dynamically in `beforeAll` so the DB singletons bind
 * AFTER globalSetup has set DATABASE_URL. `next/headers` (`cookies`) and the
 * `../_lib/request-session` module (imported by both `accounting-data.ts` and
 * `settings-data.ts`'s `getSettingsPageContext`) are `vi.mock`ed so the test
 * controls the active-period cookie and the signed-in user without a real
 * Next.js request/response.
 *
 * `loadTaxProfile` is exercised directly against a resolved `OrgContext`
 * (`resolveOrgContext`, no session dependency) rather than through
 * `getSettingsPageContext`, since the latter only adds a session/role check.
 * That gate is the shared `authorize()` helper in `../actions.ts` — the same
 * helper every settings server action (including `changeTaxProfileAction`)
 * uses to require owner/admin role before mutating. It is NOT independently
 * tested here: `authorize()` calls `auth.api.getSession()` + `headers()`,
 * which only run inside the Next.js RSC runtime, so mocking them would
 * exercise the mocks rather than the real gate (same deferred-scope
 * reasoning documented in `apps/web/app/onboarding/actions.test.ts`).
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

// Resolves to the SAME module `accounting-data.ts` AND `settings-data.ts`
// import via "@/lib/org/request-session" / "@/lib/org/request-session"
// (apps/web/app/[orgSlug]/_lib/request-session.ts) — Vitest mocks by
// resolved module id, so this relative path lands on that one file for both.
vi.mock("@/lib/org/request-session", () => ({
  getRequestSession: () =>
    Promise.resolve(sessionUserId ? { user: { id: sessionUserId } } : null),
}))

let loadTaxProfile: (typeof import("./_lib/settings-data"))["loadTaxProfile"]
let resolveOrgContext: (typeof import("../_lib/org-authz"))["resolveOrgContext"]
let getClosingObligations: (typeof import("../closing/_lib/closing-data"))["getClosingObligations"]
let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]

let sql: postgres.Sql

// ---------------------------------------------------------------------------
// Seed helpers (raw SQL via the superuser admin client) — mirrors
// closing-data.test.ts
// ---------------------------------------------------------------------------

let seq = 0

async function seedUser(): Promise<string> {
  seq += 1
  const [user] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${`tax-profile-${Date.now()}-${seq}@test.invalid`}, 'User', 'user')
    RETURNING id
  `
  if (!user) throw new Error("user insert failed")
  return user.id
}

async function seedWorkspace(creatorId: string): Promise<string> {
  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Tax Profile Test Workspace', ${creatorId}::uuid)
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

/** Insert a vat_status row. NON_PAYER, so `computeObligations` emits no VAT rows. */
async function seedVatStatus(opts: {
  orgId: string
  validFrom: string
}): Promise<void> {
  await sql`
    INSERT INTO vat_status (organization_id, vat_regime_code, valid_from, filing_period)
    VALUES (${opts.orgId}::uuid, 'NON_PAYER', ${opts.validFrom}, NULL)
  `
}

/** Insert an organization_tax_profile row. `validTo` omitted = current (open-ended). */
async function seedTaxProfile(opts: {
  orgId: string
  hasEmployees: boolean
  validFrom: string
  validTo?: string | null
  socialInsuranceParticipation?: boolean
  healthInsuranceParticipation?: boolean
  payrollTaxAdvanceDue?: boolean
  specialRateWithholdingDue?: boolean
}): Promise<void> {
  await sql`
    INSERT INTO organization_tax_profile
      (organization_id, has_employees, has_standard_employment, has_dpp, has_dpc,
       social_insurance_participation, health_insurance_participation,
       payroll_tax_advance_due, special_rate_withholding_due, valid_from, valid_to)
    VALUES (${opts.orgId}::uuid, ${opts.hasEmployees}, ${opts.hasEmployees}, false, false,
            ${opts.socialInsuranceParticipation ?? opts.hasEmployees},
            ${opts.healthInsuranceParticipation ?? opts.hasEmployees},
            ${opts.payrollTaxAdvanceDue ?? opts.hasEmployees},
            ${opts.specialRateWithholdingDue ?? false},
            ${opts.validFrom}, ${opts.validTo ?? null})
  `
}

async function cleanup(): Promise<void> {
  // truncateAll does not touch accounting_period / vat_status /
  // organization_tax_profile; clear the child tables first (FK to
  // organization), then the rest.
  await sql`DELETE FROM organization_tax_profile`
  await sql`DELETE FROM vat_status`
  await sql`DELETE FROM accounting_period`
  await truncateAll(sql)
}

beforeAll(async () => {
  ;({ adminClient, truncateAll } = await import("@workspace/db/tests/fixtures"))
  ;({ loadTaxProfile } = await import("./_lib/settings-data"))
  ;({ resolveOrgContext } = await import("../_lib/org-authz"))
  ;({ getClosingObligations } = await import("../closing/_lib/closing-data"))
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

describe("loadTaxProfile", () => {
  it("returns the has_employees history, newest valid_from first", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "tax-profile-history",
      legalName: "Tax Profile History s.r.o.",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })
    await seedTaxProfile({
      orgId: org,
      hasEmployees: false,
      validFrom: "2025-01-01",
      validTo: "2025-12-31",
    })
    await seedTaxProfile({
      orgId: org,
      hasEmployees: true,
      validFrom: "2026-01-01",
    })

    const ctx = await resolveOrgContext("tax-profile-history", user)
    if (!ctx) throw new Error("org context not found")

    const data = await loadTaxProfile(ctx, user)

    expect(data.history).toHaveLength(2)
    expect(data.history[0]).toMatchObject({
      hasEmployees: true,
      hasStandardEmployment: true,
      socialInsuranceParticipation: true,
      payrollTaxAdvanceDue: true,
      validFrom: "2026-01-01",
      validTo: null,
    })
    expect(data.history[1]).toMatchObject({
      hasEmployees: false,
      validFrom: "2025-01-01",
      validTo: "2025-12-31",
    })
  })

  it("no organization_tax_profile row -> empty history", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "tax-profile-empty",
      legalName: "Tax Profile Empty s.r.o.",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })

    const ctx = await resolveOrgContext("tax-profile-empty", user)
    if (!ctx) throw new Error("org context not found")

    const data = await loadTaxProfile(ctx, user)

    expect(data.history).toHaveLength(0)
  })
})

describe("getClosingObligations — payroll gating from organization_tax_profile", () => {
  it("period-effective facts produce social, health, and tax-advance obligations independently", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "closing-payroll-has-employees",
      legalName: "Payroll Has Employees s.r.o.",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })
    await seedPeriod({
      orgId: org,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
    })
    await seedVatStatus({ orgId: org, validFrom: "2026-01-01" })
    await seedTaxProfile({
      orgId: org,
      hasEmployees: true,
      validFrom: "2026-01-01",
    })

    sessionUserId = user
    cookieValue = undefined

    const result = await getClosingObligations("closing-payroll-has-employees")

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    const payroll = result.obligations.filter((o) => o.category === "PAYROLL")
    expect(payroll).toHaveLength(36)
    expect(payroll.filter((o) => o.kind === "SOCIAL_INSURANCE")).toHaveLength(
      12,
    )
    expect(payroll.filter((o) => o.kind === "HEALTH_INSURANCE")).toHaveLength(
      12,
    )
    expect(
      payroll.filter((o) => o.kind === "PAYROLL_TAX_ADVANCE"),
    ).toHaveLength(12)
    expect(
      payroll.filter((o) => o.kind === "SPECIAL_RATE_WITHHOLDING_TAX"),
    ).toHaveLength(0)
  }, 30_000)

  it("period-effective has_employees=false row -> 0 payroll obligations", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "closing-payroll-no-employees",
      legalName: "Payroll No Employees s.r.o.",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })
    await seedPeriod({
      orgId: org,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
    })
    await seedVatStatus({ orgId: org, validFrom: "2026-01-01" })
    await seedTaxProfile({
      orgId: org,
      hasEmployees: false,
      validFrom: "2026-01-01",
    })

    sessionUserId = user
    cookieValue = undefined

    const result = await getClosingObligations("closing-payroll-no-employees")

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(
      result.obligations.filter((o) => o.category === "PAYROLL"),
    ).toHaveLength(0)
  }, 30_000)

  it("no organization_tax_profile row returns a visible configuration issue", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "closing-payroll-no-row",
      legalName: "Payroll No Row s.r.o.",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })
    await seedPeriod({
      orgId: org,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
    })
    await seedVatStatus({ orgId: org, validFrom: "2026-01-01" })

    sessionUserId = user
    cookieValue = undefined

    const result = await getClosingObligations("closing-payroll-no-row")

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(
      result.obligations.filter((o) => o.category === "PAYROLL"),
    ).toHaveLength(0)
    expect(result.issues.map((issue) => issue.code)).toContain(
      "PAYROLL_PROFILE_MISSING",
    )
  }, 30_000)

  it("period-effective organization_tax_profile: switching the active-period cookie between two periods selects each period's OWN has_employees row (not merely the org's current one)", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "closing-payroll-history",
      legalName: "Payroll History s.r.o.",
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

    await seedVatStatus({ orgId: org, validFrom: "2025-01-01" })
    await seedTaxProfile({
      orgId: org,
      hasEmployees: false,
      validFrom: "2025-01-01",
      validTo: "2025-12-31",
    })
    await seedTaxProfile({
      orgId: org,
      hasEmployees: true,
      validFrom: "2026-01-01",
    })

    sessionUserId = user

    cookieValue = period2025
    const result2025 = await getClosingObligations("closing-payroll-history")
    expect(result2025.status).toBe("ok")
    if (result2025.status === "ok") {
      expect(
        result2025.obligations.filter((o) => o.category === "PAYROLL"),
      ).toHaveLength(0)
    }

    cookieValue = period2026
    const result2026 = await getClosingObligations("closing-payroll-history")
    expect(result2026.status).toBe("ok")
    if (result2026.status === "ok") {
      expect(
        result2026.obligations.some((o) => o.kind === "SOCIAL_INSURANCE"),
      ).toBe(true)
    }
  }, 30_000)
})

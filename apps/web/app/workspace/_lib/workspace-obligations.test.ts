/**
 * Integration test for `computeWorkspaceObligations` — the shared engine
 * behind both the Companies "next deadline" card field and the Legislation
 * board. Mirrors the seeding harness in `../../[orgSlug]/closing/_lib/closing-data.test.ts`
 * / `../../[orgSlug]/settings/tax-profile.test.ts` (AFF-119 / E7b): the module
 * under test is imported dynamically in `beforeAll` so its transitive
 * `@workspace/db` import binds AFTER globalSetup sets DATABASE_URL. Unlike
 * those loaders, `computeWorkspaceObligations` takes `activeWorkspaceId`
 * directly (no cookie/session dependency), so no `next/headers` mocking is
 * needed here.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import postgres from "postgres"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"

let computeWorkspaceObligations: (typeof import("./workspace-obligations"))["computeWorkspaceObligations"]
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
    VALUES (${`workspace-obligations-${Date.now()}-${seq}@test.invalid`}, 'User', 'user')
    RETURNING id
  `
  if (!user) throw new Error("user insert failed")
  return user.id
}

async function seedWorkspace(creatorId: string): Promise<string> {
  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Workspace Obligations Test Workspace', ${creatorId}::uuid)
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

/** Insert a vat_status row. `validTo` omitted (or null) = current (open-ended). */
async function seedVatStatus(opts: {
  orgId: string
  vatRegimeCode: "NON_PAYER" | "PAYER" | "IDENTIFIED_PERSON"
  validFrom: string
  filingPeriod: "MONTHLY" | "QUARTERLY" | null
}): Promise<void> {
  await sql`
    INSERT INTO vat_status (organization_id, vat_regime_code, valid_from, filing_period)
    VALUES (${opts.orgId}::uuid, ${opts.vatRegimeCode}, ${opts.validFrom}, ${opts.filingPeriod})
  `
}

/** Insert an organization_tax_profile row. `validTo` omitted = current (open-ended). */
async function seedTaxProfile(opts: {
  orgId: string
  hasEmployees: boolean
  validFrom: string
}): Promise<void> {
  await sql`
    INSERT INTO organization_tax_profile (organization_id, has_employees, valid_from)
    VALUES (${opts.orgId}::uuid, ${opts.hasEmployees}, ${opts.validFrom})
  `
}

async function archiveOrg(orgId: string): Promise<void> {
  await sql`UPDATE organization SET archived_at = now() WHERE id = ${orgId}::uuid`
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
  ;({ computeWorkspaceObligations } = await import("./workspace-obligations"))
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

describe("computeWorkspaceObligations", () => {
  it("PAYER MONTHLY org with employees -> VAT + KH + payroll for its current (calendar-2026) period", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "wo-payer-monthly",
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
    await seedTaxProfile({
      orgId: org,
      hasEmployees: true,
      validFrom: "2026-01-01",
    })

    const result = await computeWorkspaceObligations(ws)
    const obligations = result.get(org) ?? []

    expect(obligations.filter((o) => o.kind === "VAT_RETURN")).toHaveLength(12)
    expect(
      obligations.filter((o) => o.kind === "CONTROL_STATEMENT"),
    ).toHaveLength(12)
    expect(obligations.filter((o) => o.category === "PAYROLL")).toHaveLength(36)
    for (const o of obligations) {
      expect(o.organizationId).toBe(org)
    }
  }, 30_000)

  it("VAT-unconfigured PAYER (filing_period null) with employees -> ONLY payroll (no throw)", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "wo-vat-unconfigured",
      legalName: "Vat Unconfigured s.r.o.",
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
    await seedTaxProfile({
      orgId: org,
      hasEmployees: true,
      validFrom: "2026-01-01",
    })

    const result = await computeWorkspaceObligations(ws)
    const obligations = result.get(org) ?? []

    expect(obligations).toHaveLength(36)
    expect(obligations.every((o) => o.category === "PAYROLL")).toBe(true)
  }, 30_000)

  it("org with no accounting period contributes nothing (not even an empty entry)", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "wo-no-period",
      legalName: "No Period s.r.o.",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })

    const result = await computeWorkspaceObligations(ws)

    expect(result.has(org)).toBe(false)
  }, 30_000)

  it("an archived org contributes nothing even with a period + VAT + employees", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "wo-archived",
      legalName: "Archived s.r.o.",
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
    await seedTaxProfile({
      orgId: org,
      hasEmployees: true,
      validFrom: "2026-01-01",
    })
    await archiveOrg(org)

    const result = await computeWorkspaceObligations(ws)

    expect(result.has(org)).toBe(false)
  }, 30_000)

  it("status is date-derived: every obligation carries one of the three derived buckets, dueDate-sorted", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "wo-status-derived",
      legalName: "Status Derived s.r.o.",
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
    await seedTaxProfile({
      orgId: org,
      hasEmployees: true,
      validFrom: "2026-01-01",
    })

    const result = await computeWorkspaceObligations(ws)
    const obligations = result.get(org) ?? []

    expect(obligations.length).toBeGreaterThan(0)
    for (const o of obligations) {
      expect(["Overdue", "Due soon", "Upcoming"]).toContain(o.status)
    }
    const dueDates = obligations.map((o) => o.dueDate)
    expect(dueDates).toEqual([...dueDates].sort())
  }, 30_000)

  it("batches TWO differently-configured orgs in one workspace and fences out a THIRD org in a different workspace", async () => {
    const user = await seedUser()
    const wsA = await seedWorkspace(user)
    const wsB = await seedWorkspace(user)

    const payerOrg = await seedOrg({
      workspaceId: wsA,
      slug: "wo-batch-payer",
      legalName: "Batch Payer s.r.o.",
    })
    await addOrgMember({ orgId: payerOrg, workspaceId: wsA, userId: user })
    await seedPeriod({
      orgId: payerOrg,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
    })
    await seedVatStatus({
      orgId: payerOrg,
      vatRegimeCode: "PAYER",
      validFrom: "2026-01-01",
      filingPeriod: "MONTHLY",
    })
    await seedTaxProfile({
      orgId: payerOrg,
      hasEmployees: true,
      validFrom: "2026-01-01",
    })

    const nonPayerOrg = await seedOrg({
      workspaceId: wsA,
      slug: "wo-batch-nonpayer",
      legalName: "Batch NonPayer s.r.o.",
    })
    await addOrgMember({ orgId: nonPayerOrg, workspaceId: wsA, userId: user })
    await seedPeriod({
      orgId: nonPayerOrg,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
    })
    await seedVatStatus({
      orgId: nonPayerOrg,
      vatRegimeCode: "NON_PAYER",
      validFrom: "2026-01-01",
      filingPeriod: null,
    })
    await seedTaxProfile({
      orgId: nonPayerOrg,
      hasEmployees: false,
      validFrom: "2026-01-01",
    })

    const otherWorkspaceOrg = await seedOrg({
      workspaceId: wsB,
      slug: "wo-batch-other-ws",
      legalName: "Other Workspace s.r.o.",
    })
    await addOrgMember({
      orgId: otherWorkspaceOrg,
      workspaceId: wsB,
      userId: user,
    })
    await seedPeriod({
      orgId: otherWorkspaceOrg,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
    })
    await seedVatStatus({
      orgId: otherWorkspaceOrg,
      vatRegimeCode: "PAYER",
      validFrom: "2026-01-01",
      filingPeriod: "MONTHLY",
    })
    await seedTaxProfile({
      orgId: otherWorkspaceOrg,
      hasEmployees: true,
      validFrom: "2026-01-01",
    })

    const result = await computeWorkspaceObligations(wsA)

    // Exactly the two workspace-A org ids — the workspace fence holds, the
    // third org (a different workspace) contributes nothing to this Map.
    expect(Array.from(result.keys()).sort()).toEqual(
      [payerOrg, nonPayerOrg].sort(),
    )
    expect(result.has(otherWorkspaceOrg)).toBe(false)

    const payerObligations = result.get(payerOrg) ?? []
    expect(payerObligations.every((o) => o.organizationId === payerOrg)).toBe(
      true,
    )
    expect(
      payerObligations.filter((o) => o.kind === "VAT_RETURN"),
    ).toHaveLength(12)
    expect(
      payerObligations.filter((o) => o.kind === "CONTROL_STATEMENT"),
    ).toHaveLength(12)
    expect(
      payerObligations.filter((o) => o.category === "PAYROLL"),
    ).toHaveLength(36)

    // NON_PAYER with no employees generates no obligations — the honest
    // empty answer, not a fabricated schedule (see obligations.ts doc).
    const nonPayerObligations = result.get(nonPayerOrg) ?? []
    expect(
      nonPayerObligations.every((o) => o.organizationId === nonPayerOrg),
    ).toBe(true)
    expect(nonPayerObligations).toEqual([])
  }, 30_000)
})

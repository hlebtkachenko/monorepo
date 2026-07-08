/**
 * Integration test for the Closing VAT loaders — `getVatFilingPeriods` /
 * `getVatReturn` — plus a pure unit test for `pickDefaultFilingPeriod`.
 * Mirrors `closing-data.test.ts` (AFF-119 / E7b): the module under test + its
 * transitive `@workspace/db` imports are loaded dynamically in `beforeAll` so
 * the DB singletons bind AFTER globalSetup has set DATABASE_URL. `next/headers`
 * (`cookies`) and the `../../../_lib/request-session` module (imported by
 * `accounting-data.ts`, which `vat-data.ts` calls into via
 * `getOrgAccountingContext`) are `vi.mock`ed so the test controls the
 * active-period cookie and the signed-in user without a real Next.js
 * request/response.
 *
 * VAT facts are seeded through the real `@workspace/accounting` capture
 * pipeline (`createNumberSeries` / `createEvent` / `captureDocument`) rather
 * than hand-written INSERTs — `buildDph` reads straight off
 * partial_record/individual_record/summary_record/accounting_event, and the
 * capture pipeline is the one path guaranteed to produce rows that satisfy
 * every FK/CHECK constraint those tables carry.
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

let getVatFilingPeriods: (typeof import("./vat-data"))["getVatFilingPeriods"]
let getVatReturn: (typeof import("./vat-data"))["getVatReturn"]
let getControlStatement: (typeof import("./vat-data"))["getControlStatement"]
let getEcSalesList: (typeof import("./vat-data"))["getEcSalesList"]
let pickDefaultFilingPeriod: (typeof import("./vat-data"))["pickDefaultFilingPeriod"]
let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]
let withOrganization: (typeof import("@workspace/db"))["withOrganization"]
let createNumberSeries: (typeof import("@workspace/accounting"))["createNumberSeries"]
let createEvent: (typeof import("@workspace/accounting"))["createEvent"]
let captureDocument: (typeof import("@workspace/accounting"))["captureDocument"]

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
    VALUES (${`vat-data-${Date.now()}-${seq}@test.invalid`}, 'User', 'user')
    RETURNING id
  `
  if (!user) throw new Error("user insert failed")
  return user.id
}

async function seedWorkspace(creatorId: string): Promise<string> {
  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Vat Data Test Workspace', ${creatorId}::uuid)
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

/**
 * Capture one ISSUED_INVOICE VAT fact (STANDARD, 21 %) through the real
 * @workspace/accounting capture pipeline — allocates its own number series so
 * repeat calls in the same org don't collide.
 */
async function captureStandardSale(opts: {
  orgId: string
  workspaceId: string
  userId: string
  periodId: string
  occurredAt: string
  baseAmount: string
  vatAmount: string
}): Promise<void> {
  seq += 1
  const ctx = { organizationId: opts.orgId, workspaceId: opts.workspaceId }
  await withOrganization(opts.orgId, opts.userId, async (db) => {
    const eventSeriesId = await createNumberSeries(db, ctx, {
      entityType: "EVENT",
      code: `EV${seq}`,
      pattern: "EV{YYYY}{NNNN}",
    })
    const documentSeriesId = await createNumberSeries(db, ctx, {
      entityType: "DOCUMENT",
      code: `FV${seq}`,
      pattern: "FV{YYYY}{NNNN}",
    })
    const ev = await createEvent(db, ctx, {
      periodId: opts.periodId,
      seriesId: eventSeriesId,
      description: "FV 21%",
      occurredAt: opts.occurredAt,
      responsibleUserId: opts.userId,
    })
    await captureDocument(db, ctx, {
      periodId: opts.periodId,
      seriesId: documentSeriesId,
      type: "ISSUED_INVOICE",
      issuedAt: opts.occurredAt,
      lines: [
        {
          eventId: ev.eventId,
          partials: [
            {
              baseAmount: opts.baseAmount,
              vatRate: "21",
              vatMode: "STANDARD",
              vatAmount: opts.vatAmount,
              currencyCode: "CZK",
            },
          ],
        },
      ],
    })
  })
}

async function cleanup(): Promise<void> {
  // truncateAll does not touch accounting_period / vat_status / the capture
  // tables — clear the capture pipeline's own child tables first (FK order:
  // partial_record -> individual_record -> summary_record/accounting_event ->
  // accounting_period), then the rest.
  await sql`DELETE FROM partial_record`
  await sql`DELETE FROM individual_record`
  await sql`DELETE FROM summary_record`
  await sql`DELETE FROM accounting_event`
  await sql`DELETE FROM number_series`
  await sql`DELETE FROM vat_status`
  await sql`DELETE FROM accounting_period`
  await truncateAll(sql)
}

beforeAll(async () => {
  ;({ adminClient, truncateAll } = await import("@workspace/db/tests/fixtures"))
  ;({ withOrganization } = await import("@workspace/db"))
  ;({ createNumberSeries, createEvent, captureDocument } =
    await import("@workspace/accounting"))
  ;({
    getVatFilingPeriods,
    getVatReturn,
    getControlStatement,
    getEcSalesList,
    pickDefaultFilingPeriod,
  } = await import("./vat-data"))
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

describe("getVatFilingPeriods", () => {
  it("PAYER + MONTHLY, calendar-2026 open period -> ok with 12 monthly filing periods", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "vat-payer-monthly",
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

    const result = await getVatFilingPeriods("vat-payer-monthly")

    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    expect(result.regime).toBe("PAYER")
    expect(result.filingPeriod).toBe("MONTHLY")
    expect(result.filingPeriods).toHaveLength(12)
    expect(result.filingPeriods[0]).toEqual({
      label: "January 2026",
      from: "2026-01-01",
      to: "2026-01-31",
    })
    expect(result.filingPeriods[11]).toEqual({
      label: "December 2026",
      from: "2026-12-01",
      to: "2026-12-31",
    })
  }, 30_000)

  it("NON_PAYER org -> not-payer (no VAT filing periods to show)", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "vat-non-payer",
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

    const result = await getVatFilingPeriods("vat-non-payer")

    expect(result.status).toBe("not-payer")
  }, 30_000)

  it("PAYER with filing_period NULL -> vat-unconfigured (engine not called, no throw)", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "vat-unconfigured",
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

    const result = await getVatFilingPeriods("vat-unconfigured")

    expect(result.status).toBe("vat-unconfigured")
  }, 30_000)

  it("org with no accounting_period -> no-period", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "vat-no-period",
      legalName: "No Period s.r.o.",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })

    sessionUserId = user
    cookieValue = undefined

    const result = await getVatFilingPeriods("vat-no-period")

    expect(result.status).toBe("no-period")
  }, 30_000)

  it("IDENTIFIED_PERSON org -> identified-person (event-driven filer, no standing cadence)", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "vat-identified-person",
      legalName: "Identified Person s.r.o.",
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
      vatRegimeCode: "IDENTIFIED_PERSON",
      validFrom: "2026-01-01",
      filingPeriod: null,
    })

    sessionUserId = user
    cookieValue = undefined

    const result = await getVatFilingPeriods("vat-identified-person")

    expect(result.status).toBe("identified-person")
  }, 30_000)
})

describe("per-kind filing cadence divergence (KH quarterly, SH always monthly)", () => {
  it("NATURAL person + PAYER/QUARTERLY -> KH 4 quarterly, SH 12 monthly, DAP 4 quarterly", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "vat-natural-quarterly",
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

    const kh = await getControlStatement("vat-natural-quarterly")
    expect(kh.status).toBe("ok")
    if (kh.status !== "ok") return
    expect(kh.filingPeriods).toHaveLength(4)
    expect(kh.filingPeriods.map((fp) => fp.label)).toEqual([
      "Q1 2026",
      "Q2 2026",
      "Q3 2026",
      "Q4 2026",
    ])

    const sh = await getEcSalesList("vat-natural-quarterly")
    expect(sh.status).toBe("ok")
    if (sh.status !== "ok") return
    expect(sh.filingPeriods).toHaveLength(12)

    const dap = await getVatFilingPeriods("vat-natural-quarterly")
    expect(dap.status).toBe("ok")
    if (dap.status !== "ok") return
    expect(dap.filingPeriods).toHaveLength(4)
  }, 30_000)
})

describe("getVatReturn", () => {
  it("a filing period with a captured VAT fact returns non-zero ř.1; a different empty month returns zero", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "vat-return-figures",
      legalName: "VAT Return Figures s.r.o.",
    })
    await addOrgMember({ orgId: org, workspaceId: ws, userId: user })
    const periodId = await seedPeriod({
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
    await captureStandardSale({
      orgId: org,
      workspaceId: ws,
      userId: user,
      periodId,
      occurredAt: "2026-03-05",
      baseAmount: "1000.00",
      vatAmount: "210.00",
    })

    sessionUserId = user
    cookieValue = undefined

    const march = await getVatReturn(
      "vat-return-figures",
      "2026-03-01",
      "2026-03-31",
    )
    expect(march.status).toBe("ok")
    if (march.status !== "ok") return
    expect(march.selected).toEqual({
      label: "March 2026",
      from: "2026-03-01",
      to: "2026-03-31",
    })
    expect(march.dph.rows.r1_base).toBe("1000.0000")
    expect(march.dph.rows.r1_dan).toBe("210.0000")
    expect(march.dph.rows.vlastni_dan).toBe("210.0000")

    const april = await getVatReturn(
      "vat-return-figures",
      "2026-04-01",
      "2026-04-30",
    )
    expect(april.status).toBe("ok")
    if (april.status !== "ok") return
    expect(april.dph.rows.r1_base).toBe("0.0000")
    expect(april.dph.rows.r1_dan).toBe("0.0000")
    expect(april.dph.rows.vlastni_dan).toBe("0.0000")
  }, 30_000)

  it("a crafted/stale `?fp=` value that doesn't name a real filing period falls back to a real one, not an arbitrary range", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "vat-return-crafted-fp",
      legalName: "VAT Return Crafted FP s.r.o.",
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

    const result = await getVatReturn(
      "vat-return-crafted-fp",
      "2099-01-01",
      "2099-01-31",
    )
    expect(result.status).toBe("ok")
    if (result.status !== "ok") return
    // Fell back to a REAL filing period of this org's 2026 period, not the
    // crafted 2099 range.
    expect(result.selected.from).not.toBe("2099-01-01")
    expect(
      result.filingPeriods.some((fp) => fp.from === result.selected.from),
    ).toBe(true)
  }, 30_000)
})

describe("pickDefaultFilingPeriod", () => {
  const filingPeriods = [
    { label: "January 2026", from: "2026-01-01", to: "2026-01-31" },
    { label: "February 2026", from: "2026-02-01", to: "2026-02-28" },
    { label: "March 2026", from: "2026-03-01", to: "2026-03-31" },
  ]

  it("picks the latest period whose end is on or before today", () => {
    expect(pickDefaultFilingPeriod(filingPeriods, "2026-02-15")).toEqual(
      filingPeriods[0],
    )
    expect(pickDefaultFilingPeriod(filingPeriods, "2026-03-31")).toEqual(
      filingPeriods[2],
    )
  })

  it("falls back to the first period when today is before every period's end", () => {
    expect(pickDefaultFilingPeriod(filingPeriods, "2020-01-01")).toEqual(
      filingPeriods[0],
    )
  })

  it("returns null for an empty filing-period list", () => {
    expect(pickDefaultFilingPeriod([], "2026-01-01")).toBeNull()
  })
})

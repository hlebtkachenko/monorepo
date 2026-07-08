/**
 * Integration tests for `getHeaderPeriods` + `resolveActivePeriodId` — the
 * app-shell accounting-period switcher data fetched by the org-scoped layout.
 *
 * Mirrors `header-org.test.ts` (AFF-119 / E7b): the helper + its transitive
 * `@workspace/db` imports are loaded dynamically in `beforeAll` so the DB
 * singletons bind AFTER globalSetup has set DATABASE_URL.
 *
 * Covered behaviors:
 *   - getHeaderPeriods returns only the current org's periods
 *   - ordered newest-first (period_start desc)
 *   - open/closed status is surfaced verbatim for the client `toPeriod` mapper
 *   - resolveActivePeriodId / resolveActivePeriod: cookie-in-list wins; else
 *     newest OPEN; else newest; else null
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import postgres from "postgres"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"

let getHeaderPeriods: (typeof import("./header-periods"))["getHeaderPeriods"]
let resolveActivePeriodId: (typeof import("./header-periods"))["resolveActivePeriodId"]
let resolveActivePeriod: (typeof import("./header-periods"))["resolveActivePeriod"]
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
    VALUES (${`header-periods-${Date.now()}-${seq}@test.invalid`}, 'User', 'user')
    RETURNING id
  `
  if (!user) throw new Error("user insert failed")
  return user.id
}

async function seedWorkspace(creatorId: string): Promise<string> {
  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Header Periods Test Workspace', ${creatorId}::uuid)
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
  ;({ getHeaderPeriods, resolveActivePeriodId, resolveActivePeriod } =
    await import("./header-periods"))
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

describe("getHeaderPeriods", () => {
  it("returns the org's periods newest-first with status", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "current",
      legalName: "Current Org",
    })

    await seedPeriod({
      orgId: org,
      start: "2024-01-01",
      end: "2024-12-31",
      status: "CLOSED",
    })
    await seedPeriod({
      orgId: org,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
    })
    await seedPeriod({
      orgId: org,
      start: "2025-01-01",
      end: "2025-12-31",
      status: "CLOSED",
    })

    const periods = await getHeaderPeriods({ organizationId: org })

    expect(periods.map((p) => p.period_start)).toEqual([
      "2026-01-01",
      "2025-01-01",
      "2024-01-01",
    ])
    const byStart = Object.fromEntries(periods.map((p) => [p.period_start, p]))
    expect(byStart["2026-01-01"]?.status).toBe("OPEN")
    expect(byStart["2024-01-01"]?.status).toBe("CLOSED")
  }, 30_000)

  it("scopes to the requested org, excluding other orgs' periods", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const mine = await seedOrg({
      workspaceId: ws,
      slug: "mine",
      legalName: "Mine Org",
    })
    const other = await seedOrg({
      workspaceId: ws,
      slug: "other",
      legalName: "Other Org",
    })

    const minePeriod = await seedPeriod({
      orgId: mine,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
    })
    await seedPeriod({
      orgId: other,
      start: "2026-01-01",
      end: "2026-12-31",
      status: "OPEN",
    })

    const periods = await getHeaderPeriods({ organizationId: mine })

    expect(periods).toHaveLength(1)
    expect(periods[0]?.id).toBe(minePeriod)
  }, 30_000)

  it("returns an empty list for an org with no periods", async () => {
    const user = await seedUser()
    const ws = await seedWorkspace(user)
    const org = await seedOrg({
      workspaceId: ws,
      slug: "empty",
      legalName: "Empty Org",
    })

    const periods = await getHeaderPeriods({ organizationId: org })
    expect(periods).toEqual([])
  }, 30_000)
})

describe("resolveActivePeriodId", () => {
  const periods = [
    {
      id: "p2026",
      period_start: "2026-01-01",
      period_end: "2026-12-31",
      status: "OPEN" as const,
    },
    {
      id: "p2025",
      period_start: "2025-01-01",
      period_end: "2025-12-31",
      status: "CLOSED" as const,
    },
  ]

  it("honors the cookie when it names one of the org's periods", () => {
    expect(resolveActivePeriodId(periods, "p2025")).toBe("p2025")
  })

  it("falls back to the newest OPEN period for an unknown cookie", () => {
    expect(resolveActivePeriodId(periods, "from-another-org")).toBe("p2026")
    expect(resolveActivePeriodId(periods, undefined)).toBe("p2026")
  })

  it("falls back to the newest period when none is open", () => {
    const closed = [
      {
        id: "a",
        period_start: "2025-01-01",
        period_end: "2025-12-31",
        status: "CLOSED" as const,
      },
      {
        id: "b",
        period_start: "2024-01-01",
        period_end: "2024-12-31",
        status: "CLOSED" as const,
      },
    ]
    expect(resolveActivePeriodId(closed, null)).toBe("a")
  })

  it("returns null for an org with no periods", () => {
    expect(resolveActivePeriodId([], undefined)).toBeNull()
  })
})

describe("resolveActivePeriod", () => {
  const periods = [
    {
      id: "p2026",
      period_start: "2026-01-01",
      period_end: "2026-12-31",
      status: "OPEN" as const,
    },
    {
      id: "p2025",
      period_start: "2025-01-01",
      period_end: "2025-12-31",
      status: "CLOSED" as const,
    },
  ]

  it("returns the full row when the cookie names one of the org's periods", () => {
    expect(resolveActivePeriod(periods, "p2025")).toEqual(periods[1])
  })

  it("falls back to the newest OPEN row for an unknown/undefined cookie", () => {
    expect(resolveActivePeriod(periods, "from-another-org")).toEqual(periods[0])
    expect(resolveActivePeriod(periods, undefined)).toEqual(periods[0])
  })

  it("falls back to the newest row when none is open", () => {
    const closed = [
      {
        id: "a",
        period_start: "2025-01-01",
        period_end: "2025-12-31",
        status: "CLOSED" as const,
      },
      {
        id: "b",
        period_start: "2024-01-01",
        period_end: "2024-12-31",
        status: "CLOSED" as const,
      },
    ]
    expect(resolveActivePeriod(closed, null)).toEqual(closed[0])
  })

  it("returns null for an org with no periods", () => {
    expect(resolveActivePeriod([], undefined)).toBeNull()
  })
})

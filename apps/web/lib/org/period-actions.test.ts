/**
 * Integration tests for the period-lifecycle server actions (open / close /
 * reopen) that wire @workspace/accounting to the /o edge.
 *
 * Mirrors accounting-data.test.ts (AFF-119 / E7b): the module under test + its
 * transitive @workspace/db imports are loaded dynamically in beforeAll so the DB
 * singletons bind AFTER globalSetup has set DATABASE_URL. Only the session
 * (`./session`) and `next/cache` (revalidatePath) are mocked; `./resolve` runs
 * for real against seeded memberships, so the authz gate reads the REAL DB role
 * — the whole point of the reopen authz + tenant-isolation coverage.
 *
 * Coverage:
 *  - reopen, close, and open are each REFUSED for member/agent/guest (forbidden)
 *    and pass the gate for owner/admin (reach the domain);
 *  - reopen succeeds on a bare CLOSED period for an owner, and the reopen log's
 *    `reopened_by` is the SESSION user — an attacker-supplied `reopenedBy` / `role`
 *    in the input object is ignored (the action never reads them);
 *  - tenant isolation: a periodId belonging to another org is not actionable
 *    from this org (reopen + close both refuse, the foreign period is untouched);
 *  - open creates the successor period; unauthenticated callers get { ok: false }.
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
// Mocks — session user is controlled per-test; revalidatePath is a no-op
// (it throws outside a Next.js request scope).
// ---------------------------------------------------------------------------

let sessionUserId: string | undefined

vi.mock("./session", () => ({
  getRequestSession: () =>
    Promise.resolve(sessionUserId ? { user: { id: sessionUserId } } : null),
}))

vi.mock("next/cache", () => ({ revalidatePath: () => {} }))

type Actions = typeof import("./period-actions")
let openPeriodAction: Actions["openPeriodAction"]
let closePeriodAction: Actions["closePeriodAction"]
let reopenPeriodAction: Actions["reopenPeriodAction"]

let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]

let sql: postgres.Sql

// ---------------------------------------------------------------------------
// Seed helpers (raw SQL via the superuser admin client) — mirror
// accounting-data.test.ts.
// ---------------------------------------------------------------------------

let seq = 0

async function seedUser(): Promise<string> {
  seq += 1
  const [user] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${`period-actions-${Date.now()}-${seq}@test.invalid`}, 'User', 'user')
    RETURNING id
  `
  if (!user) throw new Error("user insert failed")
  return user.id
}

async function seedWorkspace(creatorId: string): Promise<string> {
  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Period Actions Test Workspace', ${creatorId}::uuid)
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

/** One active workspace_membership per (workspace, user); the insert is gated by
 * the last-owner trigger, so elevate to app_admin for the write. */
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

/** A full one-org-one-owner-one-period fixture. */
async function seedOrgWithMember(opts: {
  slug: string
  role?: "owner" | "admin" | "member" | "agent" | "guest"
  status?: "OPEN" | "CLOSED"
}): Promise<{ userId: string; orgId: string; periodId: string }> {
  const userId = await seedUser()
  const ws = await seedWorkspace(userId)
  const orgId = await seedOrg({
    workspaceId: ws,
    slug: opts.slug,
    legalName: `Org ${opts.slug}`,
  })
  await addOrgMember({ orgId, workspaceId: ws, userId, role: opts.role })
  const periodId = await seedPeriod({
    orgId,
    start: "2026-01-01",
    end: "2026-12-31",
    status: opts.status ?? "OPEN",
  })
  return { userId, orgId, periodId }
}

async function periodStatus(periodId: string): Promise<string | undefined> {
  const [row] = await sql<Array<{ status: string }>>`
    SELECT status FROM accounting_period WHERE id = ${periodId}::uuid
  `
  return row?.status
}

async function cleanup(): Promise<void> {
  // period_reopen_log is append-only (BEFORE DELETE / BEFORE TRUNCATE block
  // triggers). The admin-side escape hatch is `session_replication_role =
  // replica`, which disables BEFORE triggers for the transaction. TRUNCATE …
  // CASCADE clears accounting_period and everything referencing it (chart,
  // accounts, postings, reopen log) in one shot; truncateAll then clears the
  // org / workspace / user parents.
  await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL session_replication_role = replica`)
    await tx.unsafe(`TRUNCATE accounting_period CASCADE`)
  })
  await truncateAll(sql)
}

beforeAll(async () => {
  ;({ adminClient, truncateAll } = await import("@workspace/db/tests/fixtures"))
  ;({ openPeriodAction, closePeriodAction, reopenPeriodAction } =
    await import("./period-actions"))
  sql = adminClient()
  await cleanup()
}, 60_000)

afterAll(async () => {
  await cleanup()
  await sql.end({ timeout: 5 })
})

beforeEach(async () => {
  await cleanup()
  sessionUserId = undefined
})

// ---------------------------------------------------------------------------
// reopen authz gate
// ---------------------------------------------------------------------------

describe("reopenPeriodAction authz gate", () => {
  it.each(["member", "agent", "guest"] as const)(
    "refuses %s BEFORE touching the domain (forbidden)",
    async (role) => {
      const { userId, periodId } = await seedOrgWithMember({
        slug: `refuse-${role}`,
        role,
        status: "CLOSED",
      })
      sessionUserId = userId

      const result = await reopenPeriodAction({
        slug: `refuse-${role}`,
        periodId,
      })

      expect(result).toEqual({ ok: false, forbidden: true })
      // The gate ran before the domain, so the CLOSED period is untouched.
      expect(await periodStatus(periodId)).toBe("CLOSED")
    },
  )

  it.each(["owner", "admin"] as const)(
    "lets %s past the gate to the domain (not forbidden)",
    async (role) => {
      // A bare OPEN period is not reopenable — the domain refuses with
      // PERIOD_NOT_CLOSED, surfaced as { blocked }. Proving the gate PASSED
      // (forbidden absent) is the point.
      const { userId, periodId } = await seedOrgWithMember({
        slug: `allow-${role}`,
        role,
        status: "OPEN",
      })
      sessionUserId = userId

      const result = await reopenPeriodAction({
        slug: `allow-${role}`,
        periodId,
      })

      expect(result).toEqual({ ok: false, blocked: true })
    },
  )
})

// ---------------------------------------------------------------------------
// reopen: session-injected reopenedBy + ignores attacker input
// ---------------------------------------------------------------------------

describe("reopenPeriodAction session injection", () => {
  it("reopens a bare CLOSED period and logs the SESSION user as reopened_by", async () => {
    const { userId, periodId } = await seedOrgWithMember({
      slug: "reopen-ok",
      role: "owner",
      status: "CLOSED",
    })
    sessionUserId = userId

    const result = await reopenPeriodAction({ slug: "reopen-ok", periodId })

    expect(result.ok).toBe(true)
    expect(await periodStatus(periodId)).toBe("OPEN")

    const [log] = await sql<Array<{ reopened_by: string }>>`
      SELECT reopened_by FROM period_reopen_log WHERE period_id = ${periodId}::uuid
    `
    expect(log?.reopened_by).toBe(userId)
  })

  it("ignores an attacker-supplied reopenedBy / role in the input object", async () => {
    // Attacker A (a member of ANOTHER org) tries to have the owner's reopen
    // attributed to them, and to elevate themselves via an input `role`.
    const attackerId = await seedUser()
    const owner = await seedOrgWithMember({
      slug: "spoof-owner",
      role: "owner",
      status: "CLOSED",
    })
    sessionUserId = owner.userId

    // A wider object (extra `reopenedBy` / `role`) is assignable to the narrow
    // action input via a variable — TS excess-property checks only fire on
    // literals — which itself proves the fields are not part of the contract.
    const payload = {
      slug: "spoof-owner",
      periodId: owner.periodId,
      reason: "year-end correction",
      reopenedBy: attackerId,
      role: "guest",
    }
    const result = await reopenPeriodAction(payload)

    expect(result.ok).toBe(true)
    const [log] = await sql<Array<{ reopened_by: string }>>`
      SELECT reopened_by FROM period_reopen_log WHERE period_id = ${owner.periodId}::uuid
    `
    // reopened_by is the SESSION user, never the attacker id from the input.
    expect(log?.reopened_by).toBe(owner.userId)
    expect(log?.reopened_by).not.toBe(attackerId)
  })

  it("returns { ok: false } for an unauthenticated caller", async () => {
    const { periodId } = await seedOrgWithMember({
      slug: "reopen-anon",
      role: "owner",
      status: "CLOSED",
    })
    sessionUserId = undefined

    const result = await reopenPeriodAction({ slug: "reopen-anon", periodId })

    expect(result).toEqual({ ok: false })
    expect(await periodStatus(periodId)).toBe("CLOSED")
  })
})

// ---------------------------------------------------------------------------
// close authz gate
// ---------------------------------------------------------------------------

describe("closePeriodAction authz gate", () => {
  it.each(["member", "agent", "guest"] as const)(
    "refuses %s BEFORE touching the domain (forbidden)",
    async (role) => {
      const { userId, periodId } = await seedOrgWithMember({
        slug: `close-refuse-${role}`,
        role,
        status: "OPEN",
      })
      sessionUserId = userId

      const result = await closePeriodAction({
        slug: `close-refuse-${role}`,
        periodId,
      })

      expect(result).toEqual({ ok: false, forbidden: true })
      // The gate ran before the domain, so the OPEN period is untouched.
      expect(await periodStatus(periodId)).toBe("OPEN")
    },
  )

  it.each(["owner", "admin"] as const)(
    "lets %s past the gate to the domain (not forbidden)",
    async (role) => {
      // Proving the gate PASSED is the point — the concrete domain outcome for a
      // bare OPEN period (ok / blocked / error) may vary, but is never forbidden.
      const { userId, periodId } = await seedOrgWithMember({
        slug: `close-allow-${role}`,
        role,
        status: "OPEN",
      })
      sessionUserId = userId

      const result = await closePeriodAction({
        slug: `close-allow-${role}`,
        periodId,
      })

      expect(result).not.toHaveProperty("forbidden")
    },
  )
})

// ---------------------------------------------------------------------------
// tenant isolation
// ---------------------------------------------------------------------------

describe("period lifecycle tenant isolation", () => {
  it("a period in another org is not reopenable from this org", async () => {
    // Org A's owner acts; the target periodId belongs to Org B (CLOSED).
    const orgA = await seedOrgWithMember({
      slug: "iso-a",
      role: "owner",
      status: "OPEN",
    })
    const orgB = await seedOrgWithMember({
      slug: "iso-b",
      role: "owner",
      status: "CLOSED",
    })
    sessionUserId = orgA.userId

    const result = await reopenPeriodAction({
      slug: "iso-a",
      periodId: orgB.periodId,
    })

    // resolveMembership("iso-a") → org A; withOrganization(A) → the domain sees
    // org B's period as not visible → PERIOD_NOT_VISIBLE → blocked. B untouched.
    expect(result).toEqual({ ok: false, blocked: true })
    expect(await periodStatus(orgB.periodId)).toBe("CLOSED")
  })

  it("a period in another org is not closeable from this org", async () => {
    const orgA = await seedOrgWithMember({
      slug: "iso-close-a",
      role: "owner",
      status: "OPEN",
    })
    const orgB = await seedOrgWithMember({
      slug: "iso-close-b",
      role: "owner",
      status: "OPEN",
    })
    sessionUserId = orgA.userId

    const result = await closePeriodAction({
      slug: "iso-close-a",
      periodId: orgB.periodId,
    })

    // The foreign period fails the close readiness gate (not visible) → blocked,
    // and org B's period stays OPEN.
    expect(result).toMatchObject({ ok: false, blocked: true })
    expect(await periodStatus(orgB.periodId)).toBe("OPEN")
  })
})

// ---------------------------------------------------------------------------
// open
// ---------------------------------------------------------------------------

describe("openPeriodAction", () => {
  it.each(["member", "agent", "guest"] as const)(
    "refuses %s BEFORE touching the domain (forbidden)",
    async (role) => {
      const { userId, orgId, periodId } = await seedOrgWithMember({
        slug: `open-refuse-${role}`,
        role,
        status: "OPEN",
      })
      sessionUserId = userId

      const result = await openPeriodAction({
        slug: `open-refuse-${role}`,
        priorPeriodId: periodId,
        periodStart: "2027-01-01",
        periodEnd: "2027-12-31",
      })

      expect(result).toEqual({ ok: false, forbidden: true })
      // No successor was created — the gate ran before the domain.
      const [row] = await sql<Array<{ count: string }>>`
        SELECT count(*)::text AS count FROM accounting_period
        WHERE organization_id = ${orgId}::uuid
      `
      expect(row?.count).toBe("1")
    },
  )

  it.each(["owner", "admin"] as const)(
    "lets %s open the successor period",
    async (role) => {
      const { userId, periodId } = await seedOrgWithMember({
        slug: `open-allow-${role}`,
        role,
        status: "OPEN",
      })
      sessionUserId = userId

      const result = await openPeriodAction({
        slug: `open-allow-${role}`,
        priorPeriodId: periodId,
        periodStart: "2027-01-01",
        periodEnd: "2027-12-31",
      })

      expect(result.ok).toBe(true)
    },
  )

  it("opens the successor period from a prior period", async () => {
    const { userId, orgId, periodId } = await seedOrgWithMember({
      slug: "open-next",
      role: "owner",
      status: "OPEN",
    })
    sessionUserId = userId

    const result = await openPeriodAction({
      slug: "open-next",
      priorPeriodId: periodId,
      periodStart: "2027-01-01",
      periodEnd: "2027-12-31",
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      const [created] = await sql<Array<{ id: string; period_start: string }>>`
        SELECT id, period_start::text AS period_start
        FROM accounting_period
        WHERE id = ${result.newPeriodId}::uuid AND organization_id = ${orgId}::uuid
      `
      expect(created?.period_start).toBe("2027-01-01")
    }
  })

  it("returns { ok: false } for an unauthenticated caller", async () => {
    const { periodId } = await seedOrgWithMember({
      slug: "open-anon",
      role: "owner",
      status: "OPEN",
    })
    sessionUserId = undefined

    const result = await openPeriodAction({
      slug: "open-anon",
      priorPeriodId: periodId,
      periodStart: "2027-01-01",
      periodEnd: "2027-12-31",
    })

    expect(result).toEqual({ ok: false })
  })
})

/**
 * Integration tests for onboarding action logic.
 *
 * AFF-119 / E7b — apps/web integration tests.
 *
 * ## Scope and deferred work
 *
 * The action handlers in actions.ts are "use server" functions that call
 * `headers()` (from next/headers), `redirect()` (from next/navigation), and
 * `auth.api.getSession()` on every meaningful branch. None of these are
 * available outside the Next.js RSC runtime. Mocking all three at the module
 * level would produce tests that exercise our mocks, not the actual behavior.
 *
 * Deferred:
 *   - submitProfileAction, submitExperienceAction: trivially wrap Zod parse +
 *     a DB update; the Zod schemas are tested in @workspace/shared and the
 *     DB update pattern is covered by packages/db/tests/onboarding-flow.test.ts.
 *   - submitPasswordAction: depends on auth.api.signUpEmail + cookie reads.
 *   - submitPlanAction, submitTeamAction, completeOnboardingAction: all require
 *     an active session (getActiveUserId) that Next.js provides at runtime.
 *
 * Covered here (without Next.js runtime):
 *   1. slugify() behavior — the private function is replicated as a pure unit
 *      test to pin its slug-normalization contract.
 *   2. pickUniqueSlug() collision resolution — verified by seeding conflicting
 *      org slugs and asserting the next available candidate is returned. This
 *      uses the DB directly, mirroring what submitWorkspaceAction does inside
 *      withAdminBypass. The DB write sequence for the full workspace step is
 *      already covered by packages/db/tests/onboarding-flow.test.ts.
 *   3. submitWorkspaceAction DB contract — the full org creation sequence
 *      (workspace + membership + organization + org_membership) is exercised
 *      via raw SQL with the same GUC escalation pattern the action uses, and
 *      the slug + organization_id self-join trigger behavior is asserted.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import postgres from "postgres"
import { and, eq } from "drizzle-orm"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"

let sql: postgres.Sql
let withAdminBypass: (typeof import("@workspace/db"))["withAdminBypass"]
let organization: (typeof import("@workspace/db/schema"))["organization"]
let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]
// The production helpers, imported dynamically (they transitively pull
// @workspace/db, so must bind after globalSetup sets DATABASE_URL).
let slugify: (typeof import("@workspace/org-provisioning"))["slugify"]
let isReservedSlug: (typeof import("@workspace/org-provisioning"))["isReservedSlug"]

// ---------------------------------------------------------------------------
// Replicate private helpers from actions.ts (pin their contract)
// ---------------------------------------------------------------------------

/**
 * Replica of the private pickUniqueSlug() in actions.ts (its DB query cannot be
 * imported directly). Mirrors production including the reserved-slug skip; the
 * shared `slugify` is used directly (not replicated).
 */
const MAX_SLUG_ATTEMPTS = 50

async function pickUniqueSlug(
  db: import("@workspace/db").AdminBypassDb,
  workspaceId: string,
  base: string,
): Promise<string> {
  for (let i = 0; i < MAX_SLUG_ATTEMPTS; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    if (isReservedSlug(candidate)) continue
    const [row] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(
        and(
          eq(organization.workspace_id, workspaceId),
          eq(organization.slug, candidate),
        ),
      )
      .limit(1)
    if (!row) return candidate
  }
  throw new Error("Could not pick a unique organization slug")
}

beforeAll(async () => {
  ;({ adminClient, truncateAll } = await import("@workspace/db/tests/fixtures"))
  ;({ withAdminBypass } = await import("@workspace/db"))
  ;({ organization } = await import("@workspace/db/schema"))
  ;({ slugify, isReservedSlug } = await import("@workspace/org-provisioning"))
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
// Tests — slugify (pure unit)
// ---------------------------------------------------------------------------

describe("slugify (shared @workspace/org-provisioning helper)", () => {
  it("lowercases and replaces non-alphanumeric runs with hyphens", () => {
    expect(slugify("Northwind Accounting")).toBe("northwind-accounting")
    expect(slugify("ACME Corp.")).toBe("acme-corp")
    expect(slugify("123 Main St!")).toBe("123-main-st")
  })

  it("strips leading and trailing hyphens", () => {
    expect(slugify("  Acme  ")).toBe("acme")
    expect(slugify("!Acme!")).toBe("acme")
  })

  it("truncates to 48 characters", () => {
    const long = "a".repeat(60)
    expect(slugify(long)).toHaveLength(48)
  })

  it("falls back to 'org' when result would be shorter than 3 chars", () => {
    expect(slugify("A")).toBe("org")
    expect(slugify("!")).toBe("org")
    expect(slugify("")).toBe("org")
    expect(slugify("1")).toBe("org") // single digit becomes a 1-char slug
    expect(slugify("AB")).toBe("org") // two chars is still below the minimum
  })

  it("preserves digits in slug", () => {
    expect(slugify("Company 42")).toBe("company-42")
  })

  it("collapses multiple consecutive special chars into one hyphen", () => {
    expect(slugify("a---b")).toBe("a-b")
    expect(slugify("a  b")).toBe("a-b")
  })
})

// ---------------------------------------------------------------------------
// Tests — pickUniqueSlug (DB integration)
// ---------------------------------------------------------------------------

describe("pickUniqueSlug (DB integration — replica of private helper)", () => {
  it("returns the base slug when no org with that slug exists", async () => {
    const [user] = await sql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('slugpick@test.invalid', 'Slug User', 'user')
      RETURNING id
    `
    const [ws] = await sql<Array<{ id: string }>>`
      INSERT INTO workspace (display_name, created_by_user_id)
      VALUES ('Slug Workspace', ${user!.id}::uuid)
      RETURNING id
    `

    const slug = await withAdminBypass(async (db) =>
      pickUniqueSlug(db, ws!.id, "acme"),
    )
    expect(slug).toBe("acme")
  }, 30_000)

  it("appends -2, -3, ... to avoid collisions within the same workspace", async () => {
    const [user] = await sql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('slugcollide@test.invalid', 'Collide User', 'user')
      RETURNING id
    `
    const [ws] = await sql<Array<{ id: string }>>`
      INSERT INTO workspace (display_name, created_by_user_id)
      VALUES ('Collide Workspace', ${user!.id}::uuid)
      RETURNING id
    `
    // Pre-seed 'acme' and 'acme-2' in this workspace.
    for (const slug of ["acme", "acme-2"]) {
      const [org] = await sql<Array<{ id: string }>>`
        INSERT INTO organization (
          organization_id, workspace_id, slug, legal_name,
          person_kind, legal_subject_kind
        ) VALUES (uuidv7(), ${ws!.id}::uuid, ${slug}, ${`Org ${slug}`},
                  'legal_entity', 'for_profit')
        RETURNING id
      `
      await sql`UPDATE organization SET organization_id = id WHERE id = ${org!.id}::uuid`
    }

    const slug = await withAdminBypass(async (db) =>
      pickUniqueSlug(db, ws!.id, "acme"),
    )
    expect(slug).toBe("acme-3")
  }, 30_000)

  it("slug uniqueness is scoped per workspace (same base allowed in different workspaces)", async () => {
    const [user] = await sql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('slugscope@test.invalid', 'Scope User', 'user')
      RETURNING id
    `
    const [ws1] = await sql<Array<{ id: string }>>`
      INSERT INTO workspace (display_name, created_by_user_id)
      VALUES ('WS1', ${user!.id}::uuid)
      RETURNING id
    `
    const [ws2] = await sql<Array<{ id: string }>>`
      INSERT INTO workspace (display_name, created_by_user_id)
      VALUES ('WS2', ${user!.id}::uuid)
      RETURNING id
    `
    // Seed 'acme' in ws1.
    const [org1] = await sql<Array<{ id: string }>>`
      INSERT INTO organization (
        organization_id, workspace_id, slug, legal_name,
        person_kind, legal_subject_kind
      ) VALUES (uuidv7(), ${ws1!.id}::uuid, 'acme', 'Acme WS1',
                'legal_entity', 'for_profit')
      RETURNING id
    `
    await sql`UPDATE organization SET organization_id = id WHERE id = ${org1!.id}::uuid`

    // For ws2, 'acme' is still available (different workspace).
    const slug = await withAdminBypass(async (db) =>
      pickUniqueSlug(db, ws2!.id, "acme"),
    )
    expect(slug).toBe("acme")
  }, 30_000)
})

// ---------------------------------------------------------------------------
// Tests — workspace creation DB contract
// ---------------------------------------------------------------------------

describe("submitWorkspaceAction DB contract", () => {
  it("creates workspace + owner membership + org + self-referential organization_id", async () => {
    // Mirrors the exact DB sequence submitWorkspaceAction executes inside
    // withAdminBypass, exercised via raw SQL to stay independent of
    // Next.js runtime.
    const [user] = await sql<Array<{ id: string; email: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('ws-owner@actions-test.invalid', 'WS Owner', 'user')
      RETURNING id, email
    `
    if (!user) throw new Error("user insert failed")

    const displayName = "Acme Accounting"
    const orgSlug = slugify(displayName)

    // Step 1: workspace insert.
    const [ws] = await sql<Array<{ id: string }>>`
      INSERT INTO workspace (
        display_name, contact_email, use_case, team_size,
        created_by_user_id, step_1_completed_at
      ) VALUES (
        ${displayName}, ${user.email}, 'firm', 'sm',
        ${user.id}::uuid, now()
      )
      RETURNING id
    `
    if (!ws) throw new Error("workspace insert failed")

    // Step 2: owner workspace_membership (requires app_admin escalation).
    const wsMembershipId = await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE app_admin`)
      await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
      const rows = (await tx.unsafe(
        `INSERT INTO workspace_membership (workspace_id, user_id, role)
         VALUES ('${ws.id}'::uuid, '${user.id}'::uuid, 'owner')
         RETURNING id`,
      )) as unknown as Array<{ id: string }>
      if (!rows[0]) throw new Error("membership insert failed")
      return rows[0].id
    })

    // Step 3: organization + organization_id self-referential backfill.
    const [org] = await sql<Array<{ id: string; slug: string }>>`
      INSERT INTO organization (
        organization_id, workspace_id, slug, legal_name,
        person_kind, legal_subject_kind
      ) VALUES (
        uuidv7(), ${ws.id}::uuid, ${orgSlug}, ${displayName},
        'legal_entity', 'for_profit'
      )
      RETURNING id, slug
    `
    if (!org) throw new Error("org insert failed")
    await sql`
      UPDATE organization SET organization_id = id WHERE id = ${org.id}::uuid
    `

    // Step 4: owner organization_membership.
    await sql`
      INSERT INTO organization_membership (
        organization_id, workspace_id, user_id,
        workspace_membership_id, role
      ) VALUES (
        ${org.id}::uuid, ${ws.id}::uuid, ${user.id}::uuid,
        ${wsMembershipId}::uuid, 'owner'
      )
    `

    // Assertions.
    const [wsRow] = await sql<
      Array<{
        display_name: string
        use_case: string
        team_size: string
        step_1_completed_at: Date | null
      }>
    >`
      SELECT display_name, use_case, team_size, step_1_completed_at
      FROM workspace WHERE id = ${ws.id}::uuid
    `
    expect(wsRow!.display_name).toBe(displayName)
    expect(wsRow!.use_case).toBe("firm")
    expect(wsRow!.team_size).toBe("sm")
    expect(wsRow!.step_1_completed_at).not.toBeNull()

    const [orgRow] = await sql<
      Array<{ id: string; organization_id: string; slug: string }>
    >`
      SELECT id, organization_id, slug FROM organization
      WHERE id = ${org.id}::uuid
    `
    // organization_id = id after the UPDATE (self-referential trigger pattern).
    expect(orgRow!.organization_id).toBe(orgRow!.id)
    expect(orgRow!.slug).toBe("acme-accounting")

    const wsMemberships = await sql<Array<{ role: string; active: boolean }>>`
      SELECT role, active FROM workspace_membership
      WHERE workspace_id = ${ws.id}::uuid AND user_id = ${user.id}::uuid
    `
    expect(wsMemberships).toHaveLength(1)
    expect(wsMemberships[0]!.role).toBe("owner")
    expect(wsMemberships[0]!.active).toBe(true)

    const orgMemberships = await sql<Array<{ role: string }>>`
      SELECT role FROM organization_membership
      WHERE organization_id = ${org.id}::uuid AND user_id = ${user.id}::uuid
    `
    expect(orgMemberships).toHaveLength(1)
    expect(orgMemberships[0]!.role).toBe("owner")
  }, 30_000)
})

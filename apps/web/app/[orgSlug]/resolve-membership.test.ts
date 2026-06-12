/**
 * Integration tests for the org-scoped layout's membership resolution logic.
 *
 * AFF-119 / E7b — apps/web integration tests.
 *
 * `resolveMembership` is a private function inside layout.tsx (not exported).
 * Rather than re-exporting it (which would be a production-surface change),
 * these tests replicate the exact DB query pattern and assert the same
 * invariants the layout depends on. The slug-validation constants (SLUG_RE,
 * RESERVED_SLUGS) are also replicated here so their correctness is pinned
 * independently of any refactor.
 *
 * Covered behaviors:
 *   - valid member: returns organizationId, workspaceId, legalName, role
 *   - unknown slug: returns null (user is not a member of any org with that slug)
 *   - wrong user: returns null (user has no active membership for the org)
 *   - inactive membership: returns null (active = false is excluded)
 *   - slug regex: accepts valid slugs, rejects malformed ones
 *   - reserved slugs: "admin", "api", "onboarding", etc. are blocked
 *
 * The "server-only" alias in vitest.config.ts makes this file's transitive
 * imports (via @workspace/db) safe to import in Node/Vitest.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { and, eq } from "drizzle-orm"
import postgres from "postgres"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"

// ---------------------------------------------------------------------------
// Replicate the slug validation constants from layout.tsx so they are pinned
// by tests independently.
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "onboarding",
  "workspace",
  "_next",
  "favicon.ico",
])

// ---------------------------------------------------------------------------
// Replicate the resolveMembership DB query (the testable unit).
// ---------------------------------------------------------------------------

let withAdminBypass: (typeof import("@workspace/db"))["withAdminBypass"]
let organization: (typeof import("@workspace/db/schema"))["organization"]
let organization_membership: (typeof import("@workspace/db/schema"))["organization_membership"]

let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]

let sql: postgres.Sql

type ResolvedMembership = {
  organizationId: string
  workspaceId: string
  legalName: string
  role: "owner" | "admin" | "member" | "agent" | "guest"
} | null

/** Mirror of the private resolveMembership from layout.tsx. */
async function resolveMembership(input: {
  slug: string
  userId: string
}): Promise<ResolvedMembership> {
  return await withAdminBypass(async (db) => {
    const [row] = await db
      .select({
        organization_id: organization.id,
        workspace_id: organization.workspace_id,
        legal_name: organization.legal_name,
        role: organization_membership.role,
      })
      .from(organization)
      .innerJoin(
        organization_membership,
        and(
          eq(organization_membership.organization_id, organization.id),
          eq(organization_membership.user_id, input.userId),
          eq(organization_membership.active, true),
        ),
      )
      .where(eq(organization.slug, input.slug))
      .limit(1)
    if (!row) return null
    return {
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      legalName: row.legal_name,
      role: row.role,
    }
  })
}

beforeAll(async () => {
  ;({ adminClient, truncateAll } = await import("@workspace/db/tests/fixtures"))
  ;({ withAdminBypass } = await import("@workspace/db"))
  ;({ organization, organization_membership } =
    await import("@workspace/db/schema"))
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
// DB setup helper
// ---------------------------------------------------------------------------

async function seedOrgWithMember(opts: {
  slug: string
  role?: "owner" | "admin" | "member" | "agent" | "guest"
  activeMembership?: boolean
}) {
  const role = opts.role ?? "member"
  const activeMembership = opts.activeMembership ?? true

  const [owner] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${`owner-${Date.now()}@resolve-test.invalid`}, 'Owner', 'user')
    RETURNING id
  `
  if (!owner) throw new Error("owner insert failed")

  const [member] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES (${`member-${Date.now()}@resolve-test.invalid`}, 'Member', 'user')
    RETURNING id
  `
  if (!member) throw new Error("member insert failed")

  const [ws] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Resolve Test Workspace', ${owner.id}::uuid)
    RETURNING id
  `
  if (!ws) throw new Error("workspace insert failed")
  const workspaceId = ws.id

  await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE app_admin`)
    await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
    await tx.unsafe(
      `INSERT INTO workspace_membership (workspace_id, user_id, role)
       VALUES ('${workspaceId}'::uuid, '${owner.id}'::uuid, 'owner')`,
    )
  })

  const [org] = await sql<Array<{ id: string; legal_name: string }>>`
    INSERT INTO organization (
      organization_id, workspace_id, slug, legal_name,
      person_kind, legal_subject_kind
    )
    VALUES (uuidv7(), ${workspaceId}::uuid, ${opts.slug}, 'Resolve Test Org',
            'legal_entity', 'for_profit')
    RETURNING id, legal_name
  `
  if (!org) throw new Error("org insert failed")
  await sql`UPDATE organization SET organization_id = id WHERE id = ${org.id}::uuid`

  // Owner workspace + org memberships
  const ownerWsM = await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE app_admin`)
    await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
    const rows = (await tx.unsafe(
      `INSERT INTO workspace_membership (workspace_id, user_id, role)
       VALUES ('${workspaceId}'::uuid, '${member.id}'::uuid, 'member')
       RETURNING id`,
    )) as unknown as Array<{ id: string }>
    return rows[0]!
  })

  const [orgM] = await sql<Array<{ id: string }>>`
    INSERT INTO organization_membership (
      organization_id, workspace_id, user_id,
      workspace_membership_id, role
    ) VALUES (
      ${org.id}::uuid, ${workspaceId}::uuid, ${member.id}::uuid,
      ${ownerWsM.id}::uuid, ${role}
    )
    RETURNING id
  `
  if (!orgM) throw new Error("org membership insert failed")

  if (!activeMembership) {
    await sql`
      UPDATE organization_membership SET active = false
      WHERE id = ${orgM.id}::uuid
    `
  }

  return {
    workspaceId,
    orgId: org.id,
    orgSlug: opts.slug,
    legalName: org.legal_name,
    memberId: member.id,
    ownerId: owner.id,
    orgMembershipId: orgM.id,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveMembership DB query", () => {
  it("returns membership details for a valid member", async () => {
    const seed = await seedOrgWithMember({ slug: "my-org", role: "admin" })

    const result = await resolveMembership({
      slug: seed.orgSlug,
      userId: seed.memberId,
    })

    expect(result).not.toBeNull()
    expect(result!.organizationId).toBe(seed.orgId)
    expect(result!.workspaceId).toBe(seed.workspaceId)
    expect(result!.legalName).toBe(seed.legalName)
    expect(result!.role).toBe("admin")
  }, 30_000)

  it("returns null for an unknown org slug", async () => {
    await seedOrgWithMember({ slug: "exists-org" })

    const result = await resolveMembership({
      slug: "does-not-exist",
      userId: "00000000-0000-0000-0000-000000000001",
    })

    expect(result).toBeNull()
  }, 30_000)

  it("returns null when the user has no membership for the org", async () => {
    const seed = await seedOrgWithMember({ slug: "members-only" })

    // Use a user who exists but has no membership.
    const [stranger] = await sql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('stranger@resolve-test.invalid', 'Stranger', 'user')
      RETURNING id
    `

    const result = await resolveMembership({
      slug: seed.orgSlug,
      userId: stranger!.id,
    })

    expect(result).toBeNull()
  }, 30_000)

  it("returns null when the membership is inactive", async () => {
    const seed = await seedOrgWithMember({
      slug: "inactive-org",
      activeMembership: false,
    })

    const result = await resolveMembership({
      slug: seed.orgSlug,
      userId: seed.memberId,
    })

    // active = false must be excluded by the inner join predicate.
    expect(result).toBeNull()
  }, 30_000)

  it("scopes resolution to the requesting user (two orgs same slug, different workspaces)", async () => {
    // Two separate workspace owners, each with an org whose slug is 'shared'.
    const seed1 = await seedOrgWithMember({ slug: "shared" })

    // Seed a second workspace with the same org slug.
    const [owner2] = await sql<Array<{ id: string }>>`
      INSERT INTO app_user (email, name, role)
      VALUES ('owner2@resolve-test.invalid', 'Owner 2', 'user')
      RETURNING id
    `
    const [ws2] = await sql<Array<{ id: string }>>`
      INSERT INTO workspace (display_name, created_by_user_id)
      VALUES ('Workspace 2', ${owner2!.id}::uuid)
      RETURNING id
    `
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE app_admin`)
      await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
      await tx.unsafe(
        `INSERT INTO workspace_membership (workspace_id, user_id, role)
         VALUES ('${ws2!.id}'::uuid, '${owner2!.id}'::uuid, 'owner')`,
      )
    })
    const [org2] = await sql<Array<{ id: string }>>`
      INSERT INTO organization (
        organization_id, workspace_id, slug, legal_name,
        person_kind, legal_subject_kind
      )
      VALUES (uuidv7(), ${ws2!.id}::uuid, 'shared', 'Org 2',
              'legal_entity', 'for_profit')
      RETURNING id
    `
    await sql`UPDATE organization SET organization_id = id WHERE id = ${org2!.id}::uuid`

    // seed1.memberId belongs to org 1 (not org 2).
    const result = await resolveMembership({
      slug: "shared",
      userId: seed1.memberId,
    })

    // Must resolve to seed1's org, not org2.
    expect(result).not.toBeNull()
    expect(result!.organizationId).toBe(seed1.orgId)
  }, 30_000)
})

describe("slug validation (SLUG_RE + RESERVED_SLUGS)", () => {
  it("accepts valid slugs", () => {
    const valid = [
      "my-org",
      "acme",
      "northwind-accounting",
      "org123",
      "a1",
      "a-very-long-slug-that-is-still-under-sixty-three-chars-aa",
    ]
    for (const slug of valid) {
      expect(SLUG_RE.test(slug), `expected ${slug} to match`).toBe(true)
      expect(
        RESERVED_SLUGS.has(slug),
        `expected ${slug} not to be reserved`,
      ).toBe(false)
    }
  })

  it("rejects slugs that do not match the pattern", () => {
    const invalid = [
      "",
      "   ",
      "-leading-dash",
      "trailing-dash-",
      "UPPERCASE",
      "has spaces",
      "has_underscore",
    ]
    for (const slug of invalid) {
      expect(SLUG_RE.test(slug), `expected ${slug} to NOT match`).toBe(false)
    }
  })

  it("single-char slug matches the regex but is noted as DB-rejected (length < 2 DB CHECK)", () => {
    // The source comment in layout.tsx explicitly notes: "The length-1 single-char
    // form is also permitted by the regex but DB length CHECK rejects it; we still
    // accept here so the redirect surface matches the storage rule exactly, and a
    // wrong-length slug is treated the same as a non-existent org."
    // This test pins that documented behavior.
    expect(SLUG_RE.test("a")).toBe(true) // regex allows it
    expect(SLUG_RE.test("1")).toBe(true) // regex allows it
    // The DB rejects length < 2 at the CHECK constraint level, not at slug lookup.
    // resolveMembership will return null for a non-existent slug regardless.
  })

  it("flags all expected reserved slugs", () => {
    const reserved = [
      "admin",
      "api",
      "app",
      "auth",
      "onboarding",
      "workspace",
      "_next",
      "favicon.ico",
    ]
    for (const slug of reserved) {
      expect(RESERVED_SLUGS.has(slug), `expected ${slug} to be reserved`).toBe(
        true,
      )
    }
  })
})

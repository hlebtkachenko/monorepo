/**
 * Integration test for the dev period seed (apps/web/scripts/seed-dev-period.ts).
 *
 * Guards the invariant that a fresh dev workspace always resolves `/o/acme` to
 * an org with an open 2026 účetní období: seedDevPeriod opens exactly one period
 * for the org and is a no-op on re-run (idempotent). Boots the shared Postgres
 * 18 testcontainer via tests/global-setup.ts; imports the production helpers
 * dynamically so they bind after globalSetup sets DATABASE_URL.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type postgres from "postgres"

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "web-integration-test-secret-0123456789ab"

let sql: postgres.Sql
let adminClient: (typeof import("@workspace/db/tests/fixtures"))["adminClient"]
let truncateAll: (typeof import("@workspace/db/tests/fixtures"))["truncateAll"]
let seedWorkspaceWithOwner: (typeof import("@workspace/db/tests/fixtures"))["seedWorkspaceWithOwner"]
let betterAuthSignUp: (typeof import("@workspace/auth/test-support"))["betterAuthSignUp"]
let seedDevPeriod: (typeof import("../scripts/seed-dev-period"))["seedDevPeriod"]

beforeAll(async () => {
  ;({ adminClient, truncateAll, seedWorkspaceWithOwner } =
    await import("@workspace/db/tests/fixtures"))
  ;({ betterAuthSignUp } = await import("@workspace/auth/test-support"))
  ;({ seedDevPeriod } = await import("../scripts/seed-dev-period"))
  sql = adminClient()
  await truncateAll(sql)
}, 60_000)

afterAll(async () => {
  await truncateAll(sql)
  await sql.end({ timeout: 5 })
})

beforeEach(async () => {
  await truncateAll(sql)
})

/** Seed a dev-shaped s.r.o. org (slug + legal form) and return its ids + owner email. */
async function seedDevOrg(
  slug: string,
): Promise<{ id: string; email: string }> {
  const seed = await seedWorkspaceWithOwner(sql, { signUp: betterAuthSignUp })
  await sql`
    UPDATE organization
       SET slug = ${slug}, legal_form_code = 'SRO'
     WHERE id = ${seed.organizationId}::uuid
  `
  return { id: seed.organizationId, email: seed.email }
}

describe("seedDevPeriod", () => {
  it("returns no-org when the slug does not exist", async () => {
    expect(await seedDevPeriod({ orgSlug: "does-not-exist" })).toEqual({
      status: "no-org",
    })
  })

  it("opens a single OPEN 2026 period and is idempotent on re-run", async () => {
    const org = await seedDevOrg("acme-dev")

    const first = await seedDevPeriod({
      orgSlug: "acme-dev",
      ownerEmail: org.email,
      fiscalYear: 2026,
    })
    expect(first.status).toBe("created")

    const periods = await sql<
      Array<{ period_start: string; period_end: string; status: string }>
    >`
      SELECT period_start::text, period_end::text, status
        FROM accounting_period
       WHERE organization_id = ${org.id}::uuid
    `
    expect(periods).toHaveLength(1)
    expect(periods[0]).toMatchObject({
      period_start: "2026-01-01",
      period_end: "2026-12-31",
      status: "OPEN",
    })

    // Re-run: no second period, same id returned.
    const second = await seedDevPeriod({
      orgSlug: "acme-dev",
      ownerEmail: org.email,
      fiscalYear: 2026,
    })
    expect(second.status).toBe("exists")
    if (first.status !== "no-org" && second.status !== "no-org") {
      expect(second.periodId).toBe(first.periodId)
    }

    const [count] = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM accounting_period
       WHERE organization_id = ${org.id}::uuid
    `
    expect(count?.n).toBe(1)
  })
})

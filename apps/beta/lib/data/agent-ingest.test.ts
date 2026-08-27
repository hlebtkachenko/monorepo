/**
 * The ingestion API's shared error-classifying seam (spec §3.2).
 *
 * ONE THING IS UNDER TEST HERE: that `ingest()`'s catch-all recognizes a
 * foreign-key violation and answers a named refusal rather than rethrowing
 * into a 500. No current write path lets a payload state a raw id that could
 * MISS a composite FK (every reference here is either derived server-side —
 * `ensureReportingPeriod`'s id — or matched by the caller's own `externalRef`
 * text), so there is no black-box HTTP call that raises a genuine 23503
 * today. This suite proves the WIRING with a fault-injecting `op`, the same
 * technique `lib/pg-error.test.ts` uses for the predicates themselves — a
 * real `IngestContext`, minted the same way the agent door always mints one
 * (`resolveAgentScope` / `resolveAgentOwnerScope`, never a brand assertion:
 * `scope-brand-fence.boundary.test.ts` forbids that everywhere, tests
 * included), against a synthetic error shaped exactly as Drizzle wraps one.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { hashAgentKey } from "@/lib/agent/key"
import {
  createAgentKeyRow,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "@/tests/fixtures"

const { ingest } = await import("./agent-ingest")
const { resolveAgentOwnerScope, resolveAgentScope } = await import("./scope")

/** What `postgres` raises, wrapped the way Drizzle wraps it — see `pg-error.test.ts`. */
function drizzleError(code: string, message: string): unknown {
  return Object.assign(new Error("Failed query"), {
    cause: Object.assign(new Error(message), { code }),
  })
}

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

describe("ingest()'s catch-all", () => {
  it("maps a foreign-key violation to a named refusal, not a 500", async () => {
    const key = await createAgentKeyRow({
      actingUserId: org.members.owner.userId,
      organizationId: org.organizationId,
    })
    const agent = await resolveAgentScope(hashAgentKey(key.secret))
    const owner = await resolveAgentOwnerScope(agent!, org.slug)

    const outcome = await ingest(
      { owner: owner!, agent: agent!, requestId: null },
      { action: "test.probe", entityKind: "test" },
      async () => {
        // A reference this call named does not resolve inside the caller's
        // own book — the exact shape a composite tenancy FK refuses with
        // (`filing_period_fk`, `import_batch_period_fk`, ...).
        throw drizzleError("23503", "insert or update on table violates fk")
      },
    )

    expect(outcome).toEqual({
      status: "refused",
      reason: "unknown_reference",
    })
  })

  it("still rethrows a fault that is not one of the classified refusals", async () => {
    const key = await createAgentKeyRow({
      actingUserId: org.members.owner.userId,
      organizationId: org.organizationId,
    })
    const agent = await resolveAgentScope(hashAgentKey(key.secret))
    const owner = await resolveAgentOwnerScope(agent!, org.slug)

    await expect(
      ingest(
        { owner: owner!, agent: agent!, requestId: null },
        { action: "test.probe", entityKind: "test" },
        async () => {
          throw new Error("something genuinely broke")
        },
      ),
    ).rejects.toThrow("something genuinely broke")
  })
})

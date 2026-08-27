/**
 * organization_indicator — the office-stated figures behind Obrat watch, against
 * a real Postgres 18.
 *
 * WHAT IS WORTH ASSERTING HERE, given the table is four columns:
 *
 *   1. TENANCY. This database has no RLS behind the scope seam (0000's header
 *      says so), so "book A cannot read or write book B's figure" is a property
 *      of the WHERE clauses in `indicators.ts` and of nothing else. Every read
 *      and every write is checked across two books.
 *   2. WHICH READING WINS. `latestIndicator` orders by `as_of`, not by
 *      `created_at`, because a late correction to May typed after June must not
 *      become "the latest obrat". That is the one behaviour a client's card
 *      depends on, and getting it backwards would report the wrong tier.
 *   3. THE UPSERT KEY. `(kind, as_of)` is unique, so re-stating a date corrects
 *      that reading rather than adding a contradictory second one, and the
 *      return value says which arm ran.
 *   4. THE ONE CHECK the table has, by name.
 *
 * WRITES TAKE AN `OwnerScope` (spec §3.3), so they cannot even be CALLED with an
 * admin's, member's or guest's handle — a compile error, not a runtime branch.
 * The per-role proof of `requireOwner` itself lives in `scope.test.ts`; this file
 * obtains the handle through that door and does not re-derive it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { requireScope, requireOwner } = await import("./scope")
const { latestIndicator, indicatorsForOwner, upsertIndicator } =
  await import("./indicators")
const { forbiddenClientKeys } = await import("./projections")

function as(headers: Headers): void {
  request.headers = headers
}

async function orgScopeFor(
  org: TestOrganization,
  role: "owner" | "admin" | "member" | "guest",
) {
  as(org.members[role].headers)
  return requireScope(org.slug)
}

async function ownerScopeFor(org: TestOrganization) {
  return requireOwner(await orgScopeFor(org, "owner"))
}

/** Assert that a database constraint refused the write, by NAME. */
async function expectConstraintRefusal(
  run: () => Promise<unknown>,
  constraint: RegExp,
): Promise<void> {
  let messages = "<no throw>"
  try {
    await run()
  } catch (error) {
    const chain: string[] = []
    let current: unknown = error
    for (let depth = 0; current && depth < 5; depth++) {
      chain.push(String((current as { message?: unknown }).message ?? current))
      current = (current as { cause?: unknown }).cause
    }
    messages = chain.join("\n")
  }
  expect(messages).toMatch(constraint)
}

let orgA: TestOrganization
let orgB: TestOrganization

beforeAll(async () => {
  ;[orgA, orgB] = await Promise.all([seedOrganization(), seedOrganization()])
})

afterAll(endFixtures)

describe("reads", () => {
  it("is readable by every role, guest included", async () => {
    const org = await seedOrganization()
    await upsertIndicator(await ownerScopeFor(org), {
      kind: "annual_turnover",
      amount: "1850000.00",
      asOf: "2026-06-30",
    })

    for (const role of ["owner", "admin", "member", "guest"] as const) {
      const scope = await orgScopeFor(org, role)
      expect(
        await latestIndicator(scope, "annual_turnover"),
        `${role} reads the figure`,
      ).toMatchObject({ amount: "1850000.00", asOf: "2026-06-30" })
    }
  })

  it("is null when the office has never stated one", async () => {
    const org = await seedOrganization()
    const scope = await orgScopeFor(org, "owner")
    expect(await latestIndicator(scope, "annual_turnover")).toBeNull()
    expect(await indicatorsForOwner(requireOwner(scope))).toEqual([])
  })

  it("returns the newest reading BY as_of, not by insertion order", async () => {
    // The late-correction case: June is stated first, then May. A read that
    // ordered by `created_at` would answer "May" and the client's card would
    // report a stale obrat against a statutory threshold.
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await upsertIndicator(owner, {
      kind: "annual_turnover",
      amount: "2600000.00",
      asOf: "2026-06-30",
    })
    await upsertIndicator(owner, {
      kind: "annual_turnover",
      amount: "1900000.00",
      asOf: "2026-05-31",
    })

    expect(await latestIndicator(owner, "annual_turnover")).toMatchObject({
      amount: "2600000.00",
      asOf: "2026-06-30",
    })
    expect((await indicatorsForOwner(owner)).map((row) => row.asOf)).toEqual([
      "2026-06-30",
      "2026-05-31",
    ])
  })

  it("never carries the internal note onto the client-visible view", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await upsertIndicator(owner, {
      kind: "annual_turnover",
      amount: "500000.00",
      asOf: "2026-03-31",
      noteInternal: "Z výkazu DPH, bez plnění mimo tuzemsko.",
    })

    const reading = await latestIndicator(owner, "annual_turnover")
    expect(forbiddenClientKeys(reading)).toEqual([])
    expect(reading).not.toHaveProperty("noteInternal")

    // The office's own read DOES carry it — that is what the editing table
    // renders, and it never reaches a client surface.
    const [row] = await indicatorsForOwner(owner)
    expect(row?.noteInternal).toBe("Z výkazu DPH, bez plnění mimo tuzemsko.")
  })
})

describe("tenancy — no RLS behind this seam", () => {
  it("never reads another book's figure", async () => {
    await upsertIndicator(await ownerScopeFor(orgA), {
      kind: "annual_turnover",
      amount: "3000000.00",
      asOf: "2026-12-31",
    })

    const scopeB = await orgScopeFor(orgB, "owner")
    expect(await latestIndicator(scopeB, "annual_turnover")).toBeNull()
    expect(await indicatorsForOwner(requireOwner(scopeB))).toEqual([])
  })

  it("states two books' figures independently", async () => {
    const first = await seedOrganization()
    const second = await seedOrganization()
    await upsertIndicator(await ownerScopeFor(first), {
      kind: "annual_turnover",
      amount: "111.00",
      asOf: "2026-01-31",
    })
    await upsertIndicator(await ownerScopeFor(second), {
      kind: "annual_turnover",
      amount: "222.00",
      asOf: "2026-01-31",
    })

    expect(
      await latestIndicator(
        await orgScopeFor(first, "owner"),
        "annual_turnover",
      ),
    ).toMatchObject({ amount: "111.00" })
    expect(
      await latestIndicator(
        await orgScopeFor(second, "owner"),
        "annual_turnover",
      ),
    ).toMatchObject({ amount: "222.00" })
  })
})

describe("upsert — one reading per kind per date", () => {
  it("creates on a new date and updates on a repeat, reporting which", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)

    const created = await upsertIndicator(owner, {
      kind: "annual_turnover",
      amount: "1000000.00",
      asOf: "2026-06-30",
      noteInternal: "první odhad",
    })
    expect(created.action).toBe("created")

    const updated = await upsertIndicator(owner, {
      kind: "annual_turnover",
      amount: "1050000.00",
      asOf: "2026-06-30",
    })
    expect(updated.action).toBe("updated")
    expect(updated.id).toBe(created.id)

    // ONE row, corrected — not two contradictory figures for one date.
    const rows = await indicatorsForOwner(owner)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amount: "1050000.00", noteInternal: "" })
  })

  it("reports a same-transaction repeat as an update — the xmax caveat, stated", async () => {
    // `xmax = 0` answers "did THIS statement insert the tuple". Inside one
    // transaction the second call genuinely finds a tuple this transaction has
    // already locked, so it truthfully reports `updated`. Asserted rather than
    // assumed, because it is the one case where the count differs from a naive
    // "how many items were new" reading — and it is why `indicatorsUpsertSchema`
    // refuses a payload stating one `(kind, asOf)` twice instead of letting the
    // ambiguity reach the agent's summary.
    //
    // The blast radius either way is a LABEL: the row, the figure and the date
    // are identical: only the message and the created/updated counts move.
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    const { betaDb } = await import("@/db/client")

    const arms = await betaDb().transaction(async (tx) => {
      const first = await upsertIndicator(
        owner,
        { kind: "annual_turnover", amount: "100.00", asOf: "2026-02-28" },
        tx,
      )
      const second = await upsertIndicator(
        owner,
        { kind: "annual_turnover", amount: "200.00", asOf: "2026-02-28" },
        tx,
      )
      return [first, second] as const
    })

    expect(arms.map((arm) => arm.action)).toEqual(["created", "updated"])
    expect(arms[0].id).toBe(arms[1].id)
    // One row, holding the last figure written — never two.
    const rows = await indicatorsForOwner(owner)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amount: "200.00" })
  })

  it("stores the money string verbatim, digit for digit", async () => {
    // §0.7: no money value in this application is ever parsed into a float.
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await upsertIndicator(owner, {
      kind: "annual_turnover",
      amount: "2536500.01",
      asOf: "2026-07-31",
    })

    expect(await latestIndicator(owner, "annual_turnover")).toMatchObject({
      amount: "2536500.01",
    })
  })

  it("refuses a negative figure at the database", async () => {
    const org = await seedOrganization()
    const owner = await ownerScopeFor(org)
    await expectConstraintRefusal(
      () =>
        upsertIndicator(owner, {
          kind: "annual_turnover",
          amount: "-1.00",
          asOf: "2026-07-31",
        }),
      /organization_indicator_amount_nonnegative/,
    )
  })
})

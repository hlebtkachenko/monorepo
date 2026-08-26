/**
 * Přehled › Nejbližší termíny — the unified deadline list (spec §2.1 item 2,
 * Advisor F25), against a real Postgres 18.
 *
 * Four things are under test, and they are different in kind.
 *
 * WHICH ROWS EACH ORIGIN CONTRIBUTES, which is where a wrong predicate would put
 * a discharged obligation back on a client's dashboard — or, worse, drop a live
 * one. The `platba` arm is NOT re-tested here row by row: it is
 * `obligationUnionSql`, whose own suite (`obligations.test.ts`) already proves
 * what becomes a debt. What IS tested is that this module reaches that union at
 * all, and that a change to it would surface here.
 *
 * THE UNION'S ORDERING AND LIMIT, because "next 5 by due date" is the whole
 * value of the surface: the wrong five is worse than no list.
 *
 * THE TWO-ACTS RULE — one filing appearing as both `urad` and `platba` — which
 * looks like a duplicate until you notice that filing the form does not pay the
 * money. A future "dedup" would break this test, which is the point.
 *
 * TENANCY, on the same terms as every other read in `lib/data`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createClientTaskRow,
  createClientTaskTemplateRow,
  createFilingRow,
  createLiabilityRow,
  createMonthPeriod,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

import type { UpcomingDeadline } from "./deadlines"

const { requireScope } = await import("./scope")
const { upcomingDeadlinesForScope, DEADLINE_LIMIT_DEFAULT } =
  await import("./deadlines")

function as(headers: Headers): void {
  request.headers = headers
}

let shared: TestOrganization

beforeAll(async () => {
  shared = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

async function readFor(
  target: TestOrganization,
  options?: { limit?: number },
): Promise<UpcomingDeadline[]> {
  as(target.members.admin.headers)
  return upcomingDeadlinesForScope(await requireScope(target.slug), options)
}

/** ISO date `days` from today — the only way to write an "overdue" assertion
 * that stays true tomorrow. */
function daysFromToday(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

describe("the Úřad origin — a form still to be filed", () => {
  it("lists an unfiled filing under its own kind and family", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    const id = await createFilingRow(target.organizationId, periodId, {
      kind: "dph_priznani",
      dueOn: daysFromToday(10),
    })

    const rows = await readFor(target)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      key: `urad:${id}`,
      origin: "urad",
      filingKind: "dph_priznani",
      family: "dph",
      label: null,
      amount: null,
      linkKind: null,
      overdue: false,
    })
  })

  it("drops it once it has been filed, whatever the status says", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      status: "corrective",
      filedOn: daysFromToday(-2),
      dueOn: daysFromToday(5),
    })

    expect(await readFor(target)).toEqual([])
  })

  it("keeps an unfiled filing that is already PAID — the form is still owed", async () => {
    // Paying the money does not file the form. This is the asymmetry the
    // obligations arm cannot express, and the reason the Úřad arm exists.
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      amountDue: "31200.00",
      paidAt: new Date(),
      dueOn: daysFromToday(3),
    })

    const rows = await readFor(target)
    expect(rows.map((row) => row.origin)).toEqual(["urad"])
  })

  it("carries the family of every kind, so each row can deep-link", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      kind: "prehled_cssz",
      dueOn: daysFromToday(4),
    })

    expect((await readFor(target))[0]?.family).toBe("mzdove_odvody")
  })
})

describe("the Platba origin — §2.4's union, not a second copy of it", () => {
  it("lists a manual liability with the office's own title and the amount", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId, {
      label: "Penale z prodleni",
      amount: "1500.50",
      dueOn: daysFromToday(6),
    })

    const rows = await readFor(target)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      origin: "platba",
      filingKind: null,
      family: null,
      label: "Penale z prodleni",
      amount: "1500.50",
    })
  })

  it("inherits the union's exclusions rather than restating them", async () => {
    // A nadměrný odpočet is money the FÚ owes the CLIENT. `obligations.ts`
    // excludes it; if this module had copied the arm instead of importing it,
    // this is the row that would have come back.
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      amountDue: "-8400.00",
      // Filed, so the Úřad arm is silent too and the assertion is only about
      // the money arm.
      status: "filed",
      filedOn: daysFromToday(-1),
      dueOn: daysFromToday(7),
    })

    expect(await readFor(target)).toEqual([])
  })

  it("drops a paid liability", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId, {
      paidAt: new Date(),
      dueOn: daysFromToday(2),
    })

    expect(await readFor(target)).toEqual([])
  })
})

describe("the Od účetní origin — open client tasks", () => {
  it("lists an open task with its title and its link target", async () => {
    const target = await seedOrganization()
    const id = await createClientTaskRow(target.organizationId, {
      title: "Dodejte vypis z uctu",
      dueDate: daysFromToday(3),
      linkKind: "dokumenty",
    })

    const rows = await readFor(target)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      key: `ucetni:${id}`,
      origin: "ucetni",
      filingKind: null,
      label: "Dodejte vypis z uctu",
      amount: null,
      linkKind: "dokumenty",
    })
  })

  it("drops a completed one", async () => {
    const target = await seedOrganization()
    await createClientTaskRow(target.organizationId, {
      status: "done",
      doneAt: new Date(),
      dueDate: daysFromToday(3),
    })

    expect(await readFor(target)).toEqual([])
  })

  it("never lists a template — a template has no date to be due on", async () => {
    const target = await seedOrganization()
    await createClientTaskTemplateRow(target.organizationId)

    expect(await readFor(target)).toEqual([])
  })
})

describe("the union — ordering, limit and the two-acts rule", () => {
  it("orders by deadline across all three origins", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)

    await createClientTaskRow(target.organizationId, {
      title: "Task treti",
      dueDate: daysFromToday(9),
    })
    await createFilingRow(target.organizationId, periodId, {
      dueOn: daysFromToday(3),
    })
    await createLiabilityRow(target.organizationId, {
      label: "Zavazek druhy",
      dueOn: daysFromToday(6),
    })

    expect((await readFor(target)).map((row) => row.origin)).toEqual([
      "urad",
      "platba",
      "ucetni",
    ])
  })

  it("puts an overdue row above every upcoming one, and marks it", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId, {
      label: "Po splatnosti",
      dueOn: daysFromToday(-12),
    })
    await createLiabilityRow(target.organizationId, {
      label: "Jeste ne",
      dueOn: daysFromToday(12),
    })

    const rows = await readFor(target)

    expect(rows.map((row) => row.label)).toEqual(["Po splatnosti", "Jeste ne"])
    expect(rows[0]).toMatchObject({ overdue: true })
    expect(rows[0]?.daysOverdue).toBeGreaterThanOrEqual(12)
    expect(rows[1]).toMatchObject({ overdue: false, daysOverdue: 0 })
  })

  it("returns spec §2.1's five by default, and never more than the cap", async () => {
    const target = await seedOrganization()
    for (let index = 0; index < 8; index++) {
      await createLiabilityRow(target.organizationId, {
        label: `Zavazek ${index}`,
        dueOn: daysFromToday(index + 1),
      })
    }

    expect(await readFor(target)).toHaveLength(DEADLINE_LIMIT_DEFAULT)
    expect(await readFor(target, { limit: 7 })).toHaveLength(7)
    // Clamped at the boundary — an unclamped limit reaching a LIMIT clause is
    // an unbounded read of a client book.
    expect(await readFor(target, { limit: 9999 })).toHaveLength(8)
    expect(await readFor(target, { limit: 0 })).toHaveLength(1)
  })

  it("shows ONE filing twice — once to file, once to pay", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    const id = await createFilingRow(target.organizationId, periodId, {
      kind: "dph_priznani",
      amountDue: "31200.00",
      dueOn: daysFromToday(5),
    })

    const rows = await readFor(target)

    // Two acts, two rows, two keys — never one row that disappears when
    // either act is done.
    expect(rows.map((row) => row.key).sort()).toEqual([
      `platba:${id}`,
      `urad:${id}`,
    ])
    expect(rows.find((row) => row.origin === "platba")?.amount).toBe("31200.00")
    expect(rows.find((row) => row.origin === "urad")?.amount).toBeNull()
  })

  it("breaks a same-day tie the same way twice", async () => {
    const target = await seedOrganization()
    const dueOn = daysFromToday(4)
    await createLiabilityRow(target.organizationId, { label: "A", dueOn })
    await createLiabilityRow(target.organizationId, { label: "B", dueOn })
    await createClientTaskRow(target.organizationId, {
      title: "C",
      dueDate: dueOn,
    })

    const first = await readFor(target)
    const second = await readFor(target)

    expect(first.map((row) => row.key)).toEqual(second.map((row) => row.key))
    // `origin` sorts before `source_id`: platba (p) before ucetni (u).
    expect(first.map((row) => row.origin)).toEqual([
      "platba",
      "platba",
      "ucetni",
    ])
  })

  it("is empty for a book with nothing outstanding", async () => {
    expect(await readFor(await seedOrganization())).toEqual([])
  })
})

describe("visibility and tenancy", () => {
  it("shows every role the same list — guest included (§5)", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId, {
      label: "Viditelne vsem",
      dueOn: daysFromToday(5),
    })

    for (const role of ["owner", "admin", "member", "guest"] as const) {
      as(target.members[role].headers)
      const rows = await upcomingDeadlinesForScope(
        await requireScope(target.slug),
      )
      expect(rows.map((row) => row.label)).toEqual(["Viditelne vsem"])
    }
  })

  it("never leaks another organization's deadlines", async () => {
    const other = await seedOrganization()
    const periodId = await createMonthPeriod(other.organizationId)
    await createFilingRow(other.organizationId, periodId, {
      dueOn: daysFromToday(1),
    })
    await createLiabilityRow(other.organizationId, { dueOn: daysFromToday(1) })
    await createClientTaskRow(other.organizationId, {
      dueDate: daysFromToday(1),
    })

    // The shared org is untouched by any of the three writes above.
    as(shared.members.admin.headers)
    const rows = await upcomingDeadlinesForScope(
      await requireScope(shared.slug),
    )
    expect(rows).toEqual([])
  })
})

describe("the read model ships no display strings", () => {
  it("carries enums and office text, never a translated label", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      kind: "dppo_priznani",
      dueOn: daysFromToday(2),
    })

    const [row] = await readFor(target)

    // The UI maps `filingKind` through FILING_KIND_LABEL_KEY; a Czech form
    // name appearing here would make the read model untranslatable.
    expect(JSON.stringify(row)).not.toMatch(/[ěščřžýáíéůúňťď]/i)
  })
})

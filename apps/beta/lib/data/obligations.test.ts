/**
 * Finance › Dluhy a platby — the derived obligations read model (spec §2.4).
 *
 * Two things are under test and they are different in kind. The first is the
 * FILING SOURCE: which rows become an obligation and which do not, which is
 * where a wrong predicate would show a client a debt they do not owe. The second
 * is the UNION CONTRACT: the shape PR 18's manual liabilities and PR 28's
 * partner saldo will plug into. The contract cases are deliberately written to
 * fail if the shape changes, because the whole point of shipping a union with
 * one arm is that adding the other two costs nothing at the consumers.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createFilingRow,
  createMonthPeriod,
  createReportingPeriod,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

// The two exported types ARE the contract PR 18 and PR 28 build against, so
// they are named here rather than inferred: a change to either shape has to
// break this file before it breaks a consumer that does not exist yet.
import type { Obligation, ObligationSourceFreshness } from "./obligations"

const { requireScope } = await import("./scope")
const { obligationsForScope, OBLIGATION_SOURCES } =
  await import("./obligations")
const { forbiddenClientKeys } = await import("./projections")

function as(headers: Headers): void {
  request.headers = headers
}

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

async function readFor(target: TestOrganization) {
  as(target.members.admin.headers)
  return obligationsForScope(await requireScope(target.slug))
}

describe("the filing source — what becomes an obligation", () => {
  it("lists an unpaid filing with a positive amount", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    const id = await createFilingRow(target.organizationId, periodId, {
      kind: "dph_priznani",
      dueOn: "2026-03-25",
      amountDue: "31200.00",
      variableSymbol: "12345678",
    })

    const { obligations } = await readFor(target)

    expect(obligations).toHaveLength(1)
    expect(obligations[0]).toMatchObject({
      key: `filing:${id}`,
      source: "filing",
      group: "fu",
      filingKind: "dph_priznani",
      label: null,
      amount: "31200.00",
      dueOn: "2026-03-25",
      variableSymbol: "12345678",
    })
  })

  it("excludes a paid one, however large", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      amountDue: "999999.00",
      paidAt: new Date("2026-03-20T10:00:00Z"),
    })

    expect((await readFor(target)).obligations).toEqual([])
  })

  it("excludes zero, null and negative amounts — three different non-debts", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)

    // Nil filing: filed, nothing owed.
    await createFilingRow(target.organizationId, periodId, {
      amountDue: "0.00",
      dueOn: "2026-01-25",
    })
    // The office has not stated an amount. Not a debt — an unknown (§0.4).
    await createFilingRow(target.organizationId, periodId, {
      amountDue: null,
      dueOn: "2026-02-25",
    })
    // Nadměrný odpočet: the FÚ owes the CLIENT. Listing this as a debt of
    // theirs would be the read model's worst possible error.
    await createFilingRow(target.organizationId, periodId, {
      amountDue: "-8400.00",
      dueOn: "2026-03-25",
    })

    const { obligations, totals } = await readFor(target)
    expect(obligations).toEqual([])
    expect(totals).toEqual({ total: "0.00", overdue: "0.00" })
  })

  it("groups by creditor, not by family", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)

    await createFilingRow(target.organizationId, periodId, {
      kind: "prehled_cssz",
      dueOn: "2026-02-20",
      amountDue: "18000.00",
    })
    await createFilingRow(target.organizationId, periodId, {
      // A PAYROLL filing whose creditor is the finanční úřad — the case that
      // proves group is not family with different labels.
      kind: "vyuctovani_dane",
      dueOn: "2026-03-01",
      amountDue: "4000.00",
    })

    const { obligations } = await readFor(target)
    expect(obligations.map((o) => [o.filingKind, o.group])).toEqual([
      ["prehled_cssz", "cssz_zp"],
      ["vyuctovani_dane", "fu"],
    ])
  })

  it("derives Po splatnosti against today, and never stores it", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)

    await createFilingRow(target.organizationId, periodId, {
      dueInDays: -10,
      amountDue: "5000.00",
    })
    await createFilingRow(target.organizationId, periodId, {
      dueInDays: 30,
      amountDue: "7000.00",
    })

    const { obligations } = await readFor(target)
    expect(obligations.map((o) => o.overdue)).toEqual([true, false])
    expect(obligations[0]!.daysOverdue).toBe(10)
    expect(obligations[1]!.daysOverdue).toBe(0)
  })

  it("orders by deadline, soonest first", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)

    for (const dueOn of ["2026-06-25", "2026-02-25", "2026-04-25"]) {
      await createFilingRow(target.organizationId, periodId, {
        dueOn,
        amountDue: "1000.00",
      })
    }

    const { obligations } = await readFor(target)
    expect(obligations.map((o) => o.dueOn)).toEqual([
      "2026-02-25",
      "2026-04-25",
      "2026-06-25",
    ])
  })

  it("carries the period, with the boundaries the database derived", async () => {
    const target = await seedOrganization()
    const periodId = await createReportingPeriod(target.organizationId, {
      kind: "quarter",
      year: 2026,
      quarter: 3,
    })
    await createFilingRow(target.organizationId, periodId, {
      amountDue: "2500.00",
    })

    const { obligations } = await readFor(target)
    expect(obligations[0]!.period).toEqual({
      id: periodId,
      kind: "quarter",
      year: 2026,
      month: null,
      quarter: 3,
      startsOn: "2026-07-01",
      endsOn: "2026-09-30",
    })
  })
})

describe("totals — computed in SQL, carried as strings", () => {
  it("sums the listed rows and the overdue subset", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)

    await createFilingRow(target.organizationId, periodId, {
      dueInDays: -5,
      amountDue: "10000.50",
    })
    await createFilingRow(target.organizationId, periodId, {
      dueInDays: -1,
      amountDue: "2500.25",
    })
    await createFilingRow(target.organizationId, periodId, {
      dueInDays: 20,
      amountDue: "7000.00",
    })
    // Excluded from both sums: paid.
    await createFilingRow(target.organizationId, periodId, {
      dueInDays: -30,
      amountDue: "50000.00",
      paidAt: new Date(),
    })

    const { totals } = await readFor(target)
    // Every addition happened in Postgres over numeric(14,2). Nothing was
    // parsed into a JavaScript number on the way (§0.2 / §0.7).
    expect(totals.total).toBe("19500.75")
    expect(totals.overdue).toBe("12500.75")
    expect(typeof totals.total).toBe("string")
  })

  it("reports zero — as a constant, not as arithmetic — when nothing is open", async () => {
    const target = await seedOrganization()
    expect((await readFor(target)).totals).toEqual({
      total: "0.00",
      overdue: "0.00",
    })
  })

  it("does not lose a haléř at 14,2 scale", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      dueOn: "2026-05-25",
      amountDue: "0.01",
    })
    await createFilingRow(target.organizationId, periodId, {
      dueOn: "2026-06-25",
      amountDue: "0.02",
    })

    const { totals, obligations } = await readFor(target)
    expect(totals.total).toBe("0.03")
    expect(obligations.map((o) => o.amount)).toEqual(["0.01", "0.02"])
  })
})

describe("freshness — spec §0.4, empty beats stale", () => {
  it("lists every source, implemented or not", async () => {
    const target = await seedOrganization()
    const freshness: ObligationSourceFreshness[] = (await readFor(target))
      .freshness

    // Built from the constant, not from the query: a source with no rows still
    // has to appear, or a surface cannot tell "nothing outstanding" apart from
    // "this source does not exist yet".
    expect(freshness.map((f) => f.source)).toEqual([
      "filing",
      "partner_saldo",
      "manual_liability",
    ])
    expect(freshness.map((f) => [f.source, f.implemented])).toEqual([
      ["filing", true],
      // Not placeholders (§0.3 forbids those) — the fact a surface needs in
      // order to render an absent source as ABSENT rather than as "0 Kč".
      ["partner_saldo", false],
      ["manual_liability", false],
    ])
    expect(
      freshness.filter((f) => !f.implemented).map((f) => f.sourceUpdatedAt),
    ).toEqual([null, null])
  })

  it("stamps the SOURCE's last edit, not its last obligation", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)

    // Every filing is PAID, so the source contributes no obligation at all —
    // and must still report when the office last touched it. Without that, a
    // fully-paid organization looks unmaintained instead of up to date.
    await createFilingRow(target.organizationId, periodId, {
      amountDue: "1000.00",
      paidAt: new Date(),
    })

    const { obligations, freshness } = await readFor(target)
    const filingSource = freshness.find((f) => f.source === "filing")!

    expect(obligations).toEqual([])
    expect(filingSource.openCount).toBe(0)
    expect(filingSource.sourceUpdatedAt).not.toBeNull()
    expect(Date.parse(filingSource.sourceUpdatedAt!)).not.toBeNaN()
  })

  it("reports no stamp at all for an organization with no filings", async () => {
    const target = await seedOrganization()
    const filingSource = (await readFor(target)).freshness.find(
      (f) => f.source === "filing",
    )!

    expect(filingSource.sourceUpdatedAt).toBeNull()
    expect(filingSource.openCount).toBe(0)
    expect(filingSource.implemented).toBe(true)
  })

  it("counts the open obligations each source contributes", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      dueOn: "2026-02-25",
      amountDue: "100.00",
    })
    await createFilingRow(target.organizationId, periodId, {
      dueOn: "2026-03-25",
      amountDue: "200.00",
    })

    const { freshness } = await readFor(target)
    expect(freshness.find((f) => f.source === "filing")!.openCount).toBe(2)
    expect(freshness.find((f) => f.source === "partner_saldo")!.openCount).toBe(
      0,
    )
  })
})

describe("the union contract — what PR 18 and PR 28 plug into", () => {
  it("discriminates every row by source, and keys it uniquely across sources", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    const id = await createFilingRow(target.organizationId, periodId, {
      amountDue: "1000.00",
    })

    const [obligation] = (await readFor(target)).obligations

    // The discriminator is on the ROW, not inferred by the caller: that is what
    // lets a consumer written today keep working when two more sources arrive.
    expect(obligation!.source).toBe("filing")
    // Two sources can hold the same uuid — they are different tables — so a
    // bare id would collide as a React key the day the second one lands.
    expect(obligation!.key).toBe(`filing:${id}`)
    expect(obligation!.key.startsWith("filing:")).toBe(true)
  })

  it("keeps the row shape stable and free of display strings", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      amountDue: "1000.00",
    })

    const obligation: Obligation | undefined = (await readFor(target))
      .obligations[0]

    expect(Object.keys(obligation!).sort()).toEqual([
      "amount",
      "asOf",
      "daysOverdue",
      "dueOn",
      "filingKind",
      "group",
      "key",
      "label",
      "overdue",
      "period",
      "source",
      "variableSymbol",
    ])

    // No Czech anywhere: the read model ships discriminators, the UI ships
    // strings. A title built here would be untranslatable and untestable —
    // and `filingKind` is null for the two sources that carry a `label`
    // instead, which is exactly why both fields exist from the start.
    expect(JSON.stringify(obligation)).not.toMatch(/[ěščřžýáíéůú]/i)
    expect(forbiddenClientKeys(obligation)).toEqual([])
  })

  it("carries the source's own stamp on every row, per §2.4", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      amountDue: "1000.00",
    })

    const [obligation] = (await readFor(target)).obligations
    // "Per-group stamp = the SOURCE's own stamp (filing edit / import period /
    // manual edit)". For a filing that is `updated_at`, maintained by the touch
    // trigger — so an office edit moves the stamp the client sees.
    expect(Date.parse(obligation!.asOf)).not.toBeNaN()
    expect(obligation!.asOf).toMatch(/Z$/)
  })

  it("declares its sources once, and the read model agrees with the declaration", () => {
    expect(OBLIGATION_SOURCES.map((s) => s.source)).toEqual([
      "filing",
      "partner_saldo",
      "manual_liability",
    ])
    expect(OBLIGATION_SOURCES.filter((s) => s.implemented)).toHaveLength(1)
    expect(Object.isFrozen(OBLIGATION_SOURCES)).toBe(true)
  })
})

describe("tenancy", () => {
  it("never shows another organization's obligations", async () => {
    const foreign = await seedOrganization()
    const foreignPeriodId = await createMonthPeriod(foreign.organizationId)
    await createFilingRow(foreign.organizationId, foreignPeriodId, {
      amountDue: "123456.00",
      dueOn: "2026-02-25",
    })

    const mine = await createMonthPeriod(org.organizationId)
    await createFilingRow(org.organizationId, mine, {
      amountDue: "1000.00",
      dueOn: "2026-02-25",
    })

    const { obligations, totals } = await readFor(org)
    expect(obligations).toHaveLength(1)
    expect(obligations[0]!.amount).toBe("1000.00")
    expect(totals.total).toBe("1000.00")
    expect(JSON.stringify(obligations)).not.toContain("123456")
  })

  it("is readable by every role — Dluhy a platby is client-visible", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      amountDue: "4200.00",
    })

    for (const role of ["owner", "admin", "member", "guest"] as const) {
      as(target.members[role].headers)
      const model = await obligationsForScope(await requireScope(target.slug))
      expect(model.obligations, `${role} reads Dluhy a platby`).toHaveLength(1)
    }
  })

  it("goes empty rather than stale when the organization has nothing", async () => {
    const target = await seedOrganization()
    const model = await readFor(target)

    expect(model.obligations).toEqual([])
    expect(model.totals).toEqual({ total: "0.00", overdue: "0.00" })
    // The freshness list is still complete — an empty surface that can still
    // say WHEN it was last fed is the §0.4 requirement.
    expect(model.freshness).toHaveLength(3)
  })
})

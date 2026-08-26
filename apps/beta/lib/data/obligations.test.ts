/**
 * Finance › Dluhy a platby — the derived obligations read model (spec §2.4).
 *
 * Three things are under test and they are different in kind. The first is EACH
 * SOURCE: which rows become an obligation and which do not, which is where a
 * wrong predicate would show a client a debt they do not owe. The second is the
 * UNION CONTRACT: the row shape PR 28's partner saldo will plug into, written to
 * fail if that shape changes. The third — new with PR 18, because the union now
 * has two arms — is that the two sources COMPOSE: same shape, same ordering, one
 * set of totals, and no row shown twice.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createFilingRow,
  createLiabilityRow,
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

// The exported types ARE the contract PR 28 builds against, so they are named
// here rather than inferred: a change to any of the shapes has to break this
// file before it breaks a consumer that does not exist yet.
import type {
  Obligation,
  ObligationGroupSummary,
  ObligationSourceFreshness,
} from "./obligations"

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
      // Not a placeholder (§0.3 forbids those) — the fact a surface needs in
      // order to render an absent source as ABSENT rather than as "0 Kč".
      ["partner_saldo", false],
      ["manual_liability", true],
    ])
    expect(
      freshness.filter((f) => !f.implemented).map((f) => f.sourceUpdatedAt),
    ).toEqual([null])
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
    expect(OBLIGATION_SOURCES.filter((s) => s.implemented)).toHaveLength(2)
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

describe("the manual source — the residue arm (PR 18)", () => {
  it("lists an unpaid liability, with its titul as the row's label", async () => {
    const target = await seedOrganization()
    const id = await createLiabilityRow(target.organizationId, {
      label: "Penale z prodleni",
      amount: "1500.50",
      dueOn: "2026-04-30",
      variableSymbol: "87654321",
    })

    const { obligations } = await readFor(target)

    expect(obligations).toHaveLength(1)
    expect(obligations[0]).toMatchObject({
      key: `manual_liability:${id}`,
      source: "manual_liability",
      group: "ostatni",
      // The mirror image of a filing row: `filingKind` is what a filing has and
      // a liability has not, `label` is what a liability has and a filing has
      // not. Both fields have existed since the union shipped with one arm,
      // which is why this needed no shape change.
      filingKind: null,
      label: "Penale z prodleni",
      amount: "1500.50",
      dueOn: "2026-04-30",
      variableSymbol: "87654321",
    })
  })

  it("carries no period — a liability is not stamped with one", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId)

    const { obligations } = await readFor(target)
    expect(obligations[0]!.period).toBeNull()
  })

  it("excludes a paid one, however large", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId, {
      amount: "999999.00",
      paidAt: new Date("2026-03-20T10:00:00Z"),
    })

    expect((await readFor(target)).obligations).toEqual([])
  })

  it("keeps the group the office chose, for the residue that has no filing", async () => {
    const target = await seedOrganization()
    // Penále is owed to the FÚ and is NOT a form with a statutory deadline, so
    // there is no filing row it could duplicate. Filing it under Ostatní would
    // be a heading that lies.
    await createLiabilityRow(target.organizationId, {
      group: "fu",
      label: "Penale FU",
      dueOn: "2026-02-28",
    })
    await createLiabilityRow(target.organizationId, {
      group: "cssz_zp",
      label: "Splatkovy kalendar CSSZ",
      dueOn: "2026-03-31",
    })

    const { obligations } = await readFor(target)
    expect(obligations.map((o) => [o.label, o.group])).toEqual([
      ["Penale FU", "fu"],
      ["Splatkovy kalendar CSSZ", "cssz_zp"],
    ])
  })

  it("derives Po splatnosti against today, and never stores it", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId, {
      dueInDays: -10,
      amount: "5000.00",
    })
    await createLiabilityRow(target.organizationId, {
      dueInDays: 30,
      amount: "7000.00",
    })

    const { obligations } = await readFor(target)
    expect(obligations.map((o) => o.overdue)).toEqual([true, false])
    expect(obligations[0]!.daysOverdue).toBe(10)
    expect(obligations[1]!.daysOverdue).toBe(0)
  })

  it("stamps the SOURCE's last edit, not its last obligation", async () => {
    const target = await seedOrganization()
    // Every liability is PAID, so the source contributes nothing — and must
    // still report when the office last touched it.
    await createLiabilityRow(target.organizationId, { paidAt: new Date() })

    const { obligations, freshness } = await readFor(target)
    const manual = freshness.find((f) => f.source === "manual_liability")!

    expect(obligations).toEqual([])
    expect(manual.openCount).toBe(0)
    expect(manual.implemented).toBe(true)
    expect(Date.parse(manual.sourceUpdatedAt!)).not.toBeNaN()
  })

  it("reports no stamp at all for an organization with no liabilities", async () => {
    const target = await seedOrganization()
    const manual = (await readFor(target)).freshness.find(
      (f) => f.source === "manual_liability",
    )!

    expect(manual.sourceUpdatedAt).toBeNull()
    expect(manual.openCount).toBe(0)
    expect(manual.implemented).toBe(true)
  })

  it("never shows another organization's liabilities", async () => {
    const foreign = await seedOrganization()
    await createLiabilityRow(foreign.organizationId, { amount: "123456.00" })

    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId, { amount: "1000.00" })

    const { obligations, totals } = await readFor(target)
    expect(obligations).toHaveLength(1)
    expect(totals.total).toBe("1000.00")
    expect(JSON.stringify(obligations)).not.toContain("123456")
  })

  it("is readable by every role, guest included", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId)

    for (const role of ["owner", "admin", "member", "guest"] as const) {
      as(target.members[role].headers)
      const model = await obligationsForScope(await requireScope(target.slug))
      expect(model.obligations, `${role} reads the residue`).toHaveLength(1)
    }
  })
})

describe("the two sources compose — no triple entry, no double show", () => {
  it("interleaves both sources by deadline, keys them apart, sums them once", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)

    const filingId = await createFilingRow(target.organizationId, periodId, {
      kind: "dph_priznani",
      dueOn: "2026-03-25",
      amountDue: "31200.00",
    })
    const liabilityId = await createLiabilityRow(target.organizationId, {
      label: "Penale z prodleni",
      dueOn: "2026-02-28",
      amount: "1500.50",
    })

    const { obligations, totals } = await readFor(target)

    // One list, ordered by deadline ACROSS sources — not filings then
    // liabilities. The client owes what they owe, in the order it falls due.
    expect(obligations.map((o) => o.key)).toEqual([
      `manual_liability:${liabilityId}`,
      `filing:${filingId}`,
    ])
    // Two tables can hold the same uuid, so the key is prefixed by source.
    expect(new Set(obligations.map((o) => o.key)).size).toBe(2)
    expect(totals.total).toBe("32700.50")
  })

  it("shows a debt once per source, and never guesses that two are one", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)

    // The office has typed the same MONEY twice: once as a filing's amount_due
    // and once as a hand-entered FÚ liability with the same amount and the same
    // deadline. §2.4's rule is that this is not the read model's problem to
    // guess about — a liability cannot NAME a filing (there is no `filing_id`
    // column, migration 0006), so no fact says these are the same debt. Both
    // rows show. A fuzzy match on (group, due date, amount) would silently hide
    // a real second debt, and hiding a debt is the worse error.
    await createFilingRow(target.organizationId, periodId, {
      kind: "dph_priznani",
      dueOn: "2026-03-25",
      amountDue: "31200.00",
    })
    await createLiabilityRow(target.organizationId, {
      group: "fu",
      label: "DPH 02/2026",
      dueOn: "2026-03-25",
      amount: "31200.00",
    })

    const { obligations, totals } = await readFor(target)
    expect(obligations).toHaveLength(2)
    expect(obligations.map((o) => o.source).sort()).toEqual([
      "filing",
      "manual_liability",
    ])
    expect(totals.total).toBe("62400.00")
  })

  it("cannot be handed a supplier payable at all — the disjointness fence", async () => {
    const target = await seedOrganization()

    // `dodavatele` is PR 28's group and the database refuses it on the manual
    // table (migration 0006, `liability_group_is_residue`). That is what makes
    // the union disjoint by construction rather than by convention.
    await expect(
      createLiabilityRow(target.organizationId, { group: "dodavatele" }),
    ).rejects.toThrow(/liability_group_is_residue/)
  })

  it("counts open obligations per source, separately", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      amountDue: "100.00",
      dueOn: "2026-02-25",
    })
    await createLiabilityRow(target.organizationId, { dueOn: "2026-03-31" })
    await createLiabilityRow(target.organizationId, { dueOn: "2026-04-30" })

    const { freshness } = await readFor(target)
    expect(freshness.map((f) => [f.source, f.openCount] as const)).toEqual([
      ["filing", 1],
      ["partner_saldo", 0],
      ["manual_liability", 2],
    ])
  })

  it("keeps every source's own stamp independent", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      amountDue: "100.00",
    })

    const before = await readFor(target)
    expect(
      before.freshness.find((f) => f.source === "manual_liability")!
        .sourceUpdatedAt,
    ).toBeNull()
    const filingStamp = before.freshness.find(
      (f) => f.source === "filing",
    )!.sourceUpdatedAt

    await createLiabilityRow(target.organizationId)

    const after = await readFor(target)
    // Adding a liability does not move the filing source's stamp. §2.4's
    // per-group stamp is the SOURCE's own, and a shared "last refreshed" would
    // make a stale dataset look fresh because a different one was touched.
    expect(
      after.freshness.find((f) => f.source === "filing")!.sourceUpdatedAt,
    ).toBe(filingStamp)
    expect(
      after.freshness.find((f) => f.source === "manual_liability")!
        .sourceUpdatedAt,
    ).not.toBeNull()
  })
})

describe("groups — the §2.4 creditor buckets the page renders", () => {
  it("buckets by creditor group in enum order, never in first-seen order", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)

    // Deliberately seeded so the SOONEST deadline is the LAST group: a
    // first-seen ordering would put Ostatní on top, and the block would move up
    // and down the page between visits with nothing having changed.
    await createLiabilityRow(target.organizationId, {
      group: "ostatni",
      dueOn: "2026-01-31",
      amount: "100.00",
    })
    await createFilingRow(target.organizationId, periodId, {
      kind: "prehled_cssz",
      dueOn: "2026-02-20",
      amountDue: "200.00",
    })
    await createFilingRow(target.organizationId, periodId, {
      kind: "dph_priznani",
      dueOn: "2026-03-25",
      amountDue: "300.00",
    })

    const { groups } = await readFor(target)
    expect(groups.map((g) => g.group)).toEqual(["fu", "cssz_zp", "ostatni"])
  })

  it("omits an empty group entirely — a heading over 0 Kč reads as a measured zero", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId, { amount: "100.00" })

    const groups: ObligationGroupSummary[] = (await readFor(target)).groups
    expect(groups.map((g) => g.group)).toEqual(["ostatni"])
    expect(groups[0]!.obligations).toHaveLength(1)
  })

  it("has no groups at all when nothing is outstanding", async () => {
    const target = await seedOrganization()
    expect((await readFor(target)).groups).toEqual([])
  })

  it("sums each group in SQL, over exactly that group's rows", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)

    await createFilingRow(target.organizationId, periodId, {
      kind: "dph_priznani",
      dueInDays: -5,
      amountDue: "10000.50",
    })
    await createFilingRow(target.organizationId, periodId, {
      kind: "dppo_zaloha",
      dueInDays: 20,
      amountDue: "7000.00",
    })
    await createLiabilityRow(target.organizationId, {
      group: "ostatni",
      dueInDays: -1,
      amount: "2500.25",
    })

    const { groups, totals } = await readFor(target)
    const fu = groups.find((g) => g.group === "fu")!
    const ostatni = groups.find((g) => g.group === "ostatni")!

    expect(fu.total).toBe("17000.50")
    expect(fu.overdue).toBe("10000.50")
    expect(fu.overdueCount).toBe(1)
    expect(ostatni.total).toBe("2500.25")
    expect(ostatni.overdue).toBe("2500.25")
    expect(ostatni.overdueCount).toBe(1)

    // Every addition happened in Postgres over numeric(14,2); the group sums and
    // the page total come from the same query and agree by construction.
    expect(totals.total).toBe("19500.75")
    expect(totals.overdue).toBe("12500.75")
    expect(typeof fu.total).toBe("string")
  })

  it("sums a group fed by BOTH sources as one number", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)

    await createFilingRow(target.organizationId, periodId, {
      kind: "dph_priznani",
      dueOn: "2026-03-25",
      amountDue: "1000.00",
    })
    await createLiabilityRow(target.organizationId, {
      group: "fu",
      label: "Penale",
      dueOn: "2026-04-30",
      amount: "250.50",
    })

    const [fu] = (await readFor(target)).groups
    expect(fu!.group).toBe("fu")
    expect(fu!.obligations.map((o) => o.source)).toEqual([
      "filing",
      "manual_liability",
    ])
    expect(fu!.total).toBe("1250.50")
  })

  it("stamps a mixed group with the LATEST of its rows' source stamps", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      kind: "dph_priznani",
      dueOn: "2026-03-25",
      amountDue: "1000.00",
    })
    // Written second, so its `updated_at` is the newer one.
    await createLiabilityRow(target.organizationId, {
      group: "fu",
      dueOn: "2026-04-30",
    })

    const [fu] = (await readFor(target)).groups
    const stamps = fu!.obligations.map((o) => o.asOf)
    expect(fu!.asOf).toBe(stamps.reduce((a, b) => (a > b ? a : b)))
    expect(fu!.asOf).toMatch(/Z$/)
  })

  it("keeps every group's rows ordered by deadline, soonest first", async () => {
    const target = await seedOrganization()
    for (const dueOn of ["2026-09-30", "2026-03-31", "2026-06-30"]) {
      await createLiabilityRow(target.organizationId, { dueOn })
    }

    const [ostatni] = (await readFor(target)).groups
    expect(ostatni!.obligations.map((o) => o.dueOn)).toEqual([
      "2026-03-31",
      "2026-06-30",
      "2026-09-30",
    ])
  })

  it("groups exactly the rows the flat list carries, and no others", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      kind: "prehled_zp",
      dueOn: "2026-02-20",
      amountDue: "500.00",
    })
    await createLiabilityRow(target.organizationId, { dueOn: "2026-05-31" })

    const { obligations, groups } = await readFor(target)
    expect(
      groups.flatMap((g) => g.obligations.map((o) => o.key)).sort(),
    ).toEqual(obligations.map((o) => o.key).sort())
  })
})

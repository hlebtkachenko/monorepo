/**
 * The partner registry and the saldokonto read model (spec §2.4, PR 28).
 *
 * Four things are under test and they are different in kind:
 *
 *   THE REGISTRY READ — what a client is handed about a counterparty, and what
 *     they are not (the office's internal note, the office's system id).
 *   THE SALDOKONTO READ — which batch Pohledávky renders, what its totals are,
 *     and how a NULL side differs from a zero one. This is where "empty beats
 *     stale" (§0.4) is either true or a comment.
 *   THE AGING BANDS — the one classification this surface derives. Every
 *     boundary is asserted, because a band that is off by a day is a page that
 *     tells a client a debt is fine when it is 91 days old.
 *   THE MATCH ORDER — `external_ref`, then IČO, and never a name. The adoption
 *     case (an import claiming a partner the office typed) and the ambiguity
 *     case (two source ids on one IČO) are the two that decide whether a
 *     supplier's saldo history stays whole.
 */
import { afterAll, describe, expect, it, vi } from "vitest"

import {
  createImportBatchRow,
  createMonthPeriod,
  createPartnerRow,
  createPartnerSaldoRow,
  createReportingPeriod,
  endFixtures,
  publishSaldokontoRow,
  seedOrganization,
  type TestOrganization,
} from "../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { requireOwner, requireScope } = await import("./scope")
const {
  createPartner,
  partnerForScope,
  partnerForUpsert,
  partnerSaldoHistory,
  partnersForOwner,
  partnersForScope,
  saldokontoForScope,
  stampPartnerAresFetched,
  updatePartner,
  updatePartnerNotes,
} = await import("./partners")
const { forbiddenClientKeys } = await import("./projections")

function as(headers: Headers): void {
  request.headers = headers
}

afterAll(async () => {
  await endFixtures()
})

async function scopeFor(target: TestOrganization, role: "owner" | "admin") {
  as(target.members[role].headers)
  return requireScope(target.slug)
}

async function ownerScope(target: TestOrganization) {
  return requireOwner(await scopeFor(target, "owner"))
}

/** Today plus/minus `days`, as the ISO date a `date` column stores. */
function isoDaysFromToday(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

describe("partnersForScope — the registry read", () => {
  it("lists the organization's partners by name", async () => {
    const target = await seedOrganization()
    await createPartnerRow(target.organizationId, { name: "Zeta s.r.o." })
    await createPartnerRow(target.organizationId, { name: "Alfa s.r.o." })

    const partners = await partnersForScope(await scopeFor(target, "admin"))
    expect(partners.map((p) => p.name)).toEqual(["Alfa s.r.o.", "Zeta s.r.o."])
  })

  it("carries the source, so a surface can say where a row came from", async () => {
    const target = await seedOrganization()
    await createPartnerRow(target.organizationId, {
      name: "Importovany s.r.o.",
      source: "saldokonto",
      externalRef: "money-1",
    })
    await createPartnerRow(target.organizationId, {
      name: "Rucni s.r.o.",
      source: "manual",
    })

    const partners = await partnersForScope(await scopeFor(target, "admin"))
    expect(partners.map((p) => [p.name, p.source])).toEqual([
      ["Importovany s.r.o.", "saldokonto"],
      ["Rucni s.r.o.", "manual"],
    ])
  })

  it("never ships the office's own layer", async () => {
    const target = await seedOrganization()
    await createPartnerRow(target.organizationId, {
      noteClient: "Platime do 14 dnu.",
      noteInternal: "Neplatic, hlidat.",
      externalRef: "money-secret-1",
    })

    const [partner] = await partnersForScope(await scopeFor(target, "admin"))
    expect(partner!.noteClient).toBe("Platime do 14 dnu.")
    // `note_internal` and `external_ref` are on CLIENT_FORBIDDEN_COLUMNS and are
    // not even SELECTed, so neither can leak by a later projection widening.
    expect(forbiddenClientKeys(partner)).toEqual([])
    expect(JSON.stringify(partner)).not.toContain("Neplatic")
    expect(JSON.stringify(partner)).not.toContain("money-secret-1")
  })

  it("never shows another organization's partners", async () => {
    const foreign = await seedOrganization()
    await createPartnerRow(foreign.organizationId, { name: "Cizi s.r.o." })
    const target = await seedOrganization()
    await createPartnerRow(target.organizationId, { name: "Muj s.r.o." })

    const partners = await partnersForScope(await scopeFor(target, "admin"))
    expect(partners.map((p) => p.name)).toEqual(["Muj s.r.o."])
  })

  it("is readable by every role — Partneři is client-visible", async () => {
    const target = await seedOrganization()
    await createPartnerRow(target.organizationId)

    for (const role of ["owner", "admin", "member", "guest"] as const) {
      as(target.members[role].headers)
      const partners = await partnersForScope(await requireScope(target.slug))
      expect(partners, `${role} reads the registry`).toHaveLength(1)
    }
  })
})

describe("saldokontoForScope — what Pohledávky renders", () => {
  it("goes empty rather than stale for a book with no published saldokonto", async () => {
    const target = await seedOrganization()
    const view = await saldokontoForScope(await scopeFor(target, "admin"))

    // §0.4: "zatím nebylo nahráno", never an empty table that reads as "nobody
    // owes anything".
    expect(view.period).toBeNull()
    expect(view.batch).toBeNull()
    expect(view.rows).toEqual([])
    expect(view.totals).toEqual({ receivable: "0.00", payable: "0.00" })
  })

  it("renders the newest PUBLISHED period and stamps it", async () => {
    const target = await seedOrganization()
    const june = await createReportingPeriod(target.organizationId, {
      kind: "month",
      year: 2026,
      month: 6,
    })
    const july = await createReportingPeriod(target.organizationId, {
      kind: "month",
      year: 2026,
      month: 7,
    })
    const partnerId = await createPartnerRow(target.organizationId)

    await publishSaldokontoRow(target.organizationId, june, [
      { partnerId, receivableTotal: "1.00" },
    ])
    await publishSaldokontoRow(target.organizationId, july, [
      { partnerId, receivableTotal: "2.00" },
    ])

    const view = await saldokontoForScope(await scopeFor(target, "admin"))
    expect(view.period?.id).toBe(july)
    expect(view.batch?.publishedAt).not.toBeNull()
    expect(view.rows.map((r) => r.receivableTotal)).toEqual(["2.00"])
  })

  it("never renders a draft", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    const partnerId = await createPartnerRow(target.organizationId)
    const draftId = await createImportBatchRow(
      target.organizationId,
      periodId,
      {
        dataset: "saldokonto",
        status: "draft",
      },
    )
    await createPartnerSaldoRow(
      target.organizationId,
      draftId,
      partnerId,
      periodId,
      { receivableTotal: "999.00" },
    )

    const view = await saldokontoForScope(await scopeFor(target, "admin"))
    expect(view.period).toBeNull()
    expect(view.rows).toEqual([])
  })

  it("shows a re-imported month once, with the corrected figure", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    const partnerId = await createPartnerRow(target.organizationId)

    const first = await publishSaldokontoRow(target.organizationId, periodId, [
      { partnerId, receivableTotal: "10000.00" },
    ])
    await publishSaldokontoRow(
      target.organizationId,
      periodId,
      [{ partnerId, receivableTotal: "8500.00" }],
      { supersedes: first },
    )

    const view = await saldokontoForScope(await scopeFor(target, "admin"))
    expect(view.rows).toHaveLength(1)
    expect(view.rows[0]!.receivableTotal).toBe("8500.00")
    expect(view.totals.receivable).toBe("8500.00")
  })

  it("sums both sides in SQL, and keeps a haléř", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    const first = await createPartnerRow(target.organizationId, { name: "A" })
    const second = await createPartnerRow(target.organizationId, { name: "B" })

    await publishSaldokontoRow(target.organizationId, periodId, [
      {
        partnerId: first,
        receivableTotal: "0.01",
        payableTotal: "1000.50",
        oldestDue: "2026-06-30",
      },
      {
        partnerId: second,
        receivableTotal: "0.02",
        payableTotal: "2000.25",
        oldestDue: "2026-07-31",
      },
    ])

    const view = await saldokontoForScope(await scopeFor(target, "admin"))
    // Every addition happened in Postgres over numeric(14,2); nothing was
    // parsed into a JavaScript number on the way (§0.2 / §0.7).
    expect(view.totals).toEqual({ receivable: "0.03", payable: "3000.75" })
    expect(typeof view.totals.payable).toBe("string")
  })

  it("keeps an unstated side NULL — an absence is not a zero", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    const partnerId = await createPartnerRow(target.organizationId)
    await publishSaldokontoRow(target.organizationId, periodId, [
      { partnerId, payableTotal: "1000.00", oldestDue: "2026-06-30" },
    ])

    const view = await saldokontoForScope(await scopeFor(target, "admin"))
    // "0 Kč" would read as "this partner owes us nothing", which the office
    // never said. The page renders a dash.
    expect(view.rows[0]!.receivableTotal).toBeNull()
    expect(view.rows[0]!.payableTotal).toBe("1000.00")
    // The TOTAL is still a figure: SUM over an all-NULL column is NULL, and a
    // constant zero is substituted for an empty set rather than derived.
    expect(view.totals.receivable).toBe("0.00")
  })

  it("carries the partner's identity inline, and no forbidden column", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    const partnerId = await createPartnerRow(target.organizationId, {
      name: "Stavebniny Novak s.r.o.",
      ico: "87654321",
      role: "supplier",
      source: "saldokonto",
      externalRef: "money-9",
      noteInternal: "Neplatic",
    })
    await publishSaldokontoRow(target.organizationId, periodId, [
      { partnerId, payableTotal: "500.00", oldestDue: "2026-06-30" },
    ])

    const [row] = (await saldokontoForScope(await scopeFor(target, "admin")))
      .rows
    expect(row).toMatchObject({
      partnerId,
      partnerName: "Stavebniny Novak s.r.o.",
      partnerIco: "87654321",
      partnerRole: "supplier",
    })
    expect(forbiddenClientKeys(row)).toEqual([])
    expect(JSON.stringify(row)).not.toContain("money-9")
  })

  it("orders by partner name, deterministically", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    const lines = []
    for (const name of ["Ceta s.r.o.", "Alfa s.r.o.", "Beta s.r.o."]) {
      lines.push({
        partnerId: await createPartnerRow(target.organizationId, { name }),
        receivableTotal: "1.00",
      })
    }
    await publishSaldokontoRow(target.organizationId, periodId, lines)

    const view = await saldokontoForScope(await scopeFor(target, "admin"))
    expect(view.rows.map((r) => r.partnerName)).toEqual([
      "Alfa s.r.o.",
      "Beta s.r.o.",
      "Ceta s.r.o.",
    ])
  })

  it("never shows another organization's saldokonto", async () => {
    const foreign = await seedOrganization()
    const foreignPeriod = await createMonthPeriod(foreign.organizationId)
    const foreignPartner = await createPartnerRow(foreign.organizationId, {
      name: "Cizi s.r.o.",
    })
    await publishSaldokontoRow(foreign.organizationId, foreignPeriod, [
      { partnerId: foreignPartner, receivableTotal: "123456.00" },
    ])

    const target = await seedOrganization()
    const view = await saldokontoForScope(await scopeFor(target, "admin"))
    expect(view.period).toBeNull()
    expect(view.rows).toEqual([])
  })

  it("is readable by every role, guest included", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    const partnerId = await createPartnerRow(target.organizationId)
    await publishSaldokontoRow(target.organizationId, periodId, [
      { partnerId, receivableTotal: "42.00" },
    ])

    for (const role of ["owner", "admin", "member", "guest"] as const) {
      as(target.members[role].headers)
      const view = await saldokontoForScope(await requireScope(target.slug))
      expect(view.rows, `${role} reads Pohledavky`).toHaveLength(1)
    }
  })
})

describe("the aging bands — derived in SQL, against today", () => {
  it("classifies every band by the oldest splatnost", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)

    // One partner per band, named so the read's name ordering is the band
    // ordering and the assertion below reads as a table.
    const cases = [
      { name: "A future", days: 5, band: "not_due" },
      // A splatnost of TODAY is not yet overdue — the same boundary
      // `obligations.ts` derives from `due_on < CURRENT_DATE`.
      { name: "B today", days: 0, band: "not_due" },
      { name: "C one day", days: -1, band: "days_1_30" },
      { name: "D thirty", days: -30, band: "days_1_30" },
      { name: "E thirty one", days: -31, band: "days_31_90" },
      { name: "F ninety", days: -90, band: "days_31_90" },
      { name: "G ninety one", days: -91, band: "days_over_90" },
    ] as const

    const lines = []
    for (const item of cases) {
      lines.push({
        partnerId: await createPartnerRow(target.organizationId, {
          name: item.name,
        }),
        payableTotal: "1000.00",
        oldestDue: isoDaysFromToday(item.days),
      })
    }
    await publishSaldokontoRow(target.organizationId, periodId, lines)

    const view = await saldokontoForScope(await scopeFor(target, "admin"))
    expect(view.rows.map((r) => [r.partnerName, r.aging])).toEqual(
      cases.map((c) => [c.name, c.band]),
    )
    // `daysOverdue` is the same fact as a number, clamped at 0 rather than
    // going negative for a position that is not due yet.
    expect(view.rows.map((r) => r.daysOverdue)).toEqual([
      0, 0, 1, 30, 31, 90, 91,
    ])
  })

  it("says `unknown` when the office stated no splatnost at all", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    const partnerId = await createPartnerRow(target.organizationId)
    await publishSaldokontoRow(target.organizationId, periodId, [
      { partnerId, receivableTotal: "5000.00" },
    ])

    const [row] = (await saldokontoForScope(await scopeFor(target, "admin")))
      .rows
    // NOT `not_due`. "The office stated no date" and "nothing is overdue" are
    // different facts, and §0.4 forbids rendering the first as the second.
    expect(row!.aging).toBe("unknown")
    expect(row!.daysOverdue).toBeNull()
    expect(row!.oldestDue).toBeNull()
  })
})

describe("partnerSaldoHistory — one partner across periods", () => {
  it("returns every published period, newest first", async () => {
    const target = await seedOrganization()
    const partnerId = await createPartnerRow(target.organizationId)
    const june = await createReportingPeriod(target.organizationId, {
      kind: "month",
      year: 2026,
      month: 6,
    })
    const july = await createReportingPeriod(target.organizationId, {
      kind: "month",
      year: 2026,
      month: 7,
    })

    await publishSaldokontoRow(target.organizationId, june, [
      { partnerId, receivableTotal: "100.00" },
    ])
    await publishSaldokontoRow(target.organizationId, july, [
      { partnerId, receivableTotal: "200.00" },
    ])

    const history = await partnerSaldoHistory(
      await scopeFor(target, "admin"),
      partnerId,
    )
    expect(
      history.map((h) => [h.period.month, h.saldo.receivableTotal]),
    ).toEqual([
      [7, "200.00"],
      [6, "100.00"],
    ])
  })

  it("excludes drafts and superseded batches — one row per period", async () => {
    const target = await seedOrganization()
    const partnerId = await createPartnerRow(target.organizationId)
    const periodId = await createMonthPeriod(target.organizationId)

    const first = await publishSaldokontoRow(target.organizationId, periodId, [
      { partnerId, receivableTotal: "100.00" },
    ])
    await publishSaldokontoRow(
      target.organizationId,
      periodId,
      [{ partnerId, receivableTotal: "150.00" }],
      { supersedes: first },
    )
    const draftId = await createImportBatchRow(
      target.organizationId,
      periodId,
      {
        dataset: "saldokonto",
        status: "draft",
      },
    )
    // A draft for the SAME period. It is legal (the unique index is on published
    // only) and must not reach a client's history.
    await createPartnerSaldoRow(
      target.organizationId,
      draftId,
      partnerId,
      periodId,
      { receivableTotal: "999.00" },
    )

    const history = await partnerSaldoHistory(
      await scopeFor(target, "admin"),
      partnerId,
    )
    expect(history).toHaveLength(1)
    expect(history[0]!.saldo.receivableTotal).toBe("150.00")
  })

  it("never crosses into another organization", async () => {
    const foreign = await seedOrganization()
    const foreignPeriod = await createMonthPeriod(foreign.organizationId)
    const foreignPartner = await createPartnerRow(foreign.organizationId)
    await publishSaldokontoRow(foreign.organizationId, foreignPeriod, [
      { partnerId: foreignPartner, receivableTotal: "123456.00" },
    ])

    const target = await seedOrganization()
    // The id is real — it just is not this book's, which is the only case worth
    // testing: a made-up uuid would prove nothing about the WHERE clause.
    const history = await partnerSaldoHistory(
      await scopeFor(target, "admin"),
      foreignPartner,
    )
    expect(history).toEqual([])
  })
})

describe("the match order — external_ref, then IČO, never a name", () => {
  it("matches on the source system's own id first", async () => {
    const target = await seedOrganization()
    const id = await createPartnerRow(target.organizationId, {
      externalRef: "money-1",
      ico: "11111111",
    })

    const match = await partnerForUpsert(await ownerScope(target), {
      externalRef: "money-1",
    })
    expect(match).toMatchObject({ id, matchedBy: "external_ref" })
  })

  it("falls back to the IČO, which is a real identity", async () => {
    const target = await seedOrganization()
    // The office typed this partner by hand: no `external_ref`, so an import
    // can only find it by IČO. Creating a second row would split the supplier's
    // saldo across two lines of Pohledávky.
    const id = await createPartnerRow(target.organizationId, {
      name: "ACME s.r.o.",
      ico: "22222222",
      source: "manual",
    })

    const match = await partnerForUpsert(await ownerScope(target), {
      externalRef: "money-new",
      ico: "22222222",
    })
    expect(match).toMatchObject({
      id,
      matchedBy: "ico",
      source: "manual",
      externalRef: null,
    })
  })

  it("NEVER matches on a name", async () => {
    const target = await seedOrganization()
    await createPartnerRow(target.organizationId, { name: "ACME s.r.o." })

    // Same name, no IČO, different source id. Two real counterparties can share
    // a name and one counterparty is spelled three ways across exports — a merge
    // on either outcome would be the read model guessing at identity.
    const match = await partnerForUpsert(await ownerScope(target), {
      externalRef: "money-2",
    })
    expect(match).toBeNull()
  })

  it("reports a SECOND source id on one IČO rather than re-pointing", async () => {
    const target = await seedOrganization()
    await createPartnerRow(target.organizationId, {
      ico: "33333333",
      externalRef: "money-a",
      source: "saldokonto",
    })

    const match = await partnerForUpsert(await ownerScope(target), {
      externalRef: "money-b",
      ico: "33333333",
    })
    // The caller (`ingestSaldokonto`) turns this shape — matched by IČO, with a
    // different ref already on the row — into `identity_changed`. Re-pointing
    // would move the partner's whole saldo history under a new id.
    expect(match).toMatchObject({ matchedBy: "ico", externalRef: "money-a" })
  })

  it("never matches across organizations", async () => {
    const foreign = await seedOrganization()
    await createPartnerRow(foreign.organizationId, {
      externalRef: "money-shared",
      ico: "44444444",
    })
    const target = await seedOrganization()

    expect(
      await partnerForUpsert(await ownerScope(target), {
        externalRef: "money-shared",
        ico: "44444444",
      }),
    ).toBeNull()
  })
})

describe("the registry writes", () => {
  it("creates a partner with the stated origin", async () => {
    const target = await seedOrganization()
    const owner = await ownerScope(target)

    const created = await createPartner(owner, {
      name: "Novy dodavatel s.r.o.",
      ico: "55555555",
      role: "supplier",
      source: "saldokonto",
      externalRef: "money-3",
    })

    const [partner] = await partnersForScope(owner)
    expect(partner).toMatchObject({
      id: created.id,
      name: "Novy dodavatel s.r.o.",
      ico: "55555555",
      role: "supplier",
      source: "saldokonto",
      countryCode: "CZ",
    })
  })

  it("edits identity fields and leaves the office's notes alone", async () => {
    const target = await seedOrganization()
    const owner = await ownerScope(target)
    const id = await createPartnerRow(target.organizationId, {
      name: "Stary nazev s.r.o.",
      noteClient: "Platime do 14 dnu.",
      noteInternal: "Neplatic",
    })

    expect(
      await updatePartner(owner, id, {
        name: "Novy nazev s.r.o.",
        city: "Brno",
      }),
    ).toBe(true)

    const [partner] = await partnersForScope(owner)
    expect(partner!.name).toBe("Novy nazev s.r.o.")
    expect(partner!.city).toBe("Brno")
    // `PartnerPatch` has no field for either note — an import must never erase
    // an accountant's note about a supplier.
    expect(partner!.noteClient).toBe("Platime do 14 dnu.")
  })

  it("distinguishes clearing a field from leaving it alone", async () => {
    const target = await seedOrganization()
    const owner = await ownerScope(target)
    const id = await createPartnerRow(target.organizationId, {
      ico: "66666666",
      dic: "CZ66666666",
    })

    // An absent key leaves the column alone...
    await updatePartner(owner, id, { name: "Prejmenovano s.r.o." })
    expect((await partnersForScope(owner))[0]!.ico).toBe("66666666")

    // ...and an explicit null is "this partner has no IČO after all".
    await updatePartner(owner, id, { ico: null })
    expect((await partnersForScope(owner))[0]!.ico).toBeNull()
  })

  it("refuses to edit another organization's partner", async () => {
    const foreign = await seedOrganization()
    const foreignId = await createPartnerRow(foreign.organizationId, {
      name: "Cizi s.r.o.",
    })
    const target = await seedOrganization()

    // The WHERE clause carries `organization_id` even though `id` is a primary
    // key: without it, an id leaked from anywhere would let a holder of ANY
    // owner scope edit ANY partner, and this database has no RLS behind the seam.
    expect(
      await updatePartner(await ownerScope(target), foreignId, {
        name: "Prepsano",
      }),
    ).toBe(false)

    as(foreign.members.admin.headers)
    const [untouched] = await partnersForScope(await requireScope(foreign.slug))
    expect(untouched!.name).toBe("Cizi s.r.o.")
  })
})

describe("partnerForScope — the Partneři detail read (PR 29)", () => {
  it("returns the partner's identity for every role", async () => {
    const target = await seedOrganization()
    const id = await createPartnerRow(target.organizationId, {
      name: "Detail s.r.o.",
    })

    for (const role of ["owner", "admin", "member", "guest"] as const) {
      const partner = await partnerForScope(await scopeFor(target, role), id)
      expect(partner?.name, role).toBe("Detail s.r.o.")
    }
  })

  it("returns null for an id that does not exist or belongs to another book", async () => {
    const target = await seedOrganization()
    const owner = await ownerScope(target)
    expect(
      await partnerForScope(owner, "00000000-0000-0000-0000-000000000000"),
    ).toBeNull()

    const foreign = await seedOrganization()
    const foreignId = await createPartnerRow(foreign.organizationId)
    expect(await partnerForScope(owner, foreignId)).toBeNull()
  })

  it("carries note_internal ONLY for owner — absent, not null, for every other role", async () => {
    const target = await seedOrganization()
    const id = await createPartnerRow(target.organizationId, {
      noteInternal: "Neplatic, hlidat.",
    })

    const owner = await partnerForScope(await scopeFor(target, "owner"), id)
    expect(owner?.noteInternal).toBe("Neplatic, hlidat.")

    for (const role of ["admin", "member", "guest"] as const) {
      const partner = await partnerForScope(await scopeFor(target, role), id)
      expect(partner, role).not.toHaveProperty("noteInternal")
      expect(JSON.stringify(partner), role).not.toContain("Neplatic")
    }
  })
})

describe("partnersForOwner — Zadávání dat's own read (PR 29)", () => {
  it("carries note_internal for the owner, unlike partnersForScope", async () => {
    const target = await seedOrganization()
    await createPartnerRow(target.organizationId, {
      noteInternal: "Interni poznamka.",
    })

    const [row] = await partnersForOwner(await ownerScope(target))
    expect(row!.noteInternal).toBe("Interni poznamka.")
  })

  it("never crosses into another organization", async () => {
    const foreign = await seedOrganization()
    await createPartnerRow(foreign.organizationId, { name: "Cizi s.r.o." })
    const target = await seedOrganization()
    await createPartnerRow(target.organizationId, { name: "Muj s.r.o." })

    const rows = await partnersForOwner(await ownerScope(target))
    expect(rows.map((r) => r.name)).toEqual(["Muj s.r.o."])
  })
})

describe("updatePartnerNotes — the notes' own patch type (PR 29)", () => {
  it("edits the client note without touching identity fields", async () => {
    const target = await seedOrganization()
    const owner = await ownerScope(target)
    const id = await createPartnerRow(target.organizationId, {
      name: "Beze zmeny s.r.o.",
    })

    expect(
      await updatePartnerNotes(owner, id, { noteClient: "Platime do 14 dnu." }),
    ).toBe(true)

    const [row] = await partnersForOwner(owner)
    expect(row!.name).toBe("Beze zmeny s.r.o.")
    expect(row!.noteClient).toBe("Platime do 14 dnu.")
  })

  it("distinguishes clearing a note from leaving it alone", async () => {
    const target = await seedOrganization()
    const owner = await ownerScope(target)
    const id = await createPartnerRow(target.organizationId, {
      noteInternal: "Puvodni poznamka.",
    })

    await updatePartnerNotes(owner, id, { noteClient: "Nova poznamka." })
    expect((await partnersForOwner(owner))[0]!.noteInternal).toBe(
      "Puvodni poznamka.",
    )

    await updatePartnerNotes(owner, id, { noteInternal: null })
    expect((await partnersForOwner(owner))[0]!.noteInternal).toBe("")
  })

  it("refuses to edit another organization's partner", async () => {
    const foreign = await seedOrganization()
    const foreignId = await createPartnerRow(foreign.organizationId)
    const target = await seedOrganization()

    expect(
      await updatePartnerNotes(await ownerScope(target), foreignId, {
        noteClient: "Prepsano",
      }),
    ).toBe(false)
  })
})

describe("stampPartnerAresFetched — the per-partner §2.10 cache stamp (PR 29)", () => {
  it("stamps the row, distinct from the registry's own updated_at", async () => {
    const target = await seedOrganization()
    const owner = await ownerScope(target)
    const id = await createPartnerRow(target.organizationId)

    const fetchedAt = new Date("2026-04-01T10:00:00.000Z")
    await stampPartnerAresFetched(owner, id, fetchedAt)

    const [row] = await partnersForScope(owner)
    expect(row!.aresFetchedAt).toBe(fetchedAt.toISOString())
  })

  it("never stamps another organization's partner", async () => {
    const foreign = await seedOrganization()
    const foreignId = await createPartnerRow(foreign.organizationId)
    const target = await seedOrganization()

    await stampPartnerAresFetched(
      await ownerScope(target),
      foreignId,
      new Date(),
    )

    as(foreign.members.admin.headers)
    const [row] = await partnersForScope(await requireScope(foreign.slug))
    expect(row!.aresFetchedAt).toBeNull()
  })
})

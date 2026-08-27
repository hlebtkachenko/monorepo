/**
 * Přehled's loader — the two judgements the page is built on (spec §2.1,
 * Advisor F18 + F24), against a real Postgres 18.
 *
 * NEITHER JUDGEMENT IS ABOUT A NUMBER. `firstMonth` and `hasObligationData`
 * both ask "has this feeder ever spoken", and the reason they are values rather
 * than conditions inside JSX is that both are one negation away from the two
 * failures §0.3 and §0.4 exist to prevent: a dashboard drawing eight empty
 * containers for a brand-new book, and a tile reading "0 Kč" for a book nobody
 * has ever sent anything about.
 *
 * A `.db.test.ts` rather than a unit test over a fake model, because the whole
 * point is what a REAL empty book looks like coming out of seven reads.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createClientTaskRow,
  createDocumentRow,
  createFilingRow,
  createImportBatchRow,
  createLiabilityRow,
  createMonthPeriod,
  endFixtures,
  publishPayrollFixture,
  seedOrganization,
  type TestOrganization,
} from "../../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { requireScope } = await import("@/lib/data/scope")
const { requireOwner } = await import("@/lib/data/scope")
const { createAsset } = await import("@/lib/data/assets")
const { upsertIndicator } = await import("@/lib/data/indicators")
const { loadPrehled, hasObligationData, obligationsAsOf } =
  await import("./load-prehled")

function as(headers: Headers): void {
  request.headers = headers
}

async function loadFor(target: TestOrganization) {
  as(target.members.admin.headers)
  return loadPrehled(await requireScope(target.slug))
}

async function ownerScopeFor(target: TestOrganization) {
  as(target.members.owner.headers)
  return requireOwner(await requireScope(target.slug))
}

let shared: TestOrganization

beforeAll(async () => {
  shared = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

describe("the first-month state (F18)", () => {
  it("is true for a book nobody has sent anything about", async () => {
    const data = await loadFor(await seedOrganization())

    expect(data.firstMonth).toBe(true)
    // And the composition it drives has nothing to draw anyway.
    expect(data.datasets.every((dataset) => dataset.period === null)).toBe(true)
    expect(hasObligationData(data.obligations)).toBe(false)
    expect(data.deadlines).toEqual([])
  })

  it("SURVIVES the client uploading documents and the office setting tasks", async () => {
    // F18: "karta + tasks + termíny + dokumenty render" in the first-month
    // state. A client uploading their first invoices IS the first month, not
    // the end of it — if either of these ended it, the explanatory card would
    // vanish at the moment it is most needed.
    const target = await seedOrganization()
    await createDocumentRow(target.organizationId)
    await createClientTaskRow(target.organizationId)

    const data = await loadFor(target)

    expect(data.firstMonth).toBe(true)
    expect(data.documents.total).toBe(1)
    expect(data.tasks).toHaveLength(1)
  })

  it("ENDS the moment a dataset is published", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createImportBatchRow(target.organizationId, periodId, {
      dataset: "rozvaha",
      status: "published",
    })

    expect((await loadFor(target)).firstMonth).toBe(false)
  })

  it("does NOT end on a draft — a client never sees one", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createImportBatchRow(target.organizationId, periodId, {
      dataset: "rozvaha",
      status: "draft",
    })

    expect((await loadFor(target)).firstMonth).toBe(true)
  })

  it("ENDS on a filing, even a paid one", async () => {
    // The obligations feed stamps itself when it is TOUCHED, not when it owes
    // something — so a book whose only filing is already settled has data, and
    // the "otevřené závazky" tile can honestly show a measured zero.
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await createFilingRow(target.organizationId, periodId, {
      amountDue: "1000.00",
      paidAt: new Date(),
      status: "filed",
      filedOn: "2026-03-20",
    })

    const data = await loadFor(target)

    expect(data.firstMonth).toBe(false)
    expect(hasObligationData(data.obligations)).toBe(true)
    expect(data.obligations.totals.total).toBe("0.00")
  })

  it("ENDS on a registered asset", async () => {
    const target = await seedOrganization()
    await createAsset(await ownerScopeFor(target), {
      name: "Michalka",
      category: "machine",
      acquisitionCost: "250000.00",
    })

    expect((await loadFor(target)).firstMonth).toBe(false)
  })
})

describe("hasObligationData — presence, never a non-zero total", () => {
  it("is false on a book with no filing and no liability", async () => {
    expect(
      hasObligationData((await loadFor(await seedOrganization())).obligations),
    ).toBe(false)
  })

  it("is true once a liability exists, whatever it is worth", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId, { amount: "1.00" })

    expect(hasObligationData((await loadFor(target)).obligations)).toBe(true)
  })

  it("lists the saldokonto source as fed by nothing on a fresh book", async () => {
    const data = await loadFor(await seedOrganization())
    const partnerSaldo = data.obligations.freshness.find(
      (source) => source.source === "partner_saldo",
    )

    // PR 28 implemented this source, so an absent stamp now means "the office
    // has published no saldokonto" rather than "this feed does not exist" —
    // which is why the KPI tile no longer carries a caption saying its total
    // excludes supplier payables.
    expect(partnerSaldo?.implemented).toBe(true)
    expect(partnerSaldo?.sourceUpdatedAt).toBeNull()
    expect(partnerSaldo?.openCount).toBe(0)
  })
})

describe("obligationsAsOf — the newest of the fed sources' own stamps", () => {
  it("is null when nothing has been fed", async () => {
    expect(
      obligationsAsOf((await loadFor(await seedOrganization())).obligations),
    ).toBeNull()
  })

  it("is an ISO instant once a source has rows", async () => {
    const target = await seedOrganization()
    await createLiabilityRow(target.organizationId)

    const stamp = obligationsAsOf((await loadFor(target)).obligations)
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

describe("the rest of the model", () => {
  it("caps Poslední dokumenty at five while counting them all", async () => {
    const target = await seedOrganization()
    for (let index = 0; index < 7; index++) {
      await createDocumentRow(target.organizationId)
    }

    const data = await loadFor(target)

    expect(data.documents.recent).toHaveLength(5)
    expect(data.documents.total).toBe(7)
    expect(data.documents.newestUploadedAt).not.toBeNull()
  })

  it("holds obrat at null until the office states one", async () => {
    // The assertion that keeps the portal from ever showing a turnover figure
    // it derived: an unstated obrat is ABSENT, never 0 Kč (§0.4).
    expect((await loadFor(await seedOrganization())).turnover).toBeNull()
  })

  it("returns the office's stated obrat, verbatim, with its as-of date", async () => {
    const target = await seedOrganization()
    await upsertIndicator(await ownerScopeFor(target), {
      kind: "annual_turnover",
      amount: "2536500.01",
      asOf: "2026-07-31",
    })

    // Digit for digit — the figure decides which of three legal positions the
    // client is told they are in, and nothing between here and the card parses
    // it (§0.2 / §0.7).
    expect((await loadFor(target)).turnover).toEqual({
      amount: "2536500.01",
      asOf: "2026-07-31",
      source: "indicator",
    })
  })

  it("returns the reading with the newest as-of date, not the newest row", async () => {
    // A late correction to May, typed after June, must not become "the latest
    // obrat" — the card would then measure a stale figure against a statutory
    // threshold.
    const target = await seedOrganization()
    const owner = await ownerScopeFor(target)
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

    expect((await loadFor(target)).turnover).toMatchObject({
      amount: "2600000.00",
      asOf: "2026-06-30",
    })
  })

  it("never reads another book's obrat", async () => {
    const other = await seedOrganization()
    await upsertIndicator(await ownerScopeFor(other), {
      kind: "annual_turnover",
      amount: "9999999.00",
      asOf: "2026-08-31",
    })

    expect((await loadFor(await seedOrganization())).turnover).toBeNull()
  })

  it("stamps today as a Prague calendar day, for the freshness bands", async () => {
    expect((await loadFor(shared)).today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("never reads another organization's data", async () => {
    const other = await seedOrganization()
    const periodId = await createMonthPeriod(other.organizationId)
    await createFilingRow(other.organizationId, periodId, {
      amountDue: "50000.00",
    })
    await createDocumentRow(other.organizationId)
    await createClientTaskRow(other.organizationId)

    const data = await loadFor(shared)

    expect(data.org.id).toBe(shared.organizationId)
    expect(data.deadlines).toEqual([])
    expect(data.tasks).toEqual([])
    expect(data.documents.total).toBe(0)
    expect(data.obligations.totals.total).toBe("0.00")
  })
})

describe("payroll — the mzdové náklady tile's feeder", () => {
  it("is null when the book has no published payroll batch", async () => {
    const data = await loadFor(await seedOrganization())
    expect(data.payroll).toBeNull()
  })

  it("carries the newest published period and its summary", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await publishPayrollFixture(target.organizationId, periodId, {
      summary: { employerCostTotal: "123456.00" },
    })

    const data = await loadFor(target)

    expect(data.payroll?.period.id).toBe(periodId)
    expect(data.payroll?.summary?.employerCostTotal).toBe("123456.00")
  })

  it("carries the period even when the batch has no summary row at all", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    // `publishPayrollFixture` always inserts a (possibly all-null) summary
    // row — the genuinely ABSENT case needs the batch published on its own,
    // the same shape an agent run that has only sent employee lines so far
    // would leave behind.
    await createImportBatchRow(target.organizationId, periodId, {
      dataset: "payroll",
      status: "published",
    })

    const data = await loadFor(target)

    expect(data.payroll?.period.id).toBe(periodId)
    expect(data.payroll?.summary).toBeNull()
  })

  it("is null for a guest — payrollScope fails closed the same as every other payroll read", async () => {
    const target = await seedOrganization()
    const periodId = await createMonthPeriod(target.organizationId)
    await publishPayrollFixture(target.organizationId, periodId, {
      summary: { employerCostTotal: "1000.00" },
    })

    as(target.members.guest.headers)
    const data = await loadPrehled(await requireScope(target.slug))
    expect(data.payroll).toBeNull()
  })

  it("never crosses organizations", async () => {
    const other = await seedOrganization()
    const otherPeriodId = await createMonthPeriod(other.organizationId)
    await publishPayrollFixture(other.organizationId, otherPeriodId, {
      summary: { employerCostTotal: "999.00" },
    })

    const data = await loadFor(shared)
    expect(data.payroll).toBeNull()
  })
})

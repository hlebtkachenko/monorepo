/**
 * New domain capabilities (EPIC-3 follow-up): the DECISION layer + časové
 * rozlišení + fixed-asset lifecycle + DPPO. Proves the domain DECIDES the
 * treatment from raw facts (not a replayed deník) and posts each correctly.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import {
  adminClient,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
} from "./fixtures.js"
import {
  acceleratedTaxDepreciation,
  acquireAsset,
  bookVsTaxAdjustment,
  buildDppo,
  buildZaverka,
  captureDocument,
  classifyEvent,
  commissionAsset,
  createAccount,
  createEvent,
  disposeAsset,
  generalLedger,
  postAccrual,
  postDoubleEntry,
  prorataByDays,
  reconcileReadModel,
  straightLineTaxDepreciation,
  taxDepreciationSchedule,
} from "../src/index"
import type { AccountNature, DebitCredit, EconomicEvent } from "../src/index"

let admin: ReturnType<typeof adminClient>
let workspaceId: string
let orgA: string
let userId: string

beforeAll(async () => {
  admin = adminClient()
  const seed = await seedTwoOrganizations(admin)
  workspaceId = seed.workspaceId
  orgA = seed.orgAId
  userId = seed.userAId
})
afterAll(async () => {
  await admin.end({ timeout: 5 })
})

/** Extra accounts the capability tests need on top of the demo chart. */
const EXTRA: Array<{
  n: string
  name: string
  nature: AccountNature
  nb: DebitCredit | null
}> = [
  { n: "042", name: "Pořízení DHM", nature: "ASSET", nb: "DEBIT" },
  { n: "022", name: "Hmotné movité věci", nature: "ASSET", nb: "DEBIT" },
  { n: "314", name: "Poskytnuté zálohy", nature: "ASSET", nb: "DEBIT" },
  { n: "381", name: "Náklady příštích období", nature: "ASSET", nb: "DEBIT" },
  {
    n: "384",
    name: "Výnosy příštích období",
    nature: "LIABILITY",
    nb: "CREDIT",
  },
  { n: "502", name: "Spotřeba energie", nature: "EXPENSE", nb: "DEBIT" },
  {
    n: "541",
    name: "Zůstatková cena prodaného DM",
    nature: "EXPENSE",
    nb: "DEBIT",
  },
  { n: "641", name: "Tržby z prodeje DM", nature: "REVENUE", nb: "CREDIT" },
]

async function seedFull(periodStart: string, periodEnd: string) {
  const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
    periodStart,
    periodEnd,
  })
  await withOrganization(orgA, userId, async (db) => {
    for (const e of EXTRA) {
      if (s.accounts[e.n]) continue
      s.accounts[e.n] = await createAccount(db, s.ctx, {
        chartId: s.chartId,
        periodId: s.periodId,
        number: e.n,
        name: e.name,
        nature: e.nature,
        normalBalance: e.nb,
      })
    }
  })
  return s
}

/** Minimal INTERNAL voucher + event for a generated posting. */
async function voucher(s: Awaited<ReturnType<typeof seedFull>>, date: string) {
  return withOrganization(orgA, userId, async (db) => {
    const ev = await createEvent(db, s.ctx, {
      periodId: s.periodId,
      seriesId: s.eventSeriesId,
      description: "test",
      occurredAt: date,
      responsibleUserId: userId,
    })
    const doc = await captureDocument(db, s.ctx, {
      periodId: s.periodId,
      seriesId: s.documentSeriesId,
      type: "INTERNAL",
      issuedAt: date,
      lines: [],
    })
    return { eventId: ev.eventId, summaryRecordId: doc.summaryRecordId }
  })
}

describe("decision layer — the domain DECIDES from raw facts", () => {
  const facts = (o: Partial<EconomicEvent>): EconomicEvent => ({
    direction: "RECEIVED",
    supplyKind: "SERVICES",
    jurisdiction: "DOMESTIC",
    base: "1000",
    vat: "210",
    currency: "CZK",
    ...o,
  })

  it("capitalises a durable asset over the §26 threshold, expenses one below it", () => {
    const big = classifyEvent(
      facts({
        supplyKind: "ASSET",
        durable: true,
        base: "120000",
        vat: "25200",
      }),
    )
    expect(big.capitalise?.acquisitionAccount).toBe("042")
    expect(big.accountOverrides?.["504"]).toBe("042")
    expect(big.reasoning.some((r) => r.includes("§26"))).toBe(true)

    const small = classifyEvent(
      facts({
        supplyKind: "ASSET",
        durable: true,
        base: "50000",
        vat: "10500",
      }),
    )
    expect(small.capitalise).toBeUndefined()
  })

  it("defers a service that spans past the period end (§3/1 → 381)", () => {
    const d = classifyEvent(
      facts({
        supplyKind: "INSURANCE",
        serviceWindow: { start: "2026-11-01", end: "2027-10-31" },
        periodEnd: "2026-12-31",
      }),
    )
    expect(d.deferral?.bridge).toBe("381")
    expect(d.reasoning.some((r) => r.includes("§3/1"))).toBe(true)
  })

  it("self-assesses reverse-charge construction (§92e → P-PDP)", () => {
    const d = classifyEvent(
      facts({ jurisdiction: "REVERSE_CHARGE", vatRate: "21" }),
    )
    expect(d.scenario).toBe("P-PDP")
    expect(d.vatMode).toBe("REVERSE_CHARGE")
  })

  it("carries the §92 kód předmětu plnění on a DOMESTIC reverse charge (KH A.1/B.1)", () => {
    const d = classifyEvent(
      facts({
        jurisdiction: "REVERSE_CHARGE",
        vatRate: "21",
        commodityCode: "4",
      }),
    )
    expect(d.commodityCode).toBe("4")
    expect(d.reasoning.some((r) => r.includes("kód předmětu plnění 4"))).toBe(
      true,
    )
  })

  it("drops the §92 kód for non-reverse-charge jurisdictions (gated, not persisted)", () => {
    // EU reverse charge is souhrnné hlášení, not KH A.1/B.1 → no §92 kód.
    const eu = classifyEvent(
      facts({ jurisdiction: "EU", vatRate: "21", commodityCode: "4" }),
    )
    expect(eu.commodityCode).toBeNull()
    expect(
      eu.reasoning.some((r) =>
        r.includes("applies only to a domestic reverse-charge"),
      ),
    ).toBe(true)

    // A standard domestic supply likewise carries no §92 kód.
    const std = classifyEvent(facts({ commodityCode: "1" }))
    expect(std.commodityCode).toBeNull()
  })

  it("leaves the §92 kód null when the caller supplies none", () => {
    const d = classifyEvent(facts({ jurisdiction: "REVERSE_CHARGE" }))
    expect(d.commodityCode).toBeNull()
  })

  it("routes neplátce → OUTSIDE_VAT, credit note → dobropis, EU → self-assessment", () => {
    expect(classifyEvent(facts({ jurisdiction: "OUTSIDE_VAT" })).scenario).toBe(
      "P-OUTSIDE-VAT",
    )
    expect(classifyEvent(facts({ isCreditNote: true })).scenario).toBe(
      "P-CREDIT-NOTE-STD",
    )
    expect(classifyEvent(facts({ jurisdiction: "EU" })).vatMode).toBe(
      "REVERSE_CHARGE",
    )
  })

  it("compares the service window by DATE part, not raw strings (mixed formats)", () => {
    // ends INSIDE the period, but stated as a timestamp — a raw string compare
    // would see "2026-12-31T09:00" > "2026-12-31" and wrongly defer
    const timestampInside = classifyEvent(
      facts({
        serviceWindow: { start: "2026-01-01", end: "2026-12-31T09:00" },
        periodEnd: "2026-12-31",
      }),
    )
    expect(timestampInside.deferral).toBeUndefined()

    // same date across T- vs space-separated forms (" " < "T" would invert a
    // raw compare) — still inside the period
    const mixedForms = classifyEvent(
      facts({
        serviceWindow: { start: "2026-01-01", end: "2026-12-31T00:00" },
        periodEnd: "2026-12-31 23:59",
      }),
    )
    expect(mixedForms.deferral).toBeUndefined()

    // genuinely past the period end → deferral, regardless of format
    const beyond = classifyEvent(
      facts({
        serviceWindow: { start: "2026-11-01", end: "2027-01-05 09:00" },
        periodEnd: "2026-12-31",
      }),
    )
    expect(beyond.deferral?.bridge).toBe("381")
  })

  it("routes an ISSUED credit note to the sale side (S-CREDIT-NOTE-STD, 311, revenue remap)", () => {
    const d = classifyEvent(
      facts({ direction: "ISSUED", isCreditNote: true, vatRate: "21" }),
    )
    expect(d.scenario).toBe("S-CREDIT-NOTE-STD")
    expect(d.vatMode).toBe("STANDARD")
    expect(d.vatRate).toBe("21")
    expect(d.saldoAccount).toBe("311")
    // SERVICES credit note reverses 602, not the template's 604 goods revenue
    expect(d.accountOverrides?.["604"]).toBe("602")
    expect(d.reasoning.some((r) => r.includes("§42"))).toBe(true)
  })

  it("keeps a RECEIVED credit note on the purchase side with its 321 open item", () => {
    const d = classifyEvent(facts({ isCreditNote: true }))
    expect(d.scenario).toBe("P-CREDIT-NOTE-STD")
    expect(d.vatMode).toBe("STANDARD")
    expect(d.saldoAccount).toBe("321")
    // SERVICES credit note reverses 518, not the template's 504 goods cost
    expect(d.accountOverrides?.["504"]).toBe("518")
  })

  it("preserves reverse charge on a §92a credit note (correction stays RC)", () => {
    const d = classifyEvent(
      facts({
        jurisdiction: "REVERSE_CHARGE",
        isCreditNote: true,
        vatRate: "21",
      }),
    )
    expect(d.vatMode).toBe("REVERSE_CHARGE")
    expect(d.scenario).toBe("P-PDP")
    expect(d.saldoAccount).toBe("321")
  })

  it("gives an EXEMPT credit note no rate (null), not a forced 21", () => {
    const d = classifyEvent(
      facts({ jurisdiction: "EXEMPT", isCreditNote: true }),
    )
    expect(d.vatMode).toBe("EXEMPT")
    expect(d.vatRate).toBeNull()
  })

  it("rejects an implausible vat rate at the boundary (same rule as capture)", () => {
    expect(() => classifyEvent(facts({ vatRate: "19" }))).toThrow(
      /not a valid CZ VAT rate/,
    )
  })
})

describe("časové rozlišení (accruals)", () => {
  it("defers a prepaid cost to 381 and releases it — nets to zero in the bridge", async () => {
    const s = await seedFull("2040-01-01", "2040-12-31")
    const v1 = await voucher(s, "2040-12-20")
    await withOrganization(orgA, userId, (db) =>
      // prepaid: MD 381 / D 321 (paid now, belongs to next year)
      postAccrual(db, s.ctx, {
        kind: "DEFER_EXPENSE",
        periodId: s.periodId,
        summaryRecordId: v1.summaryRecordId,
        accountingEventId: v1.eventId,
        postingDate: "2040-12-20",
        responsibleUserId: userId,
        amount: "12000.00",
        counterAccountNumber: "321",
      }),
    )
    const v2 = await voucher(s, "2040-12-31")
    await withOrganization(orgA, userId, (db) =>
      // recognise the part belonging to this period: MD 518 / D 381
      postAccrual(db, s.ctx, {
        kind: "RELEASE_DEFERRED_EXPENSE",
        periodId: s.periodId,
        summaryRecordId: v2.summaryRecordId,
        accountingEventId: v2.eventId,
        postingDate: "2040-12-31",
        responsibleUserId: userId,
        amount: "1000.00",
        counterAccountNumber: "518",
      }),
    )
    await withOrganization(orgA, userId, async (db) => {
      const ledger = await generalLedger(db, s.periodId)
      const b381 = ledger.find((r) => r.account_number === "381")!
      const b518 = ledger.find((r) => r.account_number === "518")!
      expect(b381.closing_balance).toBe("11000.0000") // 12000 deferred − 1000 released
      expect(b518.turnover_debit).toBe("1000.0000") // only the current-period part hit expense
      expect(await reconcileReadModel(db, s.periodId)).toEqual([])
    })
  })

  it("splits by calendar days (pro-rata, computed in SQL)", async () => {
    const s = await seedFull("2041-01-01", "2041-12-31")
    const split = await withOrganization(orgA, userId, (db) =>
      // 12 000 for a 12-month service Nov 2041 → Oct 2042; 2 months fall in 2041
      prorataByDays(db, {
        total: "12000.00",
        serviceStart: "2041-11-01",
        serviceEnd: "2042-10-31",
        periodStart: "2041-01-01",
        periodEnd: "2041-12-31",
      }),
    )
    // 61 of 365 days in 2041 → ~2005.48 current, rest deferred; parts sum to the total
    expect(Number(split.currentPart) + Number(split.futurePart)).toBeCloseTo(
      12000,
      2,
    )
    expect(split.currentDays).toBe(61)
  })
})

describe("fixed-asset lifecycle (042 → 022 → disposal)", () => {
  it("acquires, commissions, then sells an asset — book value derecognised, gain to 641", async () => {
    const s = await seedFull("2042-01-01", "2042-12-31")
    const v1 = await voucher(s, "2042-01-10")
    await withOrganization(orgA, userId, (db) =>
      acquireAsset(db, s.ctx, {
        periodId: s.periodId,
        summaryRecordId: v1.summaryRecordId,
        accountingEventId: v1.eventId,
        postingDate: "2042-01-10",
        responsibleUserId: userId,
        amount: "100000.00",
      }),
    )
    const v2 = await voucher(s, "2042-01-15")
    await withOrganization(orgA, userId, (db) =>
      commissionAsset(db, s.ctx, {
        periodId: s.periodId,
        summaryRecordId: v2.summaryRecordId,
        accountingEventId: v2.eventId,
        postingDate: "2042-01-15",
        responsibleUserId: userId,
        amount: "100000.00",
      }),
    )
    const v3 = await voucher(s, "2042-12-01")
    await withOrganization(orgA, userId, (db) =>
      // sell: cost 100000, accumulated 30000 → ZC 70000 expensed to 541; proceeds 90000 + 18900 VAT
      disposeAsset(db, s.ctx, {
        periodId: s.periodId,
        summaryRecordId: v3.summaryRecordId,
        accountingEventId: v3.eventId,
        postingDate: "2042-12-01",
        responsibleUserId: userId,
        cost: "100000.00",
        accumulated: "30000.00",
        sale: { proceedsNet: "90000.00", vat: "18900.00" },
      }),
    )
    await withOrganization(orgA, userId, async (db) => {
      const ledger = await generalLedger(db, s.periodId)
      const pick = (n: string) => ledger.find((r) => r.account_number === n)
      expect(pick("022")!.closing_balance).toBe("0.0000") // asset fully removed
      expect(pick("082")!.turnover_debit).toBe("30000.0000") // accumulated written off
      expect(pick("541")!.turnover_debit).toBe("70000.0000") // ZC to expense
      expect(pick("641")!.turnover_credit).toBe("90000.0000") // proceeds
      expect(pick("343")!.turnover_credit).toBe("18900.0000") // output VAT
      expect(await reconcileReadModel(db, s.periodId)).toEqual([])
    })
  })
})

describe("daňové odpisy (tax depreciation §30-§32)", () => {
  it("straight-line (§31) — group 2, first year lower, schedule sums to cost", () => {
    expect(straightLineTaxDepreciation("100000", 2, 1)).toBe("11000.00") // 11 %
    expect(straightLineTaxDepreciation("100000", 2, 2)).toBe("22250.00") // 22.25 %
    const sched = taxDepreciationSchedule("100000", 2, "STRAIGHT_LINE")
    expect(sched).toHaveLength(5)
    expect(sched[sched.length - 1]!.accumulated).toBe("100000.00") // fully depreciated
  })

  it("accelerated (§32) — group 2 koeficient 5/6, schedule sums to cost", () => {
    expect(acceleratedTaxDepreciation("100000", 2, 1, "0")).toBe("20000.00") // cost / 5
    expect(acceleratedTaxDepreciation("100000", 2, 2, "20000")).toBe("32000.00") // 2×80000/5
    const sched = taxDepreciationSchedule("100000", 2, "ACCELERATED")
    expect(sched[sched.length - 1]!.accumulated).toBe("100000.00")
  })

  it("účetní-vs-daňové difference → §23/3 add-back feeds DPPO", () => {
    // book 20 000 (e.g. straight over 5y accounting), tax 11 000 (year 1) → 9 000 nedaňový
    const adj = bookVsTaxAdjustment("20000", "11000")
    expect(adj.addBack).toBe("9000.00")
    expect(adj.deduct).toBe("0.00")
  })
})

describe("DPPO (corporate income tax)", () => {
  it("computes base rounded to thousands and daň at 21%; nonprofit exclusion zeroes the base", async () => {
    const s = await seedFull("2043-01-01", "2043-12-31")
    // a taxable profit: MD 311 / D 602 = 123 456 (revenue) then nothing else → výsledek 123 456
    const v = await voucher(s, "2043-06-01")
    await withOrganization(orgA, userId, (db) =>
      postDoubleEntry(db, s.ctx, {
        periodId: s.periodId,
        summaryRecordId: v.summaryRecordId,
        accountingEventId: v.eventId,
        postingDate: "2043-06-01",
        responsibleUserId: userId,
        lines: [
          { accountId: s.accounts["311"]!, side: "DEBIT", amount: "123456.00" },
          {
            accountId: s.accounts["602"]!,
            side: "CREDIT",
            amount: "123456.00",
          },
        ],
      }),
    )
    await withOrganization(orgA, userId, async (db) => {
      const dppo = await buildDppo(db, s.periodId)
      expect(dppo.ucetni_vysledek).toBe("123456.0000")
      expect(dppo.zaklad_zaokrouhleny).toBe("123000.0000") // rounded down to whole thousands
      expect(dppo.dan).toBe("25830.0000") // 123000 × 21%

      // §18a veřejně prospěšný poplatník: exclude the result → base 0, daň 0
      const vpp = await buildDppo(db, s.periodId, {
        excludeLossMakingMainActivity: "-123456",
      })
      expect(vpp.zaklad_dane).toBe("0.0000")
      expect(vpp.dan).toBe("0.0000")
    })
  })
})

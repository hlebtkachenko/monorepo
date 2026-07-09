/**
 * EPIC 3.5 open items — the completion of the source-of-truth capabilities:
 *   1. jurisdiction on the captured fact → DPH EU (ř.3/4) vs domestic PDP (ř.10/11)
 *   2. per-counterparty kontrolní hlášení (A.4/A.5/B.1)
 *   3. auto-driven depreciation (plan+asset → monthly odpisy) + §23/3 book-vs-tax
 *   5. advance §37a (daňový doklad k záloze + vyúčtování s odpočtem)
 *   6. souhrnné hlášení §102 (EU-marked supplies)
 *   7. DPPO completeness (§34 loss carry-forward, §38a zálohy, §25 catalogue)
 *   8. statutory statement layout (Decree 500/2002 roll-up)
 * plus the raw bank-line decision (classifyCashMovement — TODO-4 join point).
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { withOrganization } from "@workspace/db"
import {
  adminClient,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
} from "./fixtures.js"
import {
  buildDph,
  buildKontrolniHlaseni,
  buildSouhrnneHlaseni,
  buildDppo,
  buildStatementLayout,
  bookVsTaxForAsset,
  captureDocument,
  classifyCashMovement,
  computeIncomeTaxAdvances,
  createAccount,
  createAsset,
  createCounterparty,
  createDepreciationPlan,
  createEvent,
  createNumberSeries,
  generalLedger,
  NON_DEDUCTIBLE_CATALOGUE,
  postAdvanceReceived,
  postFromPredkontace,
  reconcileReadModel,
  runDepreciationForPeriod,
  settleAdvanceOnFinalInvoice,
} from "../src/index"
import type { AccountNature, DebitCredit } from "../src/index"

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

const EXTRA: Array<{
  n: string
  name: string
  nature: AccountNature
  nb: DebitCredit | null
}> = [
  { n: "022", name: "Hmotné movité věci", nature: "ASSET", nb: "DEBIT" },
  { n: "324", name: "Přijaté zálohy", nature: "LIABILITY", nb: "CREDIT" },
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

describe("TODO-1 — DPH EU (ř.3/4) vs domestic PDP (ř.10/11) split", () => {
  it("routes an EU-marked reverse-charge receipt to ř.3, a domestic one to ř.10", async () => {
    const s = await seedFull("2050-01-01", "2050-12-31")
    await withOrganization(orgA, userId, async (db) => {
      // EU acquisition (§16): base 1000, jurisdiction EU
      const evEu = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "FP EU",
        occurredAt: "2050-03-01",
        responsibleUserId: userId,
      })
      const docEu = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2050-03-01",
        taxPointDate: "2050-03-01",
        receivedDate: "2050-03-01",
        lines: [
          {
            eventId: evEu.eventId,
            partials: [
              {
                baseAmount: "1000.00",
                vatRate: "21",
                vatMode: "REVERSE_CHARGE",
                vatJurisdiction: "EU",
                supplyKind: "GOODS",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: docEu.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "P-EU-GOODS",
        summaryRecordId: docEu.summaryRecordId,
        accountingEventId: evEu.eventId,
        postingDate: "2050-03-01",
        responsibleUserId: userId,
      })

      // Domestic PDP (§92e): base 2000, no jurisdiction marker
      const evPdp = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "FP PDP",
        occurredAt: "2050-03-05",
        responsibleUserId: userId,
      })
      const docPdp = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2050-03-05",
        taxPointDate: "2050-03-05",
        receivedDate: "2050-03-05",
        lines: [
          {
            eventId: evPdp.eventId,
            partials: [
              {
                baseAmount: "2000.00",
                vatRate: "21",
                vatMode: "REVERSE_CHARGE",
                vatJurisdiction: "REVERSE_CHARGE",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: docPdp.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "P-PDP",
        summaryRecordId: docPdp.summaryRecordId,
        accountingEventId: evPdp.eventId,
        postingDate: "2050-03-05",
        responsibleUserId: userId,
      })

      const dph = await buildDph(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      // EU → ř.3, domestic → ř.10 — no longer collapsed
      expect(dph.rows.r3_base).toBe("1000.0000")
      expect(dph.rows.r3_dan).toBe("210.0000")
      expect(dph.rows.r10_base).toBe("2000.0000")
      expect(dph.rows.r10_dan).toBe("420.0000")
      // both deductible → net-neutral vlastní daň
      expect(dph.rows.vlastni_dan).toBe("0.0000")
    })
  })
})

describe("TODO-2 — per-counterparty kontrolní hlášení", () => {
  it("puts a >10k invoice with DIČ on A.4 row-level, a ≤10k on the A.5 aggregate", async () => {
    const s = await seedFull("2051-01-01", "2051-12-31")
    await withOrganization(orgA, userId, async (db) => {
      const cp = await createCounterparty(db, s.ctx, {
        name: "Odběratel s.r.o.",
        taxId: "CZ12345678",
        countryCode: "CZ",
      })

      // A.4: base 20000 + VAT 4200, gross 24200 > 10000, has DIČ
      const ev1 = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "FV big",
        occurredAt: "2051-04-01",
        responsibleUserId: userId,
      })
      const d1 = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2051-04-01",
        taxPointDate: "2051-04-01",
        lines: [
          {
            eventId: ev1.eventId,
            partials: [
              {
                baseAmount: "20000.00",
                vatRate: "21",
                vatMode: "STANDARD",
                vatAmount: "4200.00",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: d1.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-GOODS-21",
        summaryRecordId: d1.summaryRecordId,
        accountingEventId: ev1.eventId,
        postingDate: "2051-04-01",
        responsibleUserId: userId,
      })

      // A.5: base 1000 + VAT 210, gross 1210 ≤ 10000
      const ev2 = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "FV small",
        occurredAt: "2051-04-02",
        responsibleUserId: userId,
      })
      const d2 = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2051-04-02",
        taxPointDate: "2051-04-02",
        lines: [
          {
            eventId: ev2.eventId,
            partials: [
              {
                baseAmount: "1000.00",
                vatRate: "21",
                vatMode: "STANDARD",
                vatAmount: "210.00",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: d2.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-GOODS-21",
        summaryRecordId: d2.summaryRecordId,
        accountingEventId: ev2.eventId,
        postingDate: "2051-04-02",
        responsibleUserId: userId,
      })

      const kh = await buildKontrolniHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(kh.a4).toHaveLength(1)
      expect(kh.a4[0]!.tax_id).toBe("CZ12345678")
      expect(kh.a4[0]!.base21).toBe("20000.0000")
      expect(kh.a4[0]!.dan21).toBe("4200.0000")
      expect(kh.a4[0]!.doklad).toBe(d1.designation)
      // the small one folds into the A.5 aggregate
      expect(kh.a5.count).toBe(1)
      expect(kh.a5.base).toBe("1000.0000")
      expect(kh.a5.dan).toBe("210.0000")
    })
  })

  it("puts a negative opravný doklad over 10k in ABSOLUTE value on the A.4 row (§101d)", async () => {
    const s = await seedFull("2057-01-01", "2057-12-31")
    await withOrganization(orgA, userId, async (db) => {
      const cp = await createCounterparty(db, s.ctx, {
        name: "Odběratel dobropisu s.r.o.",
        taxId: "CZ87654321",
        countryCode: "CZ",
      })

      // A.4: dobropis base −50000 + VAT −10500, gross −60500 → |gross| > 10000
      const ev1 = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "FV dobropis big",
        occurredAt: "2057-06-01",
        responsibleUserId: userId,
      })
      const d1 = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2057-06-01",
        taxPointDate: "2057-06-01",
        lines: [
          {
            eventId: ev1.eventId,
            partials: [
              {
                baseAmount: "-50000.00",
                vatRate: "21",
                vatMode: "STANDARD",
                vatAmount: "-10500.00",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })

      // A.5: small dobropis base −1000 + VAT −210, |gross| 1210 ≤ 10000
      const ev2 = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "FV dobropis small",
        occurredAt: "2057-06-02",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2057-06-02",
        taxPointDate: "2057-06-02",
        lines: [
          {
            eventId: ev2.eventId,
            partials: [
              {
                baseAmount: "-1000.00",
                vatRate: "21",
                vatMode: "STANDARD",
                vatAmount: "-210.00",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })

      const kh = await buildKontrolniHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      // the big dobropis is a row-level A.4 entry with NEGATIVE amounts,
      // not folded into the aggregate
      expect(kh.a4).toHaveLength(1)
      expect(kh.a4[0]!.tax_id).toBe("CZ87654321")
      expect(kh.a4[0]!.doklad).toBe(d1.designation)
      expect(kh.a4[0]!.base21).toBe("-50000.0000")
      expect(kh.a4[0]!.dan21).toBe("-10500.0000")
      // the small dobropis stays in the A.5 aggregate, keeping its sign
      expect(kh.a5.count).toBe(1)
      expect(kh.a5.base).toBe("-1000.0000")
      expect(kh.a5.dan).toBe("-210.0000")
    })
  })
})

describe("TODO-3 — auto-driven depreciation + §23/3 book-vs-tax", () => {
  it("posts monthly odpisy across the period and computes the tax adjustment", async () => {
    const s = await seedFull("2052-01-01", "2052-12-31")
    const assetSeries = await withOrganization(orgA, userId, (db) =>
      createNumberSeries(db, s.ctx, {
        entityType: "ASSET",
        code: "AST52",
        pattern: "AST{YYYY}{NNNN}",
      }),
    )
    const { assetId, planId } = await withOrganization(
      orgA,
      userId,
      async (db) => {
        const asset = await createAsset(db, s.ctx, {
          seriesId: assetSeries,
          name: "Stroj",
          category: "TANGIBLE_DEPRECIABLE",
          accountNumber: "022",
          commissioningDate: "2052-01-01",
          acquisitionCost: "120000.00",
        })
        const plan = await createDepreciationPlan(db, s.ctx, {
          assetId: asset.id,
          method: "STRAIGHT_LINE",
          startDate: "2052-01-01",
          monthlyAmount: "2000.00", // 120000 / 60 months
          expenseAccountNumber: "551",
          accumulatedAccountNumber: "082",
        })
        // tax card: group 2 straight-line, base 120000, start 2052
        await db.execute(sql`
        INSERT INTO tax_depreciation
          (organization_id, asset_id, depreciation_group_code, method, tax_base, start_year)
        VALUES (${s.ctx.organizationId}::uuid, ${asset.id}::uuid, 2, 'STRAIGHT_LINE', '120000.00', 2052)`)
        return { assetId: asset.id, planId: plan }
      },
    )

    // one internal voucher for the whole run
    const v = await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "odpisy 2052",
        occurredAt: "2052-01-31",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "INTERNAL",
        issuedAt: "2052-01-31",
        lines: [],
      })
      return { eventId: ev.eventId, summaryRecordId: doc.summaryRecordId }
    })

    const result = await withOrganization(orgA, userId, (db) =>
      runDepreciationForPeriod(db, s.ctx, {
        depreciationPlanId: planId,
        periodId: s.periodId,
        summaryRecordId: v.summaryRecordId,
        accountingEventId: v.eventId,
        responsibleUserId: userId,
        fromMonth: "2052-01-15",
        throughMonth: "2052-12-15",
      }),
    )
    expect(result.monthsPosted).toBe(12)
    expect(result.totalPosted).toBe("24000.0000") // 12 × 2000

    await withOrganization(orgA, userId, async (db) => {
      const ledger = await generalLedger(db, s.periodId)
      expect(
        ledger.find((r) => r.account_number === "551")!.turnover_debit,
      ).toBe("24000.0000")
      expect(
        ledger.find((r) => r.account_number === "082")!.turnover_credit,
      ).toBe("24000.0000")
      expect(await reconcileReadModel(db, s.periodId)).toEqual([])

      // §23/3: účetní 24000 vs daňový (group 2 year 1 = 11% of 120000 = 13200) → add-back 10800
      const adj = await bookVsTaxForAsset(db, s.ctx, {
        assetId,
        periodId: s.periodId,
        taxYear: 2052,
      })
      expect(adj.bookDepreciation).toBe("24000.0000")
      expect(adj.taxDepreciation).toBe("13200.00")
      expect(adj.addBack).toBe("10800.00")
    })
  })
})

describe("TODO-5 — advance §37a (daňový doklad k záloze + vyúčtování)", () => {
  it("declares VAT on the advance, then nets it on the final invoice (343 = total, 324 = 0)", async () => {
    const s = await seedFull("2053-01-01", "2053-12-31")
    const v1 = await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "záloha",
        occurredAt: "2053-02-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "BANK_STATEMENT",
        issuedAt: "2053-02-01",
        lines: [],
      })
      return { eventId: ev.eventId, summaryRecordId: doc.summaryRecordId }
    })
    await withOrganization(orgA, userId, (db) =>
      postAdvanceReceived(db, s.ctx, {
        periodId: s.periodId,
        summaryRecordId: v1.summaryRecordId,
        accountingEventId: v1.eventId,
        postingDate: "2053-02-01",
        responsibleUserId: userId,
        base: "10000.00",
        vat: "2100.00",
      }),
    )

    const v2 = await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "vyúčtování",
        occurredAt: "2053-03-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2053-03-01",
        lines: [],
      })
      return { eventId: ev.eventId, summaryRecordId: doc.summaryRecordId }
    })
    await withOrganization(orgA, userId, (db) =>
      settleAdvanceOnFinalInvoice(db, s.ctx, {
        periodId: s.periodId,
        summaryRecordId: v2.summaryRecordId,
        accountingEventId: v2.eventId,
        postingDate: "2053-03-01",
        responsibleUserId: userId,
        totalBase: "20000.00",
        totalVat: "4200.00",
        advanceBase: "10000.00",
        advanceVat: "2100.00",
      }),
    )

    await withOrganization(orgA, userId, async (db) => {
      const ledger = await generalLedger(db, s.periodId)
      const pick = (n: string) => ledger.find((r) => r.account_number === n)!
      // total output VAT = 2100 (advance) + 2100 (final remainder) = 4200
      expect(pick("343").closing_balance).toBe("-4200.0000") // credit balance
      // advance liability cleared
      expect(pick("324").closing_balance).toBe("0.0000")
      // full revenue recognised
      expect(pick("604").turnover_credit).toBe("20000.0000")
      expect(await reconcileReadModel(db, s.periodId)).toEqual([])
    })
  })
})

describe("TODO-6 — souhrnné hlášení §102 (EU supplies)", () => {
  it("recaps an EU-marked issued supply per counterparty VAT id", async () => {
    const s = await seedFull("2054-01-01", "2054-12-31")
    await withOrganization(orgA, userId, async (db) => {
      const cp = await createCounterparty(db, s.ctx, {
        name: "Kunde GmbH",
        taxId: "DE811234567",
        countryCode: "DE",
      })
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "EU dodání",
        occurredAt: "2054-05-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2054-05-01",
        taxPointDate: "2054-05-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                baseAmount: "50000.00",
                vatMode: "REVERSE_CHARGE",
                vatJurisdiction: "EU",
                supplyKind: "GOODS",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: doc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-EU-GOODS-DELIVERY",
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2054-05-01",
        responsibleUserId: userId,
      })

      const sh = await buildSouhrnneHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(sh.rows).toHaveLength(1)
      expect(sh.rows[0]!.tax_id).toBe("DE811234567")
      expect(sh.rows[0]!.country_code).toBe("DE")
      expect(sh.rows[0]!.value).toBe("50000.0000")
      expect(sh.rows[0]!.count).toBe(1)
      // Explicit goods classification maps to kód 0 (§64).
      expect(sh.rows[0]!.kod_plneni).toBe("0")
    })
  })

  it("reports an EU-marked SERVICES supply under kód 3 (§9/1)", async () => {
    const s = await seedFull("2064-01-01", "2064-12-31")
    await withOrganization(orgA, userId, async (db) => {
      const cp = await createCounterparty(db, s.ctx, {
        name: "Service Kunde GmbH",
        taxId: "DE822345678",
        countryCode: "DE",
      })
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "EU služba",
        occurredAt: "2064-05-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2064-05-01",
        taxPointDate: "2064-05-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                baseAmount: "30000.00",
                vatMode: "REVERSE_CHARGE",
                vatJurisdiction: "EU",
                supplyKind: "SERVICES",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: doc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-EU-GOODS-DELIVERY",
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2064-05-01",
        responsibleUserId: userId,
      })

      const sh = await buildSouhrnneHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(sh.rows).toHaveLength(1)
      expect(sh.rows[0]!.tax_id).toBe("DE822345678")
      expect(sh.rows[0]!.value).toBe("30000.0000")
      // SERVICES supply_kind → kód 3 (poskytnutí služby §9/1)
      expect(sh.rows[0]!.kod_plneni).toBe("3")
    })
  })

  it("splits one partner's goods and services into two kód rows (0 + 3)", async () => {
    const s = await seedFull("2065-01-01", "2065-12-31")
    await withOrganization(orgA, userId, async (db) => {
      const cp = await createCounterparty(db, s.ctx, {
        name: "Mixed Kunde GmbH",
        taxId: "DE833456789",
        countryCode: "DE",
      })
      const goodsEv = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "EU zboží",
        occurredAt: "2065-05-01",
        responsibleUserId: userId,
      })
      const svcEv = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "EU služba",
        occurredAt: "2065-06-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2065-05-01",
        taxPointDate: "2065-05-01",
        lines: [
          {
            eventId: goodsEv.eventId,
            partials: [
              {
                baseAmount: "10000.00",
                vatMode: "REVERSE_CHARGE",
                vatJurisdiction: "EU",
                supplyKind: "GOODS",
                currencyCode: "CZK",
              },
            ],
          },
          {
            eventId: svcEv.eventId,
            partials: [
              {
                baseAmount: "7000.00",
                vatMode: "REVERSE_CHARGE",
                vatJurisdiction: "EU",
                supplyKind: "SERVICES",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      for (const [i, ev] of [goodsEv, svcEv].entries()) {
        await postFromPredkontace(db, s.ctx, {
          partialRecordId: doc.lines[i]!.partialRecordIds[0]!,
          periodId: s.periodId,
          scenario: "S-EU-GOODS-DELIVERY",
          summaryRecordId: doc.summaryRecordId,
          accountingEventId: ev.eventId,
          postingDate: "2065-06-01",
          responsibleUserId: userId,
        })
      }

      const sh = await buildSouhrnneHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      // same partner, same doklad, two kód rows (goods 0, service 3)
      expect(sh.rows).toHaveLength(2)
      const byKod = Object.fromEntries(sh.rows.map((r) => [r.kod_plneni, r]))
      expect(byKod["0"]!.value).toBe("10000.0000")
      expect(byKod["3"]!.value).toBe("7000.0000")
      expect(byKod["0"]!.tax_id).toBe("DE833456789")
      expect(byKod["3"]!.tax_id).toBe("DE833456789")
    })
  })
})

describe("TODO-7 — DPPO completeness (§34 loss, §38a zálohy, §25)", () => {
  it("applies a prior-year loss and caps it at the base (§34)", async () => {
    const s = await seedFull("2055-01-01", "2055-12-31")
    await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "zisk",
        occurredAt: "2055-06-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2055-06-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                baseAmount: "100000.00",
                vatMode: "EXEMPT",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: doc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-EXEMPT-NO-CREDIT", // MD 311 / D 602, no VAT
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2055-06-01",
        responsibleUserId: userId,
      })

      // base 100000, apply 30000 loss → base 70000 → daň 14700
      const value = (amount: string) => ({
        amount,
        provenance: {
          source: "ADVISOR" as const,
          reference: "test fixture",
          recordedAt: "2055-12-31",
        },
      })
      const completeInput = {
        taxpayerCategory: "STANDARD" as const,
        nonDeductibleExpenses: value("0"),
        exemptRevenue: value("0"),
        excludeLossMakingMainActivity: value("0"),
        lossCarryForward: value("30000"),
        taxReliefs: value("0"),
        advancesPaid: value("0"),
      }
      const dppo = await buildDppo(db, s.periodId, completeInput)
      expect(dppo.zaklad_dane).toBe("100000.0000")
      expect(dppo.odpocet_ztraty).toBe("30000.0000")
      expect(dppo.zaklad_zaokrouhleny).toBe("70000.0000")
      expect(dppo.dan).toBe("14700.0000")

      // a loss larger than the base is capped (never turns profit negative)
      const capped = await buildDppo(db, s.periodId, {
        ...completeInput,
        lossCarryForward: value("500000"),
      })
      expect(capped.odpocet_ztraty).toBe("100000.0000")
      expect(capped.zaklad_zaokrouhleny).toBe("0.0000")
      expect(capped.dan).toBe("0.0000")
    })
  })

  it("computes §38a advances by band and exposes the §25 catalogue", () => {
    expect(computeIncomeTaxAdvances("20000").frequency).toBe("NONE")
    const semi = computeIncomeTaxAdvances("100000")
    expect(semi.frequency).toBe("SEMIANNUAL")
    expect(semi.count).toBe(2)
    expect(semi.amount).toBe("40000.00") // 40 % of 100000
    const quarterly = computeIncomeTaxAdvances("400000")
    expect(quarterly.frequency).toBe("QUARTERLY")
    expect(quarterly.count).toBe(4)
    expect(quarterly.amount).toBe("100000.00") // 25 % of 400000
    expect(NON_DEDUCTIBLE_CATALOGUE.some((e) => e.account === "513")).toBe(true)
  })
})

describe("TODO-8 — statutory statement layout (Decree 500/2002 roll-up)", () => {
  it("rolls account lines into the příloha hierarchy; výsledek foots the VZZ", async () => {
    const s = await seedFull("2056-01-01", "2056-12-31")
    await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "tržba",
        occurredAt: "2056-06-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2056-06-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                baseAmount: "80000.00",
                vatMode: "EXEMPT",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: doc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-EXEMPT-NO-CREDIT",
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2056-06-01",
        responsibleUserId: userId,
      })

      const layout = await buildStatementLayout(db, s.periodId, {
        unit: "CZK",
      })
      expect(layout.type).toBe("STATEMENT_LAYOUT")
      // výnosy 80000, no costs → výsledek 80000
      expect(layout.vynosy).toBe("80000.0000")
      expect(layout.vysledek).toBe("80000.0000")
      // the 311 receivable (80000) rolls up into the aktiva total…
      expect(layout.aktiva_total).toBe("80000.0000")
      // …and appears as a rolled-up aktiva line at some depth
      expect(layout.aktiva.some((l) => l.amount === "80000.0000")).toBe(true)
      // pre-close: the výsledek is still parked in the P&L (602), not yet carried
      // to equity 431, so pasiva_total lags aktiva_total by exactly the výsledek.
      expect(layout.pasiva_total).toBe("0.0000")
      expect(Number(layout.aktiva_total) - Number(layout.pasiva_total)).toBe(
        Number(layout.vysledek),
      )
      // abbreviated rozsah keeps only letter + roman depth
      const abbr = await buildStatementLayout(db, s.periodId, {
        rozsah: "ABBREVIATED",
        unit: "CZK",
      })
      expect(abbr.vzz.every((l) => l.depth <= 2)).toBe(true)
      expect(abbr.aktiva.every((l) => l.depth <= 2)).toBe(true)
    })
  })
})

describe("TODO-4 — bank-line decision (classifyCashMovement)", () => {
  it("maps categories/messages to nonprofit contra accounts with confidence", () => {
    expect(
      classifyCashMovement({
        direction: "OUTFLOW",
        amount: "29",
        category: "Poplatek Vedení účtu",
      }).contraAccount,
    ).toBe("568")
    expect(
      classifyCashMovement({
        direction: "OUTFLOW",
        amount: "5060",
        message: "Pojištění spolku",
      }).contraAccount,
    ).toBe("549")
    expect(
      classifyCashMovement({
        direction: "OUTFLOW",
        amount: "21000",
        message: "Darovací smlouva - RAC Tábor",
      }).contraAccount,
    ).toBe("581")
    const withdrawal = classifyCashMovement({
      direction: "OUTFLOW",
      amount: "6000",
      category: "Hotovostní transakce Výběr hotovosti",
    })
    expect(withdrawal.contraAccount).toBe("261")
    expect(withdrawal.kind).toBe("TRANSFER")
    expect(
      classifyCashMovement({
        direction: "INFLOW",
        amount: "10000",
        message: "Darovací smlouva",
      }).contraAccount,
    ).toBe("682")
    // fall-through is flagged low confidence
    expect(
      classifyCashMovement({ direction: "OUTFLOW", amount: "100" }).confidence,
    ).toBe("low")
  })
})

describe("[#516] KH A.1 / DPH exclude EU-marked issued reverse-charge", () => {
  it("keeps domestic §92 + legacy-NULL issued PDP on A.1, routes EU-marked issued RC to SH only", async () => {
    const s = await seedFull("2071-01-01", "2071-12-31")
    await withOrganization(orgA, userId, async (db) => {
      // (1) Domestic §92 PDP dodavatel — jurisdiction 'REVERSE_CHARGE' → stays on A.1.
      const cpCz = await createCounterparty(db, s.ctx, {
        name: "Stavby CZ s.r.o.",
        taxId: "CZ12345678",
        countryCode: "CZ",
      })
      const evCz = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cpCz,
        description: "PDP stavba §92e",
        occurredAt: "2071-05-01",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2071-05-01",
        taxPointDate: "2071-05-01",
        lines: [
          {
            eventId: evCz.eventId,
            partials: [
              {
                baseAmount: "20000.00",
                vatRate: "21",
                vatMode: "REVERSE_CHARGE",
                vatJurisdiction: "REVERSE_CHARGE",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })

      // (2) Legacy-NULL jurisdiction issued RC — NULL IS DISTINCT FROM 'EU' → stays on A.1.
      const cpCz2 = await createCounterparty(db, s.ctx, {
        name: "Kovošrot CZ s.r.o.",
        taxId: "CZ87654321",
        countryCode: "CZ",
      })
      const evCz2 = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cpCz2,
        description: "PDP šrot §92c (legacy, no jurisdiction)",
        occurredAt: "2071-06-01",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2071-06-01",
        taxPointDate: "2071-06-01",
        lines: [
          {
            eventId: evCz2.eventId,
            partials: [
              {
                baseAmount: "15000.00",
                vatRate: "21",
                vatMode: "REVERSE_CHARGE",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })

      // (3) EU-marked issued RC (§9/1 service reverse-charged to the EU customer) —
      // belongs on Souhrnné hlášení only, NOT on KH A.1 (the [#516] leak).
      const cpEu = await createCounterparty(db, s.ctx, {
        name: "Kunde GmbH",
        taxId: "DE811234567",
        countryCode: "DE",
      })
      const evEu = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cpEu,
        description: "EU služba §9/1",
        occurredAt: "2071-07-01",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2071-07-01",
        taxPointDate: "2071-07-01",
        lines: [
          {
            eventId: evEu.eventId,
            partials: [
              {
                baseAmount: "30000.00",
                vatRate: "21",
                vatMode: "REVERSE_CHARGE",
                vatJurisdiction: "EU",
                supplyKind: "SERVICES",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })

      const kh = await buildKontrolniHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      const a1TaxIds = kh.a1.map((r) => r.tax_id)
      // both domestic §92 rows present on A.1; the EU-marked row is absent.
      expect(a1TaxIds).toContain("CZ12345678")
      expect(a1TaxIds).toContain("CZ87654321")
      expect(a1TaxIds).not.toContain("DE811234567")
      expect(kh.a1.find((r) => r.tax_id === "CZ12345678")!.base21).toBe(
        "20000.0000",
      )
      expect(kh.a1.find((r) => r.tax_id === "CZ87654321")!.base21).toBe(
        "15000.0000",
      )

      // the EU-marked issued RC appears on Souhrnné hlášení (kód 0, no supply_kind).
      const sh = await buildSouhrnneHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      const shEu = sh.rows.find((r) => r.tax_id === "DE811234567")
      expect(shEu?.value).toBe("30000.0000")
      expect(sh.rows.some((r) => r.tax_id === "CZ12345678")).toBe(false)

      // DPH: the A.1 checksum + ř.25 exclude the EU base (20000 + 15000 = 35000),
      // so the two A.1 numbers on the filed KH agree and ř.25 carries no EU leak.
      const dph = await buildDph(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(dph.kh.a1_base).toBe("35000.0000")
      expect(dph.rows.r25_base).toBe("35000.0000")
    })
  })
})

describe("[#516] KH kód předmětu plnění (§92 commodity)", () => {
  it("emits the §92 kód on A.1/B.1, splits a mixed doklad per kód, and forces null on A.2/A.4/legacy", async () => {
    const s = await seedFull("2072-01-01", "2072-12-31")
    await withOrganization(orgA, userId, async (db) => {
      const capture = async (
        args: {
          taxId: string
          country: string
          type: "ISSUED_INVOICE" | "RECEIVED_INVOICE"
          day: string
          desc: string
        },
        partials: Array<{
          baseAmount: string
          vatMode: "REVERSE_CHARGE" | "STANDARD"
          vatJurisdiction?: "REVERSE_CHARGE" | "EU"
          commodityCode?: "1" | "3" | "4" | "5"
          vatAmount?: string
        }>,
      ) => {
        const cp = await createCounterparty(db, s.ctx, {
          name: args.desc,
          taxId: args.taxId,
          countryCode: args.country,
        })
        const ev = await createEvent(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.eventSeriesId,
          counterpartyId: cp,
          description: args.desc,
          occurredAt: args.day,
          responsibleUserId: userId,
        })
        await captureDocument(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.documentSeriesId,
          type: args.type,
          issuedAt: args.day,
          taxPointDate: args.day,
          receivedDate: args.type === "RECEIVED_INVOICE" ? args.day : undefined,
          lines: [
            {
              eventId: ev.eventId,
              partials: partials.map((p) => ({
                baseAmount: p.baseAmount,
                vatRate: "21",
                vatMode: p.vatMode,
                vatJurisdiction: p.vatJurisdiction,
                commodityCode: p.commodityCode,
                vatAmount: p.vatAmount,
                currencyCode: "CZK",
              })),
            },
          ],
        })
      }

      // (1) A.1 ISSUED domestic §92e reverse charge → kód "4".
      await capture(
        {
          taxId: "CZ11110000",
          country: "CZ",
          type: "ISSUED_INVOICE",
          day: "2072-03-01",
          desc: "PDP stavba §92e",
        },
        [
          {
            baseAmount: "10000.00",
            vatMode: "REVERSE_CHARGE",
            vatJurisdiction: "REVERSE_CHARGE",
            commodityCode: "4",
          },
        ],
      )

      // (2) A.1 ISSUED, one doklad mixing two §92 commodities (§92e + příloha 5)
      //     → the kód is part of the grouping key, so this splits into two rows.
      await capture(
        {
          taxId: "CZ22220000",
          country: "CZ",
          type: "ISSUED_INVOICE",
          day: "2072-04-01",
          desc: "PDP mixed §92e + příloha 5",
        },
        [
          {
            baseAmount: "8000.00",
            vatMode: "REVERSE_CHARGE",
            vatJurisdiction: "REVERSE_CHARGE",
            commodityCode: "4",
          },
          {
            baseAmount: "3000.00",
            vatMode: "REVERSE_CHARGE",
            vatJurisdiction: "REVERSE_CHARGE",
            commodityCode: "5",
          },
        ],
      )

      // (3) A.1 legacy domestic RC, no commodity captured → kód null (backward compat).
      await capture(
        {
          taxId: "CZ33330000",
          country: "CZ",
          type: "ISSUED_INVOICE",
          day: "2072-05-01",
          desc: "PDP legacy, no kód",
        },
        [{ baseAmount: "5000.00", vatMode: "REVERSE_CHARGE" }],
      )

      // (4) B.1 RECEIVED domestic §92c reverse charge → kód "5" + samovyměřená daň.
      await capture(
        {
          taxId: "CZ44440000",
          country: "CZ",
          type: "RECEIVED_INVOICE",
          day: "2072-06-01",
          desc: "PDP šrot přijato §92c",
        },
        [
          {
            baseAmount: "5000.00",
            vatMode: "REVERSE_CHARGE",
            vatJurisdiction: "REVERSE_CHARGE",
            commodityCode: "5",
          },
        ],
      )

      // (5) A.2 EU acquisition (no §92 kód — the DB CHECK forbids a code on an EU
      //     line; see CC6). The emitter emits kód null for it naturally.
      await capture(
        {
          taxId: "DE55550000",
          country: "DE",
          type: "RECEIVED_INVOICE",
          day: "2072-07-01",
          desc: "EU acquisition §16",
        },
        [
          {
            baseAmount: "3000.00",
            vatMode: "REVERSE_CHARGE",
            vatJurisdiction: "EU",
          },
        ],
      )

      // (6) A.4 STANDARD issued over the §101d threshold → no §92 kód.
      await capture(
        {
          taxId: "CZ66660000",
          country: "CZ",
          type: "ISSUED_INVOICE",
          day: "2072-08-01",
          desc: "standard sale > 10k",
        },
        [
          {
            baseAmount: "20000.00",
            vatMode: "STANDARD",
            vatAmount: "4200.00",
          },
        ],
      )

      const kh = await buildKontrolniHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })

      // A.1 single §92e row → kód "4".
      const a1_92e = kh.a1.find((r) => r.tax_id === "CZ11110000")
      expect(a1_92e?.kod).toBe("4")
      expect(a1_92e?.base21).toBe("10000.0000")

      // A.1 mixed doklad splits into two rows, one per kód.
      const mixed = kh.a1
        .filter((r) => r.tax_id === "CZ22220000")
        .sort((a, b) => (a.kod ?? "").localeCompare(b.kod ?? ""))
      expect(mixed.map((r) => r.kod)).toEqual(["4", "5"])
      expect(mixed.find((r) => r.kod === "4")?.base21).toBe("8000.0000")
      expect(mixed.find((r) => r.kod === "5")?.base21).toBe("3000.0000")

      // A.1 legacy row → kód null.
      expect(kh.a1.find((r) => r.tax_id === "CZ33330000")?.kod).toBeNull()

      // B.1 domestic §92c received → kód "5" + self-assessed 21 % daň.
      const b1 = kh.b1.find((r) => r.tax_id === "CZ44440000")
      expect(b1?.kod).toBe("5")
      expect(b1?.base21).toBe("5000.0000")
      expect(b1?.dan21).toBe("1050.0000")

      // A.2 EU acquisition → kód null (no §92 kód on A.2).
      const a2 = kh.a2.find((r) => r.tax_id === "DE55550000")
      expect(a2?.kod).toBeNull()
      expect(a2?.base21).toBe("3000.0000")

      // A.4 standard → kód null.
      expect(kh.a4.find((r) => r.tax_id === "CZ66660000")?.kod).toBeNull()
    })
  })
})

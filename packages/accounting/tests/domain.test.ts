/**
 * v2 @workspace/accounting domain tests — capture → předkontace post → read-model
 * books → output, across all three regimes, plus FX settlement, corrections,
 * period carry-forward, saldokonto, the VAT engine (reverse charge), and the
 * R-invariants. Runs against the PG18 testcontainer (globalSetup) as app_user
 * under RLS via withOrganization — the same path real callers take.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import type { OrganizationBoundDb } from "@workspace/db"
import {
  adminClient,
  seedCashOrg,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
} from "./fixtures.js"
import {
  allocateNumber,
  buildZaverka,
  captureDocument,
  closeResult,
  createAsset,
  createCounterparty,
  createDepreciationPlan,
  createEvent,
  createNumberSeries,
  generalLedger,
  generateDepreciation,
  generateOutput,
  journal,
  monetaryJournal,
  monetarySummary,
  openItem,
  openItemsForCounterparty,
  postDoubleEntry,
  postFromPredkontace,
  postFxSettlement,
  postMonetary,
  reconcileReadModel,
  reverse,
  rollForwardPeriod,
  traceEvent,
  unpostedCases,
  UnpostedPeriodError,
} from "../src/index"
import type { OrgCtx } from "../src/index"

let admin: ReturnType<typeof adminClient>
let workspaceId: string
let orgA: string
let orgB: string
let userId: string

beforeAll(async () => {
  admin = adminClient()
  const seed = await seedTwoOrganizations(admin)
  workspaceId = seed.workspaceId
  orgA = seed.orgAId
  orgB = seed.orgBId
  userId = seed.userAId
})

afterAll(async () => {
  await admin.end({ timeout: 5 })
})

/** Look up an account's read-model row in a period. */
async function balance(
  db: OrganizationBoundDb,
  periodId: string,
  accountId: string,
): Promise<{
  td: string
  tc: string
  closing: string
  opening: string
} | null> {
  const ledger = await generalLedger(db, periodId)
  const row = ledger.find((r) => r.account_id === accountId)
  return row
    ? {
        td: row.turnover_debit,
        tc: row.turnover_credit,
        closing: row.closing_balance,
        opening: row.opening_balance,
      }
    : null
}

describe("capture → předkontace → read-model (DOUBLE_ENTRY)", () => {
  it("posts a domestic purchase (504/343/321) and maintains balances", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId)

    const posted = await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Nákup zboží",
        occurredAt: "2026-03-10",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2026-03-10",
        receivedDate: "2026-03-10",
        lines: [
          {
            eventId: ev.eventId,
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
      const partialId = doc.lines[0]!.partialRecordIds[0]!
      return postFromPredkontace(db, s.ctx, {
        partialRecordId: partialId,
        periodId: s.periodId,
        scenario: "P-GOODS-21",
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2026-03-10",
        responsibleUserId: userId,
      })
    })
    expect(posted.lineIds).toHaveLength(3)

    await withOrganization(orgA, userId, async (db) => {
      const j = await journal(db, s.periodId)
      expect(j).toHaveLength(3)
      const b504 = await balance(db, s.periodId, s.accounts["504"]!)
      const b343 = await balance(db, s.periodId, s.accounts["343"]!)
      const b321 = await balance(db, s.periodId, s.accounts["321"]!)
      expect(b504!.td).toBe("1000.0000")
      expect(b343!.td).toBe("210.0000")
      expect(b321!.tc).toBe("1210.0000")
      // read-model agrees with the journal
      const drift = await reconcileReadModel(db, s.periodId)
      expect(drift).toEqual([])
    })
  })

  it("self-assesses VAT on a reverse-charge (PDP) purchase (343↔343 nets to 0)", async () => {
    const s = await seedDoubleEntryOrg(orgB, workspaceId, userId)
    await withOrganization(orgB, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Stavební práce PDP",
        occurredAt: "2026-04-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2026-04-01",
        receivedDate: "2026-04-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                baseAmount: "5000.00",
                vatRate: "21",
                vatMode: "REVERSE_CHARGE",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      const posted = await postFromPredkontace(db, s.ctx, {
        partialRecordId: doc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "P-PDP",
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2026-04-01",
        responsibleUserId: userId,
      })
      expect(posted.lineIds).toHaveLength(4)
    })
    await withOrganization(orgB, userId, async (db) => {
      const b343 = await balance(db, s.periodId, s.accounts["343"]!)
      // 1050 self-assessed on both sides → nets to zero
      expect(b343!.td).toBe("1050.0000")
      expect(b343!.tc).toBe("1050.0000")
      expect(b343!.closing).toBe("0.0000")
      const b518 = await balance(db, s.periodId, s.accounts["518"]!)
      expect(b518!.td).toBe("5000.0000")
    })
  })
})

describe("number series — gapless designation", () => {
  it("issues contiguous frozen Označení", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2027-01-01",
      periodEnd: "2027-12-31",
    })
    const designations = await withOrganization(orgA, userId, async (db) => {
      const a = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "first",
        occurredAt: "2027-02-01",
        responsibleUserId: userId,
      })
      const b = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "second",
        occurredAt: "2027-02-02",
        responsibleUserId: userId,
      })
      return [a.designation, b.designation]
    })
    expect(designations).toEqual(["EV20270001", "EV20270002"])
  })

  it("refuses to burn a series for the wrong entity kind and does not advance it", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2038-01-01",
      periodEnd: "2038-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      // an EVENT series must not be consumable as a DOCUMENT series
      await expect(
        allocateNumber(db, s.eventSeriesId, "2038-03-01", "DOCUMENT"),
      ).rejects.toThrow(/not of type DOCUMENT/)
      // and the refused attempt must NOT advance next_number — the next
      // legitimate allocation still draws sequence 1
      const a = await allocateNumber(db, s.eventSeriesId, "2038-03-01", "EVENT")
      expect(a.sequenceNumber).toBe(1)
      expect(a.designation).toBe("EV20380001")
    })
  })
})

describe("monetary regime (SINGLE_ENTRY)", () => {
  it("classifies a cash receipt and feeds the přehledy summary", async () => {
    const s = await seedCashOrg(orgA, workspaceId, userId, "SINGLE_ENTRY")
    await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Tržba v hotovosti",
        occurredAt: "2026-05-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "CASH_DOCUMENT",
        issuedAt: "2026-05-01",
        lines: [],
      })
      await postMonetary(db, s.ctx, {
        regime: "SINGLE_ENTRY",
        periodId: s.periodId,
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2026-05-01",
        responsibleUserId: userId,
        lines: [
          {
            location: "CASH",
            direction: "INFLOW",
            isTaxRelevant: true,
            categoryId: s.categories["sluzby"]!,
            taxBase: "3000.00",
            amount: "3000.00",
          },
        ],
      })
    })
    await withOrganization(orgA, userId, async (db) => {
      const mj = await monetaryJournal(db, s.periodId)
      expect(mj).toHaveLength(1)
      const summary = await monetarySummary(db, s.periodId)
      const inflow = summary.find((r) => r.direction === "INFLOW")
      expect(inflow!.total_amount).toBe("3000.0000")
      expect(inflow!.total_tax_base).toBe("3000.0000")
    })
  })
})

describe("corrections (REVERSAL / červené storno)", () => {
  it("reverses a posting and the read-model self-corrects", async () => {
    const s = await seedDoubleEntryOrg(orgB, workspaceId, userId, {
      periodStart: "2028-01-01",
      periodEnd: "2028-12-31",
    })
    const original = await withOrganization(orgB, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Služba",
        occurredAt: "2028-02-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2028-02-01",
        receivedDate: "2028-02-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                baseAmount: "800.00",
                vatRate: "21",
                vatMode: "STANDARD",
                vatAmount: "168.00",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      return postFromPredkontace(db, s.ctx, {
        partialRecordId: doc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "P-SERVICES-21",
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2028-02-01",
        responsibleUserId: userId,
      })
    })
    await withOrganization(orgB, userId, async (db) => {
      await reverse(db, s.ctx, {
        originalPostingId: original.postingId,
        postingDate: "2028-02-05",
        responsibleUserId: userId,
      })
    })
    await withOrganization(orgB, userId, async (db) => {
      const b518 = await balance(db, s.periodId, s.accounts["518"]!)
      // 800 posted then -800 storno → net zero turnover
      expect(b518!.closing).toBe("0.0000")
      const drift = await reconcileReadModel(db, s.periodId)
      expect(drift).toEqual([])
    })
  })
})

describe("FX engine — cross-currency settlement (ČÚS 006)", () => {
  it("realizes a kurzový zisk on a EUR receivable paid at a higher rate", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2029-01-01",
      periodEnd: "2029-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      // invoice posting (MD 311 / D 604) booked at 25.00 CZK/EUR → 25000 CZK
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Vydaná faktura EUR",
        occurredAt: "2029-03-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2029-03-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                baseAmount: "1000.00",
                vatMode: "EXEMPT",
                currencyCode: "EUR",
                fxRate: "25.000000",
                fxRateKind: "DAILY",
              },
            ],
          },
        ],
      })
      const inv = await postFromPredkontace(db, s.ctx, {
        partialRecordId: doc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-EXEMPT-NO-CREDIT",
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2029-03-01",
        responsibleUserId: userId,
      })
      const oi = await openItem(db, s.ctx, {
        counterpartyId: await createCounterparty(db, s.ctx),
        originPostingId: inv.postingId,
        accountNumber: "311",
        direction: "RECEIVABLE",
        originalAmount: "25000.00",
        currencyCode: "EUR",
        issueDate: "2029-03-01",
        dueDate: "2029-04-01",
      })
      // paid 1000 EUR at 26.00 → 26000 CZK cash; booked value 25000 → 1000 gain
      const payEv = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Úhrada faktury",
        occurredAt: "2029-04-01",
        responsibleUserId: userId,
      })
      const payDoc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "BANK_STATEMENT",
        issuedAt: "2029-04-01",
        lines: [],
      })
      await postFxSettlement(db, s.ctx, {
        openItemId: oi,
        periodId: s.periodId,
        summaryRecordId: payDoc.summaryRecordId,
        accountingEventId: payEv.eventId,
        postingDate: "2029-04-01",
        responsibleUserId: userId,
        direction: "RECEIVABLE",
        saldoAccountNumber: "311",
        cashAccountNumber: "221",
        bookedValue: "25000.00",
        cashValue: "26000.00",
        settlementFxRate: "26.000000",
      })
    })
    await withOrganization(orgA, userId, async (db) => {
      const b663 = await balance(db, s.periodId, s.accounts["663"]!)
      expect(b663!.tc).toBe("1000.0000") // kurzový zisk
      const b311 = await balance(db, s.periodId, s.accounts["311"]!)
      expect(b311!.closing).toBe("0.0000") // receivable cleared
      const b221 = await balance(db, s.periodId, s.accounts["221"]!)
      expect(b221!.td).toBe("26000.0000")
    })
  })
})

describe("saldokonto", () => {
  it("tracks an open item until settled", async () => {
    const s = await seedDoubleEntryOrg(orgB, workspaceId, userId, {
      periodStart: "2030-01-01",
      periodEnd: "2030-12-31",
    })
    const { cpId, oiId } = await withOrganization(orgB, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Faktura",
        occurredAt: "2030-02-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2030-02-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              { baseAmount: "1000.00", vatMode: "EXEMPT", currencyCode: "CZK" },
            ],
          },
        ],
      })
      const inv = await postFromPredkontace(db, s.ctx, {
        partialRecordId: doc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-EXEMPT-NO-CREDIT",
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2030-02-01",
        responsibleUserId: userId,
      })
      const cpId = await createCounterparty(db, s.ctx)
      const oiId = await openItem(db, s.ctx, {
        counterpartyId: cpId,
        originPostingId: inv.postingId,
        accountNumber: "311",
        direction: "RECEIVABLE",
        originalAmount: "1000.00",
        currencyCode: "CZK",
        issueDate: "2030-02-01",
      })
      return { cpId, oiId }
    })
    await withOrganization(orgB, userId, async (db) => {
      const items = await openItemsForCounterparty(db, cpId)
      expect(items).toHaveLength(1)
      expect(items[0]!.id).toBe(oiId)
      expect(items[0]!.remaining_amount).toBe("1000.0000")
      expect(items[0]!.is_settled).toBe(false)
    })
  })
})

describe("output (R6 gate)", () => {
  it("blocks output while a case is unposted, then succeeds once posted", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2031-01-01",
      periodEnd: "2031-12-31",
    })
    const captured = await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Prodej služby",
        occurredAt: "2031-02-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2031-02-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              { baseAmount: "500.00", vatMode: "EXEMPT", currencyCode: "CZK" },
            ],
          },
        ],
      })
      return { eventId: ev.eventId, doc }
    })

    // R6 blocks output — the case is captured but not posted.
    await withOrganization(orgA, userId, async (db) => {
      expect(await unpostedCases(db, s.periodId)).toHaveLength(1)
      await expect(
        generateOutput(db, s.ctx as OrgCtx, {
          periodId: s.periodId,
          generatedBy: userId,
        }),
      ).rejects.toBeInstanceOf(UnpostedPeriodError)
    })

    // post the case → R6 satisfied → output succeeds and records a marker.
    await withOrganization(orgA, userId, async (db) => {
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: captured.doc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-EXEMPT-NO-CREDIT",
        summaryRecordId: captured.doc.summaryRecordId,
        accountingEventId: captured.eventId,
        postingDate: "2031-02-01",
        responsibleUserId: userId,
      })
    })
    await withOrganization(orgA, userId, async (db) => {
      expect(await unpostedCases(db, s.periodId)).toHaveLength(0)
      const out = await generateOutput(db, s.ctx as OrgCtx, {
        periodId: s.periodId,
        generatedBy: userId,
      })
      expect(out.figures.type).toBe("FINANCIAL_STATEMENTS")
      const trace = await traceEvent(db, captured.eventId)
      expect(trace).toHaveLength(1) // R11 reverse trace: case → its posting
    })
  })
})

describe("period lifecycle (close + 701 carry-forward)", () => {
  it("carries balance-sheet closing balances into the next period as opening_balance", async () => {
    const s = await seedDoubleEntryOrg(orgB, workspaceId, userId, {
      periodStart: "2033-01-01",
      periodEnd: "2033-12-31",
    })
    // one purely balance-sheet posting: MD 221 / D 321 = 1000 (both carry forward)
    await withOrganization(orgB, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Úvěr na účet",
        occurredAt: "2033-06-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "INTERNAL",
        issuedAt: "2033-06-01",
        lines: [],
      })
      await postDoubleEntry(db, s.ctx, {
        periodId: s.periodId,
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2033-06-01",
        responsibleUserId: userId,
        lines: [
          { accountId: s.accounts["221"]!, side: "DEBIT", amount: "1000.00" },
          { accountId: s.accounts["321"]!, side: "CREDIT", amount: "1000.00" },
        ],
      })
    })

    const result = await withOrganization(orgB, userId, async (db) => {
      return rollForwardPeriod(db, s.ctx, {
        priorPeriodId: s.periodId,
        responsibleUserId: userId,
      })
    })
    expect(result.openingPostingId).not.toBeNull()

    await withOrganization(orgB, userId, async (db) => {
      const ledger = await generalLedger(db, result.newPeriodId)
      const bank = ledger.find((r) => r.account_number === "221")!
      const supplier = ledger.find((r) => r.account_number === "321")!
      expect(bank.opening_balance).toBe("1000.0000")
      expect(bank.turnover_debit).toBe("0.0000") // opening ≠ turnover
      expect(supplier.opening_balance).toBe("-1000.0000")
    })
  })
})

describe("supporting (depreciation generator)", () => {
  it("posts monthly depreciation MD 551 / D 082 linked to the plan", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2035-01-01",
      periodEnd: "2035-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const assetSeries = await createNumberSeries(db, s.ctx, {
        entityType: "ASSET",
        code: "DHM",
        pattern: "INV{NNNN}",
      })
      const asset = await createAsset(db, s.ctx, {
        seriesId: assetSeries,
        name: "Stroj",
        category: "TANGIBLE_DEPRECIABLE",
        accountNumber: "022",
        commissioningDate: "2035-01-01",
        acquisitionCost: "120000.00",
      })
      const plan = await createDepreciationPlan(db, s.ctx, {
        assetId: asset.id,
        method: "STRAIGHT_LINE",
        startDate: "2035-01-01",
        monthlyAmount: "2000.00",
        expenseAccountNumber: "551",
        accumulatedAccountNumber: "082",
        usefulLifeMonths: 60,
      })
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Odpis 01/2035",
        occurredAt: "2035-01-31",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "INTERNAL",
        issuedAt: "2035-01-31",
        lines: [],
      })
      await generateDepreciation(db, s.ctx, {
        depreciationPlanId: plan,
        periodId: s.periodId,
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2035-01-31",
        responsibleUserId: userId,
      })
    })
    await withOrganization(orgA, userId, async (db) => {
      const b551 = await balance(db, s.periodId, s.accounts["551"]!)
      const b082 = await balance(db, s.periodId, s.accounts["082"]!)
      expect(b551!.td).toBe("2000.0000")
      expect(b082!.tc).toBe("2000.0000")
    })
  })
})

describe("year-end result close (710 → 431)", () => {
  it("closes P&L to 710 → 431 so the rozvaha foots (aktiva = pasiva)", async () => {
    const s = await seedDoubleEntryOrg(orgB, workspaceId, userId, {
      periodStart: "2036-01-01",
      periodEnd: "2036-12-31",
    })
    // a sale on credit: MD 311 / D 602 = 1000 → asset 1000, revenue 1000, profit 1000
    await withOrganization(orgB, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Prodej služby na fakturu",
        occurredAt: "2036-03-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2036-03-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              { baseAmount: "1000.00", vatMode: "EXEMPT", currencyCode: "CZK" },
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
        postingDate: "2036-03-01",
        responsibleUserId: userId,
      })
    })

    // before the close: aktiva = 1000, pasiva = 0 (result still on P&L) — does NOT foot
    await withOrganization(orgB, userId, async (db) => {
      const z = await buildZaverka(db, s.periodId)
      expect(z.aktiva).toBe("1000.0000")
      expect(z.pasiva).toBe("0.0000")
      expect(z.vysledek).toBe("1000.0000")
    })

    // year-end close: 602 → 710 → 431
    await withOrganization(orgB, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Uzávěrkové operace",
        occurredAt: "2036-12-31",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "INTERNAL",
        issuedAt: "2036-12-31",
        lines: [],
      })
      const closed = await closeResult(db, s.ctx, {
        periodId: s.periodId,
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2036-12-31",
        responsibleUserId: userId,
      })
      expect(closed.postingId).not.toBeNull()
    })

    // after the close: result rolled to equity (431) → aktiva = pasiva, P&L zeroed
    await withOrganization(orgB, userId, async (db) => {
      const z = await buildZaverka(db, s.periodId)
      expect(z.aktiva).toBe("1000.0000")
      expect(z.pasiva).toBe("1000.0000") // now foots
      expect(z.vynosy).toBe("0.0000") // 602 closed to 710
      const b431 = await balance(db, s.periodId, s.accounts["431"]!)
      expect(b431!.closing).toBe("-1000.0000") // equity credit balance = result
    })
  })
})

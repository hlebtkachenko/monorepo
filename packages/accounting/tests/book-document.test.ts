/**
 * bookDocument — whole-invoice deterministic booking (derive mode).
 *
 * Proves the production path: a captured invoice is booked into its complete
 * double-entry posting(s) by deriving the předkontace from each partial's facts —
 * one posting PER EVENT, every line tagged with its source partial_record_id, the
 * read-model in agreement (drift = []). Plus the fail-closed guards (null
 * supplyKind, ASSET, non-zero rounding, non-invoice, double-book) that HOLD a
 * document rather than book it confidently-wrong. Runs against the PG18
 * testcontainer as app_user under RLS via withOrganization.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { executeRows, sql, withOrganization } from "@workspace/db"
import type { OrganizationBoundDb } from "@workspace/db"
import {
  adminClient,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
} from "./fixtures.js"
import {
  bookDocument,
  captureDocument,
  createEvent,
  generalLedger,
  reconcileReadModel,
  unlinkedInvoiceLines,
} from "../src/index"

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

/** turnover_debit / turnover_credit for one account in a period. */
async function balance(
  db: OrganizationBoundDb,
  periodId: string,
  accountId: string,
): Promise<{ td: string; tc: string } | null> {
  const ledger = await generalLedger(db, periodId)
  const row = ledger.find((r) => r.account_id === accountId)
  return row ? { td: row.turnover_debit, tc: row.turnover_credit } : null
}

/** How many double-entry lines for a summary_record have a NULL partial_record_id. */
async function nullPartialLines(
  db: OrganizationBoundDb,
  summaryRecordId: string,
): Promise<number> {
  const r = await executeRows<{ n: number }>(
    db,
    sql`SELECT count(*)::int AS n
          FROM posting_double_entry_line l
          JOIN posting p ON p.id = l.posting_id
         WHERE p.summary_record_id = ${summaryRecordId}::uuid
           AND l.partial_record_id IS NULL`,
  )
  return r[0]!.n
}

describe("bookDocument — derive vertical", () => {
  it("books a two-event invoice as N postings, each balanced, every line linked to its partial", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })

    const { summaryRecordId, postingCount } = await withOrganization(
      orgA,
      userId,
      async (db) => {
        const goods = await createEvent(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.eventSeriesId,
          description: "Nákup zboží",
          occurredAt: "2026-03-10",
          responsibleUserId: userId,
        })
        const services = await createEvent(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.eventSeriesId,
          description: "Přijatá služba",
          occurredAt: "2026-03-10",
          responsibleUserId: userId,
        })
        // ONE invoice billing TWO events (§ event lives on individual_record).
        const doc = await captureDocument(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.documentSeriesId,
          type: "RECEIVED_INVOICE",
          issuedAt: "2026-03-10",
          taxPointDate: "2026-03-10",
          receivedDate: "2026-03-10",
          lines: [
            {
              eventId: goods.eventId,
              partials: [
                {
                  baseAmount: "1000.00",
                  vatRate: "21",
                  vatMode: "STANDARD",
                  vatJurisdiction: "DOMESTIC",
                  supplyKind: "GOODS",
                  vatAmount: "210.00",
                  currencyCode: "CZK",
                },
              ],
            },
            {
              eventId: services.eventId,
              partials: [
                {
                  baseAmount: "2000.00",
                  vatRate: "21",
                  vatMode: "STANDARD",
                  vatJurisdiction: "DOMESTIC",
                  supplyKind: "SERVICES",
                  vatAmount: "420.00",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        })

        const booked = await bookDocument(db, s.ctx, {
          summaryRecordId: doc.summaryRecordId,
          responsibleUserId: userId,
        })
        return {
          summaryRecordId: doc.summaryRecordId,
          postingCount: booked.postings.length,
        }
      },
    )

    // one posting per event
    expect(postingCount).toBe(2)

    await withOrganization(orgA, userId, async (db) => {
      // goods → 504 net; services → 518 net; shared 343 input VAT; 321 gross
      const b504 = await balance(db, s.periodId, s.accounts["504"]!)
      const b518 = await balance(db, s.periodId, s.accounts["518"]!)
      const b343 = await balance(db, s.periodId, s.accounts["343"]!)
      const b321 = await balance(db, s.periodId, s.accounts["321"]!)
      expect(b504!.td).toBe("1000.0000")
      expect(b518!.td).toBe("2000.0000")
      expect(b343!.td).toBe("630.0000") // 210 + 420
      expect(b321!.tc).toBe("3630.0000") // 1210 + 2420

      // EVERY invoice-derived line carries its source partial_record_id
      expect(await nullPartialLines(db, summaryRecordId)).toBe(0)
      // …and the partial-link completeness invariant (E2) confirms it period-wide
      expect(await unlinkedInvoiceLines(db, s.periodId)).toEqual([])

      // read-model agrees with the journal
      expect(await reconcileReadModel(db, s.periodId)).toEqual([])
    })
  })

  it("books a STANDARD credit note (dobropis) with reversed sides from a negative capture", async () => {
    const s = await seedDoubleEntryOrg(orgB, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })

    const summaryRecordId = await withOrganization(orgB, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Dobropis k nákupu zboží",
        occurredAt: "2026-05-02",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2026-05-02",
        taxPointDate: "2026-05-02",
        receivedDate: "2026-05-02",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                // captured with NEGATIVE totals (§42 opravný daňový doklad)
                baseAmount: "-500.00",
                vatRate: "21",
                vatMode: "STANDARD",
                vatJurisdiction: "DOMESTIC",
                supplyKind: "CREDIT_NOTE",
                vatAmount: "-105.00",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      const booked = await bookDocument(db, s.ctx, {
        summaryRecordId: doc.summaryRecordId,
        responsibleUserId: userId,
      })
      expect(booked.postings).toHaveLength(1)
      return doc.summaryRecordId
    })

    await withOrganization(orgB, userId, async (db) => {
      // reversed vs a purchase: 321 DEBIT gross, 504 CREDIT net, 343 CREDIT vat
      const b321 = await balance(db, s.periodId, s.accounts["321"]!)
      const b504 = await balance(db, s.periodId, s.accounts["504"]!)
      const b343 = await balance(db, s.periodId, s.accounts["343"]!)
      expect(b321!.td).toBe("605.0000")
      expect(b504!.tc).toBe("500.0000")
      expect(b343!.tc).toBe("105.0000")
      expect(await nullPartialLines(db, summaryRecordId)).toBe(0)
      expect(await reconcileReadModel(db, s.periodId)).toEqual([])
    })
  })

  it("is idempotent — refuses to double-book an already-booked document", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2029-01-01",
      periodEnd: "2029-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Nákup",
        occurredAt: "2029-02-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2029-02-01",
        receivedDate: "2029-02-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                baseAmount: "100.00",
                vatRate: "21",
                vatMode: "STANDARD",
                vatJurisdiction: "DOMESTIC",
                supplyKind: "SERVICES",
                vatAmount: "21.00",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await bookDocument(db, s.ctx, {
        summaryRecordId: doc.summaryRecordId,
        responsibleUserId: userId,
      })
      await expect(
        bookDocument(db, s.ctx, {
          summaryRecordId: doc.summaryRecordId,
          responsibleUserId: userId,
        }),
      ).rejects.toThrow(/already booked/)
    })
  })

  it("fails closed on a null supply_kind, an ASSET, and a non-zero §37 rounding", async () => {
    const s = await seedDoubleEntryOrg(orgB, workspaceId, userId, {
      periodStart: "2030-01-01",
      periodEnd: "2030-12-31",
    })
    await withOrganization(orgB, userId, async (db) => {
      const mkDoc = async (
        supplyKind: "GOODS" | "ASSET" | null,
        roundingAmount: string,
      ): Promise<string> => {
        const ev = await createEvent(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.eventSeriesId,
          description: "guard",
          occurredAt: "2030-02-01",
          responsibleUserId: userId,
        })
        const doc = await captureDocument(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.documentSeriesId,
          type: "RECEIVED_INVOICE",
          issuedAt: "2030-02-01",
          receivedDate: "2030-02-01",
          roundingAmount,
          lines: [
            {
              eventId: ev.eventId,
              partials: [
                {
                  baseAmount: "1000.00",
                  vatRate: "21",
                  vatMode: "STANDARD",
                  vatJurisdiction: "DOMESTIC",
                  supplyKind,
                  vatAmount: "210.00",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        })
        return doc.summaryRecordId
      }

      const nullKind = await mkDoc(null, "0")
      await expect(
        bookDocument(db, s.ctx, {
          summaryRecordId: nullKind,
          responsibleUserId: userId,
        }),
      ).rejects.toThrow(/supply_kind/)

      const asset = await mkDoc("ASSET", "0")
      await expect(
        bookDocument(db, s.ctx, {
          summaryRecordId: asset,
          responsibleUserId: userId,
        }),
      ).rejects.toThrow(/ASSET/)

      const rounded = await mkDoc("GOODS", "0.40")
      await expect(
        bookDocument(db, s.ctx, {
          summaryRecordId: rounded,
          responsibleUserId: userId,
        }),
      ).rejects.toThrow(/rounding/)
    })
  })
})

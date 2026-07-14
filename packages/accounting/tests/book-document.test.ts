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
  createCounterparty,
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

/** open_item rows opened by the postings of a summary_record (saldokonto obligations). */
async function openItemsForDoc(
  db: OrganizationBoundDb,
  summaryRecordId: string,
): Promise<
  {
    account_number: string
    direction: string
    original_amount: string
    counterparty_id: string
  }[]
> {
  return executeRows(
    db,
    sql`SELECT oi.account_number, oi.direction, oi.original_amount::text AS original_amount,
               oi.counterparty_id::text AS counterparty_id
          FROM open_item oi
          JOIN posting p ON p.id = oi.origin_posting_id
         WHERE p.summary_record_id = ${summaryRecordId}::uuid
         ORDER BY oi.original_amount`,
  )
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

    const { summaryRecordId, postingCount, supplier } = await withOrganization(
      orgA,
      userId,
      async (db) => {
        const supplier = await createCounterparty(db, s.ctx, {
          name: "Dodavatel s.r.o.",
        })
        const goods = await createEvent(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.eventSeriesId,
          description: "Nákup zboží",
          occurredAt: "2026-03-10",
          counterpartyId: supplier,
          responsibleUserId: userId,
        })
        const services = await createEvent(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.eventSeriesId,
          description: "Přijatá služba",
          occurredAt: "2026-03-10",
          counterpartyId: supplier,
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
          supplier,
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

      // saldokonto: each event's posting opened a PAYABLE (321) závazek to the
      // supplier for its gross — 1210 (goods) + 2420 (services) = the 321 credit.
      const obligations = await openItemsForDoc(db, summaryRecordId)
      expect(obligations).toHaveLength(2)
      expect(obligations.every((o) => o.direction === "PAYABLE")).toBe(true)
      expect(obligations.every((o) => o.account_number === "321")).toBe(true)
      expect(obligations.every((o) => o.counterparty_id === supplier)).toBe(
        true,
      )
      expect(obligations.map((o) => o.original_amount)).toEqual([
        "1210.0000",
        "2420.0000",
      ])
    })
  })

  it("opens a RECEIVABLE (311) obligation for an issued invoice — the sales-side branch", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2032-01-01",
      periodEnd: "2032-12-31",
    })
    const res = await withOrganization(orgA, userId, async (db) => {
      const customer = await createCounterparty(db, s.ctx, {
        name: "Odběratel s.r.o.",
      })
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Prodej služby",
        occurredAt: "2032-03-10",
        counterpartyId: customer,
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2032-03-10",
        taxPointDate: "2032-03-10",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                baseAmount: "5000.00",
                vatRate: "21",
                vatMode: "STANDARD",
                vatJurisdiction: "DOMESTIC",
                supplyKind: "SERVICES",
                vatAmount: "1050.00",
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
      return { summaryRecordId: doc.summaryRecordId, customer }
    })

    await withOrganization(orgA, userId, async (db) => {
      // the customer OWES us — a RECEIVABLE on 311 for the gross (increase = DEBIT).
      const obligations = await openItemsForDoc(db, res.summaryRecordId)
      expect(obligations).toHaveLength(1)
      const oi = obligations[0]!
      expect(oi.direction).toBe("RECEIVABLE")
      expect(oi.account_number).toBe("311")
      expect(oi.counterparty_id).toBe(res.customer)
      expect(oi.original_amount).toBe("6050.0000") // 5000 + 1050 VAT
      expect(await reconcileReadModel(db, s.periodId)).toEqual([])
    })
  })

  it("opens the PAYABLE for the NET (not gross) on a reverse-charge purchase (§16 EU acquisition)", async () => {
    const s = await seedDoubleEntryOrg(orgB, workspaceId, userId, {
      periodStart: "2034-01-01",
      periodEnd: "2034-12-31",
    })
    const res = await withOrganization(orgB, userId, async (db) => {
      const supplier = await createCounterparty(db, s.ctx, {
        name: "EU Lieferant GmbH",
        countryCode: "DE",
      })
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Pořízení zboží z EU",
        occurredAt: "2034-03-10",
        counterpartyId: supplier,
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2034-03-10",
        taxPointDate: "2034-03-10",
        receivedDate: "2034-03-10",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                // §16 intra-EU acquisition: supplier invoices WITHOUT CZ VAT; the
                // 21 % is self-assessed 343↔343, so the 321 payable is NET only.
                baseAmount: "10000.00",
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
      await bookDocument(db, s.ctx, {
        summaryRecordId: doc.summaryRecordId,
        responsibleUserId: userId,
      })
      return { summaryRecordId: doc.summaryRecordId, supplier }
    })

    await withOrganization(orgB, userId, async (db) => {
      const obligations = await openItemsForDoc(db, res.summaryRecordId)
      expect(obligations).toHaveLength(1)
      const oi = obligations[0]!
      expect(oi.direction).toBe("PAYABLE")
      expect(oi.account_number).toBe("321")
      expect(oi.counterparty_id).toBe(res.supplier)
      // NET, not gross: the supplier is owed 10000; the self-assessed VAT is not owed.
      expect(oi.original_amount).toBe("10000.0000")
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
      // a dobropis REDUCES a payable — it opens NO new obligation (the 321 leg is a
      // debit/decrease; original_amount must be > 0). Párování is the settlement path.
      expect(await openItemsForDoc(db, summaryRecordId)).toHaveLength(0)
    })
  })

  it("is idempotent — refuses to double-book an already-booked document (no duplicate obligation)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2029-01-01",
      periodEnd: "2029-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const supplier = await createCounterparty(db, s.ctx, {
        name: "Nákup a.s.",
      })
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Nákup",
        occurredAt: "2029-02-01",
        counterpartyId: supplier,
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
      // the refused re-book opened NO second obligation — exactly one payable stands.
      expect(await openItemsForDoc(db, doc.summaryRecordId)).toHaveLength(1)
    })
  })

  it("fails closed (rolls back the whole approve) when an invoice event has no counterparty", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2031-01-01",
      periodEnd: "2031-12-31",
    })
    // The throw propagates out of the tx → the capture + posting roll back too, so
    // the row stays HELD (never a booked posting with no obligation). Mirrors the
    // real approve path (resolveHeldWrite's withOrganization is not caught).
    await expect(
      withOrganization(orgA, userId, async (db) => {
        // no counterpartyId on the event → the 321 payable has no partner to open.
        const ev = await createEvent(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.eventSeriesId,
          description: "Faktura bez protistrany",
          occurredAt: "2031-02-01",
          responsibleUserId: userId,
        })
        const doc = await captureDocument(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.documentSeriesId,
          type: "RECEIVED_INVOICE",
          issuedAt: "2031-02-01",
          receivedDate: "2031-02-01",
          lines: [
            {
              eventId: ev.eventId,
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
          ],
        })
        await bookDocument(db, s.ctx, {
          summaryRecordId: doc.summaryRecordId,
          responsibleUserId: userId,
        })
      }),
    ).rejects.toThrow(/no counterparty/)
  })

  it("fails closed on null supply_kind, ASSET, ADVANCE, and a non-zero §37 rounding", async () => {
    const s = await seedDoubleEntryOrg(orgB, workspaceId, userId, {
      periodStart: "2030-01-01",
      periodEnd: "2030-12-31",
    })
    await withOrganization(orgB, userId, async (db) => {
      const mkDoc = async (
        supplyKind: "GOODS" | "ASSET" | "ADVANCE" | null,
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

      const advance = await mkDoc("ADVANCE", "0")
      await expect(
        bookDocument(db, s.ctx, {
          summaryRecordId: advance,
          responsibleUserId: userId,
        }),
      ).rejects.toThrow(/ADVANCE/)

      const rounded = await mkDoc("GOODS", "0.40")
      await expect(
        bookDocument(db, s.ctx, {
          summaryRecordId: rounded,
          responsibleUserId: userId,
        }),
      ).rejects.toThrow(/rounding/)
    })
  })

  it("books a NON-STANDARD credit note (PDP) as a signed storno on the normal scenario", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2031-01-01",
      periodEnd: "2031-12-31",
    })
    const summaryRecordId = await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Dobropis k PDP službě",
        occurredAt: "2031-04-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2031-04-01",
        receivedDate: "2031-04-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                // reverse-charge dobropis captured NEGATIVE — no CREDIT-NOTE-STD
                // scenario (mode != STANDARD), so it books the normal P-PDP with
                // signed (negative) amounts = storno on the original sides.
                baseAmount: "-1000.00",
                vatRate: "21",
                vatMode: "REVERSE_CHARGE",
                vatJurisdiction: "REVERSE_CHARGE",
                supplyKind: "SERVICES",
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
      expect(booked.postings[0]!.lineIds).toHaveLength(4) // 518 / 321 / 343↔343
      return doc.summaryRecordId
    })
    await withOrganization(orgA, userId, async (db) => {
      // signed storno: 518 debit turnover is NEGATIVE; 343 self-assessed nets to 0
      const b518 = await balance(db, s.periodId, s.accounts["518"]!)
      const b343 = await balance(db, s.periodId, s.accounts["343"]!)
      expect(b518!.td).toBe("-1000.0000")
      expect(b343!.td).toBe("-210.0000")
      expect(b343!.tc).toBe("-210.0000")
      expect(await nullPartialLines(db, summaryRecordId)).toBe(0)
      expect(await reconcileReadModel(db, s.periodId)).toEqual([])
    })
  })

  it("fails closed when the derived vat_mode disagrees with the stored one (inconsistent capture)", async () => {
    const s = await seedDoubleEntryOrg(orgB, workspaceId, userId, {
      periodStart: "2032-01-01",
      periodEnd: "2032-12-31",
    })
    await withOrganization(orgB, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "nekonzistentní zachycení",
        occurredAt: "2032-02-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2032-02-01",
        receivedDate: "2032-02-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                // stored REVERSE_CHARGE but jurisdiction DOMESTIC → classifyEvent
                // derives STANDARD → the mode-consistency guard must throw.
                baseAmount: "1000.00",
                vatRate: "21",
                vatMode: "REVERSE_CHARGE",
                vatJurisdiction: "DOMESTIC",
                supplyKind: "SERVICES",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await expect(
        bookDocument(db, s.ctx, {
          summaryRecordId: doc.summaryRecordId,
          responsibleUserId: userId,
        }),
      ).rejects.toThrow(/vat_mode/)
    })
  })
})

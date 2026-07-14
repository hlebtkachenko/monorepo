/**
 * captureAndBookIfInvoice — the shared "capture-approve of a doklad" unit both
 * gated-write approve paths (the API held-write resolve + the web approvals
 * action) call. An approved invoice must land ONE fully-wired accounting fact —
 * capture + a posting per event + its saldokonto obligation — while a non-invoice
 * voucher captures only. PG18 testcontainer, app_user under RLS.
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
  captureAndBookIfInvoice,
  createCounterparty,
  createEvent,
} from "../src/index"

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

async function postingCount(
  db: OrganizationBoundDb,
  summaryRecordId: string,
): Promise<number> {
  const r = await executeRows<{ n: number }>(
    db,
    sql`SELECT count(*)::int AS n FROM posting WHERE summary_record_id = ${summaryRecordId}::uuid`,
  )
  return r[0]!.n
}

async function obligationCount(
  db: OrganizationBoundDb,
  summaryRecordId: string,
): Promise<number> {
  const r = await executeRows<{ n: number }>(
    db,
    sql`SELECT count(*)::int AS n
          FROM open_item oi JOIN posting p ON p.id = oi.origin_posting_id
         WHERE p.summary_record_id = ${summaryRecordId}::uuid`,
  )
  return r[0]!.n
}

describe("captureAndBookIfInvoice", () => {
  it("books an invoice type: capture + a posting per event + the saldokonto obligation", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2040-01-01",
      periodEnd: "2040-12-31",
    })
    const { summaryRecordId, postingIds } = await withOrganization(
      orgA,
      userId,
      async (db) => {
        const supplier = await createCounterparty(db, s.ctx, {
          name: "Dodavatel s.r.o.",
          ico: "10000040",
        })
        const ev = await createEvent(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.eventSeriesId,
          description: "Nákup zboží",
          occurredAt: "2040-03-10",
          counterpartyId: supplier,
          responsibleUserId: userId,
        })
        const res = await captureAndBookIfInvoice(
          db,
          s.ctx,
          {
            periodId: s.periodId,
            seriesId: s.documentSeriesId,
            type: "RECEIVED_INVOICE",
            issuedAt: "2040-03-10",
            taxPointDate: "2040-03-10",
            receivedDate: "2040-03-10",
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
          },
          userId,
        )
        return {
          summaryRecordId: res.doc.summaryRecordId,
          postingIds: res.postingIds,
        }
      },
    )

    // one posting per event, surfaced back to the caller
    expect(postingIds).toHaveLength(1)
    await withOrganization(orgA, userId, async (db) => {
      expect(await postingCount(db, summaryRecordId)).toBe(1)
      // the payable (321) obligation opened against the invoice's posting
      expect(await obligationCount(db, summaryRecordId)).toBe(1)
    })
  })

  it("captures a non-invoice voucher (INTERNAL) WITHOUT booking — no posting, no obligation, no postingIds", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2041-01-01",
      periodEnd: "2041-12-31",
    })
    const { summaryRecordId, postingIds } = await withOrganization(
      orgA,
      userId,
      async (db) => {
        const res = await captureAndBookIfInvoice(
          db,
          s.ctx,
          {
            periodId: s.periodId,
            seriesId: s.documentSeriesId,
            type: "INTERNAL",
            issuedAt: "2041-01-31",
            lines: [],
          },
          userId,
        )
        return {
          summaryRecordId: res.doc.summaryRecordId,
          postingIds: res.postingIds,
        }
      },
    )

    expect(postingIds).toBeUndefined()
    await withOrganization(orgA, userId, async (db) => {
      expect(await postingCount(db, summaryRecordId)).toBe(0)
      expect(await obligationCount(db, summaryRecordId)).toBe(0)
    })
  })
})

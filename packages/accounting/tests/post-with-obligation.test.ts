/**
 * postWithObligation — a double-entry posting can now OPEN its saldokonto obligation
 * (pohledávka/závazek) directly, not only via the invoice booker (PR #715). This is the
 * seam that lets a contract obligation or an internal doklad populate saldokonto through
 * the `createAccountingPosting` gate. PG18 testcontainer, app_user under RLS.
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
  captureDocument,
  createCounterparty,
  createEvent,
  postWithObligation,
} from "../src/index"
import type { OrgCtx } from "../src/index"

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

async function openItemCount(
  db: OrganizationBoundDb,
  postingId: string,
): Promise<number> {
  const r = await executeRows<{ n: number }>(
    db,
    sql`SELECT count(*)::int AS n FROM open_item WHERE origin_posting_id = ${postingId}::uuid`,
  )
  return r[0]!.n
}

/** Seed an org, a counterparty (unless null), an INTERNAL voucher, and its event. */
async function scaffold(
  db: OrganizationBoundDb,
  ctx: OrgCtx,
  s: Awaited<ReturnType<typeof seedDoubleEntryOrg>>,
  date: string,
  withCounterparty: boolean,
) {
  const counterpartyId = withCounterparty
    ? await createCounterparty(db, ctx, {
        name: "Protistrana s.r.o.",
        ico: "10000073",
      })
    : undefined
  const ev = await createEvent(db, ctx, {
    periodId: s.periodId,
    seriesId: s.eventSeriesId,
    description: "Interní doklad — závazek",
    occurredAt: date,
    counterpartyId,
    responsibleUserId: userId,
  })
  const doc = await captureDocument(db, ctx, {
    periodId: s.periodId,
    seriesId: s.documentSeriesId,
    type: "INTERNAL",
    issuedAt: date,
    lines: [],
  })
  return { eventId: ev.eventId, summaryRecordId: doc.summaryRecordId }
}

describe("postWithObligation", () => {
  it("opens the saldokonto obligation a double-entry saldo leg represents (518 MD / 321 D → 321 payable)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2043-01-01",
      periodEnd: "2043-12-31",
    })
    const result = await withOrganization(orgA, userId, async (db) => {
      const { eventId, summaryRecordId } = await scaffold(
        db,
        s.ctx,
        s,
        "2043-02-10",
        true,
      )
      return postWithObligation(db, s.ctx, {
        kind: "double",
        entry: {
          periodId: s.periodId,
          summaryRecordId,
          accountingEventId: eventId,
          postingDate: "2043-02-10",
          responsibleUserId: userId,
          lines: [
            { accountId: s.accounts["518"]!, side: "DEBIT", amount: "1000.00" },
            {
              accountId: s.accounts["321"]!,
              side: "CREDIT",
              amount: "1000.00",
            },
          ],
        },
        obligation: { saldoAccountNumber: "321", direction: "PAYABLE" },
      })
    })

    expect(result.openItemId).not.toBeNull()
    await withOrganization(orgA, userId, async (db) => {
      expect(await openItemCount(db, result.postingId)).toBe(1)
      const r = await executeRows<{ amount: string; direction: string }>(
        db,
        sql`SELECT original_amount::text AS amount, direction FROM open_item WHERE id = ${result.openItemId}::uuid`,
      )
      expect(r[0]!.amount).toBe("1000.0000")
      expect(r[0]!.direction).toBe("PAYABLE")
    })
  })

  it("opens NOTHING without a directive", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2044-01-01",
      periodEnd: "2044-12-31",
    })
    const result = await withOrganization(orgA, userId, async (db) => {
      const { eventId, summaryRecordId } = await scaffold(
        db,
        s.ctx,
        s,
        "2044-02-10",
        true,
      )
      return postWithObligation(db, s.ctx, {
        kind: "double",
        entry: {
          periodId: s.periodId,
          summaryRecordId,
          accountingEventId: eventId,
          postingDate: "2044-02-10",
          responsibleUserId: userId,
          lines: [
            { accountId: s.accounts["518"]!, side: "DEBIT", amount: "500.00" },
            { accountId: s.accounts["321"]!, side: "CREDIT", amount: "500.00" },
          ],
        },
      })
    })
    expect(result.openItemId).toBeNull()
    await withOrganization(orgA, userId, async (db) => {
      expect(await openItemCount(db, result.postingId)).toBe(0)
    })
  })

  it("opens nothing when the saldo leg has a net movement ≤ 0 (account not on the posting)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2045-01-01",
      periodEnd: "2045-12-31",
    })
    const result = await withOrganization(orgA, userId, async (db) => {
      const { eventId, summaryRecordId } = await scaffold(
        db,
        s.ctx,
        s,
        "2045-02-10",
        true,
      )
      return postWithObligation(db, s.ctx, {
        kind: "double",
        entry: {
          periodId: s.periodId,
          summaryRecordId,
          accountingEventId: eventId,
          postingDate: "2045-02-10",
          responsibleUserId: userId,
          lines: [
            { accountId: s.accounts["518"]!, side: "DEBIT", amount: "700.00" },
            { accountId: s.accounts["321"]!, side: "CREDIT", amount: "700.00" },
          ],
        },
        // 311 is in the chart but carries no movement on this posting → net 0 → opens nothing.
        obligation: { saldoAccountNumber: "311", direction: "RECEIVABLE" },
      })
    })
    expect(result.openItemId).toBeNull()
  })

  it("fails closed on a null-counterparty event (the obligation needs a partner)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2046-01-01",
      periodEnd: "2046-12-31",
    })
    await expect(
      withOrganization(orgA, userId, async (db) => {
        const { eventId, summaryRecordId } = await scaffold(
          db,
          s.ctx,
          s,
          "2046-02-10",
          false,
        )
        return postWithObligation(db, s.ctx, {
          kind: "double",
          entry: {
            periodId: s.periodId,
            summaryRecordId,
            accountingEventId: eventId,
            postingDate: "2046-02-10",
            responsibleUserId: userId,
            lines: [
              {
                accountId: s.accounts["518"]!,
                side: "DEBIT",
                amount: "900.00",
              },
              {
                accountId: s.accounts["321"]!,
                side: "CREDIT",
                amount: "900.00",
              },
            ],
          },
          obligation: { saldoAccountNumber: "321", direction: "PAYABLE" },
        })
      }),
    ).rejects.toThrow(/counterparty/)
  })
})

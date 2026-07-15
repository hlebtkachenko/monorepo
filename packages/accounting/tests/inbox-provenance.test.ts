/**
 * inbox_id provenance stamping (Tier 4) — when OrgCtx.inboxId is set (the approve
 * replay of a gated write), EVERY row the domain INSERTs carries that inbox_id
 * ("Created by Agent"); when it is absent (a human-driven write) every row stays
 * NULL. This test enumerates the landed insert sites end-to-end against a real
 * PG18 testcontainer (app_user under RLS), so a threading miss on any one insert
 * fails here rather than silently under-reporting the filter. PG18 testcontainer.
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
  mintInboxItem,
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

async function inboxIdOf(
  db: OrganizationBoundDb,
  table: string,
  where: string,
): Promise<(string | null)[]> {
  const r = await executeRows<{ inbox_id: string | null }>(
    db,
    sql.raw(`SELECT inbox_id::text AS inbox_id FROM ${table} WHERE ${where}`),
  )
  return r.map((x) => x.inbox_id)
}

/** Run one full derive-shaped write (event + captured line/partial + posting +
 * saldokonto obligation) under the given ctx, returning the landed ids. */
async function landWrite(
  db: OrganizationBoundDb,
  ctx: OrgCtx,
  s: Awaited<ReturnType<typeof seedDoubleEntryOrg>>,
  date: string,
) {
  const counterpartyId = await createCounterparty(db, ctx, {
    name: "Protistrana s.r.o.",
    ico: "10000073",
  })
  const ev = await createEvent(db, ctx, {
    periodId: s.periodId,
    seriesId: s.eventSeriesId,
    description: "Faktura přijatá — nájem",
    occurredAt: date,
    counterpartyId,
    responsibleUserId: userId,
  })
  const doc = await captureDocument(db, ctx, {
    periodId: s.periodId,
    seriesId: s.documentSeriesId,
    type: "RECEIVED_INVOICE",
    issuedAt: date,
    lines: [
      {
        eventId: ev.eventId,
        partials: [
          { baseAmount: "1000.00", vatMode: "STANDARD", currencyCode: "CZK" },
        ],
      },
    ],
  })
  const posting = await postWithObligation(db, ctx, {
    kind: "double",
    entry: {
      periodId: s.periodId,
      summaryRecordId: doc.summaryRecordId,
      accountingEventId: ev.eventId,
      postingDate: date,
      responsibleUserId: userId,
      lines: [
        { accountId: s.accounts["518"]!, side: "DEBIT", amount: "1000.00" },
        { accountId: s.accounts["321"]!, side: "CREDIT", amount: "1000.00" },
      ],
    },
    obligation: { saldoAccountNumber: "321", direction: "PAYABLE" },
  })
  return {
    eventId: ev.eventId,
    summaryRecordId: doc.summaryRecordId,
    postingId: posting.postingId,
    openItemId: posting.openItemId,
  }
}

describe("inbox_id provenance stamping", () => {
  it("stamps inbox_id on every landed row when the ctx carries one", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2051-01-01",
      periodEnd: "2051-12-31",
    })
    const landed = await withOrganization(orgA, userId, async (db) => {
      const inboxId = await mintInboxItem(db, s.ctx, {
        toolCallLogId: "0196f1de-0000-7000-8000-0000000fff01",
        kind: "captureAccountingDocument",
        createdBy: "ai_on_behalf",
        source: "agent",
        reasoning: "Booked from an OCR'd invoice",
      })
      const l = await landWrite(db, { ...s.ctx, inboxId }, s, "2051-02-10")
      return { inboxId, ...l }
    })

    await withOrganization(orgA, userId, async (db) => {
      expect(
        await inboxIdOf(db, "accounting_event", `id = '${landed.eventId}'`),
      ).toEqual([landed.inboxId])
      expect(
        await inboxIdOf(
          db,
          "summary_record",
          `id = '${landed.summaryRecordId}'`,
        ),
      ).toEqual([landed.inboxId])
      expect(
        await inboxIdOf(
          db,
          "individual_record",
          `summary_record_id = '${landed.summaryRecordId}'`,
        ),
      ).toEqual([landed.inboxId])
      expect(
        await inboxIdOf(
          db,
          "partial_record",
          `individual_record_id IN (SELECT id FROM individual_record WHERE summary_record_id = '${landed.summaryRecordId}')`,
        ),
      ).toEqual([landed.inboxId])
      expect(
        await inboxIdOf(db, "posting", `id = '${landed.postingId}'`),
      ).toEqual([landed.inboxId])
      const lineStamps = await inboxIdOf(
        db,
        "posting_double_entry_line",
        `posting_id = '${landed.postingId}'`,
      )
      expect(lineStamps).toEqual([landed.inboxId, landed.inboxId])
      expect(
        await inboxIdOf(db, "open_item", `id = '${landed.openItemId}'`),
      ).toEqual([landed.inboxId])
    })
  })

  it("leaves inbox_id NULL on a human-driven write (no ctx.inboxId)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2052-01-01",
      periodEnd: "2052-12-31",
    })
    const landed = await withOrganization(orgA, userId, (db) =>
      landWrite(db, s.ctx, s, "2052-02-10"),
    )
    await withOrganization(orgA, userId, async (db) => {
      expect(
        await inboxIdOf(db, "accounting_event", `id = '${landed.eventId}'`),
      ).toEqual([null])
      expect(
        await inboxIdOf(
          db,
          "summary_record",
          `id = '${landed.summaryRecordId}'`,
        ),
      ).toEqual([null])
      expect(
        await inboxIdOf(db, "posting", `id = '${landed.postingId}'`),
      ).toEqual([null])
      expect(
        await inboxIdOf(db, "open_item", `id = '${landed.openItemId}'`),
      ).toEqual([null])
    })
  })
})

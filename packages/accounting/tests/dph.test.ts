/**
 * DPH (VAT return) output: přiznání rows + kontrolní hlášení section totals,
 * built straight from captured partial_record VAT facts (§13/§14/§51/§92a/§92e
 * ZDPH). Mirrors capabilities.test.ts's seed + document-capture pattern.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import {
  adminClient,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
} from "./fixtures.js"
import {
  buildDph,
  captureDocument,
  createEvent,
  postFromPredkontace,
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

describe("DPH (VAT return + kontrolní hlášení section totals)", () => {
  it("aggregates 21% sale, 12% sale, PDP purchase, and exempt sale into přiznání rows", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2044-01-01",
      periodEnd: "2044-12-31",
    })

    await withOrganization(orgA, userId, async (db) => {
      // FV — domestic goods, 21%: základ 1000, daň 210
      const ev1 = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "FV 21%",
        occurredAt: "2044-03-01",
        responsibleUserId: userId,
      })
      const doc1 = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2044-03-01",
        lines: [
          {
            eventId: ev1.eventId,
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
        partialRecordId: doc1.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-GOODS-21",
        summaryRecordId: doc1.summaryRecordId,
        accountingEventId: ev1.eventId,
        postingDate: "2044-03-01",
        responsibleUserId: userId,
      })

      // FV — domestic goods, 12%: základ 2000, daň 240
      const ev2 = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "FV 12%",
        occurredAt: "2044-03-05",
        responsibleUserId: userId,
      })
      const doc2 = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2044-03-05",
        lines: [
          {
            eventId: ev2.eventId,
            partials: [
              {
                baseAmount: "2000.00",
                vatRate: "12",
                vatMode: "STANDARD",
                vatAmount: "240.00",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: doc2.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-GOODS-12",
        summaryRecordId: doc2.summaryRecordId,
        accountingEventId: ev2.eventId,
        postingDate: "2044-03-05",
        responsibleUserId: userId,
      })

      // FP — PDP (reverse charge) purchase: základ 500, self-assessed daň 21% = 105
      const ev3 = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "FP PDP",
        occurredAt: "2044-03-10",
        responsibleUserId: userId,
      })
      const doc3 = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2044-03-10",
        lines: [
          {
            eventId: ev3.eventId,
            partials: [
              {
                baseAmount: "500.00",
                vatRate: "21",
                vatMode: "REVERSE_CHARGE",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: doc3.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "P-PDP",
        summaryRecordId: doc3.summaryRecordId,
        accountingEventId: ev3.eventId,
        postingDate: "2044-03-10",
        responsibleUserId: userId,
      })

      // FV — exempt supply (§51): základ 300, daň 0
      const ev4 = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "FV exempt",
        occurredAt: "2044-03-15",
        responsibleUserId: userId,
      })
      const doc4 = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2044-03-15",
        lines: [
          {
            eventId: ev4.eventId,
            partials: [
              {
                baseAmount: "300.00",
                vatMode: "EXEMPT",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: doc4.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-EXEMPT-NO-CREDIT",
        summaryRecordId: doc4.summaryRecordId,
        accountingEventId: ev4.eventId,
        postingDate: "2044-03-15",
        responsibleUserId: userId,
      })

      const dph = await buildDph(db, s.periodId)

      expect(dph.type).toBe("VAT_RETURN")

      // ř.1 — 21% sale
      expect(dph.rows.r1_base).toBe("1000.0000")
      expect(dph.rows.r1_dan).toBe("210.0000")

      // ř.2 — 12% sale
      expect(dph.rows.r2_base).toBe("2000.0000")
      expect(dph.rows.r2_dan).toBe("240.0000")

      // ř.10 — PDP odběratel, samovyměření 21%: daň = round(500 * 21/100, 2)
      expect(dph.rows.r10_base).toBe("500.0000")
      expect(dph.rows.r10_dan).toBe("105.0000")
      expect(dph.rows.r11_base).toBe("0.0000")
      expect(dph.rows.r11_dan).toBe("0.0000")

      // ř.25 — no PDP-dodavatel supply captured in this test
      expect(dph.rows.r25_base).toBe("0.0000")

      // ř.40/41 — no domestic STANDARD purchase captured
      expect(dph.rows.r40_base).toBe("0.0000")
      expect(dph.rows.r40_dan).toBe("0.0000")
      expect(dph.rows.r41_base).toBe("0.0000")
      expect(dph.rows.r41_dan).toBe("0.0000")

      // ř.50 — exempt sale
      expect(dph.rows.r50_base).toBe("300.0000")

      // daň na výstupu = r1_dan + r2_dan + r10_dan (self-assessed output side)
      expect(dph.rows.dan_na_vystupu).toBe("555.0000") // 210 + 240 + 105
      // ř.43 — the PDP self-assessed INPUT is deductible (§73/4), so it lands in odpočet
      expect(dph.rows.r43_dan).toBe("105.0000")
      // odpočet = STANDARD input (0) + deductible samovyměření (105)
      expect(dph.rows.odpocet).toBe("105.0000")
      // vlastní daň = 555 − 105 = 450 → the two STANDARD sales' output; the PDP nets out
      expect(dph.rows.vlastni_dan).toBe("450.0000")

      // kontrolní hlášení section totals
      expect(dph.kh.a4_base).toBe("3000.0000") // 1000 + 2000 (both STANDARD ISSUED)
      expect(dph.kh.a4_dan).toBe("450.0000") // 210 + 240
      expect(dph.kh.b1_base).toBe("500.0000") // PDP odběratel
      expect(dph.kh.b1_dan).toBe("105.0000")
      expect(dph.kh.a1_base).toBe("0.0000")
      expect(dph.kh.b2_base).toBe("0.0000")
    })
  })
})

/**
 * DPH ř.5/6 — EU services received (§9/1), split out of ř.3/4 (EU goods §16).
 *
 * A RECEIVED REVERSE_CHARGE supply with vat_jurisdiction = 'EU' is a self-assessed
 * intra-Community acquisition. supply_kind = 'SERVICES' (migration 0043) routes it
 * to ř.5/6 (přijetí služby dle §9/1); goods or a legacy NULL stay on ř.3/4 (§16).
 * Both are deductible on ř.43/44, so vlastní daň is unaffected by the split.
 *
 * buildDph reads partial_record directly, so no posting step is needed.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import {
  adminClient,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
} from "./fixtures.js"
import { buildDph, captureDocument, createEvent } from "../src/index"
import type { OrgCtx, SupplyKind } from "../src/index"

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

/** Capture one RECEIVED EU reverse-charge supply (self-assessed acquisition). */
async function captureEuReceipt(
  db: Parameters<Parameters<typeof withOrganization>[2]>[0],
  ctx: OrgCtx,
  seed: { periodId: string; eventSeriesId: string; documentSeriesId: string },
  args: {
    supplyKind: SupplyKind | null
    baseAmount: string
    vatRate: string
    day: string
  },
): Promise<void> {
  const ev = await createEvent(db, ctx, {
    periodId: seed.periodId,
    seriesId: seed.eventSeriesId,
    description: "EU receipt",
    occurredAt: args.day,
    responsibleUserId: userId,
  })
  await captureDocument(db, ctx, {
    periodId: seed.periodId,
    seriesId: seed.documentSeriesId,
    type: "RECEIVED_INVOICE",
    issuedAt: args.day,
    taxPointDate: args.day,
    receivedDate: args.day,
    lines: [
      {
        eventId: ev.eventId,
        partials: [
          {
            baseAmount: args.baseAmount,
            vatRate: args.vatRate,
            vatMode: "REVERSE_CHARGE",
            vatJurisdiction: "EU",
            supplyKind: args.supplyKind,
            currencyCode: "CZK",
          },
        ],
      },
    ],
  })
}

describe("DPH ř.5/6 — EU services received split (#449)", () => {
  it("routes SERVICES to ř.5/6, goods + NULL to ř.3/4, both deductible and net-neutral", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2081-01-01",
      periodEnd: "2081-12-31",
    })

    await withOrganization(orgA, userId, async (db) => {
      // EU services received — §9/1, ř.5 (21%) + ř.6 (12%)
      await captureEuReceipt(db, s.ctx, s, {
        supplyKind: "SERVICES",
        baseAmount: "1000.00",
        vatRate: "21",
        day: "2081-02-01",
      })
      await captureEuReceipt(db, s.ctx, s, {
        supplyKind: "SERVICES",
        baseAmount: "2000.00",
        vatRate: "12",
        day: "2081-03-01",
      })
      // EU goods received — §16, ř.3 (21%)
      await captureEuReceipt(db, s.ctx, s, {
        supplyKind: "GOODS",
        baseAmount: "500.00",
        vatRate: "21",
        day: "2081-04-01",
      })
      // Legacy NULL supply_kind — excluded until classified.
      await captureEuReceipt(db, s.ctx, s, {
        supplyKind: null,
        baseAmount: "300.00",
        vatRate: "21",
        day: "2081-05-01",
      })

      const dph = await buildDph(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })

      // ř.5/6 — EU services received, self-assessed
      expect(dph.rows.r5_base).toBe("1000.0000")
      expect(dph.rows.r5_dan).toBe("210.0000") // round(1000 * 21/100)
      expect(dph.rows.r6_base).toBe("2000.0000")
      expect(dph.rows.r6_dan).toBe("240.0000") // round(2000 * 12/100)

      // ř.3/4 — only the explicitly classified EU goods entry.
      expect(dph.rows.r3_base).toBe("500.0000")
      expect(dph.rows.r3_dan).toBe("105.0000")
      expect(dph.rows.r4_base).toBe("0.0000")
      expect(dph.rows.r4_dan).toBe("0.0000")

      // Not domestic PDP — ř.10/11 stay empty
      expect(dph.rows.r10_base).toBe("0.0000")
      expect(dph.rows.r11_base).toBe("0.0000")

      // ř.43/44 — the self-assessed input is deductible for goods AND services
      // (21% bucket = 500 + 1000 = 1500; 12% bucket = 2000)
      expect(dph.rows.r43_base).toBe("1500.0000")
      expect(dph.rows.r43_dan).toBe("315.0000")
      expect(dph.rows.r44_base).toBe("2000.0000")
      expect(dph.rows.r44_dan).toBe("240.0000")

      // Fully deductible self-assessment → vlastní daň nets to zero.
      expect(dph.rows.dan_na_vystupu).toBe("555.0000")
      expect(dph.rows.odpocet).toBe("555.0000")
      expect(dph.rows.vlastni_dan).toBe("0.0000")
      expect(dph.completeness).toMatchObject({
        status: "NEEDS_INPUT",
        missingClassificationDocuments: 1,
      })
    })
  })
})

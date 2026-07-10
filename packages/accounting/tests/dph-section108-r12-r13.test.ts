/**
 * DPH ř.12/13 — §108 residual self-assessment on receipt (#540), + the RENT
 * place-of-supply fix.
 *
 * A RECEIVED REVERSE_CHARGE supply is routed by TWO questions, not by supply
 * kind alone: (1) is the place of supply CZ? (2) is the supplier established in
 * CZ? A supply with place of supply CZ from a supplier NOT established in
 * tuzemsko is a §108 residual self-assessment on receipt → DPH ř.12/13. It is
 * carried by partial_record.vat_jurisdiction = 'SECTION_108' (migration 0056),
 * which splits it out of the domestic §92 line ř.10/11. It self-assesses on
 * 343↔343 and is deductible on ř.43/44, so vlastní daň nets to zero.
 *
 * The RENT fix (also #540): renting general movable property from an EU lessor
 * is a §9(1) service (ownership never transfers → not a §16 goods acquisition),
 * so it belongs on ř.5/6, not ř.3/4.
 *
 * buildDph / buildKontrolniHlaseni read partial_record directly, so no posting
 * step is needed.
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
  buildKontrolniHlaseni,
  captureDocument,
  createCounterparty,
  createEvent,
} from "../src/index"
import type { OrgCtx, SupplyKind, VatJurisdiction } from "../src/index"

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

/** Capture one RECEIVED reverse-charge supply (self-assessed on receipt). */
async function captureReceipt(
  db: Parameters<Parameters<typeof withOrganization>[2]>[0],
  ctx: OrgCtx,
  seed: { periodId: string; eventSeriesId: string; documentSeriesId: string },
  args: {
    jurisdiction: VatJurisdiction
    supplyKind: SupplyKind | null
    baseAmount: string
    vatRate: string
    day: string
    counterpartyId?: string
  },
): Promise<void> {
  const ev = await createEvent(db, ctx, {
    periodId: seed.periodId,
    seriesId: seed.eventSeriesId,
    counterpartyId: args.counterpartyId,
    description: "Received supply (reverse charge)",
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
            vatJurisdiction: args.jurisdiction,
            supplyKind: args.supplyKind,
            currencyCode: "CZK",
          },
        ],
      },
    ],
  })
}

describe("DPH ř.12/13 — §108 residual + RENT place-of-supply fix (#540)", () => {
  it("routes §108 residual to ř.12/13 and RENT-from-EU to ř.5/6, both net-neutral, ř.10/11 empty", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2085-01-01",
      periodEnd: "2085-12-31",
    })

    await withOrganization(orgA, userId, async (db) => {
      // §108 residual — place of supply CZ, supplier NOT established. 21% → ř.12.
      await captureReceipt(db, s.ctx, s, {
        jurisdiction: "SECTION_108",
        supplyKind: "UTILITY",
        baseAmount: "1000.00",
        vatRate: "21",
        day: "2085-02-01",
      })
      // §108 residual — 12% → ř.13.
      await captureReceipt(db, s.ctx, s, {
        jurisdiction: "SECTION_108",
        supplyKind: "SERVICES",
        baseAmount: "2000.00",
        vatRate: "12",
        day: "2085-03-01",
      })
      // RENT of general movable property from an EU lessor — §9(1) service → ř.5.
      await captureReceipt(db, s.ctx, s, {
        jurisdiction: "EU",
        supplyKind: "RENT",
        baseAmount: "3000.00",
        vatRate: "21",
        day: "2085-04-01",
      })

      const dph = await buildDph(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })

      // ř.12/13 — §108 residual, self-assessed
      expect(dph.rows.r12_base).toBe("1000.0000")
      expect(dph.rows.r12_dan).toBe("210.0000") // round(1000 * 21/100)
      expect(dph.rows.r13_base).toBe("2000.0000")
      expect(dph.rows.r13_dan).toBe("240.0000") // round(2000 * 12/100)

      // RENT fix — lands on ř.5 (§9/1 service), NOT ř.3/4 (goods)
      expect(dph.rows.r5_base).toBe("3000.0000")
      expect(dph.rows.r5_dan).toBe("630.0000") // round(3000 * 21/100)
      expect(dph.rows.r3_base).toBe("0.0000")
      expect(dph.rows.r3_dan).toBe("0.0000")
      expect(dph.rows.r4_base).toBe("0.0000")

      // §108 residual does NOT collapse onto the domestic §92 line ř.10/11
      expect(dph.rows.r10_base).toBe("0.0000")
      expect(dph.rows.r10_dan).toBe("0.0000")
      expect(dph.rows.r11_base).toBe("0.0000")

      // ř.43/44 — the self-assessed input is deductible for §108 AND RENT
      // 21% bucket = §108 1000 + RENT 3000 = 4000 (daň 210 + 630 = 840)
      // 12% bucket = §108 2000 (daň 240)
      expect(dph.rows.r43_base).toBe("4000.0000")
      expect(dph.rows.r43_dan).toBe("840.0000")
      expect(dph.rows.r44_base).toBe("2000.0000")
      expect(dph.rows.r44_dan).toBe("240.0000")

      // Fully deductible self-assessment → vlastní daň nets to zero.
      expect(dph.rows.dan_na_vystupu).toBe("1080.0000") // 210 + 240 + 630
      expect(dph.rows.odpocet).toBe("1080.0000")
      expect(dph.rows.vlastni_dan).toBe("0.0000")

      // The §108 rows are explicitly classified by jurisdiction, so they are NOT
      // flagged for classification. The RENT+EU row stays flagged for review
      // (the DAP completeness gate is deliberately left unchanged — conservative
      // pending KB ratification of the RENT→§9(1) rule).
      expect(dph.completeness).toMatchObject({
        status: "NEEDS_INPUT",
        missingClassificationDocuments: 1,
      })
    })
  })

  it("reports a §108 residual receipt on kontrolní hlášení A.2 (recipient self-assessment), not B.1 (domestic §92)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2086-01-01",
      periodEnd: "2086-12-31",
    })

    await withOrganization(orgA, userId, async (db) => {
      const supplier = await createCounterparty(db, s.ctx, {
        name: "Non-established Supplier AG",
        taxId: "CHE123456789",
        countryCode: "CH",
      })
      await captureReceipt(db, s.ctx, s, {
        jurisdiction: "SECTION_108",
        supplyKind: "UTILITY",
        baseAmount: "5000.00",
        vatRate: "21",
        day: "2086-05-01",
        counterpartyId: supplier,
      })

      const kh = await buildKontrolniHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })

      // A.2 — recipient self-assesses under §108 (same section as EU acquisitions)
      expect(kh.a2).toHaveLength(1)
      expect(kh.a2[0]).toMatchObject({
        tax_id: "CHE123456789",
        base21: "5000.0000",
        dan21: "1050.0000", // round(5000 * 21/100)
      })
      // NOT a domestic §92 PDP → B.1 stays empty
      expect(kh.b1).toHaveLength(0)
    })
  })

  it("rejects a SECTION_108 marker on an ISSUED invoice (received-only invariant)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2087-01-01",
      periodEnd: "2087-12-31",
    })

    await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Nonsensical issued §108",
        occurredAt: "2087-06-01",
        responsibleUserId: userId,
      })
      await expect(
        captureDocument(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.documentSeriesId,
          type: "ISSUED_INVOICE",
          issuedAt: "2087-06-01",
          taxPointDate: "2087-06-01",
          lines: [
            {
              eventId: ev.eventId,
              partials: [
                {
                  baseAmount: "1000.00",
                  vatRate: "21",
                  vatMode: "REVERSE_CHARGE",
                  vatJurisdiction: "SECTION_108",
                  supplyKind: "UTILITY",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        }),
      ).rejects.toThrow(/SECTION_108/)
    })
  })

  it("rejects a §92 commodityCode on a RECEIVED SECTION_108 partial (KH A.2 metadata leak)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2088-01-01",
      periodEnd: "2088-12-31",
    })

    await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "§108 residual with a stray §92 kód",
        occurredAt: "2088-06-01",
        responsibleUserId: userId,
      })
      await expect(
        captureDocument(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.documentSeriesId,
          type: "RECEIVED_INVOICE",
          issuedAt: "2088-06-01",
          taxPointDate: "2088-06-01",
          receivedDate: "2088-06-01",
          lines: [
            {
              eventId: ev.eventId,
              partials: [
                {
                  baseAmount: "1000.00",
                  vatRate: "21",
                  vatMode: "REVERSE_CHARGE",
                  vatJurisdiction: "SECTION_108",
                  supplyKind: "UTILITY",
                  commodityCode: "5",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        }),
      ).rejects.toThrow(/commodityCode/)
    })
  })
})

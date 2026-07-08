/**
 * VAT filing-period awareness: a přiznání k DPH / kontrolní hlášení / souhrnné
 * hlášení covers a FILING PERIOD (calendar month or quarter), not the whole
 * annual účetní období. buildDph / buildKontrolniHlaseni / buildSouhrnneHlaseni
 * accept an optional third `filingRange` argument that further filters rows to
 * those whose DUZP (accounting_event.occurred_at, okamžik uskutečnění §11/1e)
 * falls within [from, to]. Omitting it (the v1 API call sites today) aggregates
 * the whole accounting period, unchanged — this suite proves both the new
 * narrowing behavior and that the whole-period default is untouched.
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
  buildSouhrnneHlaseni,
  captureDocument,
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

describe("VAT output builders — optional filingRange", () => {
  it("buildDph: omitted range aggregates the whole period; a monthly range narrows to that month's DUZP only", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      // January — STANDARD 21%, base 1000, daň 210
      const evJan = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "FV Jan 21%",
        occurredAt: "2026-01-15",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2026-01-15",
        lines: [
          {
            eventId: evJan.eventId,
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

      // February — STANDARD 21%, base 2000, daň 420
      const evFeb = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "FV Feb 21%",
        occurredAt: "2026-02-15",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2026-02-15",
        lines: [
          {
            eventId: evFeb.eventId,
            partials: [
              {
                baseAmount: "2000.00",
                vatRate: "21",
                vatMode: "STANDARD",
                vatAmount: "420.00",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })

      // No range → whole accounting period, both months included (backward compat)
      const whole = await buildDph(db, s.periodId)
      expect(whole.rows.r1_base).toBe("3000.0000")
      expect(whole.rows.r1_dan).toBe("630.0000")

      // January filing range → January row only, February amount excluded
      const jan = await buildDph(db, s.periodId, {
        from: "2026-01-01",
        to: "2026-01-31",
      })
      expect(jan.rows.r1_base).toBe("1000.0000")
      expect(jan.rows.r1_dan).toBe("210.0000")

      // February filing range → February row only, January amount excluded
      const feb = await buildDph(db, s.periodId, {
        from: "2026-02-01",
        to: "2026-02-28",
      })
      expect(feb.rows.r1_base).toBe("2000.0000")
      expect(feb.rows.r1_dan).toBe("420.0000")
    })
  })

  it("buildKontrolniHlaseni: a monthly filing range narrows A.4 to that month's doklad only", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const cp = await createCounterparty(db, s.ctx, {
        name: "Odběratel s.r.o.",
        taxId: "CZ87654321",
        countryCode: "CZ",
      })

      // January doklad over the §101d 10k threshold: base 20000, daň 4200
      const evJan = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "FV Jan nad limit",
        occurredAt: "2026-01-10",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2026-01-10",
        lines: [
          {
            eventId: evJan.eventId,
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

      // February doklad also over the threshold: base 30000, daň 6300
      const evFeb = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "FV Feb nad limit",
        occurredAt: "2026-02-10",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2026-02-10",
        lines: [
          {
            eventId: evFeb.eventId,
            partials: [
              {
                baseAmount: "30000.00",
                vatRate: "21",
                vatMode: "STANDARD",
                vatAmount: "6300.00",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })

      // No range → both dokladů appear (backward compat)
      const whole = await buildKontrolniHlaseni(db, s.periodId)
      expect(whole.a4).toHaveLength(2)

      // January filing range → the January doklad only
      const jan = await buildKontrolniHlaseni(db, s.periodId, {
        from: "2026-01-01",
        to: "2026-01-31",
      })
      expect(jan.a4).toHaveLength(1)
      expect(jan.a4[0]!.base21).toBe("20000.0000")

      // February filing range → the February doklad only (January excluded)
      const feb = await buildKontrolniHlaseni(db, s.periodId, {
        from: "2026-02-01",
        to: "2026-02-28",
      })
      expect(feb.a4).toHaveLength(1)
      expect(feb.a4[0]!.base21).toBe("30000.0000")
    })
  })

  it("buildKontrolniHlaseni: a monthly filing range narrows B.1 (received domestic §92 PDP, self-assessed) to that month's doklad only", async () => {
    // Exercises reverseChargeRows's filingRangeFilter directly — the section
    // the existing A.4 assertion above never touches (A.4 goes through
    // standardRowsOverThreshold / standardDokladCte instead). B.1 is also the
    // RECEIVED side, so this doubles as the RECEIVED-side range-lock.
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const cp = await createCounterparty(db, s.ctx, {
        name: "Dodavatel PDP s.r.o.",
        taxId: "CZ11223344",
        countryCode: "CZ",
      })

      // January — domestic §92 PDP purchase, self-assessed: base 500, daň 105
      const evJan = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "FP PDP Jan",
        occurredAt: "2026-01-12",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2026-01-12",
        lines: [
          {
            eventId: evJan.eventId,
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

      // February — same PDP flow, different doklad: base 800, daň 168
      const evFeb = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "FP PDP Feb",
        occurredAt: "2026-02-12",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2026-02-12",
        lines: [
          {
            eventId: evFeb.eventId,
            partials: [
              {
                baseAmount: "800.00",
                vatRate: "21",
                vatMode: "REVERSE_CHARGE",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })

      // No range → both PDP dokladů appear (backward compat)
      const whole = await buildKontrolniHlaseni(db, s.periodId)
      expect(whole.b1).toHaveLength(2)

      // January filing range → the January doklad only
      const jan = await buildKontrolniHlaseni(db, s.periodId, {
        from: "2026-01-01",
        to: "2026-01-31",
      })
      expect(jan.b1).toHaveLength(1)
      expect(jan.b1[0]!.base21).toBe("500.0000")
      expect(jan.b1[0]!.dan21).toBe("105.0000")

      // February filing range → the February doklad only (January excluded)
      const feb = await buildKontrolniHlaseni(db, s.periodId, {
        from: "2026-02-01",
        to: "2026-02-28",
      })
      expect(feb.b1).toHaveLength(1)
      expect(feb.b1[0]!.base21).toBe("800.0000")
      expect(feb.b1[0]!.dan21).toBe("168.0000")
    })
  })

  it("buildKontrolniHlaseni: a monthly filing range narrows A.5 (aggregate, under the §101d threshold) to that month's dokladů only", async () => {
    // Exercises standardAggregate's own call site into standardDokladCte —
    // a distinct call from the one A.4 already locks (standardRowsOverThreshold),
    // so a dropped filingRange specific to the aggregate query would not have
    // been caught by the A.4 assertion above.
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      // January doklad UNDER the §101d 10k threshold: base 1000, daň 210
      const evJan = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "FV Jan pod limit",
        occurredAt: "2026-01-18",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2026-01-18",
        lines: [
          {
            eventId: evJan.eventId,
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

      // February doklad also under the threshold, different doklad: base 1500, daň 315
      const evFeb = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "FV Feb pod limit",
        occurredAt: "2026-02-18",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2026-02-18",
        lines: [
          {
            eventId: evFeb.eventId,
            partials: [
              {
                baseAmount: "1500.00",
                vatRate: "21",
                vatMode: "STANDARD",
                vatAmount: "315.00",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })

      // No range → both sub-threshold dokladů fold into one A.5 aggregate (backward compat)
      const whole = await buildKontrolniHlaseni(db, s.periodId)
      expect(whole.a5.count).toBe(2)
      expect(whole.a5.base).toBe("2500.0000")
      expect(whole.a5.dan).toBe("525.0000")

      // January filing range → the January doklad only
      const jan = await buildKontrolniHlaseni(db, s.periodId, {
        from: "2026-01-01",
        to: "2026-01-31",
      })
      expect(jan.a5.count).toBe(1)
      expect(jan.a5.base).toBe("1000.0000")
      expect(jan.a5.dan).toBe("210.0000")

      // February filing range → the February doklad only (January excluded)
      const feb = await buildKontrolniHlaseni(db, s.periodId, {
        from: "2026-02-01",
        to: "2026-02-28",
      })
      expect(feb.a5.count).toBe(1)
      expect(feb.a5.base).toBe("1500.0000")
      expect(feb.a5.dan).toBe("315.0000")
    })
  })

  it("buildSouhrnneHlaseni: a monthly filing range narrows to that month's EU supply only", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const cp = await createCounterparty(db, s.ctx, {
        name: "EU Partner GmbH",
        taxId: "DE811234567",
        countryCode: "DE",
      })

      // January — EU goods supply (§64, kód 0): base 50000
      const evJan = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "EU zboží Jan",
        occurredAt: "2026-01-20",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2026-01-20",
        lines: [
          {
            eventId: evJan.eventId,
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

      // February — same counterparty + kód, EU goods supply: base 70000
      const evFeb = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "EU zboží Feb",
        occurredAt: "2026-02-20",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2026-02-20",
        lines: [
          {
            eventId: evFeb.eventId,
            partials: [
              {
                baseAmount: "70000.00",
                vatMode: "REVERSE_CHARGE",
                vatJurisdiction: "EU",
                supplyKind: "GOODS",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })

      // No range → both months fold into one kód-0 row (same counterparty + kód)
      const whole = await buildSouhrnneHlaseni(db, s.periodId)
      expect(whole.rows).toHaveLength(1)
      expect(whole.rows[0]!.value).toBe("120000.0000")
      expect(whole.rows[0]!.count).toBe(2)

      // January filing range → January supply only
      const jan = await buildSouhrnneHlaseni(db, s.periodId, {
        from: "2026-01-01",
        to: "2026-01-31",
      })
      expect(jan.rows).toHaveLength(1)
      expect(jan.rows[0]!.value).toBe("50000.0000")
      expect(jan.rows[0]!.count).toBe(1)

      // February filing range → February supply only (January excluded)
      const feb = await buildSouhrnneHlaseni(db, s.periodId, {
        from: "2026-02-01",
        to: "2026-02-28",
      })
      expect(feb.rows).toHaveLength(1)
      expect(feb.rows[0]!.value).toBe("70000.0000")
    })
  })
})

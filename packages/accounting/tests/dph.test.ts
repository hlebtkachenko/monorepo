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
  buildKontrolniHlaseni,
  buildSouhrnneHlaseni,
  getVatPeriodActivity,
  captureDocument,
  createCounterparty,
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
        taxPointDate: "2044-03-01",
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
        taxPointDate: "2044-03-05",
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
        taxPointDate: "2044-03-10",
        receivedDate: "2044-03-10",
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
        taxPointDate: "2044-03-15",
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

      const dph = await buildDph(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })

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

      const activity = await getVatPeriodActivity(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(activity).toEqual([
        {
          month: "2044-03",
          hasKhReportableTransactions: true,
          hasShGoodsSupplies: false,
          hasShServiceSupplies: false,
          hasIdentifiedPersonVatLiability: false,
        },
      ])
    })
  })
})

describe("VAT period activity legal dates", () => {
  it("places a received standard invoice in its proven deduction month", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2045-01-01",
      periodEnd: "2045-12-31",
    })

    await withOrganization(orgA, userId, async (db) => {
      const event = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Late-received standard invoice",
        occurredAt: "2045-01-10",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2045-01-10",
        taxPointDate: "2045-01-10",
        receivedDate: "2045-03-05",
        lines: [
          {
            eventId: event.eventId,
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

      const activity = await getVatPeriodActivity(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })

      expect(activity).toEqual([
        {
          month: "2045-03",
          hasKhReportableTransactions: true,
          hasShGoodsSupplies: false,
          hasShServiceSupplies: false,
          hasIdentifiedPersonVatLiability: false,
        },
      ])
    })
  })
})

/**
 * Issued-EU supplies (#541): a §64 goods delivery to a JČS plátce belongs on
 * DAP ř.20, a §9/1 service on ř.21 — both osvobozené s nárokem (base only, no
 * daň) and reported in the souhrnné hlášení, NOT in the kontrolní hlášení. They
 * capture as vat_mode = REVERSE_CHARGE + vat_jurisdiction = 'EU' (the canonical
 * mode from decideVat), so vat_jurisdiction is the discriminator that keeps them
 * off the domestic §92 PDP line ř.25 + KH A.1.
 */
describe("DPH ř.20/21 — issued EU supplies (§64 goods / §9/1 service) (#541)", () => {
  it("routes issued EU goods to ř.20 ONLY — not ř.25, not KH A.1", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2091-01-01",
      periodEnd: "2091-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const cp = await createCounterparty(db, s.ctx, {
        name: "Kunde GmbH",
        taxId: "DE811234567",
        countryCode: "DE",
      })
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "EU dodání zboží §64",
        occurredAt: "2091-04-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2091-04-01",
        taxPointDate: "2091-04-01",
        lines: [
          {
            eventId: ev.eventId,
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
      // Exercise the full capture→POST→report path: S-EU-GOODS-DELIVERY now
      // carries vat_mode REVERSE_CHARGE, so expand.ts no longer throws on the
      // mismatch (the #541 unreachability bug) and books base-only (311/604).
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: doc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-EU-GOODS-DELIVERY",
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2091-04-01",
        responsibleUserId: userId,
      })

      const dph = await buildDph(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      // ř.20 — EU goods, base only (osvobozené s nárokem, daň 0)
      expect(dph.rows.r20_base).toBe("50000.0000")
      // ř.21 — no EU service
      expect(dph.rows.r21_base).toBe("0.0000")
      // NOT domestic §92 PDP dodavatel — ř.25 stays empty
      expect(dph.rows.r25_base).toBe("0.0000")
      // NOT ř.50 §51 exempt-without-deduction (belt-and-braces EU exclusion)
      expect(dph.rows.r50_base).toBe("0.0000")
      // NOT kontrolní hlášení A.1 (EU excluded, #516/#541)
      expect(dph.kh.a1_base).toBe("0.0000")

      const kh = await buildKontrolniHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(kh.a1).toHaveLength(0)
    })
  })

  it("routes issued EU service to ř.21 ONLY — not ř.25, not KH A.1", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2092-01-01",
      periodEnd: "2092-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const cp = await createCounterparty(db, s.ctx, {
        name: "Service Kunde GmbH",
        taxId: "DE822345678",
        countryCode: "DE",
      })
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "EU služba §9/1",
        occurredAt: "2092-04-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2092-04-01",
        taxPointDate: "2092-04-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                baseAmount: "30000.00",
                vatMode: "REVERSE_CHARGE",
                vatJurisdiction: "EU",
                supplyKind: "SERVICES",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      // Full capture→POST→report path (base-only book via S-EU-GOODS-DELIVERY).
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: doc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-EU-GOODS-DELIVERY",
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2092-04-01",
        responsibleUserId: userId,
      })

      const dph = await buildDph(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      // ř.21 — EU service, base only
      expect(dph.rows.r21_base).toBe("30000.0000")
      // ř.20 — no EU goods
      expect(dph.rows.r20_base).toBe("0.0000")
      // NOT ř.25, NOT ř.50, NOT KH A.1
      expect(dph.rows.r25_base).toBe("0.0000")
      expect(dph.rows.r50_base).toBe("0.0000")
      expect(dph.kh.a1_base).toBe("0.0000")

      const kh = await buildKontrolniHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(kh.a1).toHaveLength(0)
    })
  })

  it("keeps domestic §92 PDP issued (construction) on ř.25 + KH A.1 (regression guard)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2093-01-01",
      periodEnd: "2093-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const cp = await createCounterparty(db, s.ctx, {
        name: "Stavební odběratel s.r.o.",
        taxId: "CZ12345678",
        countryCode: "CZ",
      })
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "Stavební práce §92e (PDP dodavatel)",
        occurredAt: "2093-04-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2093-04-01",
        taxPointDate: "2093-04-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                baseAmount: "80000.00",
                vatRate: "21",
                vatMode: "REVERSE_CHARGE",
                vatJurisdiction: "REVERSE_CHARGE",
                commodityCode: "4",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: doc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-PDP",
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2093-04-01",
        responsibleUserId: userId,
      })

      const dph = await buildDph(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      // ř.25 — domestic §92 PDP dodavatel, base only (daň odvádí odběratel)
      expect(dph.rows.r25_base).toBe("80000.0000")
      // NOT EU lines
      expect(dph.rows.r20_base).toBe("0.0000")
      expect(dph.rows.r21_base).toBe("0.0000")
      // KH A.1 section total unchanged (domestic §92 supplier)
      expect(dph.kh.a1_base).toBe("80000.0000")

      // KH A.1 row-level: the §92e domestic PDP supply IS reported (kód 4)
      const kh = await buildKontrolniHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(kh.a1).toHaveLength(1)
      expect(kh.a1[0]!.tax_id).toBe("CZ12345678")
      expect(kh.a1[0]!.kod).toBe("4")
      expect(kh.a1[0]!.base21).toBe("80000.0000")
    })
  })

  it("reconciles: souhrnné hlášení kód-0 + kód-3 base totals == ř.20 + ř.21 (#541)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2094-01-01",
      periodEnd: "2094-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const cp = await createCounterparty(db, s.ctx, {
        name: "EU Partner GmbH",
        taxId: "DE833456789",
        countryCode: "DE",
      })
      // EU goods (§64 → ř.20 / SH kód 0)
      const goodsEv = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "EU zboží",
        occurredAt: "2094-04-01",
        responsibleUserId: userId,
      })
      const goodsDoc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2094-04-01",
        taxPointDate: "2094-04-01",
        lines: [
          {
            eventId: goodsEv.eventId,
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
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: goodsDoc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-EU-GOODS-DELIVERY",
        summaryRecordId: goodsDoc.summaryRecordId,
        accountingEventId: goodsEv.eventId,
        postingDate: "2094-04-01",
        responsibleUserId: userId,
      })
      // EU service (§9/1 → ř.21 / SH kód 3)
      const svcEv = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "EU služba",
        occurredAt: "2094-05-01",
        responsibleUserId: userId,
      })
      const svcDoc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2094-05-01",
        taxPointDate: "2094-05-01",
        lines: [
          {
            eventId: svcEv.eventId,
            partials: [
              {
                baseAmount: "30000.00",
                vatMode: "REVERSE_CHARGE",
                vatJurisdiction: "EU",
                supplyKind: "SERVICES",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: svcDoc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-EU-GOODS-DELIVERY",
        summaryRecordId: svcDoc.summaryRecordId,
        accountingEventId: svcEv.eventId,
        postingDate: "2094-05-01",
        responsibleUserId: userId,
      })

      const dph = await buildDph(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      const sh = await buildSouhrnneHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })

      const shByKod = Object.fromEntries(
        sh.rows.map((r) => [r.kod_plneni, r.value]),
      )
      // SH kód 0 (goods §64) reconciles with DAP ř.20
      expect(shByKod["0"]).toBe(dph.rows.r20_base)
      expect(dph.rows.r20_base).toBe("50000.0000")
      // SH kód 3 (service §9/1) reconciles with DAP ř.21
      expect(shByKod["3"]).toBe(dph.rows.r21_base)
      expect(dph.rows.r21_base).toBe("30000.0000")

      // Full cross-check: SH total == ř.20 + ř.21 (both osvobozené s nárokem)
      const shTotal = sh.rows.reduce((acc, r) => acc + Number(r.value), 0)
      expect(shTotal).toBe(
        Number(dph.rows.r20_base) + Number(dph.rows.r21_base),
      )
      // None of it leaked to the domestic §92 PDP line, ř.50 exempt, or KH A.1
      expect(dph.rows.r25_base).toBe("0.0000")
      expect(dph.rows.r50_base).toBe("0.0000")
      expect(dph.kh.a1_base).toBe("0.0000")
    })
  })

  it("rejects at the capture boundary: ISSUED + EU + non-REVERSE_CHARGE mode (#541)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2095-01-01",
      periodEnd: "2095-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "EU supply with a wrong (EXEMPT) mode",
        occurredAt: "2095-04-01",
        responsibleUserId: userId,
      })
      // A wrong-mode ISSUED EU capture (EXEMPT+EU) would silently drop off
      // ř.20/21 + SH — the capture guard rejects it instead of reinterpreting it.
      await expect(
        captureDocument(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.documentSeriesId,
          type: "ISSUED_INVOICE",
          issuedAt: "2095-04-01",
          taxPointDate: "2095-04-01",
          lines: [
            {
              eventId: ev.eventId,
              partials: [
                {
                  baseAmount: "50000.00",
                  vatMode: "EXEMPT",
                  vatJurisdiction: "EU",
                  supplyKind: "GOODS",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        }),
      ).rejects.toThrow(
        /ISSUED EU supply must capture as vat_mode 'REVERSE_CHARGE'/,
      )
    })
  })
})

/**
 * Export of goods to a third country (§66 vývoz, #566): osvobozeno s nárokem
 * na odpočet (base only, no daň) — belongs on DAP ř.22, never ř.50 (§51 exempt
 * WITHOUT deduction) and never souhrnné hlášení (SH is EU-only) or KH.
 * Captures as vat_mode = 'EXEMPT' + vat_jurisdiction = 'IMPORT' (the canonical
 * pair decideVat now emits, classify.ts), mirroring the #541 EU pattern.
 */
describe("DPH ř.22 — export of goods to a third country (§66) (#566)", () => {
  it("routes an ISSUED export to ř.22 ONLY — not ř.50, not ř.25, not KH A.1", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2096-01-01",
      periodEnd: "2096-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const cp = await createCounterparty(db, s.ctx, {
        name: "Overseas Buyer LLC",
        countryCode: "US",
      })
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        counterpartyId: cp,
        description: "Vývoz zboží §66",
        occurredAt: "2096-04-01",
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2096-04-01",
        taxPointDate: "2096-04-01",
        lines: [
          {
            eventId: ev.eventId,
            partials: [
              {
                baseAmount: "150000.00",
                vatMode: "EXEMPT",
                vatJurisdiction: "IMPORT",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      // Full capture→POST→report path: S-EXPORT now carries vat_mode EXEMPT
      // matching decideVat's export-side decision, so expand.ts no longer
      // throws on the pre-#566 mismatch — books base-only (311/604).
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: doc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-EXPORT",
        summaryRecordId: doc.summaryRecordId,
        accountingEventId: ev.eventId,
        postingDate: "2096-04-01",
        responsibleUserId: userId,
      })

      const dph = await buildDph(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      // ř.22 — export, base only (osvobozeno s nárokem, daň 0)
      expect(dph.rows.r22_base).toBe("150000.0000")
      // NOT §51 exempt-without-deduction
      expect(dph.rows.r50_base).toBe("0.0000")
      // NOT domestic §92 PDP dodavatel
      expect(dph.rows.r25_base).toBe("0.0000")
      // NOT kontrolní hlašení A.1
      expect(dph.kh.a1_base).toBe("0.0000")

      const kh = await buildKontrolniHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(kh.a1).toHaveLength(0)

      const sh = await buildSouhrnneHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(sh.rows).toHaveLength(0)
    })
  })

  it("does not conflate a §66 export with a §51 domestic exempt sale on ř.50", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2097-01-01",
      periodEnd: "2097-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      // §51 domestic exempt sale (e.g. pojištění) — stays on ř.50.
      const exemptEv = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "FV exempt §51",
        occurredAt: "2097-04-01",
        responsibleUserId: userId,
      })
      const exemptDoc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2097-04-01",
        taxPointDate: "2097-04-01",
        lines: [
          {
            eventId: exemptEv.eventId,
            partials: [
              {
                baseAmount: "10000.00",
                vatMode: "EXEMPT",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: exemptDoc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-EXEMPT-NO-CREDIT",
        summaryRecordId: exemptDoc.summaryRecordId,
        accountingEventId: exemptEv.eventId,
        postingDate: "2097-04-01",
        responsibleUserId: userId,
      })

      // §66 export — stays on ř.22, not ř.50.
      const exportEv = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Vývoz zboží §66",
        occurredAt: "2097-04-05",
        responsibleUserId: userId,
      })
      const exportDoc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2097-04-05",
        taxPointDate: "2097-04-05",
        lines: [
          {
            eventId: exportEv.eventId,
            partials: [
              {
                baseAmount: "20000.00",
                vatMode: "EXEMPT",
                vatJurisdiction: "IMPORT",
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })
      await postFromPredkontace(db, s.ctx, {
        partialRecordId: exportDoc.lines[0]!.partialRecordIds[0]!,
        periodId: s.periodId,
        scenario: "S-EXPORT",
        summaryRecordId: exportDoc.summaryRecordId,
        accountingEventId: exportEv.eventId,
        postingDate: "2097-04-05",
        responsibleUserId: userId,
      })

      const dph = await buildDph(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(dph.rows.r50_base).toBe("10000.0000") // §51 only
      expect(dph.rows.r22_base).toBe("20000.0000") // §66 only
    })
  })

  it("rejects at the capture boundary: ISSUED + IMPORT jurisdiction + non-EXEMPT mode (#566)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2098-01-01",
      periodEnd: "2098-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Export with the RECEIVED-side (IMPORT) mode misapplied",
        occurredAt: "2098-04-01",
        responsibleUserId: userId,
      })
      // A wrong-mode ISSUED export (IMPORT, the RECEIVED-side self-assessment
      // mode) would silently misfile off ř.22 or crash the poster — the
      // capture guard rejects it instead of reinterpreting it.
      await expect(
        captureDocument(db, s.ctx, {
          periodId: s.periodId,
          seriesId: s.documentSeriesId,
          type: "ISSUED_INVOICE",
          issuedAt: "2098-04-01",
          taxPointDate: "2098-04-01",
          lines: [
            {
              eventId: ev.eventId,
              partials: [
                {
                  baseAmount: "20000.00",
                  vatMode: "IMPORT",
                  vatJurisdiction: "IMPORT",
                  vatRate: "21",
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        }),
      ).rejects.toThrow(
        /ISSUED export to a third country must capture as vat_mode 'EXEMPT'/,
      )
    })
  })
})

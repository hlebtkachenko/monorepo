/**
 * VAT filing-period awareness: a přiznání k DPH / kontrolní hlášení / souhrnné
 * hlášení covers a FILING PERIOD (calendar month or quarter), not the whole
 * annual účetní období. buildDph / buildKontrolniHlaseni / buildSouhrnneHlaseni
 * accept an explicit evidence scope. FILING_PERIOD uses legal document dates
 * and can cross accounting periods; ACCOUNTING_PERIOD preserves the v1 public
 * read-model boundary. This suite proves both behaviors.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { executeRows, withOrganization } from "@workspace/db"
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
let orgB: string
let userId: string
let userBId: string
let orgSequence = 0

beforeAll(async () => {
  admin = adminClient()
  const seed = await seedTwoOrganizations(admin)
  workspaceId = seed.workspaceId
  orgA = seed.orgAId
  orgB = seed.orgBId
  userId = seed.userAId
  userBId = seed.userBId
})
afterAll(async () => {
  await admin.end({ timeout: 5 })
})

beforeEach(async () => {
  const sequence = ++orgSequence
  const [org] = await admin<Array<{ id: string }>>`
    INSERT INTO organization
      (organization_id, workspace_id, slug, legal_name, person_kind, legal_subject_kind)
    VALUES
      (uuidv7(), ${workspaceId}, ${`vat-range-${sequence}`}, ${`VAT Range ${sequence}`}, 'legal_entity', 'for_profit')
    RETURNING id
  `
  if (!org) throw new Error("Failed to seed VAT range organization")
  orgA = org.id
  await admin`UPDATE organization SET organization_id = id WHERE id = ${orgA}::uuid`
})

describe("VAT output builder evidence scopes", () => {
  it("rejects legal-date corrections after the accounting period is closed", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })
    const documentId = await withOrganization(orgA, userId, async (db) => {
      const event = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Legal-date correction guard",
        occurredAt: "2026-01-15",
        responsibleUserId: userId,
      })
      const document = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2026-01-15",
        taxPointDate: "2026-01-15",
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
      return document.summaryRecordId
    })

    await admin`
      UPDATE accounting_period
         SET status = 'CLOSED'
       WHERE id = ${s.periodId}::uuid
    `

    await expect(
      withOrganization(orgA, userId, (db) =>
        db.execute(sql`
          UPDATE summary_record
             SET tax_point_date = '2026-02-01'
           WHERE id = ${documentId}::uuid
        `),
      ),
    ).rejects.toThrow()
  })

  it("buildDph: accounting-period scope aggregates the book period and filing scope narrows by tax point", async () => {
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
        taxPointDate: "2026-01-15",
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
        taxPointDate: "2026-02-15",
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

      // Accounting-period scope keeps the public API's book-period read model.
      const whole = await buildDph(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(whole.rows.r1_base).toBe("3000.0000")
      expect(whole.rows.r1_dan).toBe("630.0000")

      // January filing scope includes only January tax points.
      const jan = await buildDph(db, {
        kind: "FILING_PERIOD",
        period: { from: "2026-01-01", to: "2026-01-31" },
      })
      expect(jan.rows.r1_base).toBe("1000.0000")
      expect(jan.rows.r1_dan).toBe("210.0000")

      // February filing scope includes only February tax points.
      const feb = await buildDph(db, {
        kind: "FILING_PERIOD",
        period: { from: "2026-02-01", to: "2026-02-28" },
      })
      expect(feb.rows.r1_base).toBe("2000.0000")
      expect(feb.rows.r1_dan).toBe("420.0000")
    })
  })

  it("uses the explicit Czech legal date independently of the database session timezone", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const event = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Midnight-boundary sale",
        occurredAt: "2026-02-01T00:30:00+01:00",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2026-02-01T00:30:00+01:00",
        taxPointDate: "2026-02-01",
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

      const scope = {
        kind: "FILING_PERIOD" as const,
        period: { from: "2026-02-01", to: "2026-02-28" },
      }
      await db.execute(sql`SELECT set_config('TimeZone', 'UTC', true)`)
      const utc = await buildDph(db, scope)
      await db.execute(
        sql`SELECT set_config('TimeZone', 'Europe/Prague', true)`,
      )
      const prague = await buildDph(db, scope)

      expect(utc.rows.r1_base).toBe("1000.0000")
      expect(prague.rows.r1_base).toBe("1000.0000")
    })
  })

  it("treats a date-only occurredAt as a Prague legal date in every session timezone", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })

    await withOrganization(orgA, userId, async (db) => {
      await db.execute(sql`SELECT set_config('TimeZone', 'Asia/Tokyo', true)`)
      const event = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Date-only legal event",
        occurredAt: "2026-02-01",
        responsibleUserId: userId,
      })

      const [stored] = await executeRows<{
        occurred_on: string
        occurred_at_utc: string
      }>(
        db,
        sql`SELECT occurred_on::text,
                   to_char(
                     occurred_at AT TIME ZONE 'UTC',
                     'YYYY-MM-DD HH24:MI:SS'
                   ) AS occurred_at_utc
              FROM accounting_event
             WHERE id = ${event.eventId}::uuid`,
      )

      expect(stored).toEqual({
        occurred_on: "2026-02-01",
        occurred_at_utc: "2026-01-31 23:00:00",
      })
    })
  })

  it("claims received standard VAT no earlier than the proven receipt date", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const event = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "January supply received in February",
        occurredAt: "2026-01-15",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2026-01-15",
        taxPointDate: "2026-01-15",
        receivedDate: "2026-02-05",
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

      const january = await buildDph(db, {
        kind: "FILING_PERIOD",
        period: { from: "2026-01-01", to: "2026-01-31" },
      })
      const february = await buildDph(db, {
        kind: "FILING_PERIOD",
        period: { from: "2026-02-01", to: "2026-02-28" },
      })

      expect(january.rows.r40_base).toBe("0.0000")
      expect(january.rows.r40_dan).toBe("0.0000")
      expect(february.rows.r40_base).toBe("1000.0000")
      expect(february.rows.r40_dan).toBe("210.0000")
      expect(february.completeness.status).toBe("COMPLETE")
    })
  })

  it("keeps a legacy received invoice without receipt evidence out of deductions and reports missing input", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const event = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Received invoice with unknown receipt date",
        occurredAt: "2026-01-15",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2026-01-15",
        taxPointDate: "2026-01-15",
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

      const result = await buildDph(db, {
        kind: "FILING_PERIOD",
        period: { from: "2026-01-01", to: "2026-01-31" },
      })
      expect(result.rows.r40_base).toBe("0.0000")
      expect(result.rows.r40_dan).toBe("0.0000")
      expect(result.completeness).toEqual({
        status: "NEEDS_INPUT",
        missingTaxPointDocuments: 0,
        missingReceivedDateDocuments: 1,
      })
    })
  })

  it("does not infer a tax point from linked events at runtime", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const event = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Invoice with unresolved tax point",
        occurredAt: "2026-01-15",
        responsibleUserId: userId,
      })
      const document = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2026-01-15",
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

      const [stored] = await db.execute<{ tax_point_date: string | null }>(sql`
        SELECT tax_point_date::text AS tax_point_date
          FROM summary_record
         WHERE id = ${document.summaryRecordId}::uuid
      `)
      expect(stored?.tax_point_date).toBeNull()
    })
  })

  it("counts unresolved receipts from earlier tax points only when the accounting period overlaps the filing period", async () => {
    const old = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
    })
    const current = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })

    await withOrganization(orgA, userId, async (db) => {
      const captureUnresolvedReceipt = async (
        seed: typeof old,
        occurredAt: string,
        taxPointDate: string,
      ) => {
        const event = await createEvent(db, seed.ctx, {
          periodId: seed.periodId,
          seriesId: seed.eventSeriesId,
          description: "Received invoice with unresolved receipt date",
          occurredAt,
          responsibleUserId: userId,
        })
        await captureDocument(db, seed.ctx, {
          periodId: seed.periodId,
          seriesId: seed.documentSeriesId,
          type: "RECEIVED_INVOICE",
          issuedAt: occurredAt,
          taxPointDate,
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
      }

      await captureUnresolvedReceipt(old, "2025-12-15", "2025-12-15")
      await captureUnresolvedReceipt(current, "2026-01-05", "2025-12-20")

      const result = await buildDph(db, {
        kind: "FILING_PERIOD",
        period: { from: "2026-01-01", to: "2026-01-31" },
      })
      expect(result.completeness).toMatchObject({
        status: "NEEDS_INPUT",
        missingReceivedDateDocuments: 1,
      })
    })
  })

  it("reports missing receipt evidence only for VAT artifacts that use received invoices", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const event = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Received invoice irrelevant to souhrnne hlaseni",
        occurredAt: "2026-01-20",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2026-01-20",
        taxPointDate: "2026-01-20",
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

      const scope = {
        kind: "FILING_PERIOD" as const,
        period: { from: "2026-01-01", to: "2026-01-31" },
      }
      const [dap, kh, sh] = await Promise.all([
        buildDph(db, scope),
        buildKontrolniHlaseni(db, scope),
        buildSouhrnneHlaseni(db, scope),
      ])

      expect(dap.completeness).toEqual({
        status: "NEEDS_INPUT",
        missingTaxPointDocuments: 0,
        missingReceivedDateDocuments: 1,
      })
      expect(kh.completeness).toEqual({
        status: "NEEDS_INPUT",
        missingTaxPointDocuments: 0,
        missingReceivedDateDocuments: 1,
      })
      expect(sh.completeness).toEqual({
        status: "COMPLETE",
        missingTaxPointDocuments: 0,
        missingReceivedDateDocuments: 0,
      })
    })
  })

  it("requires receipt evidence for a deductible reverse-charge DAP entry but not for KH", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const event = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Deductible reverse-charge invoice without receipt date",
        occurredAt: "2026-01-22",
        responsibleUserId: userId,
      })
      await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2026-01-22",
        taxPointDate: "2026-01-22",
        lines: [
          {
            eventId: event.eventId,
            partials: [
              {
                baseAmount: "1000.00",
                vatRate: "21",
                vatMode: "REVERSE_CHARGE",
                vatJurisdiction: "REVERSE_CHARGE",
                vatDeductible: true,
                currencyCode: "CZK",
              },
            ],
          },
        ],
      })

      const scope = {
        kind: "FILING_PERIOD" as const,
        period: { from: "2026-01-01", to: "2026-01-31" },
      }
      const [dap, kh] = await Promise.all([
        buildDph(db, scope),
        buildKontrolniHlaseni(db, scope),
      ])

      expect(dap.completeness).toEqual({
        status: "NEEDS_INPUT",
        missingTaxPointDocuments: 0,
        missingReceivedDateDocuments: 1,
      })
      expect(kh.completeness).toEqual({
        status: "COMPLETE",
        missingTaxPointDocuments: 0,
        missingReceivedDateDocuments: 0,
      })
    })
  })

  it("excludes an issued invoice with an unknown tax point from an accounting-period DAP", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })
    await withOrganization(orgA, userId, async (db) => {
      const event = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Issued invoice with incomplete legacy tax evidence",
        occurredAt: "2026-01-25",
        responsibleUserId: userId,
      })
      const document = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "ISSUED_INVOICE",
        issuedAt: "2026-01-25",
        taxPointDate: "2026-01-25",
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
      await db.execute(sql`
        UPDATE summary_record
           SET tax_point_date = NULL
         WHERE id = ${document.summaryRecordId}::uuid
      `)

      const result = await buildDph(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })

      expect(result.rows.r1_base).toBe("0.0000")
      expect(result.rows.r1_dan).toBe("0.0000")
      expect(result.completeness).toEqual({
        status: "NEEDS_INPUT",
        missingTaxPointDocuments: 1,
        missingReceivedDateDocuments: 0,
      })
    })
  })

  it("keeps filing-period evidence isolated by organization RLS", async () => {
    const a = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2028-01-01",
      periodEnd: "2028-12-31",
    })
    const b = await seedDoubleEntryOrg(orgB, workspaceId, userBId, {
      periodStart: "2028-01-01",
      periodEnd: "2028-12-31",
    })

    const captureSale = async (
      organizationId: string,
      actorId: string,
      seed: typeof a,
      baseAmount: string,
      vatAmount: string,
    ) => {
      await withOrganization(organizationId, actorId, async (db) => {
        const event = await createEvent(db, seed.ctx, {
          periodId: seed.periodId,
          seriesId: seed.eventSeriesId,
          description: "RLS filing-period sale",
          occurredAt: "2028-03-10",
          responsibleUserId: actorId,
        })
        await captureDocument(db, seed.ctx, {
          periodId: seed.periodId,
          seriesId: seed.documentSeriesId,
          type: "ISSUED_INVOICE",
          issuedAt: "2028-03-10",
          taxPointDate: "2028-03-10",
          lines: [
            {
              eventId: event.eventId,
              partials: [
                {
                  baseAmount,
                  vatRate: "21",
                  vatMode: "STANDARD",
                  vatAmount,
                  currencyCode: "CZK",
                },
              ],
            },
          ],
        })
      })
    }

    await captureSale(orgA, userId, a, "1000.00", "210.00")
    await captureSale(orgB, userBId, b, "9000.00", "1890.00")

    await withOrganization(orgA, userId, async (db) => {
      const result = await buildDph(db, {
        kind: "FILING_PERIOD",
        period: { from: "2028-01-01", to: "2028-03-31" },
      })
      expect(result.rows.r1_base).toBe("1000.0000")
      expect(result.rows.r1_dan).toBe("210.0000")
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
        taxPointDate: "2026-01-10",
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
        taxPointDate: "2026-02-10",
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

      // Accounting-period scope includes both documents.
      const whole = await buildKontrolniHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(whole.a4).toHaveLength(2)

      // January filing scope includes the January document only.
      const jan = await buildKontrolniHlaseni(db, {
        kind: "FILING_PERIOD",
        period: { from: "2026-01-01", to: "2026-01-31" },
      })
      expect(jan.a4).toHaveLength(1)
      expect(jan.a4[0]!.base21).toBe("20000.0000")

      // February filing scope includes the February document only.
      const feb = await buildKontrolniHlaseni(db, {
        kind: "FILING_PERIOD",
        period: { from: "2026-02-01", to: "2026-02-28" },
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
        taxPointDate: "2026-01-12",
        receivedDate: "2026-01-12",
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
        taxPointDate: "2026-02-12",
        receivedDate: "2026-02-12",
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

      // Accounting-period scope includes both PDP documents.
      const whole = await buildKontrolniHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(whole.b1).toHaveLength(2)

      // January filing scope includes the January document only.
      const jan = await buildKontrolniHlaseni(db, {
        kind: "FILING_PERIOD",
        period: { from: "2026-01-01", to: "2026-01-31" },
      })
      expect(jan.b1).toHaveLength(1)
      expect(jan.b1[0]!.base21).toBe("500.0000")
      expect(jan.b1[0]!.dan21).toBe("105.0000")

      // February filing scope includes the February document only.
      const feb = await buildKontrolniHlaseni(db, {
        kind: "FILING_PERIOD",
        period: { from: "2026-02-01", to: "2026-02-28" },
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
        taxPointDate: "2026-01-18",
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
        taxPointDate: "2026-02-18",
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

      // Accounting-period scope folds both sub-threshold documents into A.5.
      const whole = await buildKontrolniHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(whole.a5.count).toBe(2)
      expect(whole.a5.base).toBe("2500.0000")
      expect(whole.a5.dan).toBe("525.0000")

      // January filing scope includes the January document only.
      const jan = await buildKontrolniHlaseni(db, {
        kind: "FILING_PERIOD",
        period: { from: "2026-01-01", to: "2026-01-31" },
      })
      expect(jan.a5.count).toBe(1)
      expect(jan.a5.base).toBe("1000.0000")
      expect(jan.a5.dan).toBe("210.0000")

      // February filing scope includes the February document only.
      const feb = await buildKontrolniHlaseni(db, {
        kind: "FILING_PERIOD",
        period: { from: "2026-02-01", to: "2026-02-28" },
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
        taxPointDate: "2026-01-20",
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
        taxPointDate: "2026-02-20",
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

      // Accounting-period scope folds both months into one kód-0 row.
      const whole = await buildSouhrnneHlaseni(db, {
        kind: "ACCOUNTING_PERIOD",
        periodId: s.periodId,
      })
      expect(whole.rows).toHaveLength(1)
      expect(whole.rows[0]!.value).toBe("120000.0000")
      expect(whole.rows[0]!.count).toBe(2)

      // January filing scope includes the January supply only.
      const jan = await buildSouhrnneHlaseni(db, {
        kind: "FILING_PERIOD",
        period: { from: "2026-01-01", to: "2026-01-31" },
      })
      expect(jan.rows).toHaveLength(1)
      expect(jan.rows[0]!.value).toBe("50000.0000")
      expect(jan.rows[0]!.count).toBe(1)

      // February filing scope includes the February supply only.
      const feb = await buildSouhrnneHlaseni(db, {
        kind: "FILING_PERIOD",
        period: { from: "2026-02-01", to: "2026-02-28" },
      })
      expect(feb.rows).toHaveLength(1)
      expect(feb.rows[0]!.value).toBe("70000.0000")
    })
  })
})

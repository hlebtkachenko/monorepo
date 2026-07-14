/**
 * resolveCounterparty — supplier/customer identity → workspace-shared counterparty
 * (find-or-create). Dedup by IČO → DIČ → name+country, self-org excluded, NULL-only
 * backfill, race-safe upsert. Plus the createEvent seam that opens the saldokonto
 * obligation against the resolved partner. PG18 testcontainer, app_user under RLS.
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
  createEvent,
  resolveCounterparty,
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

async function countByIco(
  db: OrganizationBoundDb,
  ico: string,
): Promise<number> {
  const r = await executeRows<{ n: number }>(
    db,
    sql`SELECT count(*)::int AS n FROM counterparty WHERE workspace_id = ${workspaceId}::uuid AND ico = ${ico}`,
  )
  return r[0]!.n
}

async function fieldsOf(
  db: OrganizationBoundDb,
  id: string,
): Promise<{
  name: string | null
  tax_id: string | null
  country_code: string | null
}> {
  const r = await executeRows<{
    name: string | null
    tax_id: string | null
    country_code: string | null
  }>(
    db,
    sql`SELECT name, tax_id, country_code FROM counterparty WHERE id = ${id}::uuid`,
  )
  return r[0]!
}

describe("resolveCounterparty", () => {
  it("creates by IČO once, then returns the same row (idempotent, no duplicate)", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const a = await resolveCounterparty(
        db,
        { organizationId: orgA, workspaceId },
        {
          name: "ACME s.r.o.",
          ico: "10000001",
          dic: "CZ10000001",
        },
      )
      const b = await resolveCounterparty(
        db,
        { organizationId: orgA, workspaceId },
        {
          name: "ACME (jiný zápis)",
          ico: "10000001",
        },
      )
      expect(b).toBe(a)
      expect(await countByIco(db, "10000001")).toBe(1)
    })
  })

  it("matches by DIČ when the incoming identity carries no IČO", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const ctx = { organizationId: orgA, workspaceId }
      const a = await resolveCounterparty(db, ctx, {
        name: "DIC Match s.r.o.",
        ico: "10000002",
        dic: "CZ10000002",
      })
      const b = await resolveCounterparty(db, ctx, {
        name: "DIC Match",
        dic: "CZ10000002", // no IČO → resolve by tax_id
      })
      expect(b).toBe(a)
    })
  })

  it("name-only matches only a row that itself has no IČO/DIČ, same country", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const ctx = { organizationId: orgA, workspaceId }
      // an identified company
      const identified = await resolveCounterparty(db, ctx, {
        name: "Bare Name Ltd",
        ico: "10000003",
      })
      // a bare name (no ico/dic) must NOT merge into the identified row
      const bare = await resolveCounterparty(db, ctx, {
        name: "Bare Name Ltd",
        countryCode: "CZ",
      })
      expect(bare).not.toBe(identified)
      // …but two bare names (same name+country) DO converge
      const bare2 = await resolveCounterparty(db, ctx, {
        name: "bare name ltd", // case-insensitive
        countryCode: "CZ",
      })
      expect(bare2).toBe(bare)
    })
  })

  it("back-fills only NULL fields on a match — never overwrites curated data", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const ctx = { organizationId: orgA, workspaceId }
      const id = await resolveCounterparty(db, ctx, {
        name: "Fill Co",
        ico: "10000004",
      })
      // fills the missing DIČ + country
      await resolveCounterparty(db, ctx, {
        name: "Fill Co",
        ico: "10000004",
        dic: "CZ10000004",
        countryCode: "CZ",
      })
      // a different name does NOT overwrite the existing one
      await resolveCounterparty(db, ctx, {
        name: "WRONG NAME",
        ico: "10000004",
      })
      const f = await fieldsOf(db, id)
      expect(f.tax_id).toBe("CZ10000004")
      expect(f.country_code).toBe("CZ")
      expect(f.name).toBe("Fill Co")
    })
  })

  it("never matches the self-org identity row (its own IČO can be re-used by a supplier)", async () => {
    await withOrganization(orgB, userId, async (db) => {
      const ctx = { organizationId: orgB, workspaceId }
      // seed a self-org row carrying an IČO
      const selfRows = await executeRows<{ id: string }>(
        db,
        sql`INSERT INTO counterparty (workspace_id, self_of_organization_id, name, ico)
            VALUES (${workspaceId}::uuid, ${orgB}::uuid, 'Naše firma', '10000005')
            RETURNING id`,
      )
      const selfId = selfRows[0]!.id
      // a supplier that happens to share that IČO resolves to a DIFFERENT row
      const supplier = await resolveCounterparty(db, ctx, {
        name: "Supplier sharing ICO",
        ico: "10000005",
      })
      expect(supplier).not.toBe(selfId)
    })
  })

  it("throws when the identity has no IČO, DIČ, or name", async () => {
    await withOrganization(orgA, userId, async (db) => {
      await expect(
        resolveCounterparty(
          db,
          { organizationId: orgA, workspaceId },
          { name: "  " },
        ),
      ).rejects.toThrow(/no IČO, DIČ, or name/)
    })
  })
})

describe("createEvent — counterparty identity seam", () => {
  it("resolves the identity and books the obligation against that partner", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2035-01-01",
      periodEnd: "2035-12-31",
    })
    const res = await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Nákup od resolved dodavatele",
        occurredAt: "2035-03-10",
        counterparty: { name: "Resolved Dodavatel s.r.o.", ico: "10000006" },
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.documentSeriesId,
        type: "RECEIVED_INVOICE",
        issuedAt: "2035-03-10",
        taxPointDate: "2035-03-10",
        receivedDate: "2035-03-10",
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
      const expected = await resolveCounterparty(db, s.ctx, {
        ico: "10000006",
        name: "x",
      })
      return { summaryRecordId: doc.summaryRecordId, expected }
    })

    await withOrganization(orgA, userId, async (db) => {
      // the obligation opened against the resolved counterparty (not null → no hold).
      const rows = await executeRows<{
        counterparty_id: string
        direction: string
      }>(
        db,
        sql`SELECT oi.counterparty_id::text AS counterparty_id, oi.direction
              FROM open_item oi JOIN posting p ON p.id = oi.origin_posting_id
             WHERE p.summary_record_id = ${res.summaryRecordId}::uuid`,
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]!.counterparty_id).toBe(res.expected)
      expect(rows[0]!.direction).toBe("PAYABLE")
    })
  })

  it("an explicit counterpartyId takes precedence over an identity", async () => {
    const s = await seedDoubleEntryOrg(orgB, workspaceId, userId, {
      periodStart: "2036-01-01",
      periodEnd: "2036-12-31",
    })
    await withOrganization(orgB, userId, async (db) => {
      const explicit = await resolveCounterparty(db, s.ctx, {
        name: "Explicit",
        ico: "10000007",
      })
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "id wins over identity",
        occurredAt: "2036-03-10",
        counterpartyId: explicit,
        counterparty: { name: "Ignored", ico: "10000008" },
        responsibleUserId: userId,
      })
      const r = await executeRows<{ counterparty_id: string }>(
        db,
        sql`SELECT counterparty_id::text AS counterparty_id FROM accounting_event WHERE id = ${ev.eventId}::uuid`,
      )
      expect(r[0]!.counterparty_id).toBe(explicit)
      // the ignored identity was never created
      expect(await countByIco(db, "10000008")).toBe(0)
    })
  })
})

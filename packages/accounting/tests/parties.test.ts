/**
 * Party reads — listParties (with derived supplier/customer), getParty (children +
 * relationship), listPartyRelationships. PG18 testcontainer, app_user under RLS.
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
  getParty,
  listParties,
  listPartyRelationships,
  resolveCounterparty,
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

async function insertCounterparty(
  db: OrganizationBoundDb,
  name: string,
  partyKindCode: string | null = null,
): Promise<string> {
  const r = await executeRows<{ id: string }>(
    db,
    sql`INSERT INTO counterparty (workspace_id, name, party_kind_code)
        VALUES (${workspaceId}::uuid, ${name}, ${partyKindCode})
        RETURNING id`,
  )
  return r[0]!.id
}

describe("listParties", () => {
  it("returns a party with its org relationship overlay and false derived flags", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const cpId = await insertCounterparty(
        db,
        "Overlay Party s.r.o.",
        "LEGAL_ENTITY",
      )
      await executeRows(
        db,
        sql`INSERT INTO party_relationship (organization_id, workspace_id, counterparty_id, relationship_type)
            VALUES (${orgA}::uuid, ${workspaceId}::uuid, ${cpId}::uuid, 'SUPPLIER')`,
      )
      const list = await listParties(db)
      const row = list.find((r) => r.id === cpId)
      expect(row).toBeDefined()
      expect(row!.party_kind_code).toBe("LEGAL_ENTITY")
      expect(row!.relationship_type).toBe("SUPPLIER")
      expect(row!.relationship_active).toBe(true)
      expect(row!.is_supplier).toBe(false) // no open_item yet
      expect(row!.is_customer).toBe(false)
    })
  })

  it("excludes the self-org identity row", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const selfRows = await executeRows<{ id: string }>(
        db,
        sql`INSERT INTO counterparty (workspace_id, self_of_organization_id, name)
            VALUES (${workspaceId}::uuid, ${orgA}::uuid, 'Naše firma') RETURNING id`,
      )
      const selfId = selfRows[0]!.id
      const list = await listParties(db)
      expect(list.find((r) => r.id === selfId)).toBeUndefined()
    })
  })

  it("filters by search and kind", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const cpId = await insertCounterparty(
        db,
        "Searchable Uniquename a.s.",
        "PUBLIC_AUTHORITY",
      )
      const byName = await listParties(db, { search: "Searchable Uniquename" })
      expect(byName.some((r) => r.id === cpId)).toBe(true)
      const byKind = await listParties(db, { kind: "PUBLIC_AUTHORITY" })
      expect(
        byKind.every((r) => r.party_kind_code === "PUBLIC_AUTHORITY"),
      ).toBe(true)
    })
  })

  it("derives is_supplier from a booked PAYABLE open_item", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId, {
      periodStart: "2040-01-01",
      periodEnd: "2040-12-31",
    })
    const cpId = await withOrganization(orgA, userId, async (db) => {
      const ev = await createEvent(db, s.ctx, {
        periodId: s.periodId,
        seriesId: s.eventSeriesId,
        description: "Nákup od dodavatele",
        occurredAt: "2040-03-10",
        counterparty: { name: "Derived Supplier s.r.o.", ico: "40000001" },
        responsibleUserId: userId,
      })
      const doc = await captureDocument(db, s.ctx, {
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
      })
      await bookDocument(db, s.ctx, {
        summaryRecordId: doc.summaryRecordId,
        responsibleUserId: userId,
      })
      return resolveCounterparty(db, s.ctx, { ico: "40000001", name: "x" })
    })

    await withOrganization(orgA, userId, async (db) => {
      const list = await listParties(db)
      const row = list.find((r) => r.id === cpId)
      expect(row!.is_supplier).toBe(true)
      expect(row!.is_customer).toBe(false)
    })
  })
})

describe("getParty", () => {
  it("returns the identity core, relationship, and child collections", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const cpId = await insertCounterparty(
        db,
        "Full Detail s.r.o.",
        "LEGAL_ENTITY",
      )
      await executeRows(
        db,
        sql`INSERT INTO party_address (workspace_id, counterparty_id, purpose, municipality)
            VALUES (${workspaceId}::uuid, ${cpId}::uuid, 'REGISTERED', 'Praha')`,
      )
      await executeRows(
        db,
        sql`INSERT INTO party_contact (workspace_id, counterparty_id, first_name, last_name, email)
            VALUES (${workspaceId}::uuid, ${cpId}::uuid, 'Jan', 'Novák', 'jan@example.com')`,
      )
      await executeRows(
        db,
        sql`INSERT INTO party_bank_account (workspace_id, counterparty_id, account_number, bank_code)
            VALUES (${workspaceId}::uuid, ${cpId}::uuid, '123456789', '0100')`,
      )
      await executeRows(
        db,
        sql`INSERT INTO party_identifier (workspace_id, counterparty_id, identifier_type, value)
            VALUES (${workspaceId}::uuid, ${cpId}::uuid, 'LEI', '3157001234ABCDEF0000')`,
      )
      await executeRows(
        db,
        sql`INSERT INTO party_relationship (organization_id, workspace_id, counterparty_id, relationship_type, default_payment_terms)
            VALUES (${orgA}::uuid, ${workspaceId}::uuid, ${cpId}::uuid, 'CUSTOMER', 14)`,
      )

      const party = await getParty(db, cpId)
      expect(party.id).toBe(cpId)
      expect(party.party_kind_code).toBe("LEGAL_ENTITY")
      expect(party.addresses).toHaveLength(1)
      expect(party.contacts).toHaveLength(1)
      expect(party.bank_accounts).toHaveLength(1)
      expect(party.identifiers).toHaveLength(1)
      expect(party.relationship).not.toBeNull()
      expect(party.relationship!.relationship_type).toBe("CUSTOMER")
      expect(party.relationship!.default_payment_terms).toBe(14)
    })
  })

  it("returns empty child arrays and null relationship for a bare party", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const cpId = await insertCounterparty(db, "Bare Party s.r.o.")
      const party = await getParty(db, cpId)
      expect(party.addresses).toHaveLength(0)
      expect(party.contacts).toHaveLength(0)
      expect(party.relationship).toBeNull()
    })
  })
})

describe("listPartyRelationships", () => {
  it("returns the org's relationships", async () => {
    await withOrganization(orgA, userId, async (db) => {
      const cpId = await insertCounterparty(db, "Rel List s.r.o.")
      await executeRows(
        db,
        sql`INSERT INTO party_relationship (organization_id, workspace_id, counterparty_id, relationship_type)
            VALUES (${orgA}::uuid, ${workspaceId}::uuid, ${cpId}::uuid, 'PARTNER')`,
      )
      const rels = await listPartyRelationships(db)
      const rel = rels.find((r) => r.counterparty_id === cpId)
      expect(rel).toBeDefined()
      expect(rel!.relationship_type).toBe("PARTNER")
    })
  })
})

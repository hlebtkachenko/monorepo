/**
 * backfillDefaultDocumentTypes — scaffold-only seed of the default doklad types
 * (one primary per default-série category) + the default série Czech Název fill.
 * Idempotent; the is_primary guard can never mint a second primary in a category.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { executeRows, sql, withOrganization } from "@workspace/db"
import {
  backfillDefaultDocumentTypes,
  backfillDefaultNumberSeries,
  DEFAULT_DOCUMENT_TYPES,
  setPrimaryDocumentType,
  upsertDocumentType,
} from "../src/index"
import type { OrgCtx } from "../src/index"
import { adminClient, seedTwoOrganizations } from "./fixtures"

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

interface TypeRow {
  category: string
  code: string
  name: string
  kind: string | null
  is_primary: boolean
  series_code: string | null
}

async function typeRows(orgId: string, ctx: OrgCtx): Promise<TypeRow[]> {
  return withOrganization(orgId, userId, (db) =>
    executeRows<TypeRow>(
      db,
      sql`SELECT dt.category, dt.code, dt.name, dt.kind, dt.is_primary,
                 ns.code AS series_code
            FROM document_type dt
            LEFT JOIN number_series ns ON ns.id = dt.default_series_id
           WHERE dt.organization_id = ${ctx.organizationId}::uuid
           ORDER BY dt.category, dt.code`,
    ),
  )
}

describe("backfillDefaultDocumentTypes", () => {
  it("fresh org: seeds one primary type per category, linked to its default série", async () => {
    const ctx: OrgCtx = { organizationId: orgA, workspaceId }
    // Séries must exist first — each type links to its série by code.
    await withOrganization(orgA, userId, (db) =>
      backfillDefaultNumberSeries(db, ctx),
    )
    const inserted = await withOrganization(orgA, userId, (db) =>
      backfillDefaultDocumentTypes(db, ctx),
    )
    expect(inserted).toBe(DEFAULT_DOCUMENT_TYPES.length)

    const rows = await typeRows(orgA, ctx)
    expect(rows).toHaveLength(DEFAULT_DOCUMENT_TYPES.length)
    for (const def of DEFAULT_DOCUMENT_TYPES) {
      const r = rows.find(
        (x) => x.category === def.category && x.code === def.code,
      )
      expect(r, `${def.category}/${def.code}`).toBeDefined()
      expect(r!.is_primary).toBe(true)
      expect(r!.name).toBe(def.name)
      expect(r!.kind).toBe(def.kind)
      expect(r!.series_code).toBe(def.seriesCode)
    }
  })

  it("is idempotent: a second run inserts nothing", async () => {
    const ctx: OrgCtx = { organizationId: orgA, workspaceId }
    const inserted = await withOrganization(orgA, userId, (db) =>
      backfillDefaultDocumentTypes(db, ctx),
    )
    expect(inserted).toBe(0)
    const rows = await typeRows(orgA, ctx)
    expect(rows).toHaveLength(DEFAULT_DOCUMENT_TYPES.length)
  })

  it("fills the default DOCUMENT séries with their Czech Název", async () => {
    const ctx: OrgCtx = { organizationId: orgA, workspaceId }
    const rows = await withOrganization(orgA, userId, (db) =>
      executeRows<{ code: string; name: string | null }>(
        db,
        sql`SELECT code, name FROM number_series
             WHERE organization_id = ${ctx.organizationId}::uuid
               AND entity_type = 'DOCUMENT'
             ORDER BY code`,
      ),
    )
    expect(rows.find((r) => r.code === "FV")?.name).toBe("Vydané faktury")
    expect(rows.find((r) => r.code === "PPD")?.name).toBe(
      "Příjmové pokladní doklady",
    )
    expect(rows.every((r) => r.name != null)).toBe(true)
  })

  it("never mints a second primary when a category already has one", async () => {
    const ctx: OrgCtx = { organizationId: orgB, workspaceId }
    await withOrganization(orgB, userId, (db) =>
      backfillDefaultNumberSeries(db, ctx),
    )
    // Pre-seed a user's own primary in ISSUED_INVOICE under a DIFFERENT code.
    await withOrganization(orgB, userId, async (db) => {
      await upsertDocumentType(db, ctx, {
        category: "ISSUED_INVOICE",
        code: "XX",
        name: "Custom",
        kind: "STANDARD",
      })
      const found = await executeRows<{ id: string }>(
        db,
        sql`SELECT id FROM document_type
             WHERE organization_id = ${ctx.organizationId}::uuid
               AND category = 'ISSUED_INVOICE' AND code = 'XX'`,
      )
      await setPrimaryDocumentType(db, ctx, {
        id: found[0]!.id,
        category: "ISSUED_INVOICE",
      })
    })

    await withOrganization(orgB, userId, (db) =>
      backfillDefaultDocumentTypes(db, ctx),
    )

    const issued = (await typeRows(orgB, ctx)).filter(
      (r) => r.category === "ISSUED_INVOICE",
    )
    const primaries = issued.filter((r) => r.is_primary)
    expect(primaries).toHaveLength(1)
    expect(primaries[0]!.code).toBe("XX")
    // The default FV type is still seeded, but as a non-primary sibling.
    expect(issued.find((r) => r.code === "FV")?.is_primary).toBe(false)
  })
})

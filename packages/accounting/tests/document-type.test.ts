/**
 * document_type + Dokladové řady config backend — the reusable read/write surface
 * every future Doklady page consumes. Covers the taxonomy constants, doklad-type
 * upsert + list + get, the exclusive-primary + active toggles, Druh-per-category
 * validation, the DOCUMENT number_series category filter, series+period reads, and
 * cross-org RLS isolation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import type { OrganizationBoundDb } from "@workspace/db"
import {
  DOCUMENT_CATEGORIES,
  backfillDefaultNumberSeries,
  createNumberSeriesPeriod,
  documentKindsFor,
  getDocumentSeries,
  getDocumentType,
  listDocumentCategories,
  listDocumentSeries,
  listDocumentTypes,
  setDocumentTypeActive,
  setPrimaryDocumentType,
  upsertDocumentType,
} from "../src/index"
import type { DoubleEntrySeed } from "./fixtures"
import {
  adminClient,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
} from "./fixtures"

let admin: ReturnType<typeof adminClient>
let orgA: string
let orgB: string
let workspaceId: string
let userA: string
let userB: string
let seed: DoubleEntrySeed

beforeAll(async () => {
  admin = adminClient()
  const s = await seedTwoOrganizations(admin)
  orgA = s.orgAId
  orgB = s.orgBId
  workspaceId = s.workspaceId
  userA = s.userAId
  userB = s.userBId
  seed = await seedDoubleEntryOrg(orgA, workspaceId, userA)
})

afterAll(async () => {
  await admin.end({ timeout: 5 })
})

const onA = <T>(fn: (db: OrganizationBoundDb) => Promise<T>): Promise<T> =>
  withOrganization(orgA, userA, fn)

describe("document category taxonomy", () => {
  it("lists the 9 config categories in fixed display order", () => {
    expect(listDocumentCategories()).toEqual(DOCUMENT_CATEGORIES)
    expect(DOCUMENT_CATEGORIES).toHaveLength(9)
    expect(DOCUMENT_CATEGORIES[0]).toBe("RECEIVED_INVOICE")
  })

  it("returns the Druh set for a kind-bearing category and none for others", () => {
    expect(documentKindsFor("RECEIVED_INVOICE")).toContain("CREDIT_NOTE")
    expect(documentKindsFor("INTERNAL")).toContain("FX_GAIN")
    expect(documentKindsFor("SET_OFF")).toEqual([])
  })
})

describe("document_type writes + reads", () => {
  it("upserts a type, lists it under its category, and reads it back by id", async () => {
    const id = await onA((db) =>
      upsertDocumentType(db, seed.ctx, {
        category: "RECEIVED_INVOICE",
        code: "FAKTURA",
        name: "Faktura přijatá",
        kind: "STANDARD",
        defaultSeriesId: seed.documentSeriesId,
        dueDays: 14,
        defaultAccount: "321001",
      }),
    )
    const listed = await onA((db) =>
      listDocumentTypes(db, { category: "RECEIVED_INVOICE" }),
    )
    expect(listed.find((t) => t.id === id)?.code).toBe("FAKTURA")

    const row = await onA((db) => getDocumentType(db, id))
    expect(row).toMatchObject({
      category: "RECEIVED_INVOICE",
      code: "FAKTURA",
      kind: "STANDARD",
      default_series_id: seed.documentSeriesId,
      due_days: 14,
      default_account: "321001",
      is_active: true,
    })
  })

  it("overwrites on (org, category, code) conflict without flipping primacy", async () => {
    const first = await onA((db) =>
      upsertDocumentType(db, seed.ctx, {
        category: "ISSUED_INVOICE",
        code: "FAKTURA",
        name: "Faktura vydaná",
        kind: "STANDARD",
        isPrimary: true,
      }),
    )
    const again = await onA((db) =>
      upsertDocumentType(db, seed.ctx, {
        category: "ISSUED_INVOICE",
        code: "FAKTURA",
        name: "Faktura vydaná (renamed)",
        kind: "CREDIT_NOTE",
      }),
    )
    expect(again).toBe(first)
    const row = await onA((db) => getDocumentType(db, first))
    // name + kind updated; is_primary NOT clobbered by a plain edit.
    expect(row).toMatchObject({
      name: "Faktura vydaná (renamed)",
      kind: "CREDIT_NOTE",
      is_primary: true,
    })
  })

  it("rejects a Druh that is invalid for the category", async () => {
    await expect(
      onA((db) =>
        upsertDocumentType(db, seed.ctx, {
          category: "RECEIVED_INVOICE",
          code: "BADKIND",
          name: "x",
          kind: "FX_GAIN", // internal-only Druh on an invoice category
        }),
      ),
    ).rejects.toThrow(/not valid for category/)
    await expect(
      onA((db) =>
        upsertDocumentType(db, seed.ctx, {
          category: "SET_OFF", // no Druh defined for this category
          code: "ZAP",
          name: "Zápočet",
          kind: "STANDARD",
        }),
      ),
    ).rejects.toThrow(/not valid for category/)
  })

  it("makes exactly one type primary per category", async () => {
    const a = await onA((db) =>
      upsertDocumentType(db, seed.ctx, {
        category: "INTERNAL",
        code: "ID1",
        name: "Interní 1",
        kind: "GENERAL",
        isPrimary: true,
      }),
    )
    const b = await onA((db) =>
      upsertDocumentType(db, seed.ctx, {
        category: "INTERNAL",
        code: "ID2",
        name: "Interní 2",
        kind: "GENERAL",
      }),
    )
    await onA((db) =>
      setPrimaryDocumentType(db, seed.ctx, { id: b, category: "INTERNAL" }),
    )
    const rowA = await onA((db) => getDocumentType(db, a))
    const rowB = await onA((db) => getDocumentType(db, b))
    expect(rowA?.is_primary).toBe(false)
    expect(rowB?.is_primary).toBe(true)
  })

  it("setPrimaryDocumentType rejects an id outside the category", async () => {
    const id = await onA((db) =>
      upsertDocumentType(db, seed.ctx, {
        category: "CASH",
        code: "PD1",
        name: "Pokladní",
      }),
    )
    await expect(
      onA((db) =>
        setPrimaryDocumentType(db, seed.ctx, { id, category: "BANK" }),
      ),
    ).rejects.toThrow(/not a type of category/)
  })

  it("archives + restores a type, and rejects an unknown id", async () => {
    const id = await onA((db) =>
      upsertDocumentType(db, seed.ctx, {
        category: "BANK",
        code: "BV1",
        name: "Bankovní",
      }),
    )
    await onA((db) =>
      setDocumentTypeActive(db, seed.ctx, { id, isActive: false }),
    )
    expect((await onA((db) => getDocumentType(db, id)))?.is_active).toBe(false)
    const active = await onA((db) =>
      listDocumentTypes(db, { category: "BANK", activeOnly: true }),
    )
    expect(active.some((t) => t.id === id)).toBe(false)

    await onA((db) =>
      setDocumentTypeActive(db, seed.ctx, { id, isActive: true }),
    )
    expect((await onA((db) => getDocumentType(db, id)))?.is_active).toBe(true)

    await expect(
      onA((db) =>
        setDocumentTypeActive(db, seed.ctx, {
          id: "00000000-0000-0000-0000-000000000000",
          isActive: false,
        }),
      ),
    ).rejects.toThrow(/not found/)
  })
})

describe("DOCUMENT number_series reads", () => {
  it("lists DOCUMENT séries filtered by config category via the backfilled defaults", async () => {
    await onA((db) => backfillDefaultNumberSeries(db, seed.ctx))
    const received = await onA((db) =>
      listDocumentSeries(db, { category: "RECEIVED_INVOICE" }),
    )
    // The canonical FP série is tagged RECEIVED_INVOICE by the backfill.
    expect(received.find((s) => s.code === "FP")?.category).toBe(
      "RECEIVED_INVOICE",
    )
    // The uncategorized seed série (FP<tag>, category NULL) is not in this bucket.
    expect(received.some((s) => s.id === seed.documentSeriesId)).toBe(false)
  })

  it("reads a série with its per-období numbering rows, or null for a missing id", async () => {
    await onA((db) =>
      createNumberSeriesPeriod(db, seed.ctx, {
        numberSeriesId: seed.documentSeriesId,
        periodId: seed.periodId,
        numberLength: 4,
        prefix: "FP",
        postfix: "/{YYYY}",
      }),
    )
    const found = await onA((db) =>
      getDocumentSeries(db, seed.documentSeriesId),
    )
    expect(found?.series.code).toContain("FP")
    expect(found?.periods).toHaveLength(1)
    expect(found?.periods[0]).toMatchObject({
      period_id: seed.periodId,
      number_length: 4,
      prefix: "FP",
    })
    expect(
      await onA((db) =>
        getDocumentSeries(db, "00000000-0000-0000-0000-000000000000"),
      ),
    ).toBeNull()
  })
})

describe("cross-organization isolation (FORCE RLS)", () => {
  it("hides one org's document types from another", async () => {
    await withOrganization(orgA, userA, (db) =>
      upsertDocumentType(db, seed.ctx, {
        category: "OTHER_PAYABLE",
        code: "SECRET",
        name: "Only A",
      }),
    )
    const fromB = await withOrganization(orgB, userB, (db) =>
      listDocumentTypes(db, { category: "OTHER_PAYABLE" }),
    )
    expect(fromB).toHaveLength(0)
  })
})

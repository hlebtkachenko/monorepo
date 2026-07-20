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
  allocateNumber,
  backfillDefaultNumberSeries,
  createNumberSeries,
  createNumberSeriesPeriod,
  deleteNumberSeriesPeriod,
  documentKindsFor,
  getDocumentSeries,
  getDocumentType,
  listDocumentCategories,
  listDocumentSeries,
  listDocumentTypes,
  setDocumentTypeActive,
  setPrimaryDocumentType,
  upsertDocumentSeries,
  upsertDocumentType,
  upsertNumberSeriesPeriod,
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
      }),
    )
    // Primacy is set only through the atomic writer, never through upsert.
    await onA((db) =>
      setPrimaryDocumentType(db, seed.ctx, {
        id: first,
        category: "ISSUED_INVOICE",
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

  it("inserts fresh types as non-primary (primacy is not an upsert field)", async () => {
    const id = await onA((db) =>
      upsertDocumentType(db, seed.ctx, {
        category: "OTHER_RECEIVABLE",
        code: "OP1",
        name: "Ostatní pohledávka",
      }),
    )
    expect((await onA((db) => getDocumentType(db, id)))?.is_primary).toBe(false)
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

  it("makes exactly one type primary per category via the atomic writer", async () => {
    const a = await onA((db) =>
      upsertDocumentType(db, seed.ctx, {
        category: "INTERNAL",
        code: "ID1",
        name: "Interní 1",
        kind: "GENERAL",
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
      setPrimaryDocumentType(db, seed.ctx, { id: a, category: "INTERNAL" }),
    )
    expect((await onA((db) => getDocumentType(db, a)))?.is_primary).toBe(true)
    // Electing b demotes a — exactly one primary at a time.
    await onA((db) =>
      setPrimaryDocumentType(db, seed.ctx, { id: b, category: "INTERNAL" }),
    )
    expect((await onA((db) => getDocumentType(db, a)))?.is_primary).toBe(false)
    expect((await onA((db) => getDocumentType(db, b)))?.is_primary).toBe(true)
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
    ).rejects.toThrow(/not an active type of category/)
  })

  it("archiving a primary demotes it, and setPrimary refuses an archived id", async () => {
    const id = await onA((db) =>
      upsertDocumentType(db, seed.ctx, {
        category: "OTHER_PAYABLE",
        code: "OZ1",
        name: "Ostatní závazek",
      }),
    )
    await onA((db) =>
      setPrimaryDocumentType(db, seed.ctx, { id, category: "OTHER_PAYABLE" }),
    )
    // Archiving the current primary must clear is_primary (a primary must be active).
    await onA((db) =>
      setDocumentTypeActive(db, seed.ctx, { id, isActive: false }),
    )
    expect(await onA((db) => getDocumentType(db, id))).toMatchObject({
      is_active: false,
      is_primary: false,
    })
    // An archived type can no longer be elected primary.
    await expect(
      onA((db) =>
        setPrimaryDocumentType(db, seed.ctx, {
          id,
          category: "OTHER_PAYABLE",
        }),
      ),
    ).rejects.toThrow(/not an active type of category/)
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

describe("Dokladová řada writes (number_series)", () => {
  it("upserts a série with category + editor metadata, editable without resetting the counter", async () => {
    const id = await onA((db) =>
      upsertDocumentSeries(db, seed.ctx, {
        category: "ISSUED_INVOICE",
        code: "VF-DR",
        name: "Vydané faktury",
        note: "hlavní",
        description: "popis",
        validFromYear: 2026,
        validToYear: 2027,
      }),
    )
    let s = await onA((db) => getDocumentSeries(db, id))
    expect(s?.series).toMatchObject({
      category: "ISSUED_INVOICE",
      code: "VF-DR",
      name: "Vydané faktury",
      note: "hlavní",
      valid_from_year: 2026,
      valid_to_year: 2027,
    })
    // Re-upsert on the same (org, DOCUMENT, code) edits metadata, same id.
    const again = await onA((db) =>
      upsertDocumentSeries(db, seed.ctx, {
        category: "ISSUED_INVOICE",
        code: "VF-DR",
        name: "Vydané faktury (edit)",
      }),
    )
    expect(again).toBe(id)
    s = await onA((db) => getDocumentSeries(db, id))
    expect(s?.series.name).toBe("Vydané faktury (edit)")
    // next_number (flat counter) is never reset by a metadata edit.
    expect(s?.series.next_number).toBe(1)
  })

  it("upserts + edits a period row's format while preserving the gapless counter", async () => {
    const series = await onA((db) =>
      upsertDocumentSeries(db, seed.ctx, {
        category: "RECEIVED_INVOICE",
        code: "FP-DR",
      }),
    )
    const pid = await onA((db) =>
      upsertNumberSeriesPeriod(db, seed.ctx, {
        numberSeriesId: series,
        periodId: seed.periodId,
        numberLength: 4,
        prefix: "FP",
        postfix: "/{YYYY}",
      }),
    )
    const first = await onA((db) =>
      allocateNumber(db, series, "2026-02-01", "DOCUMENT", seed.periodId),
    )
    expect(first).toEqual({ sequenceNumber: 1, designation: "FP0001/2026" })
    // Edit the format (length + prefix); the counter must survive, not reset to 1.
    const pid2 = await onA((db) =>
      upsertNumberSeriesPeriod(db, seed.ctx, {
        numberSeriesId: series,
        periodId: seed.periodId,
        numberLength: 5,
        prefix: "PF",
        postfix: "/{YYYY}",
      }),
    )
    expect(pid2).toBe(pid)
    const next = await onA((db) =>
      allocateNumber(db, series, "2026-02-01", "DOCUMENT", seed.periodId),
    )
    expect(next).toEqual({ sequenceNumber: 2, designation: "PF00002/2026" })
  })

  it("deletes an unused period row but refuses one that has issued numbers", async () => {
    const series = await onA((db) =>
      upsertDocumentSeries(db, seed.ctx, {
        category: "INTERNAL",
        code: "ID-DR",
      }),
    )
    const unused = await onA((db) =>
      upsertNumberSeriesPeriod(db, seed.ctx, {
        numberSeriesId: series,
        periodId: seed.periodId,
        numberLength: 4,
        prefix: "ID",
      }),
    )
    await onA((db) => deleteNumberSeriesPeriod(db, seed.ctx, { id: unused }))
    expect(
      (await onA((db) => getDocumentSeries(db, series)))?.periods,
    ).toHaveLength(0)

    // Recreate, allocate once → the counter now guards deletion.
    const used = await onA((db) =>
      upsertNumberSeriesPeriod(db, seed.ctx, {
        numberSeriesId: series,
        periodId: seed.periodId,
        numberLength: 4,
        prefix: "ID",
      }),
    )
    await onA((db) =>
      allocateNumber(db, series, "2026-03-01", "DOCUMENT", seed.periodId),
    )
    await expect(
      onA((db) => deleteNumberSeriesPeriod(db, seed.ctx, { id: used })),
    ).rejects.toThrow(/gapless counter cannot be deleted/)
    await expect(
      onA((db) =>
        deleteNumberSeriesPeriod(db, seed.ctx, {
          id: "00000000-0000-0000-0000-000000000000",
        }),
      ),
    ).rejects.toThrow(/not found/)
  })

  it("upsertNumberSeriesPeriod rejects a non-DOCUMENT série", async () => {
    await expect(
      onA((db) =>
        upsertNumberSeriesPeriod(db, seed.ctx, {
          numberSeriesId: seed.eventSeriesId,
          periodId: seed.periodId,
          numberLength: 4,
        }),
      ),
    ).rejects.toThrow(/not DOCUMENT/)
  })

  it("surfaces the default série's Zkratka on the type via JOIN, createNumberSeries stores category", async () => {
    const series = await onA((db) =>
      upsertDocumentSeries(db, seed.ctx, { category: "CASH", code: "PD-DR" }),
    )
    const typeId = await onA((db) =>
      upsertDocumentType(db, seed.ctx, {
        category: "CASH",
        code: "PDT",
        name: "Pokladní",
        defaultSeriesId: series,
      }),
    )
    expect(
      (await onA((db) => getDocumentType(db, typeId)))?.default_series_code,
    ).toBe("PD-DR")

    const catSeries = await onA((db) =>
      createNumberSeries(db, seed.ctx, {
        entityType: "DOCUMENT",
        code: "CN-CAT",
        pattern: "CN{NNNN}",
        category: "TAX_APPLICATION",
      }),
    )
    expect(
      (await onA((db) => getDocumentSeries(db, catSeries)))?.series.category,
    ).toBe("TAX_APPLICATION")
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

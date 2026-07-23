/**
 * allocateForDocumentType — the typ→řada→číslo chain: a doklad type draws its
 * next gapless Označení from the číselná řada it is wired to (its default série).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import {
  allocateForDocumentType,
  upsertDocumentSeries,
  upsertDocumentType,
} from "../src/index"
import type { OrgCtx } from "../src/index"
import { adminClient, seedTwoOrganizations } from "./fixtures"

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

describe("allocateForDocumentType", () => {
  it("draws gapless numbers from the type's default série", async () => {
    const ctx: OrgCtx = { organizationId: orgA, workspaceId }

    const typeId = await withOrganization(orgA, userId, async (db) => {
      const seriesId = await upsertDocumentSeries(db, ctx, {
        category: "ISSUED_INVOICE",
        code: "TFV",
        name: "Test vydané",
      })
      return upsertDocumentType(db, ctx, {
        category: "ISSUED_INVOICE",
        code: "TFV",
        name: "Testovací faktura vydaná",
        kind: "STANDARD",
        defaultSeriesId: seriesId,
      })
    })

    const first = await withOrganization(orgA, userId, (db) =>
      allocateForDocumentType(db, ctx, {
        documentTypeId: typeId,
        isoDate: "2026-06-01",
      }),
    )
    expect(first.seriesCode).toBe("TFV")
    expect(first.sequenceNumber).toBe(1)
    expect(first.designation).toContain("TFV")

    // Gapless: the next allocation advances the counter by exactly one.
    const second = await withOrganization(orgA, userId, (db) =>
      allocateForDocumentType(db, ctx, {
        documentTypeId: typeId,
        isoDate: "2026-06-02",
      }),
    )
    expect(second.sequenceNumber).toBe(2)
  })

  it("throws when the type has no default série", async () => {
    const ctx: OrgCtx = { organizationId: orgA, workspaceId }
    const typeId = await withOrganization(orgA, userId, (db) =>
      upsertDocumentType(db, ctx, {
        category: "INTERNAL",
        code: "TNOSER",
        name: "Bez řady",
        kind: "GENERAL",
      }),
    )
    await expect(
      withOrganization(orgA, userId, (db) =>
        allocateForDocumentType(db, ctx, {
          documentTypeId: typeId,
          isoDate: "2026-06-01",
        }),
      ),
    ).rejects.toThrow(/no DOCUMENT default série/)
  })
})

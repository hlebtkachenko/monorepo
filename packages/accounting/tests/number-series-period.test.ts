/**
 * number_series_period — per-účetní-období gapless numbering for DOCUMENT série.
 * A configured série advances its per-period counter (restarts per period); an
 * unconfigured série falls back to the flat pattern; the entity_type guard holds.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import {
  allocateNumber,
  createNumberSeries,
  createNumberSeriesPeriod,
  createPeriod,
  previewNextNumber,
} from "../src/index"
import type { DoubleEntrySeed } from "./fixtures"
import {
  adminClient,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
} from "./fixtures"

let admin: ReturnType<typeof adminClient>
let orgA: string
let workspaceId: string
let userId: string
let seed: DoubleEntrySeed
let seq = 0

beforeAll(async () => {
  admin = adminClient()
  const s = await seedTwoOrganizations(admin)
  orgA = s.orgAId
  workspaceId = s.workspaceId
  userId = s.userAId
  seed = await seedDoubleEntryOrg(orgA, workspaceId, userId)
})

afterAll(async () => {
  await admin.end({ timeout: 5 })
})

/** A fresh DOCUMENT série with one configured period row (prefix/length/postfix). */
async function freshConfiguredSeries(
  periodId: string,
  cfg: { prefix: string; length: number; postfix: string },
): Promise<string> {
  return withOrganization(orgA, userId, async (db) => {
    const seriesId = await createNumberSeries(db, seed.ctx, {
      entityType: "DOCUMENT",
      code: `DS${++seq}`,
      pattern: `${cfg.prefix}{${"N".repeat(cfg.length)}}${cfg.postfix}`,
    })
    await createNumberSeriesPeriod(db, seed.ctx, {
      numberSeriesId: seriesId,
      periodId,
      numberLength: cfg.length,
      prefix: cfg.prefix,
      postfix: cfg.postfix,
    })
    return seriesId
  })
}

describe("number_series_period allocation", () => {
  it("advances the per-period counter gaplessly and formats prefix+pad+postfix", async () => {
    const series = await freshConfiguredSeries(seed.periodId, {
      prefix: "PF",
      length: 4,
      postfix: "/{YYYY}",
    })
    const a = await withOrganization(orgA, userId, (db) =>
      allocateNumber(db, series, "2026-03-01", "DOCUMENT", seed.periodId),
    )
    const b = await withOrganization(orgA, userId, (db) =>
      allocateNumber(db, series, "2026-03-01", "DOCUMENT", seed.periodId),
    )
    expect(a).toEqual({ sequenceNumber: 1, designation: "PF0001/2026" })
    expect(b).toEqual({ sequenceNumber: 2, designation: "PF0002/2026" })
  })

  it("previewNextNumber shows the next Označení without consuming it", async () => {
    const series = await freshConfiguredSeries(seed.periodId, {
      prefix: "VF",
      length: 5,
      postfix: "",
    })
    const preview = await withOrganization(orgA, userId, (db) =>
      previewNextNumber(db, series, "2026-06-01", seed.periodId),
    )
    expect(preview).toBe("VF00001")
    // The counter did not move: the next real allocation is still #1.
    const first = await withOrganization(orgA, userId, (db) =>
      allocateNumber(db, series, "2026-06-01", "DOCUMENT", seed.periodId),
    )
    expect(first.sequenceNumber).toBe(1)
  })

  it("restarts the counter per účetní období (widened uniqueness allows same seq across periods)", async () => {
    const period2025 = await withOrganization(orgA, userId, (db) =>
      createPeriod(db, seed.ctx, {
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        regimeCode: "DOUBLE_ENTRY",
        accountingCurrency: "CZK",
      }),
    )
    const series = await freshConfiguredSeries(seed.periodId, {
      prefix: "ID",
      length: 4,
      postfix: "/{YYYY}",
    })
    await withOrganization(orgA, userId, (db) =>
      createNumberSeriesPeriod(db, seed.ctx, {
        numberSeriesId: series,
        periodId: period2025,
        numberLength: 4,
        prefix: "ID",
        postfix: "/{YYYY}",
      }),
    )
    // Advance 2026 twice, then 2025 once: 2025 starts fresh at #1.
    await withOrganization(orgA, userId, (db) =>
      allocateNumber(db, series, "2026-03-01", "DOCUMENT", seed.periodId),
    )
    await withOrganization(orgA, userId, (db) =>
      allocateNumber(db, series, "2026-03-01", "DOCUMENT", seed.periodId),
    )
    const y2025 = await withOrganization(orgA, userId, (db) =>
      allocateNumber(db, series, "2025-11-01", "DOCUMENT", period2025),
    )
    expect(y2025).toEqual({ sequenceNumber: 1, designation: "ID0001/2025" })
  })

  it("falls back to the flat pattern for a DOCUMENT série with no period rows", async () => {
    const flatSeries = await withOrganization(orgA, userId, (db) =>
      createNumberSeries(db, seed.ctx, {
        entityType: "DOCUMENT",
        code: `FLAT${++seq}`,
        pattern: "XX{NNNN}",
      }),
    )
    // periodId supplied, but the série has no period row → flat path.
    const a = await withOrganization(orgA, userId, (db) =>
      allocateNumber(db, flatSeries, "2026-03-01", "DOCUMENT", seed.periodId),
    )
    expect(a).toEqual({ sequenceNumber: 1, designation: "XX0001" })
  })

  it("rejects allocation when the entity_type does not match the série", async () => {
    const series = await freshConfiguredSeries(seed.periodId, {
      prefix: "ZZ",
      length: 3,
      postfix: "",
    })
    await expect(
      withOrganization(orgA, userId, (db) =>
        allocateNumber(db, series, "2026-03-01", "EVENT", seed.periodId),
      ),
    ).rejects.toThrow(/not EVENT|has no dokladová řada|is DOCUMENT/)
  })
})

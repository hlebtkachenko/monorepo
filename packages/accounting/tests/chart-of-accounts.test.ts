/**
 * Chart of accounts (Účtový rozvrh) + year-based Účetní osnova (account directive) + prebuilt
 * house rozvrh template. Covers the single-source list reads, the three seed paths, the
 * year/tax/saldo threading, and tenant isolation. Real Postgres (testcontainer via globalSetup).
 */
import { beforeAll, describe, expect, it } from "vitest"
import { withOrganization, withOrgReadonly } from "@workspace/db"
import {
  adminClient,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
} from "./fixtures.js"
import {
  createChart,
  createPeriod,
  listAccounts,
  listChartTemplates,
  listChartTemplateAccounts,
  listDirectiveYear,
  resolveOsnovaYear,
  seedChartFromDirectives,
  seedChartFromTemplate,
} from "../src/index"
import type { OrgCtx } from "../src/index"

let workspaceId: string
let orgA: string
let orgB: string
let userA: string
let userB: string

beforeAll(async () => {
  const admin = adminClient()
  const seed = await seedTwoOrganizations(admin)
  workspaceId = seed.workspaceId
  orgA = seed.orgAId
  orgB = seed.orgBId
  userA = seed.userAId
  userB = seed.userBId
  await admin.end()
})

describe("listAccounts — the tenant Účtový rozvrh single-source read", () => {
  it("returns the seeded chart, sorted by number, with the tax_relevant column present", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userA)
    const rows = await withOrgReadonly(orgA, userA, (db) =>
      listAccounts(db, { periodId: s.periodId }),
    )
    expect(rows.length).toBeGreaterThan(10)
    const numbers = rows.map((r) => r.number)
    expect(numbers).toEqual([...numbers].sort())
    const acc311 = rows.find((r) => r.number === "311")
    expect(acc311?.tracks_open_items).toBe(true)
    expect(acc311).toHaveProperty("tax_relevant")
    // structural GENERATED columns project through
    expect(acc311?.class).toBe(3)
    expect(acc311?.is_synthetic).toBe(true)
  })

  it("filters by isSynthetic and by number", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userA)
    const one = await withOrgReadonly(orgA, userA, (db) =>
      listAccounts(db, { periodId: s.periodId, number: "311" }),
    )
    expect(one).toHaveLength(1)
    expect(one[0]?.number).toBe("311")
    const synth = await withOrgReadonly(orgA, userA, (db) =>
      listAccounts(db, { periodId: s.periodId, isSynthetic: true }),
    )
    expect(synth.every((r) => r.is_synthetic)).toBe(true)
  })
})

describe("Účetní osnova (account directive) — year-based reference read", () => {
  it("lists the 2026 osnova: synthetic-only, deprecated excluded, tax + statement lines present", async () => {
    const rows = await withOrgReadonly(orgA, userA, (db) =>
      listDirectiveYear(db, 2026),
    )
    expect(rows.length).toBeGreaterThan(200)
    // #6: the osnova NEVER holds analytics — every code is a 3-digit synthetic (no dot)
    expect(rows.every((r) => /^\d{3}$/.test(r.code))).toBe(true)
    // deprecated (e.g. 011 Zřizovací výdaje) excluded by default
    expect(rows.some((r) => r.code === "011")).toBe(false)
    // a saldokonto account carries the flag
    expect(rows.find((r) => r.code === "311")?.tracks_open_items).toBe(true)
    // an expense account carries the Daňový flag + a statement line
    const exp = rows.find((r) => r.code === "501")
    expect(exp?.tax_relevant).not.toBeNull()
    expect(exp?.income_statement_line).toBeTruthy()
  })

  it("resolveOsnovaYear falls back to the nearest published osnova", async () => {
    const future = await withOrganization(orgA, userA, (db) =>
      resolveOsnovaYear(db, 2099),
    )
    expect(future).toBe(2026)
    const past = await withOrganization(orgA, userA, (db) =>
      resolveOsnovaYear(db, 2000),
    )
    expect(past).toBe(2026) // earliest-published fallback
  })
})

describe("seedChartFromDirectives — start a chart from the osnova (#3)", () => {
  it("seeds the 2026 osnova into a bare chart with saldo + tax carried", async () => {
    const ctx: OrgCtx = { organizationId: orgB, workspaceId }
    const { periodId, count, rows } = await withOrganization(
      orgB,
      userB,
      async (db) => {
        const periodId = await createPeriod(db, ctx, {
          periodStart: "2026-01-01",
          periodEnd: "2026-12-31",
          regimeCode: "DOUBLE_ENTRY",
          accountingCurrency: "CZK",
        })
        const chartId = await createChart(db, ctx, { periodId })
        const count = await seedChartFromDirectives(db, ctx, {
          chartId,
          periodId,
          year: 2026,
        })
        const rows = await listAccounts(db, { periodId })
        return { periodId, count, rows }
      },
    )
    expect(count).toBeGreaterThan(200)
    expect(rows).toHaveLength(count)
    const acc311 = rows.find((r) => r.number === "311")
    expect(acc311?.tracks_open_items).toBe(true)
    expect(acc311?.specializes_directive_code).toBe("311")
    const exp = rows.find((r) => r.number === "501")
    expect(exp?.tax_relevant).not.toBeNull()
    void periodId
  })
})

describe("prebuilt house rozvrh template — start a chart from it (#4)", () => {
  it("lists the 2026 template + its accounts", async () => {
    const { templates, tplAccounts } = await withOrgReadonly(
      orgA,
      userA,
      async (db) => {
        const templates = await listChartTemplates(db, 2026)
        const money = templates.find((t) => t.code === "MONEY_2026")
        const tplAccounts = money
          ? await listChartTemplateAccounts(db, money.id)
          : []
        return { templates, tplAccounts }
      },
    )
    const money = templates.find((t) => t.code === "MONEY_2026")
    expect(money?.is_default).toBe(true)
    expect(tplAccounts.length).toBeGreaterThan(300)
  })

  it("seedChartFromTemplate materializes the template into a bare chart", async () => {
    const ctx: OrgCtx = { organizationId: orgB, workspaceId }
    const { count, rows } = await withOrganization(orgB, userB, async (db) => {
      const templates = await listChartTemplates(db, 2026)
      const money = templates.find((t) => t.code === "MONEY_2026")!
      const periodId = await createPeriod(db, ctx, {
        periodStart: "2027-01-01",
        periodEnd: "2027-12-31",
        regimeCode: "DOUBLE_ENTRY",
        accountingCurrency: "CZK",
      })
      const chartId = await createChart(db, ctx, { periodId })
      const count = await seedChartFromTemplate(db, ctx, {
        chartId,
        periodId,
        templateId: money.id,
      })
      const rows = await listAccounts(db, { periodId })
      return { count, rows }
    })
    expect(count).toBeGreaterThan(300)
    expect(rows).toHaveLength(count)
    // an oprávky account exists and every row carries the tax_relevant column
    expect(rows.some((r) => r.number === "082")).toBe(true)
    expect(rows.every((r) => "tax_relevant" in r)).toBe(true)
  })
})

describe("tenant isolation", () => {
  it("org A cannot see org B's chart accounts", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userA)
    // org B reads org A's period id → RLS yields nothing
    const leaked = await withOrgReadonly(orgB, userB, (db) =>
      listAccounts(db, { periodId: s.periodId }),
    )
    expect(leaked).toHaveLength(0)
  })
})

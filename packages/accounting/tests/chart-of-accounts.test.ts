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
  resolveFrameworkYear,
  seedChartFromDirectives,
  seedChartFromTemplate,
  updateAccount,
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
  it("lists the 2026 framework: synthetic-only, deprecated excluded, tax + statement lines present", async () => {
    const rows = await withOrgReadonly(orgA, userA, (db) =>
      listDirectiveYear(db, 2026),
    )
    expect(rows.length).toBeGreaterThan(200)
    // #6: the framework NEVER holds analytics — every code is a 3-digit synthetic (no dot)
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

  it("resolveFrameworkYear falls back to the nearest published framework", async () => {
    const future = await withOrganization(orgA, userA, (db) =>
      resolveFrameworkYear(db, 2099),
    )
    expect(future).toBe(2026)
    const past = await withOrganization(orgA, userA, (db) =>
      resolveFrameworkYear(db, 2000),
    )
    expect(past).toBe(2026) // earliest-published fallback
  })
})

describe("seedChartFromDirectives — start a chart from the framework (#3)", () => {
  it("seeds the 2026 framework into a bare chart with saldo + tax carried", async () => {
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

describe("updateAccount — edit the user-editable fields of one účet", () => {
  it("updates name + the two policy flags; structural columns stay immutable", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userA)
    const ctx: OrgCtx = { organizationId: orgA, workspaceId }
    const after = await withOrganization(orgA, userA, async (db) => {
      const id = await updateAccount(db, ctx, {
        id: s.accounts["311"]!,
        name: "Odběratelé (upravené)",
        tracksOpenItems: false,
        taxRelevant: true,
      })
      expect(id).toBe(s.accounts["311"])
      const [row] = await listAccounts(db, {
        periodId: s.periodId,
        number: "311",
      })
      return row
    })
    expect(after?.name).toBe("Odběratelé (upravené)")
    expect(after?.tracks_open_items).toBe(false)
    expect(after?.tax_relevant).toBe(true)
    // číslo + the GENERATED structural columns are untouched
    expect(after?.number).toBe("311")
    expect(after?.is_synthetic).toBe(true)
    expect(after?.nature).toBe("ASSET")
  })

  it("taxRelevant:null clears the flag (SET-list from present keys, not COALESCE)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userA)
    const ctx: OrgCtx = { organizationId: orgA, workspaceId }
    const id = s.accounts["504"]!
    const cleared = await withOrganization(orgA, userA, async (db) => {
      await updateAccount(db, ctx, { id, taxRelevant: true })
      const [set] = await listAccounts(db, {
        periodId: s.periodId,
        number: "504",
      })
      expect(set?.tax_relevant).toBe(true)
      // a null patch is a real value — it must overwrite, not be ignored
      await updateAccount(db, ctx, { id, taxRelevant: null })
      const [row] = await listAccounts(db, {
        periodId: s.periodId,
        number: "504",
      })
      return row
    })
    expect(cleared?.tax_relevant).toBeNull()
    // an untouched field (name) is left alone by the partial patch
    expect(cleared?.name).toBe("Prodané zboží")
  })

  it("throws on an empty patch and treats an immutable field as no field", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userA)
    const ctx: OrgCtx = { organizationId: orgA, workspaceId }
    await expect(
      withOrganization(orgA, userA, (db) =>
        updateAccount(db, ctx, { id: s.accounts["311"]! }),
      ),
    ).rejects.toThrow(/no editable fields/)
    // an immutable column is NOT a patchable field — the type rejects it AND, if
    // forced through, it is not counted, so the patch is still "empty".
    await expect(
      withOrganization(orgA, userA, (db) =>
        // @ts-expect-error — `nature` is derived/immutable, not part of the patch
        updateAccount(db, ctx, { id: s.accounts["311"]!, nature: "REVENUE" }),
      ),
    ).rejects.toThrow(/no editable fields/)
  })

  it("throws on a non-existent id", async () => {
    const ctx: OrgCtx = { organizationId: orgA, workspaceId }
    await expect(
      withOrganization(orgA, userA, (db) =>
        updateAccount(db, ctx, {
          id: "11111111-1111-1111-1111-111111111111",
          name: "ghost",
        }),
      ),
    ).rejects.toThrow(/not found/)
  })

  it("org B cannot update org A's account (RLS + organization_id predicate)", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userA)
    const targetId = s.accounts["311"]!
    // org B, scoped to its own GUC, targets org A's account id → zero rows → throws
    await expect(
      withOrganization(orgB, userB, (db) =>
        updateAccount(
          db,
          { organizationId: orgB, workspaceId },
          { id: targetId, name: "hijacked" },
        ),
      ),
    ).rejects.toThrow(/not found/)
    // org A's row is unchanged
    const still = await withOrgReadonly(orgA, userA, async (db) => {
      const [row] = await listAccounts(db, {
        periodId: s.periodId,
        number: "311",
      })
      return row
    })
    expect(still?.name).toBe("Odběratelé")
  })
})

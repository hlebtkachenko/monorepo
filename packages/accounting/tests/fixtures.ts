/**
 * Accounting v2 test fixtures. Reuses @workspace/db's canonical platform
 * fixtures (adminClient, seedTwoOrganizations) for the workspace / org / user
 * identities, then builds the účetní období + chart + number series through the
 * PUBLIC domain API, so tests exercise the same code paths as real callers
 * (app_user under RLS via withOrganization).
 */

import { withOrganization } from "@workspace/db"
import {
  createAccount,
  createChart,
  createNumberSeries,
  createPeriod,
} from "../src/index"
import type { AccountNature, DebitCredit, OrgCtx, Regime } from "../src/index"

export { adminClient, seedTwoOrganizations } from "@workspace/db/tests/fixtures"

/**
 * Monotonic per-seed suffix so the number_series `code` is unique per org (the
 * UNIQUE(org, entity_type, code) constraint) even when the same org is reused
 * across scenarios. The `pattern` — which drives the frozen Označení — is
 * unchanged, so designation assertions stay deterministic.
 */
let seedSeq = 0

/** Minimal KB-grounded chart for the demo/tests (synthetics only). */
const DEMO_COA: ReadonlyArray<{
  number: string
  name: string
  nature: AccountNature
  normalBalance: DebitCredit | null
  tracksOpenItems?: boolean
}> = [
  { number: "211", name: "Pokladna", nature: "ASSET", normalBalance: "DEBIT" },
  {
    number: "221",
    name: "Bankovní účty",
    nature: "ASSET",
    normalBalance: "DEBIT",
  },
  {
    number: "311",
    name: "Odběratelé",
    nature: "ASSET",
    normalBalance: "DEBIT",
    tracksOpenItems: true,
  },
  {
    number: "321",
    name: "Dodavatelé",
    nature: "LIABILITY",
    normalBalance: "CREDIT",
    tracksOpenItems: true,
  },
  { number: "343", name: "DPH", nature: "LIABILITY", normalBalance: "CREDIT" },
  {
    number: "082",
    name: "Oprávky k SHM",
    nature: "ASSET",
    normalBalance: "CREDIT",
  },
  {
    number: "504",
    name: "Prodané zboží",
    nature: "EXPENSE",
    normalBalance: "DEBIT",
  },
  {
    number: "518",
    name: "Ostatní služby",
    nature: "EXPENSE",
    normalBalance: "DEBIT",
  },
  {
    number: "548",
    name: "Ostatní provozní náklady",
    nature: "EXPENSE",
    normalBalance: "DEBIT",
  },
  { number: "551", name: "Odpisy", nature: "EXPENSE", normalBalance: "DEBIT" },
  {
    number: "563",
    name: "Kurzové ztráty",
    nature: "EXPENSE",
    normalBalance: "DEBIT",
  },
  {
    number: "602",
    name: "Tržby z služeb",
    nature: "REVENUE",
    normalBalance: "CREDIT",
  },
  {
    number: "604",
    name: "Tržby za zboží",
    nature: "REVENUE",
    normalBalance: "CREDIT",
  },
  {
    number: "663",
    name: "Kurzové zisky",
    nature: "REVENUE",
    normalBalance: "CREDIT",
  },
  {
    number: "428",
    name: "Nerozdělený zisk minulých let",
    nature: "EQUITY",
    normalBalance: "CREDIT",
  },
  {
    number: "431",
    name: "Výsledek hospodaření ve schvalování",
    nature: "EQUITY",
    normalBalance: "CREDIT",
  },
  {
    number: "701",
    name: "Počáteční účet rozvažný",
    nature: "CLOSING",
    normalBalance: null,
  },
  {
    number: "702",
    name: "Konečný účet rozvažný",
    nature: "CLOSING",
    normalBalance: null,
  },
  {
    number: "710",
    name: "Účet zisků a ztrát",
    nature: "CLOSING",
    normalBalance: null,
  },
]

export interface DoubleEntrySeed {
  ctx: OrgCtx
  userId: string
  periodId: string
  chartId: string
  eventSeriesId: string
  documentSeriesId: string
  /** number → account id */
  accounts: Record<string, string>
}

/** Seed a DOUBLE_ENTRY org with an open 2026 period, the demo chart, and 2 series. */
export async function seedDoubleEntryOrg(
  organizationId: string,
  workspaceId: string,
  userId: string,
  opts: { periodStart?: string; periodEnd?: string; currency?: string } = {},
): Promise<DoubleEntrySeed> {
  const ctx: OrgCtx = { organizationId, workspaceId }
  const tag = ++seedSeq
  return withOrganization(organizationId, userId, async (db) => {
    const periodId = await createPeriod(db, ctx, {
      periodStart: opts.periodStart ?? "2026-01-01",
      periodEnd: opts.periodEnd ?? "2026-12-31",
      regimeCode: "DOUBLE_ENTRY",
      accountingCurrency: opts.currency ?? "CZK",
    })
    const chartId = await createChart(db, ctx, { periodId })
    const accounts: Record<string, string> = {}
    for (const a of DEMO_COA) {
      accounts[a.number] = await createAccount(db, ctx, {
        chartId,
        periodId,
        number: a.number,
        name: a.name,
        nature: a.nature,
        normalBalance: a.normalBalance,
        tracksOpenItems: a.tracksOpenItems,
      })
    }
    const eventSeriesId = await createNumberSeries(db, ctx, {
      entityType: "EVENT",
      code: `EV${tag}`,
      pattern: "EV{YYYY}{NNNN}",
    })
    const documentSeriesId = await createNumberSeries(db, ctx, {
      entityType: "DOCUMENT",
      code: `FP${tag}`,
      pattern: "FP{YYYY}{NNNN}",
    })
    return {
      ctx,
      userId,
      periodId,
      chartId,
      eventSeriesId,
      documentSeriesId,
      accounts,
    }
  })
}

export interface CashSeed {
  ctx: OrgCtx
  userId: string
  periodId: string
  eventSeriesId: string
  documentSeriesId: string
  categories: Record<string, string>
}

/** Seed a SINGLE_ENTRY or TAX_RECORDS org with an open period + a few categories. */
export async function seedCashOrg(
  organizationId: string,
  workspaceId: string,
  userId: string,
  regime: Extract<Regime, "SINGLE_ENTRY" | "TAX_RECORDS">,
): Promise<CashSeed> {
  const ctx: OrgCtx = { organizationId, workspaceId }
  const tag = ++seedSeq
  const { createCategory } = await import("../src/index")
  return withOrganization(organizationId, userId, async (db) => {
    const periodId = await createPeriod(db, ctx, {
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      regimeCode: regime,
      accountingCurrency: "CZK",
    })
    const eventSeriesId = await createNumberSeries(db, ctx, {
      entityType: "EVENT",
      code: `EV${tag}`,
      pattern: "EV{NNNN}",
    })
    const documentSeriesId = await createNumberSeries(db, ctx, {
      entityType: "DOCUMENT",
      code: `PD${tag}`,
      pattern: "PD{NNNN}",
    })
    const categories: Record<string, string> = {
      sluzby: await createCategory(db, ctx, {
        type: "INCOME",
        name: "Tržby za služby",
      }),
      material: await createCategory(db, ctx, {
        type: "EXPENSE",
        name: "Materiál",
      }),
    }
    return {
      ctx,
      userId,
      periodId,
      eventSeriesId,
      documentSeriesId,
      categories,
    }
  })
}

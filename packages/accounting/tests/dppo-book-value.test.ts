/**
 * DPPO ř.10 ledger derivation — buildDppo derives the účetní výsledek PŘED
 * zdaněním from the read-model closing balances, excluding the účty the VZZ
 * reports below "** Výsledek hospodaření před zdaněním" (590/591/592/595/596 and
 * 599). Two regression guards: a booked 591 balance must NOT move ř.10 (it would
 * report VH po zdanění), and a 597 převod must still net against its 697
 * counterpart (excluding the whole skupina 59 would keep 697 and inflate ř.10).
 * Mirrors the standalone /vykazy path (apps/web/.../dppo-bridge.ts
 * deriveUcetniVysledek), which draws the same line.
 *
 * Runs against the PG18 testcontainer (globalSetup) as app_user under RLS via
 * withOrganization; the read-model rows are seeded through the admin client.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { withOrganization } from "@workspace/db"
import {
  adminClient,
  seedDoubleEntryOrg,
  seedTwoOrganizations,
} from "./fixtures.js"
import {
  buildDppo,
  createAccount,
  loadDppoAdjustments,
  saveDppoAdjustments,
  type DppoAdjustmentSaveInput,
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
  await admin`DELETE FROM dppo_annual_adjustment`
  await admin`DELETE FROM dppo_annual_taxpayer_category`
  await admin.end({ timeout: 5 })
})

/** Every §23–§35 adjustment answered as zero, so základ daně == ř.10. */
function zeroEntries(): DppoAdjustmentSaveInput["entries"] {
  const z = { amount: "0", reference: "0" }
  return {
    nonDeductibleExpenses: z,
    exemptRevenue: z,
    excludeLossMakingMainActivity: z,
    lossCarryForward: z,
    taxReliefs: z,
    advancesPaid: z,
  }
}

describe("buildDppo ř.10 (VH před zdaněním) from the ledger", () => {
  it("excludes the daň z příjmů (591) from the náklady sum", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId)

    // A 591 (daň z příjmů splatná) account is not in the demo chart — add one so
    // the read-model carries a booked income-tax expense. Booked on an ANALYTICAL
    // 591.001 on purpose: ř.10 is drawn on synthetic_code, so the analytika must
    // be caught exactly like its syntetický parent.
    const acc591 = await withOrganization(orgA, userId, async (db) => {
      const parent = await createAccount(db, s.ctx, {
        chartId: s.chartId,
        periodId: s.periodId,
        number: "591",
        name: "Daň z příjmů splatná",
        nature: "EXPENSE",
        normalBalance: "DEBIT",
      })
      return createAccount(db, s.ctx, {
        chartId: s.chartId,
        periodId: s.periodId,
        parentId: parent,
        number: "591.001",
        name: "Daň z příjmů splatná - běžná",
        nature: "EXPENSE",
        normalBalance: "DEBIT",
      })
    })

    // Seed the read-model: výnos 602 = 1 000 000, náklad 518 = 600 000,
    // daň 591 = 76 000. VH před zdaněním = 1 000 000 − 600 000 = 400 000; the
    // 591 tax is excluded. Without the skupina-59 fix it would be 324 000.
    await admin`
      INSERT INTO account_period_balance
        (organization_id, period_id, account_id, turnover_debit, turnover_credit)
      VALUES
        (${orgA}::uuid, ${s.periodId}::uuid, ${s.accounts["602"]}::uuid, 0, 1000000),
        (${orgA}::uuid, ${s.periodId}::uuid, ${s.accounts["518"]}::uuid, 600000, 0),
        (${orgA}::uuid, ${s.periodId}::uuid, ${acc591}::uuid, 76000, 0)
    `

    await withOrganization(orgA, userId, (db) =>
      saveDppoAdjustments(db, s.ctx, s.periodId, {
        taxpayerCategory: "STANDARD",
        entries: zeroEntries(),
      }),
    )

    const dppo = await withOrganization(orgA, userId, async (db) => {
      const input = await loadDppoAdjustments(db, s.periodId)
      return buildDppo(db, s.periodId, input)
    })

    // Both the header query (bookValues.accountingResult) and the worksheet CTE
    // (ucetni_vysledek → zaklad_dane) must agree at the before-tax figure.
    expect(dppo.ucetni_vysledek).toBe("400000.0000")
    expect(dppo.bookValues.accountingResult).toBe("400000.0000")
    expect(dppo.zaklad_dane).toBe("400000.0000")
  }, 30_000)

  it("keeps the převodové účty 597/598 so they net against 697/698", async () => {
    const s = await seedDoubleEntryOrg(orgA, workspaceId, userId)

    // 597 and 697 are both skupina-59-adjacent transfer accounts: 597 is an
    // EXPENSE in skupina 59, 697 a REVENUE in skupina 69. They always cancel, so
    // dropping the whole skupina 59 would keep the 697 výnos while losing its 597
    // counterpart and inflate ř.10 by the transfer amount.
    const [acc597, acc697] = await withOrganization(
      orgA,
      userId,
      async (db) => [
        await createAccount(db, s.ctx, {
          chartId: s.chartId,
          periodId: s.periodId,
          number: "597",
          name: "Převod provozních nákladů",
          nature: "EXPENSE",
          normalBalance: "DEBIT",
        }),
        await createAccount(db, s.ctx, {
          chartId: s.chartId,
          periodId: s.periodId,
          number: "697",
          name: "Převod provozních výnosů",
          nature: "REVENUE",
          normalBalance: "CREDIT",
        }),
      ],
    )

    // Same books as above minus the daň, plus a 50 000 převod on both sides:
    // VH = 1 000 000 + 50 000 − 600 000 − 50 000 = 400 000, unchanged by the
    // transfer. Excluding all of skupina 59 would report 450 000.
    await admin`
      INSERT INTO account_period_balance
        (organization_id, period_id, account_id, turnover_debit, turnover_credit)
      VALUES
        (${orgA}::uuid, ${s.periodId}::uuid, ${s.accounts["602"]}::uuid, 0, 1000000),
        (${orgA}::uuid, ${s.periodId}::uuid, ${s.accounts["518"]}::uuid, 600000, 0),
        (${orgA}::uuid, ${s.periodId}::uuid, ${acc597}::uuid, 50000, 0),
        (${orgA}::uuid, ${s.periodId}::uuid, ${acc697}::uuid, 0, 50000)
    `

    await withOrganization(orgA, userId, (db) =>
      saveDppoAdjustments(db, s.ctx, s.periodId, {
        taxpayerCategory: "STANDARD",
        entries: zeroEntries(),
      }),
    )

    const dppo = await withOrganization(orgA, userId, async (db) => {
      const input = await loadDppoAdjustments(db, s.periodId)
      return buildDppo(db, s.periodId, input)
    })

    expect(dppo.ucetni_vysledek).toBe("400000.0000")
    expect(dppo.bookValues.accountingResult).toBe("400000.0000")
  }, 30_000)
})

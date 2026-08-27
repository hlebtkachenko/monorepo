/**
 * The výkazy row drawer's three předvaha Server Actions (manual-entry plan
 * §3, W5), driven as the POSTs they are — mirrors `saldo-rows.db.test.ts`.
 *
 * PROVES THE ROUND TRIP THE PLAN'S §2.5 NAMES TWICE OVER: once published, a
 * manually-entered account is visible both through `trialBalanceLinesForBatch`
 * (the client Výkazy › Předvaha page's own read) AND through
 * `accountBalancesForScope` (Účty a hotovost, which reads `trial_balance_line`
 * through `account_balance_map` — spec §2.4's "zero extra entry").
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createAccountMappingRow,
  createImportBatchRow,
  createMonthPeriod,
  endFixtures,
  readImportBatchRow,
  seedOrganization,
  type TestOrganization,
} from "@/tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}))

const {
  addTrialBalanceLineRowAction,
  updateTrialBalanceLineRowAction,
  deleteTrialBalanceLineRowAction,
  publishBatchAction,
} = await import("./uzaverka")
const { requireOwner, requireScope } = await import("@/lib/data/scope")
const { trialBalanceLinesForBatch } = await import("@/lib/data/imports")
const { accountBalancesForScope } = await import("@/lib/data/account-balances")

const IDLE = { status: "idle" } as const
const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404"

function as(headers: Headers): void {
  request.headers = headers
}

function fd(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

async function expect404(
  run: () => Promise<unknown>,
  because: string,
): Promise<void> {
  let digest: unknown = "<no throw>"
  try {
    await run()
  } catch (error) {
    digest = (error as { digest?: unknown }).digest ?? error
  }
  expect(digest, because).toBe(NOT_FOUND_DIGEST)
}

async function ownerScope(org: TestOrganization) {
  as(org.members.owner.headers)
  return requireOwner(await requireScope(org.slug))
}

/** An empty draft předvaha batch — `startManualBatchAction`'s own state. */
async function draftPredvahaBatch(org: TestOrganization) {
  const owner = await ownerScope(org)
  const periodId = await createMonthPeriod(org.organizationId)
  const batchId = await createImportBatchRow(org.organizationId, periodId, {
    dataset: "predvaha",
    status: "draft",
    source: "manual",
    rowCount: 0,
  })
  return { owner, periodId, batchId }
}

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

describe("addTrialBalanceLineRowAction — owner only", () => {
  it("refuses every non-owner role", async () => {
    const { batchId } = await draftPredvahaBatch(org)

    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      await expect404(
        () =>
          addTrialBalanceLineRowAction(
            IDLE,
            fd({
              orgSlug: org.slug,
              batchId,
              accountCode: "221",
              accountName: "Bankovní účet",
            }),
          ),
        role,
      )
    }
  })
})

describe("field validation — resolved before the database ever sees the row", () => {
  it("refuses an empty accountCode", async () => {
    const { batchId } = await draftPredvahaBatch(org)
    await ownerScope(org)

    const state = await addTrialBalanceLineRowAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId, accountCode: "", accountName: "x" }),
    )
    expect(state).toEqual({
      status: "error",
      error: "vykazyZadani.rowErrorInvalidInput",
    })
  })

  it("refuses an empty accountName", async () => {
    const { batchId } = await draftPredvahaBatch(org)
    await ownerScope(org)

    const state = await addTrialBalanceLineRowAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId, accountCode: "221", accountName: "" }),
    )
    expect(state).toEqual({
      status: "error",
      error: "vykazyZadani.rowErrorInvalidInput",
    })
  })

  it("refuses a second row for the same account in the same batch", async () => {
    const { batchId } = await draftPredvahaBatch(org)
    await ownerScope(org)

    const first = await addTrialBalanceLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        accountCode: "221",
        accountName: "Bankovní účet",
      }),
    )
    expect(first.status).toBe("ok")

    const second = await addTrialBalanceLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        accountCode: "221",
        accountName: "Bankovní účet (duplicate)",
      }),
    )
    expect(second).toEqual({
      status: "error",
      error: "vykazyZadani.predvahaRowErrorDuplicate",
    })
  })
})

describe("the round trip", () => {
  it("adds, edits and removes a row, keeping row_count in step, and a publish surfaces it on trialBalanceLinesForBatch AND accountBalancesForScope", async () => {
    const { owner, batchId } = await draftPredvahaBatch(org)
    await createAccountMappingRow(org.organizationId, {
      accountCode: "221100",
      matchKind: "exact",
      label: "Běžný účet",
      kind: "bank",
    })

    const added = await addTrialBalanceLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        accountCode: "221100",
        accountName: "Bankovní účet CZK",
        closingBalance: "2128450.50",
      }),
    )
    expect(added).toEqual({
      status: "ok",
      message: "vykazyZadani.predvahaRowOkAdded",
    })

    let lines = await trialBalanceLinesForBatch(owner, batchId)
    expect(lines).toHaveLength(1)
    const rowId = lines[0]!.id
    expect((await readImportBatchRow(batchId)).row_count).toBe(1)

    const updated = await updateTrialBalanceLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        rowId,
        accountCode: "221100",
        accountName: "Bankovní účet CZK",
        closingBalance: "2200000.00",
      }),
    )
    expect(updated).toEqual({
      status: "ok",
      message: "vykazyZadani.predvahaRowOkUpdated",
    })

    lines = await trialBalanceLinesForBatch(owner, batchId)
    expect(lines[0]?.closingBalance).toBe("2200000.00")
    // Editing a row never touches row_count.
    expect((await readImportBatchRow(batchId)).row_count).toBe(1)

    // Publish, then prove BOTH derived read models surface the manual row.
    const published = await publishBatchAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId }),
    )
    expect(published.status).toBe("ok")

    const scope = await requireScope(org.slug)

    const publishedLines = await trialBalanceLinesForBatch(scope, batchId)
    expect(
      publishedLines.some(
        (line) =>
          line.accountCode === "221100" && line.closingBalance === "2200000.00",
      ),
    ).toBe(true)

    const accountBalances = await accountBalancesForScope(scope)
    const card = accountBalances.cards.find(
      (candidate) => candidate.accountCode === "221100",
    )
    expect(card?.closingBalance).toBe("2200000.00")

    // The batch is no longer a draft — every further row write is refused.
    const deleteAfterPublish = await deleteTrialBalanceLineRowAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId, rowId }),
    )
    expect(deleteAfterPublish).toEqual({
      status: "error",
      error: "vykazyZadani.predvahaRowErrorNotEditable",
    })
  })
})

describe("deleteTrialBalanceLineRowAction", () => {
  it("removes the row and decrements row_count", async () => {
    const { owner, batchId } = await draftPredvahaBatch(org)
    await addTrialBalanceLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        accountCode: "211",
        accountName: "Pokladna",
      }),
    )
    const [line] = await trialBalanceLinesForBatch(owner, batchId)
    expect((await readImportBatchRow(batchId)).row_count).toBe(1)

    const deleted = await deleteTrialBalanceLineRowAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId, rowId: line!.id }),
    )
    expect(deleted).toEqual({
      status: "ok",
      message: "vykazyZadani.predvahaRowOkDeleted",
    })
    expect(await trialBalanceLinesForBatch(owner, batchId)).toEqual([])
    expect((await readImportBatchRow(batchId)).row_count).toBe(0)
  })

  it("refuses an unknown row id", async () => {
    const { batchId } = await draftPredvahaBatch(org)
    await ownerScope(org)

    const state = await deleteTrialBalanceLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        rowId: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5fa",
      }),
    )
    expect(state).toEqual({
      status: "error",
      error: "vykazyZadani.predvahaRowErrorNotEditable",
    })
  })
})

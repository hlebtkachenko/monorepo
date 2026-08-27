/**
 * The výkazy row drawer's three statement Server Actions (manual-entry plan
 * §3, W5), driven as the POSTs they are — mirrors `saldo-rows.db.test.ts`'s
 * own reasoning: a Server Action is tested through `FormData` and a real
 * session, not by calling `lib/data/imports.ts` directly.
 *
 * PROVES THE ROUND TRIP THE PLAN'S §2.5 NAMES: once the batch is published,
 * `statementLinesForBatch` — the SAME read the client Výkazy pages call —
 * returns the manually-added row.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
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
  addStatementLineRowAction,
  updateStatementLineRowAction,
  deleteStatementLineRowAction,
  publishBatchAction,
} = await import("./uzaverka")
const { requireOwner, requireScope } = await import("@/lib/data/scope")
const { statementLinesForBatch } = await import("@/lib/data/imports")

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

/** An empty draft batch of a given statement dataset — `startManualBatchAction`'s own state. */
async function draftBatch(org: TestOrganization, dataset: "rozvaha" | "vzz") {
  const owner = await ownerScope(org)
  const periodId = await createMonthPeriod(org.organizationId)
  const batchId = await createImportBatchRow(org.organizationId, periodId, {
    dataset,
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

describe("addStatementLineRowAction — owner only", () => {
  it("refuses every non-owner role", async () => {
    const { batchId } = await draftBatch(org, "rozvaha")

    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      await expect404(
        () =>
          addStatementLineRowAction(
            IDLE,
            fd({
              orgSlug: org.slug,
              batchId,
              statementKind: "rozvaha_aktiva",
              rowCode: "001",
              rowLabel: "AKTIVA CELKEM",
              sortOrder: "1",
            }),
          ),
        role,
      )
    }
  })
})

describe("field validation — resolved before the database ever sees the row", () => {
  it("refuses an empty rowCode", async () => {
    const { batchId } = await draftBatch(org, "rozvaha")
    await ownerScope(org)

    const state = await addStatementLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        statementKind: "rozvaha_aktiva",
        rowCode: "",
        rowLabel: "AKTIVA CELKEM",
        sortOrder: "1",
      }),
    )
    expect(state).toEqual({
      status: "error",
      error: "vykazyZadani.rowErrorInvalidInput",
    })
  })

  it("refuses an unrecognised statementKind", async () => {
    const { batchId } = await draftBatch(org, "rozvaha")
    await ownerScope(org)

    const state = await addStatementLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        statementKind: "predvaha",
        rowCode: "001",
        rowLabel: "AKTIVA CELKEM",
        sortOrder: "1",
      }),
    )
    expect(state).toEqual({
      status: "error",
      error: "vykazyZadani.rowErrorInvalidInput",
    })
  })

  it("refuses a vzz statementKind inside a rozvaha batch — the trigger, wrapped as a sentence", async () => {
    const { batchId } = await draftBatch(org, "rozvaha")
    await ownerScope(org)

    const state = await addStatementLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        statementKind: "vzz",
        rowCode: "057",
        rowLabel: "Výsledek hospodaření",
        sortOrder: "1",
      }),
    )
    expect(state).toEqual({ status: "error", error: "uzaverka.errorRejected" })
  })

  it("refuses a second row with the same statementKind + rowCode in the same batch", async () => {
    const { batchId } = await draftBatch(org, "rozvaha")
    await ownerScope(org)

    const first = await addStatementLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        statementKind: "rozvaha_aktiva",
        rowCode: "001",
        rowLabel: "AKTIVA CELKEM",
        sortOrder: "1",
      }),
    )
    expect(first.status).toBe("ok")

    const second = await addStatementLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        statementKind: "rozvaha_aktiva",
        rowCode: "001",
        rowLabel: "AKTIVA CELKEM (duplicate)",
        sortOrder: "2",
      }),
    )
    expect(second).toEqual({
      status: "error",
      error: "vykazyZadani.rowErrorDuplicate",
    })
  })

  it("allows the same rowCode across aktiva and pasiva — identity is per kind", async () => {
    const { batchId } = await draftBatch(org, "rozvaha")
    await ownerScope(org)

    const aktiva = await addStatementLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        statementKind: "rozvaha_aktiva",
        rowCode: "001",
        rowLabel: "AKTIVA CELKEM",
        sortOrder: "1",
      }),
    )
    expect(aktiva.status).toBe("ok")

    const pasiva = await addStatementLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        statementKind: "rozvaha_pasiva",
        rowCode: "001",
        rowLabel: "PASIVA CELKEM",
        sortOrder: "2",
      }),
    )
    expect(pasiva.status).toBe("ok")
  })
})

describe("the round trip", () => {
  it("adds, edits and removes a row, keeping row_count in step, and a publish surfaces it on statementLinesForBatch", async () => {
    const { owner, batchId } = await draftBatch(org, "rozvaha")

    const added = await addStatementLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        statementKind: "rozvaha_aktiva",
        ozn: "B.II.",
        rowCode: "014",
        rowLabel: "Dlouhodobý hmotný majetek",
        sortOrder: "1",
        indent: "2",
        brutto: "150000.00",
        korekce: "50000.00",
        netto: "100000.00",
      }),
    )
    expect(added).toEqual({ status: "ok", message: "vykazyZadani.rowOkAdded" })

    let lines = await statementLinesForBatch(owner, batchId, {
      statementKind: "rozvaha_aktiva",
    })
    expect(lines).toHaveLength(1)
    const rowId = lines[0]!.id
    expect((await readImportBatchRow(batchId)).row_count).toBe(1)

    const updated = await updateStatementLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        rowId,
        statementKind: "rozvaha_aktiva",
        rowCode: "014",
        rowLabel: "Dlouhodobý hmotný majetek",
        sortOrder: "1",
        netto: "120000.00",
      }),
    )
    expect(updated).toEqual({
      status: "ok",
      message: "vykazyZadani.rowOkUpdated",
    })

    lines = await statementLinesForBatch(owner, batchId, {
      statementKind: "rozvaha_aktiva",
    })
    expect(lines[0]?.netto).toBe("120000.00")
    // Editing a row never touches row_count.
    expect((await readImportBatchRow(batchId)).row_count).toBe(1)

    // Publish, then prove the CLIENT's own read (`statementLinesForBatch`,
    // the same call the Výkazy pages make) surfaces the manual row.
    const published = await publishBatchAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId }),
    )
    expect(published.status).toBe("ok")

    const scope = await requireScope(org.slug)
    const publishedLines = await statementLinesForBatch(scope, batchId, {
      statementKind: "rozvaha_aktiva",
    })
    expect(
      publishedLines.some(
        (line) => line.rowCode === "014" && line.netto === "120000.00",
      ),
    ).toBe(true)

    // The batch is no longer a draft — every further row write is refused.
    const deleteAfterPublish = await deleteStatementLineRowAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId, rowId }),
    )
    expect(deleteAfterPublish).toEqual({
      status: "error",
      error: "vykazyZadani.rowErrorNotEditable",
    })
  })
})

describe("deleteStatementLineRowAction", () => {
  it("removes the row and decrements row_count", async () => {
    const { owner, batchId } = await draftBatch(org, "vzz")
    await addStatementLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        statementKind: "vzz",
        rowCode: "057",
        rowLabel: "Výsledek hospodaření",
        sortOrder: "1",
        bezne: "500000.00",
      }),
    )
    const [line] = await statementLinesForBatch(owner, batchId, {
      statementKind: "vzz",
    })
    expect((await readImportBatchRow(batchId)).row_count).toBe(1)

    const deleted = await deleteStatementLineRowAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId, rowId: line!.id }),
    )
    expect(deleted).toEqual({
      status: "ok",
      message: "vykazyZadani.rowOkDeleted",
    })
    expect(
      await statementLinesForBatch(owner, batchId, { statementKind: "vzz" }),
    ).toEqual([])
    expect((await readImportBatchRow(batchId)).row_count).toBe(0)
  })

  it("refuses an unknown row id", async () => {
    const { batchId } = await draftBatch(org, "vzz")
    await ownerScope(org)

    const state = await deleteStatementLineRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        rowId: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5fa",
      }),
    )
    expect(state).toEqual({
      status: "error",
      error: "vykazyZadani.rowErrorNotEditable",
    })
  })
})

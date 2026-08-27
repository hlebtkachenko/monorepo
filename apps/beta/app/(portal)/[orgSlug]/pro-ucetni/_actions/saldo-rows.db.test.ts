/**
 * The saldokonto row drawer's three Server Actions (manual-entry plan §3,
 * W2), driven as the POSTs they are — mirrors
 * `mzdy/_actions/employees.db.test.ts`'s own reasoning: a Server Action is
 * tested through `FormData` and a real session, not by calling
 * `lib/data/imports.ts` directly (already covered in `imports.test.ts`).
 *
 * PROVES THE ROUND TRIP THE PLAN'S W2 SECTION NAMES: once the batch is
 * published, BOTH `saldokontoForScope` (Finance › Pohledávky a závazky) AND
 * `obligationsForScope`'s `dodavatele` arm (Dluhy a platby) read back the
 * manually-added row — not merely that the action returned `"ok"`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createImportBatchRow,
  createMonthPeriod,
  createPartnerRow,
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
  addPartnerSaldoRowAction,
  updatePartnerSaldoRowAction,
  deletePartnerSaldoRowAction,
  publishBatchAction,
} = await import("./uzaverka")
const { requireOwner, requireScope } = await import("@/lib/data/scope")
const { partnerSaldoLinesForBatch } = await import("@/lib/data/imports")
const { saldokontoForScope } = await import("@/lib/data/partners")
const { obligationsForScope } = await import("@/lib/data/obligations")

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

/** An empty draft saldokonto batch, the exact state `startManualBatchAction` leaves. */
async function draftSaldoBatch(org: TestOrganization) {
  const owner = await ownerScope(org)
  const periodId = await createMonthPeriod(org.organizationId)
  const batchId = await createImportBatchRow(org.organizationId, periodId, {
    dataset: "saldokonto",
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

describe("addPartnerSaldoRowAction — owner only", () => {
  it("refuses every non-owner role", async () => {
    const { batchId } = await draftSaldoBatch(org)
    const partnerId = await createPartnerRow(org.organizationId)

    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role].headers)
      await expect404(
        () =>
          addPartnerSaldoRowAction(
            IDLE,
            fd({
              orgSlug: org.slug,
              batchId,
              partnerId,
              receivableTotal: "100",
            }),
          ),
        role,
      )
    }
  })
})

describe("field validation — resolved before the database ever sees the row", () => {
  it("refuses a row that states neither total", async () => {
    const { batchId } = await draftSaldoBatch(org)
    await ownerScope(org)
    const partnerId = await createPartnerRow(org.organizationId)

    const state = await addPartnerSaldoRowAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId, partnerId }),
    )
    expect(state).toEqual({
      status: "error",
      error: "uzaverka.saldoRowErrorStatesNothing",
    })
  })

  it("refuses a stated, non-zero payable with no oldest due date", async () => {
    const { batchId } = await draftSaldoBatch(org)
    await ownerScope(org)
    const partnerId = await createPartnerRow(org.organizationId)

    const state = await addPartnerSaldoRowAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId, partnerId, payableTotal: "500" }),
    )
    expect(state).toEqual({
      status: "error",
      error: "uzaverka.saldoRowErrorPayableNeedsOldestDue",
    })
  })

  it("allows a ZERO payable with no oldest due date — a settled supplier", async () => {
    const { batchId } = await draftSaldoBatch(org)
    await ownerScope(org)
    const partnerId = await createPartnerRow(org.organizationId)

    const state = await addPartnerSaldoRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        partnerId,
        payableTotal: "0.00",
        receivableTotal: "100",
      }),
    )
    expect(state.status).toBe("ok")
  })

  it("refuses a negative amount", async () => {
    const { batchId } = await draftSaldoBatch(org)
    await ownerScope(org)
    const partnerId = await createPartnerRow(org.organizationId)

    const state = await addPartnerSaldoRowAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId, partnerId, receivableTotal: "-100" }),
    )
    expect(state).toEqual({
      status: "error",
      error: "uzaverka.saldoRowErrorInvalidInput",
    })
  })

  it("refuses a second row for the same partner in the same batch", async () => {
    const { batchId } = await draftSaldoBatch(org)
    await ownerScope(org)
    const partnerId = await createPartnerRow(org.organizationId)

    const first = await addPartnerSaldoRowAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId, partnerId, receivableTotal: "100" }),
    )
    expect(first.status).toBe("ok")

    const second = await addPartnerSaldoRowAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId, partnerId, receivableTotal: "200" }),
    )
    expect(second).toEqual({
      status: "error",
      error: "uzaverka.saldoRowErrorDuplicate",
    })
  })
})

describe("the round trip", () => {
  it("adds, edits and removes a row, keeping row_count in step, and a publish surfaces it on both Pohledávky a závazky and the Dluhy dodavatele arm", async () => {
    const { owner, batchId } = await draftSaldoBatch(org)
    const partnerId = await createPartnerRow(org.organizationId, {
      name: "Round Trip s.r.o.",
    })

    const added = await addPartnerSaldoRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        partnerId,
        payableTotal: "1500.50",
        oldestDue: "2026-01-15",
      }),
    )
    expect(added).toEqual({ status: "ok", message: "uzaverka.saldoRowOkAdded" })

    let lines = await partnerSaldoLinesForBatch(owner, batchId)
    expect(lines).toHaveLength(1)
    const rowId = lines[0]!.id
    expect((await readImportBatchRow(batchId)).row_count).toBe(1)

    const updated = await updatePartnerSaldoRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        rowId,
        partnerId,
        payableTotal: "2000.00",
        oldestDue: "2026-02-01",
      }),
    )
    expect(updated).toEqual({
      status: "ok",
      message: "uzaverka.saldoRowOkUpdated",
    })

    lines = await partnerSaldoLinesForBatch(owner, batchId)
    expect(lines[0]?.payableTotal).toBe("2000.00")
    // Editing a row never touches row_count.
    expect((await readImportBatchRow(batchId)).row_count).toBe(1)

    // Publish, then prove BOTH derived read models surface the manual row.
    const published = await publishBatchAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId }),
    )
    expect(published.status).toBe("ok")

    const scope = await requireScope(org.slug)

    const saldokonto = await saldokontoForScope(scope)
    expect(
      saldokonto.rows.some(
        (row) => row.partnerId === partnerId && row.payableTotal === "2000.00",
      ),
    ).toBe(true)

    const obligations = await obligationsForScope(scope)
    expect(
      obligations.obligations.some(
        (obligation) =>
          obligation.group === "dodavatele" &&
          obligation.label === "Round Trip s.r.o." &&
          obligation.amount === "2000.00",
      ),
    ).toBe(true)

    // The batch is no longer a draft — every further row write is refused.
    const deleteAfterPublish = await deletePartnerSaldoRowAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId, rowId }),
    )
    expect(deleteAfterPublish).toEqual({
      status: "error",
      error: "uzaverka.saldoRowErrorNotEditable",
    })
  })
})

describe("deletePartnerSaldoRowAction", () => {
  it("removes the row and decrements row_count", async () => {
    const { owner, batchId } = await draftSaldoBatch(org)
    const partnerId = await createPartnerRow(org.organizationId)
    await addPartnerSaldoRowAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId, partnerId, receivableTotal: "100" }),
    )
    const [line] = await partnerSaldoLinesForBatch(owner, batchId)
    expect((await readImportBatchRow(batchId)).row_count).toBe(1)

    const deleted = await deletePartnerSaldoRowAction(
      IDLE,
      fd({ orgSlug: org.slug, batchId, rowId: line!.id }),
    )
    expect(deleted).toEqual({
      status: "ok",
      message: "uzaverka.saldoRowOkDeleted",
    })
    expect(await partnerSaldoLinesForBatch(owner, batchId)).toEqual([])
    expect((await readImportBatchRow(batchId)).row_count).toBe(0)
  })

  it("refuses an unknown row id", async () => {
    const { batchId } = await draftSaldoBatch(org)
    await ownerScope(org)

    const state = await deletePartnerSaldoRowAction(
      IDLE,
      fd({
        orgSlug: org.slug,
        batchId,
        rowId: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5fa",
      }),
    )
    expect(state).toEqual({
      status: "error",
      error: "uzaverka.saldoRowErrorNotEditable",
    })
  })
})

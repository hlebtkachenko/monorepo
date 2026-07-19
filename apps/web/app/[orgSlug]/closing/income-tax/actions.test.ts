/**
 * saveDppoAdjustmentsAction — stale-active-period write guard.
 *
 * Focused unit test: the action's collaborators (authorizeOrgAdmin,
 * getHeaderPeriods, the active-period cookie, withOrganization, revalidatePath)
 * are mocked so the equality guard is exercised directly, without a database or
 * a real session. `resolveActivePeriod` + `PERIOD_COOKIE` stay real — the guard
 * is only meaningful against the real cookie→period resolution.
 *
 * Contract under test: the server always resolves the target period itself; the
 * `expectedPeriodId` the dialog was rendered with is compared for equality only.
 * A multi-tab session that switched the active period out from under an open
 * dialog must be rejected (`stalePeriod`) with NO write, never retargeted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  authorizeOrgAdmin: vi.fn(),
  getHeaderPeriods: vi.fn(),
  cookieGet: vi.fn(),
  withOrganization: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("../../_lib/org-authz", () => ({
  authorizeOrgAdmin: mocks.authorizeOrgAdmin,
}))
vi.mock("@/lib/org/header-periods", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/org/header-periods")>()
  // Keep resolveActivePeriod + PERIOD_COOKIE real; only stub the DB read.
  return { ...actual, getHeaderPeriods: mocks.getHeaderPeriods }
})
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@workspace/db", () => ({ withOrganization: mocks.withOrganization }))

import { saveDppoAdjustmentsAction } from "./actions"
import type { DppoAdjustmentInput } from "./_lib/dppo-adjustment-form"

const ACTIVE_PERIOD_ID = "11111111-1111-1111-1111-111111111111"
const STALE_PERIOD_ID = "22222222-2222-2222-2222-222222222222"

const VALID_INPUT: DppoAdjustmentInput = {
  taxpayerCategory: "STANDARD",
  fields: {
    nonDeductibleExpenses: { amount: "", reference: "" },
    exemptRevenue: { amount: "", reference: "" },
    excludeLossMakingMainActivity: { amount: "", reference: "" },
    lossCarryForward: { amount: "", reference: "" },
    taxReliefs: { amount: "", reference: "" },
    advancesPaid: { amount: "", reference: "" },
  },
}

describe("saveDppoAdjustmentsAction — stale active period guard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Authenticated owner of the org.
    mocks.authorizeOrgAdmin.mockResolvedValue({
      userId: "user-1",
      ctx: {
        organizationId: "org-1",
        workspaceId: "ws-1",
        role: "owner",
      },
    })
    // The org has exactly one period; the cookie names it → it is active.
    mocks.getHeaderPeriods.mockResolvedValue([
      {
        id: ACTIVE_PERIOD_ID,
        period_start: "2026-01-01",
        period_end: "2026-12-31",
        status: "OPEN",
      },
    ])
    mocks.cookieGet.mockReturnValue({ value: ACTIVE_PERIOD_ID })
    mocks.withOrganization.mockResolvedValue(undefined)
  })

  it("rejects with stalePeriod and writes nothing when the dialog's period is not the active period", async () => {
    const result = await saveDppoAdjustmentsAction(
      "acme",
      STALE_PERIOD_ID,
      VALID_INPUT,
    )

    expect(result).toEqual({ ok: false, errorKey: "stalePeriod" })
    expect(mocks.withOrganization).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("proceeds to the write when the dialog's period matches the active period", async () => {
    const result = await saveDppoAdjustmentsAction(
      "acme",
      ACTIVE_PERIOD_ID,
      VALID_INPUT,
    )

    expect(result).toEqual({ ok: true })
    expect(mocks.withOrganization).toHaveBeenCalledTimes(1)
  })

  it("still rejects unauthenticated / non-admin callers before the period check", async () => {
    mocks.authorizeOrgAdmin.mockResolvedValue(null)

    const result = await saveDppoAdjustmentsAction(
      "acme",
      ACTIVE_PERIOD_ID,
      VALID_INPUT,
    )

    expect(result).toEqual({ ok: false, errorKey: "forbidden" })
    expect(mocks.getHeaderPeriods).not.toHaveBeenCalled()
    expect(mocks.withOrganization).not.toHaveBeenCalled()
  })
})

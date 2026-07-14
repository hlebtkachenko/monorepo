import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  PeriodCloseBlockedError,
  type PeriodCloseCheck,
  type PeriodCloseReadiness,
} from "@workspace/accounting"

const mocks = vi.hoisted(() => ({
  authorizeOrgAdmin: vi.fn(),
  loadPeriodCloseReadiness: vi.fn(),
  rollForwardOrgPeriod: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("../_lib/org-authz", () => ({
  authorizeOrgAdmin: mocks.authorizeOrgAdmin,
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("./_lib/settings-data", async (importActual) => {
  const actual = await importActual<typeof import("./_lib/settings-data")>()
  return {
    ...actual,
    loadPeriodCloseReadiness: mocks.loadPeriodCloseReadiness,
    rollForwardOrgPeriod: mocks.rollForwardOrgPeriod,
  }
})

import { loadPeriodCloseReadinessAction, rollForwardAction } from "./actions"

const PERIOD_ID = "11111111-1111-4111-8111-111111111111"

function makeReadiness(
  overrides: Partial<PeriodCloseReadiness> = {},
  checks: PeriodCloseCheck[] = [],
): PeriodCloseReadiness {
  return {
    periodId: PERIOD_ID,
    organizationId: "22222222-2222-4222-8222-222222222222",
    regimeCode: "DOUBLE_ENTRY",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    periodStatus: "OPEN",
    ready: true,
    checks,
    ...overrides,
  }
}

function periodCheck(
  code: "PERIOD_EXISTS" | "PERIOD_OPEN",
  status: "PASS" | "FAIL",
): PeriodCloseCheck {
  return {
    code,
    severity: "BLOCKER",
    status,
    label: code === "PERIOD_EXISTS" ? "Period exists" : "Period is open",
    message: status === "PASS" ? "Pass" : "Blocked",
  }
}

describe("period close settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authorizeOrgAdmin.mockResolvedValue({
      userId: "user-1",
      ctx: {
        organizationId: "org-1",
        workspaceId: "workspace-1",
        role: "owner",
      },
    })
  })

  it.each(["owner", "admin"] as const)(
    "%s can load readiness and request close",
    async (role) => {
      mocks.authorizeOrgAdmin.mockResolvedValue({
        userId: "user-1",
        ctx: {
          organizationId: "org-1",
          workspaceId: "workspace-1",
          role,
        },
      })
      const readiness = makeReadiness()
      mocks.loadPeriodCloseReadiness.mockResolvedValue(readiness)
      mocks.rollForwardOrgPeriod.mockResolvedValue({
        newPeriodId: "period-2",
        periodOutputId: "output-1",
      })

      await expect(
        loadPeriodCloseReadinessAction("acme", PERIOD_ID),
      ).resolves.toEqual({ ok: true, readiness })
      await expect(rollForwardAction("acme", PERIOD_ID)).resolves.toEqual({
        ok: true,
      })
      expect(mocks.revalidatePath).toHaveBeenCalledWith(
        "/acme/settings/periods",
      )
    },
  )

  it.each(["member", "agent", "guest"] as const)(
    "%s cannot load readiness or close",
    async () => {
      mocks.authorizeOrgAdmin.mockResolvedValue(null)

      await expect(
        loadPeriodCloseReadinessAction("acme", PERIOD_ID),
      ).resolves.toEqual({ ok: false, errorKey: "forbidden" })
      await expect(rollForwardAction("acme", PERIOD_ID)).resolves.toEqual({
        ok: false,
        errorKey: "forbidden",
      })
      expect(mocks.loadPeriodCloseReadiness).not.toHaveBeenCalled()
      expect(mocks.rollForwardOrgPeriod).not.toHaveBeenCalled()
    },
  )

  it("preserves structured blockers across the action boundary", async () => {
    const readiness = makeReadiness({ ready: false }, [
      periodCheck("PERIOD_EXISTS", "PASS"),
      periodCheck("PERIOD_OPEN", "PASS"),
      {
        code: "NO_UNPOSTED_CASES",
        severity: "BLOCKER",
        status: "FAIL",
        label: "All cases posted",
        message: "1 accounting case remains unposted.",
        count: 1,
        references: [{ id: "case-1", designation: "EV20260001" }],
      },
    ])
    mocks.rollForwardOrgPeriod.mockRejectedValue(
      new PeriodCloseBlockedError(readiness),
    )

    await expect(rollForwardAction("acme", PERIOD_ID)).resolves.toEqual({
      ok: false,
      errorKey: "closeBlocked",
      readiness,
    })
  })

  it.each([
    {
      expected: "periodNotFound",
      checks: [
        periodCheck("PERIOD_EXISTS", "FAIL"),
        periodCheck("PERIOD_OPEN", "FAIL"),
      ],
    },
    {
      expected: "periodClosed",
      checks: [
        periodCheck("PERIOD_EXISTS", "PASS"),
        periodCheck("PERIOD_OPEN", "FAIL"),
      ],
    },
  ] as const)("returns $expected distinctly", async ({ expected, checks }) => {
    const readiness = makeReadiness(
      {
        ready: false,
        periodStatus: expected === "periodClosed" ? "CLOSED" : null,
      },
      [...checks],
    )
    mocks.rollForwardOrgPeriod.mockRejectedValue(
      new PeriodCloseBlockedError(readiness),
    )

    const result = await rollForwardAction("acme", PERIOD_ID)

    expect(result).toEqual({ ok: false, errorKey: expected, readiness })
  })

  it("hides unexpected failures behind a safe result", async () => {
    mocks.rollForwardOrgPeriod.mockRejectedValue(
      new Error("database detail must not cross boundary"),
    )

    await expect(rollForwardAction("acme", PERIOD_ID)).resolves.toEqual({
      ok: false,
      errorKey: "rollForwardFailed",
    })
  })
})

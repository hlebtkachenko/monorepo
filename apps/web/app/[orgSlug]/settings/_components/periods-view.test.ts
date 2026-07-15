/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest"

import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  PeriodCloseCheck,
  PeriodCloseReadiness,
} from "@workspace/accounting"

const mocks = vi.hoisted(() => ({
  loadReadiness: vi.fn(),
  refresh: vi.fn(),
  rollForward: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))
vi.mock("../actions", () => ({
  loadPeriodCloseReadinessAction: mocks.loadReadiness,
  rollForwardAction: mocks.rollForward,
}))
vi.mock("@workspace/ui/components/sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

import { PeriodsView } from "./periods-view"

const PERIOD_ID = "11111111-1111-4111-8111-111111111111"
const PERIODS = [
  {
    id: PERIOD_ID,
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    status: "OPEN",
    regimeCode: "DOUBLE_ENTRY",
  },
]

const passingCheck: PeriodCloseCheck = {
  code: "PERIOD_EXISTS",
  severity: "BLOCKER",
  status: "PASS",
  label: "Period exists",
  message: "Period exists in this organization.",
}

const limitation: PeriodCloseCheck = {
  code: "FILING_COMPLETENESS",
  severity: "WARNING",
  status: "UNAVAILABLE",
  label: "Tax and payroll filings",
  message: "VAT and other filing completion is not verified.",
}

function makeReadiness(
  ready: boolean,
  checks: PeriodCloseCheck[],
): PeriodCloseReadiness {
  return {
    periodId: PERIOD_ID,
    organizationId: "22222222-2222-4222-8222-222222222222",
    regimeCode: "DOUBLE_ENTRY",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    periodStatus: "OPEN",
    ready,
    checks,
  }
}

function renderPeriods() {
  return render(
    React.createElement(PeriodsView, {
      slug: "acme",
      periods: PERIODS,
      canEdit: true,
    }),
  )
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: () => false,
  })
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: () => undefined,
  })
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: () => undefined,
  })
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: () => undefined,
  })
})

describe("PeriodsView close readiness", () => {
  it("shows safe blockers and disables confirmation", async () => {
    const user = userEvent.setup()
    mocks.loadReadiness.mockResolvedValue({
      ok: true,
      readiness: makeReadiness(false, [
        passingCheck,
        {
          code: "NO_UNPOSTED_CASES",
          severity: "BLOCKER",
          status: "FAIL",
          label: "All cases posted",
          message: "1 accounting case remains unposted.",
          count: 1,
          references: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              designation: "EV20260001",
            },
          ],
        },
        {
          code: "PENDING_BRAIN_PROPOSALS",
          severity: "BLOCKER",
          status: "FAIL",
          label: "Pending Brain proposals",
          message: "1 unresolved HELD Brain proposal targets this period.",
          count: 1,
          references: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              designation:
                "createAccountingEvent (44444444-4444-4444-8444-444444444444)",
            },
          ],
        },
        limitation,
      ]),
    })
    renderPeriods()

    await user.click(
      screen.getByRole("button", { name: "Roll period forward" }),
    )

    expect(await screen.findByText("All cases posted")).toBeInTheDocument()
    expect(screen.getByText("EV20260001")).toBeInTheDocument()
    expect(screen.getByText("Pending Brain proposals")).toBeInTheDocument()
    expect(
      screen.getByText(/createAccountingEvent \(44444444/),
    ).toBeInTheDocument()
    expect(screen.getByText("Tax and payroll filings")).toBeInTheDocument()
    expect(screen.getByText("Not verified")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Roll forward" })).toBeDisabled()
  })

  it("discloses limitations and enables a ready double-entry close", async () => {
    const user = userEvent.setup()
    mocks.loadReadiness.mockResolvedValue({
      ok: true,
      readiness: makeReadiness(true, [passingCheck, limitation]),
    })
    renderPeriods()

    await user.click(
      screen.getByRole("button", { name: "Roll period forward" }),
    )

    expect(
      await screen.findByText(
        /This creates closing entries, generates the period output/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "Passing available checks does not prove statutory filing readiness or a complete statutory year close.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Roll forward" })).toBeEnabled()
  })

  it("keeps the dialog open when the authoritative recheck finds a blocker", async () => {
    const user = userEvent.setup()
    const staleBlocker = makeReadiness(false, [
      passingCheck,
      {
        code: "NO_UNPOSTED_CASES",
        severity: "BLOCKER",
        status: "FAIL",
        label: "All cases posted",
        message: "A new unposted case blocks close.",
      },
      limitation,
    ])
    mocks.loadReadiness.mockResolvedValue({
      ok: true,
      readiness: makeReadiness(true, [passingCheck, limitation]),
    })
    mocks.rollForward.mockResolvedValue({
      ok: false,
      errorKey: "closeBlocked",
      readiness: staleBlocker,
    })
    renderPeriods()

    await user.click(
      screen.getByRole("button", { name: "Roll period forward" }),
    )
    await user.click(
      await screen.findByRole("button", { name: "Roll forward" }),
    )

    expect(
      await screen.findByText("A new unposted case blocks close."),
    ).toBeInTheDocument()
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Roll forward" })).toBeDisabled()
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Period close is blocked",
      expect.objectContaining({ description: expect.any(String) }),
    )
    await waitFor(() => expect(mocks.rollForward).toHaveBeenCalledTimes(1))
  })
})

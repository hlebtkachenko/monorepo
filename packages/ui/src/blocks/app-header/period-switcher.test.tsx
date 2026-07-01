import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { PeriodSwitcher, type AccountingPeriod } from "./period-switcher"

const PERIODS: AccountingPeriod[] = [
  { id: "2026", label: "01.2026 – 12.2026", closed: false },
  { id: "2025", label: "01.2025 – 12.2025", closed: true },
  { id: "2024", label: "01.2024 – 12.2024", closed: true },
]

const wrap = (
  props: Partial<React.ComponentProps<typeof PeriodSwitcher>> = {},
) =>
  render(<PeriodSwitcher periods={PERIODS} value="2026" {...props} />, {
    wrapper: IconProvider,
  })

describe("PeriodSwitcher", () => {
  it("shows the active period range on the trigger", () => {
    wrap()
    expect(
      screen.getByRole("button", { name: /switch accounting period/i }),
    ).toHaveTextContent(/01\.2026 – 12\.2026/)
  })

  it("uses the compact headerLabel on the trigger but the full label in the dropdown", async () => {
    const user = userEvent.setup()
    wrap({
      periods: [
        {
          id: "2026",
          label: "01.2026 – 12.2026",
          headerLabel: "2026",
          closed: false,
        },
      ],
    })
    const trigger = screen.getByRole("button", {
      name: /switch accounting period/i,
    })
    expect(trigger).toHaveTextContent("2026")
    expect(trigger).not.toHaveTextContent("01.2026")
    await user.click(trigger)
    expect(
      screen.getByRole("menuitem", { name: /01\.2026 – 12\.2026/ }),
    ).toBeInTheDocument()
  })

  it("drives the lock glyph from the closed flag (open = brand green, closed = muted)", async () => {
    const user = userEvent.setup()
    wrap() // PERIODS: 2026 open, 2025 + 2024 closed
    await user.click(
      screen.getByRole("button", { name: /switch accounting period/i }),
    )
    const open = screen.getByRole("menuitem", { name: /01\.2026 – 12\.2026/ })
    const closed = screen.getByRole("menuitem", { name: /01\.2025 – 12\.2025/ })
    // The leading glyph in each row is the lock state.
    expect(open.querySelector("svg")).toHaveClass("text-brand-primary-light")
    expect(closed.querySelector("svg")).toHaveClass("text-muted-foreground")
  })

  it("lists every period + an Add period action", async () => {
    const user = userEvent.setup()
    wrap()
    await user.click(
      screen.getByRole("button", { name: /switch accounting period/i }),
    )
    expect(
      screen.getByRole("menuitem", { name: /01\.2025 – 12\.2025/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("menuitem", { name: /add period/i }),
    ).toBeInTheDocument()
  })

  it("selecting a period fires onValueChange", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    wrap({ onValueChange })
    await user.click(
      screen.getByRole("button", { name: /switch accounting period/i }),
    )
    await user.click(
      screen.getByRole("menuitem", { name: /01\.2024 – 12\.2024/ }),
    )
    expect(onValueChange).toHaveBeenCalledWith("2024")
  })

  it("Add period fires onAddPeriod", async () => {
    const user = userEvent.setup()
    const onAddPeriod = vi.fn()
    wrap({ onAddPeriod })
    await user.click(
      screen.getByRole("button", { name: /switch accounting period/i }),
    )
    await user.click(screen.getByRole("menuitem", { name: /add period/i }))
    expect(onAddPeriod).toHaveBeenCalledOnce()
  })

  it("Manage periods fires onManagePeriods", async () => {
    const user = userEvent.setup()
    const onManagePeriods = vi.fn()
    wrap({ onManagePeriods })
    await user.click(
      screen.getByRole("button", { name: /switch accounting period/i }),
    )
    await user.click(screen.getByRole("menuitem", { name: /manage periods/i }))
    expect(onManagePeriods).toHaveBeenCalledOnce()
  })
})

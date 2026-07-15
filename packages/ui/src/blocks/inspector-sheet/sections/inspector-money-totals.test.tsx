import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { InspectorMoneyTotals } from "./inspector-money-totals"

describe("InspectorMoneyTotals", () => {
  it("renders each row label, note, and title", () => {
    render(
      <IconProvider>
        <InspectorMoneyTotals
          title="Totals"
          rows={[
            { label: "Subtotal", amount: 1000 },
            { label: "VAT 21%", amount: 210, note: "standard rate" },
            { label: "Total", amount: 1210, emphasis: true },
          ]}
        />
      </IconProvider>,
    )
    expect(screen.getByText("Totals")).toBeInTheDocument()
    expect(screen.getByText("Subtotal")).toBeInTheDocument()
    expect(screen.getByText("VAT 21%")).toBeInTheDocument()
    expect(screen.getByText("standard rate")).toBeInTheDocument()
    expect(screen.getByText("Total")).toBeInTheDocument()
  })

  it("is read-only — renders no inputs", () => {
    render(
      <IconProvider>
        <InspectorMoneyTotals
          rows={[{ label: "Total", amount: 100, emphasis: true }]}
        />
      </IconProvider>,
    )
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })
})

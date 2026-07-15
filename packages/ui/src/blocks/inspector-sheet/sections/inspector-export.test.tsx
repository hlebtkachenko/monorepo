import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { InspectorExport } from "./inspector-export"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

describe("InspectorExport", () => {
  it("renders the title, action buttons, and field toggles", () => {
    wrap(
      <InspectorExport
        fields={[
          { id: "header", label: "Header block" },
          { id: "lines", label: "Invoice lines" },
        ]}
      />,
    )
    expect(screen.getByRole("heading", { name: "Export" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument()
    expect(screen.getByText("Header block")).toBeInTheDocument()
    expect(screen.getByText("Invoice lines")).toBeInTheDocument()
  })

  it("fires Print and Export with the current format + checked fields", async () => {
    const user = userEvent.setup()
    const onPrint = vi.fn()
    const onExport = vi.fn()
    wrap(
      <InspectorExport
        fields={[
          { id: "header", label: "Header block" },
          { id: "lines", label: "Invoice lines", defaultChecked: false },
        ]}
        onPrint={onPrint}
        onExport={onExport}
      />,
    )
    await user.click(screen.getByRole("button", { name: "Print" }))
    expect(onPrint).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Export" }))
    expect(onExport).toHaveBeenCalledWith("pdf", ["header"])
  })

  it("keeps Send disabled until an email is typed", async () => {
    const user = userEvent.setup()
    const onSendEmail = vi.fn()
    wrap(<InspectorExport onSendEmail={onSendEmail} />)
    const send = screen.getByRole("button", { name: "Send" })
    expect(send).toBeDisabled()

    await user.type(screen.getByPlaceholderText("name@example.com"), "a@b.cz")
    expect(send).toBeEnabled()
    await user.click(send)
    expect(onSendEmail).toHaveBeenCalledWith("a@b.cz", "pdf")
  })
})

import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { InspectorSheet } from "./inspector-sheet"
import type { InspectorFlagValue } from "./inspector-flag-picker"
import type { InspectorTab } from "./inspector-rail"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

function Harness({
  initialTab = "details",
  content,
}: {
  initialTab?: InspectorTab
  content?: Partial<Record<InspectorTab, React.ReactNode>>
}) {
  const [name, setName] = React.useState("Acme Corp")
  const [flag, setFlag] = React.useState<InspectorFlagValue>({ tone: "none" })
  const [tab, setTab] = React.useState<InspectorTab>(initialTab)

  return (
    <InspectorSheet
      breadcrumb={["Contacts", "Companies"]}
      onCopy={vi.fn()}
      onSwitchLayout={vi.fn()}
      onClose={vi.fn()}
      name={name}
      onNameChange={setName}
      flag={flag}
      onFlagChange={setFlag}
      activeTab={tab}
      onTabChange={setTab}
      content={content}
    />
  )
}

describe("InspectorSheet", () => {
  it("renders header breadcrumb, name, and rail", () => {
    wrap(<Harness />)
    expect(screen.getByText("Contacts")).toBeInTheDocument()
    expect(screen.getByText("Companies")).toBeInTheDocument()
    expect(screen.getByText("Acme Corp")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Details" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Activity" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Related" })).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Attachments" }),
    ).toBeInTheDocument()
  })

  it("rail is w-12 fixed", () => {
    const { container } = wrap(<Harness />)
    const rail = container.querySelector('[data-slot="inspector-rail"]')
    expect(rail).toHaveClass("w-12")
  })

  it("header copy dropdown fires with the chosen target", async () => {
    const onCopy = vi.fn()
    const user = userEvent.setup()
    wrap(
      <InspectorSheet
        breadcrumb={["A", "B"]}
        onCopy={onCopy}
        name="x"
        onNameChange={vi.fn()}
        flag={{ tone: "none" }}
        onFlagChange={vi.fn()}
      />,
    )
    await user.click(screen.getByRole("button", { name: "Copy" }))
    await user.click(await screen.findByRole("menuitem", { name: "Copy ID" }))
    expect(onCopy).toHaveBeenCalledWith("id")
  })

  it("disables header actions with no handler", () => {
    wrap(
      <InspectorSheet
        breadcrumb={["A", "B"]}
        name="x"
        onNameChange={vi.fn()}
        flag={{ tone: "none" }}
        onFlagChange={vi.fn()}
      />,
    )
    expect(
      screen.getByRole("button", { name: "Close inspector" }),
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Switch layout" })).toBeDisabled()
  })

  it("defaults to details and each rail tab swaps in its own content", () => {
    wrap(
      <Harness
        content={{
          details: <div>Details body</div>,
          activity: <div>Activity body</div>,
          related: <div>Related body</div>,
          attachments: <div>Attachments body</div>,
        }}
      />,
    )
    // details is the default
    expect(screen.getByText("Details body")).toBeInTheDocument()

    // every tab shows only its own content
    for (const [tab, body] of [
      ["Activity", "Activity body"],
      ["Related", "Related body"],
      ["Attachments", "Attachments body"],
      ["Details", "Details body"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: tab }))
      expect(screen.getByText(body)).toBeInTheDocument()
      for (const other of [
        "Details body",
        "Activity body",
        "Related body",
        "Attachments body",
      ]) {
        if (other !== body)
          expect(screen.queryByText(other)).not.toBeInTheDocument()
      }
    }
  })

  it("Edit reveals the name input; Done returns it to text", () => {
    wrap(<Harness />)
    expect(screen.queryByDisplayValue("Acme Corp")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    expect(screen.getByDisplayValue("Acme Corp")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.getByText("Acme Corp")).toBeInTheDocument()
  })

  it("caps the name input at 120 chars and shows a used/max counter", () => {
    wrap(<Harness />) // seeded name "Acme Corp" (9 chars)
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    const input = screen.getByDisplayValue("Acme Corp")
    expect(input).toHaveAttribute("maxlength", "120")
    expect(screen.getByText("9/120")).toBeInTheDocument()
    fireEvent.change(input, { target: { value: "AB" } })
    expect(screen.getByText("2/120")).toBeInTheDocument()
  })

  it("commits a trimmed non-empty name on Enter (stays in edit mode)", () => {
    wrap(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    const input = screen.getByDisplayValue("Acme Corp")
    fireEvent.change(input, { target: { value: "  New Name  " } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(screen.getByDisplayValue("New Name")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.getByText("New Name")).toBeInTheDocument()
  })

  it("reverts an empty name back to the saved value on blur", () => {
    wrap(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    const input = screen.getByDisplayValue("Acme Corp")
    fireEvent.change(input, { target: { value: "   " } })
    fireEvent.blur(input)
    expect(screen.getByDisplayValue("Acme Corp")).toBeInTheDocument()
  })

  it("renders an optional status badge next to the name", () => {
    wrap(
      <InspectorSheet
        breadcrumb={["A", "B"]}
        name="Acme"
        onNameChange={vi.fn()}
        flag={{ tone: "none" }}
        onFlagChange={vi.fn()}
        badge={{ label: "Draft", variant: "secondary" }}
      />,
    )
    expect(screen.getByText("Draft")).toBeInTheDocument()
  })

  it("renders an optional footer whose buttons fire decline/approve", () => {
    const onDecline = vi.fn()
    const onApprove = vi.fn()
    wrap(
      <InspectorSheet
        breadcrumb={["A", "B"]}
        name="Acme"
        onNameChange={vi.fn()}
        flag={{ tone: "none" }}
        onFlagChange={vi.fn()}
        footer={{
          declineLabel: "Reject",
          approveLabel: "Approve",
          onDecline,
          onApprove,
        }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Reject" }))
    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    expect(onDecline).toHaveBeenCalledTimes(1)
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it("flag menu lists tone choices and selects one", async () => {
    const user = userEvent.setup()
    wrap(<Harness />)
    await user.click(screen.getByRole("button", { name: "Flag" }))
    expect(screen.getByText("None")).toBeInTheDocument()
    expect(screen.getByText("Red")).toBeInTheDocument()
    await user.click(screen.getByText("Red"))
    const trigger = screen.getByRole("button", { name: "Flag" })
    expect(trigger).toBeInTheDocument()
    const icon = trigger.querySelector('[data-flag-state="filled"]')
    expect(icon).not.toBeNull()
    expect(icon).toHaveClass("fill-current")
    expect(icon).toHaveClass("text-destructive")
  })
})

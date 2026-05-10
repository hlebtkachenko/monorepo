import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import {
  ActionBar,
  ActionBarClose,
  ActionBarGroup,
  ActionBarItem,
  ActionBarSelection,
  ActionBarSeparator,
} from "./action-bar"

describe("ActionBar", () => {
  it("renders when open", () => {
    render(
      <ActionBar open>
        <ActionBarGroup>
          <ActionBarItem>Copy</ActionBarItem>
        </ActionBarGroup>
      </ActionBar>,
    )
    expect(screen.getByRole("toolbar")).toBeInTheDocument()
  })

  it("does not render when closed", () => {
    render(
      <ActionBar open={false}>
        <ActionBarGroup>
          <ActionBarItem>Copy</ActionBarItem>
        </ActionBarGroup>
      </ActionBar>,
    )
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument()
  })

  it("renders items as buttons", () => {
    render(
      <ActionBar open>
        <ActionBarGroup>
          <ActionBarItem>Edit</ActionBarItem>
          <ActionBarItem>Delete</ActionBarItem>
        </ActionBarGroup>
      </ActionBar>,
    )
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument()
  })

  it("renders selection text", () => {
    render(
      <ActionBar open>
        <ActionBarGroup>
          <ActionBarSelection>3 selected</ActionBarSelection>
        </ActionBarGroup>
      </ActionBar>,
    )
    expect(screen.getByText("3 selected")).toBeInTheDocument()
  })

  it("renders separator", () => {
    render(
      <ActionBar open>
        <ActionBarGroup>
          <ActionBarItem>Copy</ActionBarItem>
          <ActionBarSeparator data-testid="sep" />
          <ActionBarItem>Delete</ActionBarItem>
        </ActionBarGroup>
      </ActionBar>,
    )
    expect(screen.getByTestId("sep")).toHaveAttribute("role", "separator")
  })

  it("calls onOpenChange(false) when close is clicked", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <ActionBar open onOpenChange={onOpenChange}>
        <ActionBarGroup>
          <ActionBarClose>X</ActionBarClose>
        </ActionBarGroup>
      </ActionBar>,
    )
    await user.click(screen.getByText("X"))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("calls onSelect when item is clicked", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <ActionBar open>
        <ActionBarGroup>
          <ActionBarItem onSelect={onSelect}>Copy</ActionBarItem>
        </ActionBarGroup>
      </ActionBar>,
    )
    await user.click(screen.getByRole("button", { name: "Copy" }))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it("disables item when disabled prop is set", () => {
    render(
      <ActionBar open>
        <ActionBarGroup>
          <ActionBarItem disabled>Locked</ActionBarItem>
        </ActionBarGroup>
      </ActionBar>,
    )
    expect(screen.getByRole("button", { name: "Locked" })).toBeDisabled()
  })
})

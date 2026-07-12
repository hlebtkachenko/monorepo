import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { Inspector } from "./inspector"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

describe("Inspector", () => {
  it("renders nothing when closed", () => {
    const { container } = wrap(
      <Inspector open={false}>
        <div>detail</div>
      </Inspector>,
    )
    expect(
      container.querySelector('[data-slot="content-inspector"]'),
    ).toBeNull()
    expect(screen.queryByText("detail")).not.toBeInTheDocument()
  })

  it("renders nothing when open but no children", () => {
    const { container } = wrap(<Inspector open>{null}</Inspector>)
    expect(
      container.querySelector('[data-slot="content-inspector"]'),
    ).toBeNull()
  })

  it("panel mode renders a docked aside with the title and no dialog", () => {
    const { container } = wrap(
      <Inspector open mode="panel" title="FP-2026-0001">
        <div>detail body</div>
      </Inspector>,
    )
    expect(
      container.querySelector('[data-slot="content-inspector"]'),
    ).not.toBeNull()
    expect(screen.getByText("detail body")).toBeInTheDocument()
    expect(screen.getByText("FP-2026-0001")).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows a close button only when onOpenChange is wired, and fires false", () => {
    const onOpenChange = vi.fn()
    const { rerender } = wrap(
      <Inspector open mode="panel" title="t">
        <div>b</div>
      </Inspector>,
    )
    expect(
      screen.queryByRole("button", { name: /close inspector/i }),
    ).not.toBeInTheDocument()
    rerender(
      <Inspector open mode="panel" title="t" onOpenChange={onOpenChange}>
        <div>b</div>
      </Inspector>,
    )
    fireEvent.click(screen.getByRole("button", { name: /close inspector/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("dialog mode renders a modal, not the docked aside", () => {
    wrap(
      <Inspector open mode="dialog" title="FP-2026-0001">
        <div>detail body</div>
      </Inspector>,
    )
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("detail body")).toBeInTheDocument()
    expect(document.querySelector('[data-slot="content-inspector"]')).toBeNull()
  })
})

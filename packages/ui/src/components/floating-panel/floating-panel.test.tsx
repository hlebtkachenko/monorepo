import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Button } from "@workspace/ui/components/button"
import {
  FloatingPanel,
  FloatingPanelBody,
  FloatingPanelContent,
  FloatingPanelControl,
  FloatingPanelHeader,
  FloatingPanelMinimize,
  FloatingPanelTitle,
  FloatingPanelTrigger,
} from "./floating-panel"

function renderPanel(props?: React.ComponentProps<typeof FloatingPanel>) {
  return render(
    <FloatingPanel defaultOpen {...props}>
      <FloatingPanelTrigger asChild>
        <Button>Open</Button>
      </FloatingPanelTrigger>
      <FloatingPanelContent>
        <FloatingPanelHeader>
          <FloatingPanelTitle>Panel title</FloatingPanelTitle>
          <FloatingPanelControl>
            <FloatingPanelMinimize />
          </FloatingPanelControl>
        </FloatingPanelHeader>
        <FloatingPanelBody>
          <p>Panel body content</p>
        </FloatingPanelBody>
      </FloatingPanelContent>
    </FloatingPanel>,
  )
}

describe("FloatingPanel", () => {
  it("renders trigger and panel title when open", () => {
    renderPanel()
    expect(screen.getByText("Open")).toBeInTheDocument()
    expect(screen.getByText("Panel title")).toBeInTheDocument()
  })

  it("renders the minimize control", () => {
    renderPanel()
    expect(screen.getByRole("button", { name: "Minimize" })).toBeInTheDocument()
  })

  it("transitions to minimized stage when minimize is clicked", async () => {
    const user = userEvent.setup()
    renderPanel()
    const minimizeButton = screen.getByRole("button", { name: "Minimize" })
    await user.click(minimizeButton)
    const panel = document.querySelector('[data-slot="floating-panel-content"]')
    expect(panel?.hasAttribute("data-minimized")).toBe(true)
  })
})

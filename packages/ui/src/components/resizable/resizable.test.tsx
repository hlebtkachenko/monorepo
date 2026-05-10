import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./resizable"

describe("Resizable", () => {
  it("renders panel group", () => {
    render(
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={50}>
          <div>Left</div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50}>
          <div>Right</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    )
    expect(screen.getByText("Left")).toBeInTheDocument()
    expect(screen.getByText("Right")).toBeInTheDocument()
  })

  it("renders resize handle", () => {
    render(
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={50}>
          <div>Panel A</div>
        </ResizablePanel>
        <ResizableHandle aria-label="resize" />
        <ResizablePanel defaultSize={50}>
          <div>Panel B</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    )
    expect(screen.getByRole("separator")).toBeInTheDocument()
  })
})

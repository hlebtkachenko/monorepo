import * as React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { ColorPicker } from "./color-picker"

function Harness({ initial = "#007AFF" }: { initial?: string }) {
  const [color, setColor] = React.useState(initial)
  return <ColorPicker color={color} onChange={setColor} />
}

describe("ColorPicker", () => {
  it("renders the trigger with the current color value", () => {
    render(<Harness />)
    expect(screen.getByText("#007AFF")).toBeInTheDocument()
  })

  it("opens the popover when trigger is clicked", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button"))
    expect(await screen.findByLabelText("Hue")).toBeInTheDocument()
  })

  it("calls onChange when a preset is selected", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ColorPicker color="#007AFF" onChange={onChange} />)
    await user.click(screen.getByRole("button"))
    const presets = await screen.findAllByLabelText(/Select color/i)
    await user.click(presets[0]!)
    expect(onChange).toHaveBeenCalled()
  })
})

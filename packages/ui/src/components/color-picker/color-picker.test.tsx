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

  it("updates the color when dragging in the saturation/value area", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ColorPicker color="#007AFF" onChange={onChange} />)
    await user.click(screen.getByRole("button"))

    const area = await screen.findByRole("presentation")
    Object.defineProperty(area, "getBoundingClientRect", {
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 200,
        bottom: 160,
        width: 200,
        height: 160,
        toJSON: () => ({}),
      }),
    })
    ;(
      area as HTMLElement & { setPointerCapture?: (id: number) => void }
    ).setPointerCapture = () => {}
    ;(
      area as HTMLElement & { releasePointerCapture?: (id: number) => void }
    ).releasePointerCapture = () => {}
    ;(
      area as HTMLElement & { hasPointerCapture?: (id: number) => boolean }
    ).hasPointerCapture = () => true

    onChange.mockClear()

    area.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 50,
        clientY: 40,
        pointerId: 1,
        button: 0,
      }),
    )
    expect(onChange).toHaveBeenCalled()

    onChange.mockClear()

    area.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: 150,
        clientY: 120,
        pointerId: 1,
      }),
    )
    expect(onChange).toHaveBeenCalled()

    area.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        clientX: 150,
        clientY: 120,
        pointerId: 1,
      }),
    )
  })
})

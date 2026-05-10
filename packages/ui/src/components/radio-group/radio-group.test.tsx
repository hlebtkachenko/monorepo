import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect } from "vitest"
import { RadioGroup, RadioGroupItem } from "./radio-group"

describe("RadioGroup", () => {
  it("renders with radiogroup role", () => {
    render(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" id="a" />
        <RadioGroupItem value="b" id="b" />
      </RadioGroup>
    )
    expect(screen.getByRole("radiogroup")).toBeInTheDocument()
  })

  it("renders radio items", () => {
    render(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" id="a" />
        <RadioGroupItem value="b" id="b" />
      </RadioGroup>
    )
    const radios = screen.getAllByRole("radio")
    expect(radios).toHaveLength(2)
  })

  it("selects item on click", async () => {
    const user = userEvent.setup()
    render(
      <RadioGroup defaultValue="a">
        <RadioGroupItem value="a" id="a" />
        <RadioGroupItem value="b" id="b" />
      </RadioGroup>
    )
    const radioB = screen.getAllByRole("radio")[1]!
    await user.click(radioB)
    expect(radioB).toBeChecked()
  })
})

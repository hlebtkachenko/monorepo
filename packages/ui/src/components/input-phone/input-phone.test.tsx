import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { PhoneInput, PhoneInputCountry, PhoneInputField } from "./input-phone"

function Composed(props: React.ComponentProps<typeof PhoneInput>) {
  return (
    <PhoneInput {...props}>
      <PhoneInputCountry />
      <PhoneInputField />
    </PhoneInput>
  )
}

describe("PhoneInput", () => {
  it("renders the country trigger and tel input", () => {
    render(<Composed defaultCountry="US" />)
    const tel = screen.getByRole("textbox")
    expect(tel).toBeInTheDocument()
    expect(tel).toHaveAttribute("type", "tel")
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0)
  })

  it("calls onValueChange with normalized E.164-ish value on typing", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Composed defaultCountry="US" onValueChange={onValueChange} />)

    const tel = screen.getByRole("textbox")
    await user.type(tel, "+14155552671")

    expect(onValueChange).toHaveBeenCalled()
    const last = onValueChange.mock.calls.at(-1)?.[0]
    expect(last).toBe("+14155552671")
  })

  it("renders disabled state", () => {
    render(<Composed disabled defaultCountry="DE" />)
    const tel = screen.getByRole("textbox") as HTMLInputElement
    expect(tel).toBeDisabled()
  })
})

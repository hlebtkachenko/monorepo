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
    // Opt out of the default country, so a full international number lands
    // verbatim without a dial code being pre-loaded.
    render(<Composed defaultCountry="" onValueChange={onValueChange} />)

    const tel = screen.getByRole("textbox")
    await user.type(tel, "+14155552671")

    expect(onValueChange).toHaveBeenCalled()
    const last = onValueChange.mock.calls.at(-1)?.[0]
    expect(last).toBe("+14155552671")
  })

  it("defaults the country to Czechia (+420)", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Composed onValueChange={onValueChange} />)

    await user.type(screen.getByRole("textbox"), "777")

    expect(onValueChange).toHaveBeenLastCalledWith("+420777")
  })

  it("auto-loads the default country dial code on the first digit typed", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Composed defaultCountry="DE" onValueChange={onValueChange} />)

    const tel = screen.getByRole("textbox")
    // Typing the local part loads +49 in front of it.
    await user.type(tel, "1511234")

    expect(onValueChange).toHaveBeenLastCalledWith("+491511234")
  })

  it("keeps the first typed digit even when it equals the dial code's leading digit", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Composed defaultCountry="DE" onValueChange={onValueChange} />)

    const tel = screen.getByRole("textbox")
    // "4" is also the first digit of +49, but it is the user's national number
    // and must not be swallowed: the code is prepended, the digit is kept.
    await user.type(tel, "4")

    expect(onValueChange).toHaveBeenLastCalledWith("+494")
  })

  it("a leading + lets the user type a foreign code instead of forcing the default dial", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    // Default is Czechia (+420); starting with "+" opts into a manual number.
    render(<Composed onValueChange={onValueChange} />)

    await user.type(screen.getByRole("textbox"), "+49")

    // No forced +420 prefix — the typed international code lands verbatim.
    expect(onValueChange).toHaveBeenLastCalledWith("+49")
  })

  it("rewrites the dial code (keeping the local part) when a country is picked", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Composed value="+420777123456" onValueChange={onValueChange} />)

    // Open the country popover and pick Germany.
    await user.click(screen.getAllByRole("button")[0]!)
    const germany = await screen.findByText("Germany")
    await user.click(germany)

    // +420 (CZ) -> +49 (DE), local part 777123456 preserved.
    expect(onValueChange).toHaveBeenLastCalledWith("+49777123456")
  })

  it("renders disabled state", () => {
    render(<Composed disabled defaultCountry="DE" />)
    const tel = screen.getByRole("textbox") as HTMLInputElement
    expect(tel).toBeDisabled()
  })
})

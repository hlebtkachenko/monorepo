import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createRef } from "react"
import { describe, it, expect, vi } from "vitest"
import { PasswordInput } from "./password-input"

describe("PasswordInput", () => {
  it("renders input with type password by default", () => {
    render(<PasswordInput />)
    // type="password" inputs have no ARIA role — query the DOM element directly
    const input = document.querySelector("input")
    expect(input).toHaveAttribute("type", "password")
  })

  it("toggles to type text when eye button is clicked", async () => {
    const user = userEvent.setup()
    render(<PasswordInput />)
    const input = document.querySelector("input")!
    expect(input).toHaveAttribute("type", "password")

    const toggle = screen.getByRole("button", { name: "Show password" })
    await user.click(toggle)

    expect(input).toHaveAttribute("type", "text")
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toBeInTheDocument()
  })

  it("toggling back hides password again", async () => {
    const user = userEvent.setup()
    render(<PasswordInput />)
    const input = document.querySelector("input")!

    await user.click(screen.getByRole("button", { name: "Show password" }))
    await user.click(screen.getByRole("button", { name: "Hide password" }))

    expect(input).toHaveAttribute("type", "password")
    expect(
      screen.getByRole("button", { name: "Show password" }),
    ).toBeInTheDocument()
  })

  it("generate button calls onGenerate with an Apple-style grouped string", async () => {
    const user = userEvent.setup()
    const onGenerate = vi.fn()
    render(
      <PasswordInput
        showGenerate
        onGenerate={onGenerate}
        onValueChange={() => {}}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Generate password" }))

    expect(onGenerate).toHaveBeenCalledOnce()
    const generated = onGenerate.mock.lastCall![0] as string
    // 18 chars + 2 hyphens (three groups of six)
    expect(generated).toHaveLength(20)
    expect(generated.split("-")).toHaveLength(3)
    expect(generated.split("-").every((g) => g.length === 6)).toBe(true)
  })

  it("generated string contains digit, symbol, uppercase and lowercase", async () => {
    const user = userEvent.setup()
    const collected: string[] = []

    // Collect 50 passwords — the combined corpus is overwhelmingly likely to
    // contain every character class even if any individual 16-char draw misses one.
    for (let i = 0; i < 50; i++) {
      const onGenerate = vi.fn()
      const { unmount } = render(
        <PasswordInput
          showGenerate
          onGenerate={onGenerate}
          onValueChange={() => {}}
        />,
      )
      await user.click(
        screen.getByRole("button", { name: "Generate password" }),
      )
      collected.push(onGenerate.mock.lastCall![0] as string)
      unmount()
    }

    const corpus = collected.join("")
    expect(corpus).toMatch(/[0-9]/)
    expect(corpus).toMatch(/[!@#$%^&*]/)
    expect(corpus).toMatch(/[A-Z]/)
    expect(corpus).toMatch(/[a-z]/)
  })

  it("forwardRef wires to the underlying input element", () => {
    const ref = createRef<HTMLInputElement>()
    render(<PasswordInput ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it("calls onValueChange when user types", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<PasswordInput value="" onValueChange={onValueChange} />)
    await user.type(document.querySelector("input")!, "abc")
    expect(onValueChange).toHaveBeenCalled()
  })
})

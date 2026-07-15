import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, it, expect, vi } from "vitest"
import { ThemeToggle } from "./theme-toggle"

describe("ThemeToggle", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("renders toggle buttons", () => {
    render(<ThemeToggle />)
    const buttons = screen.getAllByRole("button")
    expect(buttons.length).toBe(3)
  })

  // Regression for #749/#750: Safari with cookies/storage blocked throws a
  // "Can't find variable: localStorage" ReferenceError on any bare
  // `localStorage` access — both the mount effect (read) and the density
  // toggle handler (write) must swallow it.
  it("does not throw when localStorage access is blocked", () => {
    const blocked = () => {
      throw new Error("The operation is insecure.")
    }
    vi.stubGlobal("localStorage", {
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
      clear: () => {},
    })

    expect(() => render(<ThemeToggle />)).not.toThrow()

    // Buttons render order: [0] color-theme menu, [1] density toggle, [2] mode.
    // Clicking density persists to localStorage, which throws when blocked.
    const [, densityButton] = screen.getAllByRole("button")
    if (!densityButton) throw new Error("density button not found")
    expect(() => fireEvent.click(densityButton)).not.toThrow()
  })
})

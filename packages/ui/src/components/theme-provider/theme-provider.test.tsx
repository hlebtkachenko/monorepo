import { render, screen } from "@testing-library/react"
import { afterEach, describe, it, expect, vi } from "vitest"
import { ThemeProvider } from "./theme-provider"

describe("ThemeProvider", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("renders children", () => {
    render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>,
    )
    expect(screen.getByText("Content")).toBeInTheDocument()
  })

  // Regression for #749/#750: Safari with cookies/storage blocked throws a
  // "Can't find variable: localStorage" ReferenceError on any bare
  // `localStorage` access. ColorThemeRestorer's mount effect ran app-wide, so
  // the throw escaped to window.onerror on every page load. The effect must
  // swallow it.
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

    expect(() =>
      render(
        <ThemeProvider>
          <div>Content</div>
        </ThemeProvider>,
      ),
    ).not.toThrow()
    expect(screen.getByText("Content")).toBeInTheDocument()
  })
})

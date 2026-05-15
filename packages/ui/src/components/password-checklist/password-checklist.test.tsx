import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { PASSWORD_RULES } from "@workspace/shared/auth"
import { PasswordChecklist } from "./password-checklist"

const labels = {
  length: "At least 12 characters",
  number: "Contains a number",
  symbol: "Contains a symbol",
  mixedCase: "Mix of upper & lower",
}

describe("PasswordChecklist", () => {
  it("renders one row per PASSWORD_RULES entry", () => {
    render(<PasswordChecklist value="" labels={labels} />)
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(PASSWORD_RULES.length)
  })

  it("renders all label strings", () => {
    render(<PasswordChecklist value="" labels={labels} />)
    expect(screen.getByText("At least 12 characters")).toBeInTheDocument()
    expect(screen.getByText("Contains a number")).toBeInTheDocument()
    expect(screen.getByText("Contains a symbol")).toBeInTheDocument()
    expect(screen.getByText("Mix of upper & lower")).toBeInTheDocument()
  })

  it("empty value — all rows show Circle (invalid)", () => {
    render(<PasswordChecklist value="" labels={labels} />)
    const items = screen.getAllByRole("listitem")
    items.forEach((item) => {
      expect(item.className).toContain("text-muted-foreground")
    })
  })

  it("fully valid password — all rows show Check (passing)", () => {
    render(<PasswordChecklist value="Str0ng!Password" labels={labels} />)
    const items = screen.getAllByRole("listitem")
    items.forEach((item) => {
      expect(item.className).toContain("text-foreground")
      expect(item.className).not.toContain("text-muted-foreground")
    })
  })

  it("partial password — some passing, some failing", () => {
    // "Password1" passes mixedCase + number, fails length + symbol
    render(<PasswordChecklist value="Password1" labels={labels} />)
    const items = screen.getAllByRole("listitem")
    const passing = items.filter(
      (i) =>
        i.className.includes("text-foreground") &&
        !i.className.includes("text-muted-foreground"),
    )
    const failing = items.filter((i) =>
      i.className.includes("text-muted-foreground"),
    )
    expect(passing.length).toBeGreaterThan(0)
    expect(failing.length).toBeGreaterThan(0)
  })

  it("has aria-live polite on the list", () => {
    render(<PasswordChecklist value="" labels={labels} />)
    expect(screen.getByRole("list")).toHaveAttribute("aria-live", "polite")
  })
})

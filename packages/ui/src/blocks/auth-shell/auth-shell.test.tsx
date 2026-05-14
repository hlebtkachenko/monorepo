import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { AuthShell } from "./auth-shell"

describe("AuthShell", () => {
  it("renders all slots", () => {
    render(
      <AuthShell>
        <div className="flex flex-col">
          <AuthShell.Header>
            <span>Logo</span>
          </AuthShell.Header>
          <AuthShell.Body>
            <p>Body content</p>
          </AuthShell.Body>
          <AuthShell.Footer>
            <span>Footer text</span>
          </AuthShell.Footer>
        </div>
        <AuthShell.Aside>
          <span>Aside content</span>
        </AuthShell.Aside>
      </AuthShell>,
    )

    expect(screen.getByText("Logo")).toBeInTheDocument()
    expect(screen.getByText("Body content")).toBeInTheDocument()
    expect(screen.getByText("Footer text")).toBeInTheDocument()
    expect(screen.getByText("Aside content")).toBeInTheDocument()
  })

  it("renders back link when backHref is provided", () => {
    render(
      <AuthShell>
        <div className="flex flex-col">
          <AuthShell.Header backHref="/home" backLabel="Back to home">
            <span>Logo</span>
          </AuthShell.Header>
          <AuthShell.Body>
            <p>Content</p>
          </AuthShell.Body>
          <AuthShell.Footer />
        </div>
      </AuthShell>,
    )

    const link = screen.getByRole("link", { name: /back to home/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "/home")
  })

  it("does not render back link when backHref is omitted", () => {
    render(
      <AuthShell>
        <div className="flex flex-col">
          <AuthShell.Header>
            <span>Logo</span>
          </AuthShell.Header>
          <AuthShell.Body>
            <p>Content</p>
          </AuthShell.Body>
          <AuthShell.Footer />
        </div>
      </AuthShell>,
    )

    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("uses default back label when only backHref is provided", () => {
    render(
      <AuthShell>
        <div className="flex flex-col">
          <AuthShell.Header backHref="/go-back">
            <span>Logo</span>
          </AuthShell.Header>
          <AuthShell.Body>
            <p>Content</p>
          </AuthShell.Body>
          <AuthShell.Footer />
        </div>
      </AuthShell>,
    )

    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute(
      "href",
      "/go-back",
    )
  })

  it("renders the root element with auth-shell slot", () => {
    const { container } = render(
      <AuthShell>
        <div />
      </AuthShell>,
    )

    expect(container.querySelector("[data-slot='auth-shell']")).toBeTruthy()
  })
})

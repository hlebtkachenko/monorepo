import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  BRAND_PRIVACY_URL,
  BRAND_STATUS_URL,
  BRAND_TERMS_URL,
} from "@workspace/ui/brand-assets"

import {
  AuthShellChromeAside,
  AuthShellChromeFooter,
} from "./auth-shell-chrome"

const LABELS = { privacy: "Privacy", terms: "Terms", status: "Status" }

describe("AuthShellChromeFooter", () => {
  it("renders the © line with brand, current year, and version", () => {
    render(
      <AuthShellChromeFooter
        brand="Afframe"
        version="v0.2.0"
        labels={LABELS}
      />,
    )
    const year = new Date().getFullYear()
    expect(screen.getByText(`© ${year} Afframe. v0.2.0`)).toBeInTheDocument()
  })

  it("wires the three links to the BRAND_* URLs", () => {
    render(
      <AuthShellChromeFooter brand="Afframe" version="dev" labels={LABELS} />,
    )
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      BRAND_PRIVACY_URL,
    )
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      BRAND_TERMS_URL,
    )
    expect(screen.getByRole("link", { name: "Status" })).toHaveAttribute(
      "href",
      BRAND_STATUS_URL,
    )
  })

  it("renders the trailing slot and applies the xs size", () => {
    const { container } = render(
      <AuthShellChromeFooter
        brand="Afframe"
        version="dev"
        labels={LABELS}
        size="xs"
      >
        <span>EN</span>
      </AuthShellChromeFooter>,
    )
    expect(screen.getByText("EN")).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass("text-xs")
  })
})

describe("AuthShellChromeAside", () => {
  it("renders headline, subtitle, quote, and the labeled partner marquee", () => {
    render(
      <AuthShellChromeAside
        image=""
        headline="Headline"
        subtitle="Subtitle"
        quote={{ text: "Quote text", author: "Author", role: "Role" }}
        partnersLabel="Partners of Afframe"
      />,
    )
    expect(screen.getByText("Headline")).toBeInTheDocument()
    expect(screen.getByText("Subtitle")).toBeInTheDocument()
    expect(screen.getByText("Quote text")).toBeInTheDocument()
    expect(screen.getByText("Author")).toBeInTheDocument()
    expect(screen.getByLabelText("Partners of Afframe")).toBeInTheDocument()
  })
})

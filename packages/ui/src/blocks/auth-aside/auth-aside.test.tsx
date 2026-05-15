import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { AuthAside, AuthAsideLogoMarquee, type LogoItem } from "./auth-aside"

describe("AuthAside", () => {
  it("renders with default photo variant", () => {
    const { container } = render(
      <AuthAside image="/bg.webp">
        <AuthAside.Headline>Hello</AuthAside.Headline>
      </AuthAside>,
    )

    const aside = container.querySelector("[data-slot='auth-aside']")
    expect(aside).toBeTruthy()
    expect(aside).toHaveAttribute("data-variant", "photo")
  })

  it("switches variant via data attribute — dark", () => {
    const { container } = render(
      <AuthAside variant="dark">
        <span>dark</span>
      </AuthAside>,
    )

    expect(container.querySelector("[data-variant='dark']")).toBeTruthy()
  })

  it("switches variant via data attribute — tone", () => {
    const { container } = render(
      <AuthAside variant="tone">
        <span>tone</span>
      </AuthAside>,
    )

    expect(container.querySelector("[data-variant='tone']")).toBeTruthy()
  })

  it("applies supplied image as background-image via CSS custom property", () => {
    const { container } = render(
      <AuthAside variant="photo" image="/auth-bg.webp">
        <span>content</span>
      </AuthAside>,
    )

    const aside = container.querySelector(
      "[data-slot='auth-aside']",
    ) as HTMLElement
    expect(aside.style.getPropertyValue("--auth-aside-image")).toContain(
      "/auth-bg.webp",
    )
  })

  it("does not apply image style when variant is not photo", () => {
    const { container } = render(
      <AuthAside variant="dark" image="/auth-bg.webp">
        <span>content</span>
      </AuthAside>,
    )

    const aside = container.querySelector(
      "[data-slot='auth-aside']",
    ) as HTMLElement
    expect(aside.style.getPropertyValue("--auth-aside-image")).toBe("")
  })

  it("renders headline, subtitle, quote, and logo marquee slots", () => {
    const logos: LogoItem[] = [
      { src: "/logo-a.svg", alt: "Logo A" },
      { src: "/logo-b.svg", alt: "Logo B" },
    ]

    render(
      <AuthAside variant="photo" image="/bg.webp">
        <AuthAside.Headline>The headline</AuthAside.Headline>
        <AuthAside.Subtitle>The subtitle</AuthAside.Subtitle>
        <AuthAside.Quote author="Alice" role="Engineer">
          Great product.
        </AuthAside.Quote>
        <AuthAside.LogoMarquee logos={logos} />
      </AuthAside>,
    )

    expect(screen.getByText("The headline")).toBeInTheDocument()
    expect(screen.getByText("The subtitle")).toBeInTheDocument()
    expect(screen.getByText("Great product.")).toBeInTheDocument()
    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(screen.getByText(/Engineer/)).toBeInTheDocument()
  })

  it("renders role=complementary on aside element", () => {
    render(
      <AuthAside variant="dark">
        <span>content</span>
      </AuthAside>,
    )

    expect(screen.getByRole("complementary")).toBeInTheDocument()
  })
})

describe("AuthAsideLogoMarquee", () => {
  it("renders N logo items", () => {
    const logos: LogoItem[] = [
      { src: "/a.svg", alt: "Alpha" },
      { src: "/b.svg", alt: "Beta" },
      { src: "/c.svg", alt: "Gamma" },
    ]

    render(<AuthAsideLogoMarquee logos={logos} />)

    // Marquee repeats children — we check at least one instance per logo
    const alphaImgs = screen.getAllByAltText("Alpha")
    expect(alphaImgs.length).toBeGreaterThanOrEqual(1)

    const betaImgs = screen.getAllByAltText("Beta")
    expect(betaImgs.length).toBeGreaterThanOrEqual(1)

    const gammaImgs = screen.getAllByAltText("Gamma")
    expect(gammaImgs.length).toBeGreaterThanOrEqual(1)
  })

  it("renders nothing when logos array is empty", () => {
    const { container } = render(<AuthAsideLogoMarquee logos={[]} />)
    expect(container.firstChild).toBeNull()
  })
})

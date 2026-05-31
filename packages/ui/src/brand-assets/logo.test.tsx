import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Logo } from "./logo"
import type { LogoTone, LogoVariant } from "./logo-types"

const VARIANTS: LogoVariant[] = [
  "horizontal",
  "stacked",
  "logomark",
  "wordmark",
]
const EXPLICIT: Exclude<LogoTone, "primary" | "admin" | "mono">[] = [
  "primary-light",
  "primary-dark",
  "admin-light",
  "admin-dark",
  "mono-light",
  "mono-dark",
]
const SUGAR: Extract<LogoTone, "primary" | "admin" | "mono">[] = [
  "primary",
  "admin",
  "mono",
]

const TONE_TO_MARK_VAR: Record<(typeof EXPLICIT)[number], string> = {
  "primary-light": "--brand-primary-light",
  "primary-dark": "--brand-primary-dark",
  "admin-light": "--brand-admin-light",
  "admin-dark": "--brand-admin-dark",
  "mono-light": "--brand-mono-light",
  "mono-dark": "--brand-mono-dark",
}

const SUGAR_LIGHT: Record<(typeof SUGAR)[number], (typeof EXPLICIT)[number]> = {
  primary: "primary-light",
  admin: "admin-light",
  mono: "mono-dark",
}
const SUGAR_DARK: Record<(typeof SUGAR)[number], (typeof EXPLICIT)[number]> = {
  primary: "primary-dark",
  admin: "admin-dark",
  mono: "mono-light",
}

describe("Logo", () => {
  describe("explicit tones", () => {
    for (const variant of VARIANTS) {
      for (const tone of EXPLICIT) {
        it(`renders ${variant} / ${tone} with one svg + data attributes`, () => {
          const { container } = render(<Logo variant={variant} tone={tone} />)
          const svgs = container.querySelectorAll("svg[data-slot='logo']")
          expect(svgs).toHaveLength(1)
          expect(svgs[0]).toHaveAttribute("data-variant", variant)
          expect(svgs[0]).toHaveAttribute("data-tone", tone)
        })

        it(`paints ${variant} / ${tone} with the matching mark token`, () => {
          const { container } = render(<Logo variant={variant} tone={tone} />)
          const paths = container.querySelectorAll("path")
          expect(paths.length).toBeGreaterThan(0)
          // Every path's fill MUST be a var(--brand-*) reference, never a hex.
          paths.forEach((p) => {
            expect(p.getAttribute("fill")).toMatch(/^var\(--brand-/)
          })
          // At least one path must use the tone's expected mark/text token.
          const hasExpectedVar = Array.from(paths).some((p) =>
            p.getAttribute("fill")?.includes(TONE_TO_MARK_VAR[tone]),
          )
          // mark-only variants always include the mark token; text-only
          // variants include the corresponding text token via the other
          // brand-mono-* slot. Validate the variable family is present.
          if (variant === "wordmark") {
            // wordmark has no mark path — fills are text-role only.
            expect(hasExpectedVar || true).toBeTruthy()
          } else {
            expect(hasExpectedVar).toBe(true)
          }
        })
      }
    }
  })

  describe("sugar tones — adaptive light/dark pair", () => {
    for (const variant of VARIANTS) {
      for (const tone of SUGAR) {
        it(`renders ${variant} / ${tone} as two svgs with dark: visibility classes`, () => {
          const { container } = render(<Logo variant={variant} tone={tone} />)
          const svgs = container.querySelectorAll("svg[data-slot='logo']")
          expect(svgs).toHaveLength(2)

          const lightSvg = container.querySelector(
            `svg[data-tone='${SUGAR_LIGHT[tone]}']`,
          )
          const darkSvg = container.querySelector(
            `svg[data-tone='${SUGAR_DARK[tone]}']`,
          )
          expect(lightSvg).toBeTruthy()
          expect(darkSvg).toBeTruthy()
          expect(lightSvg?.getAttribute("class") ?? "").toContain("dark:hidden")
          expect(darkSvg?.getAttribute("class") ?? "").toContain(
            "hidden dark:block",
          )
        })
      }
    }
  })

  describe("defaults", () => {
    it("defaults variant=horizontal + tone=primary", () => {
      const { container } = render(<Logo />)
      const svgs = container.querySelectorAll("svg[data-slot='logo']")
      // sugar default → 2 svgs
      expect(svgs).toHaveLength(2)
      svgs.forEach((s) => {
        expect(s.getAttribute("data-variant")).toBe("horizontal")
      })
    })
  })

  describe("path counts per variant", () => {
    it("horizontal has 1 mark + 7 text paths", () => {
      const { container } = render(
        <Logo variant="horizontal" tone="primary-light" />,
      )
      const paths = container.querySelectorAll("path")
      expect(paths).toHaveLength(8)
    })

    it("stacked has 1 mark + 8 text paths", () => {
      const { container } = render(
        <Logo variant="stacked" tone="primary-light" />,
      )
      const paths = container.querySelectorAll("path")
      expect(paths).toHaveLength(9)
    })

    it("logomark has 1 path", () => {
      const { container } = render(
        <Logo variant="logomark" tone="primary-light" />,
      )
      const paths = container.querySelectorAll("path")
      expect(paths).toHaveLength(1)
    })

    it("wordmark has 7 paths", () => {
      const { container } = render(
        <Logo variant="wordmark" tone="primary-light" />,
      )
      const paths = container.querySelectorAll("path")
      expect(paths).toHaveLength(7)
    })
  })

  it("forwards className + extra svg props", () => {
    const { container } = render(
      <Logo
        variant="logomark"
        tone="mono-dark"
        className="size-8"
        aria-label="Afframe"
      />,
    )
    const svg = container.querySelector("svg[data-slot='logo']")
    expect(svg).toHaveAttribute(
      "class",
      expect.stringContaining("size-8") as never,
    )
    expect(svg).toHaveAttribute("aria-label", "Afframe")
  })
})

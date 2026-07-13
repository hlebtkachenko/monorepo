import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { ContentBody } from "./content-body"
import { sectionEmpty } from "./sections/section-empty"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

describe("ContentBody", () => {
  it("renders a branded section through the section registry", () => {
    wrap(<ContentBody sections={[sectionEmpty({ title: "Nothing here" })]} />)
    expect(screen.getByText("Nothing here")).toBeInTheDocument()
  })

  it("renders each section in order", () => {
    const { container } = wrap(
      <ContentBody
        sections={[
          sectionEmpty({ title: "First" }),
          sectionEmpty({ title: "Second" }),
        ]}
      />,
    )
    const slots = container.querySelectorAll('[data-slot="content-section"]')
    expect(slots).toHaveLength(2)
    expect(slots[0]).toHaveTextContent("First")
    expect(slots[1]).toHaveTextContent("Second")
  })

  it("uses the content-body region markup", () => {
    const { container } = wrap(
      <ContentBody sections={[sectionEmpty({ title: "Nothing here" })]} />,
    )
    const root = container.querySelector('[data-slot="content-body"]')
    expect(root).not.toBeNull()
    expect(root).toHaveClass("flex-1")
  })

  it("throws in non-production when given an unbranded section", () => {
    expect(() =>
      wrap(
        <ContentBody
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sections={[{ kind: "empty", props: {} } as any]}
        />,
      ),
    ).toThrow(/branded section/)
  })

  it("in production skips a forged section without throwing or leaking its payload", () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const { container } = wrap(
        <ContentBody
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sections={[{ kind: "empty", props: { title: "leak" } } as any]}
        />,
      )
      const root = container.querySelector('[data-slot="content-body"]')
      expect(root).not.toBeNull()
      // The prod backstop must skip the forgery — no forged content escapes.
      expect(container).not.toHaveTextContent("leak")
      expect(
        container.querySelector('[data-slot="content-section"]'),
      ).toBeNull()
      expect(error).toHaveBeenCalled()
    } finally {
      error.mockRestore()
      process.env.NODE_ENV = prev
    }
  })
})

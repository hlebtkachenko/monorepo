import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { archetypeEmpty } from "./archetypes/archetype-empty"
import { ContentBody } from "./content-body"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

describe("ContentBody", () => {
  it("renders the archetype title", () => {
    wrap(<ContentBody body={archetypeEmpty({ title: "Nothing here" })} />)
    expect(screen.getByText("Nothing here")).toBeInTheDocument()
  })

  it("renders the glyph when the archetype carries an icon", () => {
    const { container } = wrap(
      <ContentBody
        body={archetypeEmpty({ title: "Nothing here", icon: "Inbox" })}
      />,
    )
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("uses the content-body scroll region markup", () => {
    const { container } = wrap(
      <ContentBody body={archetypeEmpty({ title: "Nothing here" })} />,
    )
    const root = container.querySelector('[data-slot="content-body"]')
    expect(root).not.toBeNull()
    expect(root).toHaveClass("overflow-auto")
  })

  it("throws in non-production when given an unbranded body", () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wrap(<ContentBody body={{ kind: "empty" } as any} />),
    ).toThrow(/branded archetype descriptor/)
  })

  it("in production renders an empty body without throwing or leaking a forged payload", () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const { container } = wrap(
        <ContentBody
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          body={{ kind: "empty", props: { title: "leak" } } as any}
        />,
      )
      const root = container.querySelector('[data-slot="content-body"]')
      expect(root).not.toBeNull()
      // The prod backstop must render nothing rather than leak hand-built content.
      expect(root).toBeEmptyDOMElement()
      expect(container).not.toHaveTextContent("leak")
      expect(error).toHaveBeenCalled()
    } finally {
      error.mockRestore()
      process.env.NODE_ENV = prev
    }
  })
})

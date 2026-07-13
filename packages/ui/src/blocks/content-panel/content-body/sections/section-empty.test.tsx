import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { SectionEmptyRenderer } from "./section-empty"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

describe("SectionEmptyRenderer", () => {
  it("renders the provided title", () => {
    wrap(<SectionEmptyRenderer props={{ title: "Line items" }} />)
    expect(screen.getByText("Line items")).toBeInTheDocument()
  })

  it("falls back to the placeholder title when none is given", () => {
    wrap(<SectionEmptyRenderer props={{}} />)
    expect(screen.getByText("Section placeholder")).toBeInTheDocument()
  })
})

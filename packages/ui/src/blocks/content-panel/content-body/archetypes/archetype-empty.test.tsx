import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { ARCHETYPE_KINDS } from "./archetype"
import { ArchetypeEmptyRenderer } from "./archetype-empty"
import { ARCHETYPE_REGISTRY } from "./registry"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

describe("ArchetypeEmptyRenderer", () => {
  it("renders the title and description", () => {
    wrap(
      <ArchetypeEmptyRenderer
        props={{
          title: "No invoices",
          description: "Import a document to start.",
        }}
      />,
    )
    expect(screen.getByText("No invoices")).toBeInTheDocument()
    expect(screen.getByText("Import a document to start.")).toBeInTheDocument()
  })

  it("omits the description when it is not passed", () => {
    wrap(<ArchetypeEmptyRenderer props={{ title: "No invoices" }} />)
    expect(screen.getByText("No invoices")).toBeInTheDocument()
    expect(
      screen.queryByText("Import a document to start."),
    ).not.toBeInTheDocument()
  })
})

describe("ARCHETYPE_REGISTRY", () => {
  it("maps the empty kind to its renderer", () => {
    expect(ARCHETYPE_REGISTRY.empty).toBe(ArchetypeEmptyRenderer)
  })

  it("registry keys match the closed ARCHETYPE_KINDS set", () => {
    expect(Object.keys(ARCHETYPE_REGISTRY)).toEqual([...ARCHETYPE_KINDS])
  })
})

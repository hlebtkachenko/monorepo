import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { sectionTabs } from "./section-tabs"
import { SectionTabsRenderer } from "./section-tabs-renderer"
import { isSectionDescriptor } from "./section"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

describe("sectionTabs factory", () => {
  it("mints a branded `tabs` descriptor", () => {
    const descriptor = sectionTabs({
      title: "Addresses",
      tabs: [{ id: "sidlo", label: "Registered seat", fields: [] }],
    })
    expect(descriptor.kind).toBe("tabs")
    expect(isSectionDescriptor(descriptor)).toBe(true)
    expect(descriptor.props.tabs).toHaveLength(1)
  })
})

describe("SectionTabsRenderer", () => {
  it("renders the title, tab triggers, and the default tab's fields", () => {
    wrap(
      <SectionTabsRenderer
        props={{
          title: "Addresses",
          tabs: [
            {
              id: "sidlo",
              label: "Registered seat",
              fields: [
                {
                  label: "Street",
                  name: "sidlo_street",
                  control: { kind: "text" },
                },
              ],
            },
            {
              id: "mail",
              label: "Mailing address",
              fields: [
                { label: "Box", name: "mail_box", control: { kind: "text" } },
              ],
            },
          ],
        }}
      />,
    )
    expect(screen.getByText("Addresses")).toBeInTheDocument()
    expect(
      screen.getByRole("tab", { name: "Registered seat" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("tab", { name: "Mailing address" }),
    ).toBeInTheDocument()
    // The default (first) tab is active — its field is visible.
    expect(screen.getByLabelText("Street")).toBeInTheDocument()
  })
})

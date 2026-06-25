import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { ContentHeader, type ContentTab } from "./content-header"
import { ContentToolbar } from "./content-toolbar"
import { ContentStatusBar } from "./content-status-bar"
import { ContentPanel } from "./content-panel"
import { DetailField } from "./detail-field"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

const TABS: ContentTab[] = [
  { value: "all", label: "Všechny" },
  { value: "tax", label: "Daňové doklady" },
]

describe("ContentHeader", () => {
  it("renders the page title", () => {
    wrap(<ContentHeader title="Faktury přijaté" />)
    expect(screen.getByText("Faktury přijaté")).toBeInTheDocument()
  })

  it("renders tabs as a tablist when tabs are provided", () => {
    wrap(<ContentHeader title="Faktury" tabs={TABS} value="all" />)
    expect(screen.getByRole("tablist")).toBeInTheDocument()
    expect(screen.getAllByRole("tab")).toHaveLength(2)
    expect(screen.getByRole("tab", { name: "Všechny" })).toHaveAttribute(
      "data-state",
      "active",
    )
  })

  it("omits the tablist when there are no tabs", () => {
    wrap(<ContentHeader title="Faktury" />)
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
  })

  it("shows the manage-tabs trigger only when a menu is passed", () => {
    const { rerender } = wrap(
      <ContentHeader title="Faktury" tabs={TABS} value="all" />,
    )
    expect(
      screen.queryByRole("button", { name: /manage tabs/i }),
    ).not.toBeInTheDocument()
    rerender(
      <ContentHeader
        title="Faktury"
        tabs={TABS}
        value="all"
        manageTabs={<div>menu</div>}
      />,
    )
    expect(
      screen.getByRole("button", { name: /manage tabs/i }),
    ).toBeInTheDocument()
  })

  it("renders right-aligned page actions", () => {
    wrap(
      <ContentHeader
        title="Faktury"
        actions={<button type="button">Oblíbené</button>}
      />,
    )
    expect(screen.getByRole("button", { name: "Oblíbené" })).toBeInTheDocument()
  })
})

describe("ContentToolbar", () => {
  it("renders both slots", () => {
    wrap(
      <ContentToolbar
        left={<span>12 dokladů</span>}
        right={<button type="button">Přidat</button>}
      />,
    )
    expect(screen.getByText("12 dokladů")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Přidat" })).toBeInTheDocument()
  })
})

describe("ContentStatusBar", () => {
  it("renders nothing when both slots are empty", () => {
    const { container } = wrap(<ContentStatusBar />)
    expect(
      container.querySelector('[data-slot="content-status-bar"]'),
    ).toBeNull()
  })

  it("renders the info slot when provided", () => {
    wrap(<ContentStatusBar left={<span>Σ 1 240 Kč</span>} />)
    expect(screen.getByText("Σ 1 240 Kč")).toBeInTheDocument()
  })
})

describe("ContentPanel", () => {
  it("stacks the toolbar, body, status bar and action bar", () => {
    const { container } = wrap(
      <ContentPanel
        toolbar={<div data-testid="tb">toolbar</div>}
        statusBar={<div data-testid="sb">status</div>}
        actionBar={<div data-testid="ab">actions</div>}
      >
        <div>body</div>
      </ContentPanel>,
    )
    expect(screen.getByTestId("tb")).toBeInTheDocument()
    expect(screen.getByText("body")).toBeInTheDocument()
    expect(screen.getByTestId("sb")).toBeInTheDocument()
    expect(screen.getByTestId("ab")).toBeInTheDocument()
    expect(container.querySelector('[data-slot="content-body"]')).not.toBeNull()
  })
})

describe("ContentPanel inspector", () => {
  it("renders the inspector as a side panel when open in panel mode", () => {
    const { container } = wrap(
      <ContentPanel
        inspector={<div>detail body</div>}
        inspectorOpen
        inspectorMode="panel"
        inspectorTitle="FP-2026-0001"
      >
        <div>body</div>
      </ContentPanel>,
    )
    expect(
      container.querySelector('[data-slot="content-inspector"]'),
    ).not.toBeNull()
    expect(screen.getByText("detail body")).toBeInTheDocument()
    expect(screen.getByText("FP-2026-0001")).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("renders the inspector as a dialog when open in dialog mode", () => {
    wrap(
      <ContentPanel
        inspector={<div>detail body</div>}
        inspectorOpen
        inspectorMode="dialog"
        inspectorTitle="FP-2026-0001"
      >
        <div>body</div>
      </ContentPanel>,
    )
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("detail body")).toBeInTheDocument()
    expect(document.querySelector('[data-slot="content-inspector"]')).toBeNull()
  })

  it("renders no inspector when closed", () => {
    const { container } = wrap(
      <ContentPanel inspector={<div>detail body</div>} inspectorOpen={false}>
        <div>body</div>
      </ContentPanel>,
    )
    expect(
      container.querySelector('[data-slot="content-inspector"]'),
    ).toBeNull()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.queryByText("detail body")).not.toBeInTheDocument()
  })
})

describe("DetailField", () => {
  it("renders the label and value as a dt/dd pair", () => {
    const { container } = wrap(
      <dl>
        <DetailField label="Partner" value="ČEZ, a.s." />
      </dl>,
    )
    const dt = container.querySelector("dt")
    const dd = container.querySelector("dd")
    expect(dt).toHaveTextContent("Partner")
    expect(dd).toHaveTextContent("ČEZ, a.s.")
  })
})

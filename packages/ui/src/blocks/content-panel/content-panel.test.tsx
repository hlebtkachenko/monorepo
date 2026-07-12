import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

import { IconProvider } from "@workspace/ui/icon-packs"

import { ContentHeader, type ViewTab } from "./content-header"
import { ContentToolbar } from "./content-toolbar"
import { ContentStatusBar } from "./content-status-bar"
import { ContentPanel } from "./content-panel"
import { DashboardChartCard, DashboardGrid } from "./dashboard-grid"
import { DetailField } from "./detail-field"
import { LaunchpadGrid, type LaunchpadSection } from "./launchpad-grid"
import { RecordWorkspace, type RecordWorkspaceProps } from "./record-workspace"

const wrap = (ui: React.ReactElement) => render(ui, { wrapper: IconProvider })

const TABS: ViewTab[] = [
  { value: "all", label: "Všechny" },
  { value: "tax", label: "Daňové doklady" },
]

describe("ContentHeader", () => {
  it("renders the page title", () => {
    wrap(<ContentHeader title="Faktury přijaté" />)
    expect(screen.getByText("Faktury přijaté")).toBeInTheDocument()
  })

  it("renders tabs as a tablist when tabs are provided", () => {
    wrap(<ContentHeader title="Faktury" viewTabs={TABS} value="all" />)
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
      <ContentHeader title="Faktury" viewTabs={TABS} value="all" />,
    )
    expect(
      screen.queryByRole("button", { name: /manage views/i }),
    ).not.toBeInTheDocument()
    rerender(
      <ContentHeader
        title="Faktury"
        viewTabs={TABS}
        value="all"
        manageViews={{ tabs: TABS, hidden: new Set(), onToggle: () => {} }}
      />,
    )
    expect(
      screen.getByRole("button", { name: /manage views/i }),
    ).toBeInTheDocument()
  })

  it("renders the closed favorite + configure actions on every header", () => {
    wrap(<ContentHeader title="Faktury" />)
    expect(
      screen.getByRole("button", { name: /favorite/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /configure/i }),
    ).toBeInTheDocument()
  })

  it("renders a decorative titleIcon and keeps the title", () => {
    const { container } = wrap(
      <ContentHeader title="Faktury" titleIcon="Inbox" />,
    )
    expect(screen.getByText("Faktury")).toBeInTheDocument()
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("renders the breadcrumb trail as links and inert pages", () => {
    wrap(
      <ContentHeader
        title="Received"
        breadcrumb={[{ label: "Accounting", href: "/acc" }, { label: "Docs" }]}
      />,
    )
    expect(screen.getByRole("link", { name: "Accounting" })).toHaveAttribute(
      "href",
      "/acc",
    )
    expect(screen.getByText("Docs")).toBeInTheDocument()
  })
})

describe("ContentToolbar", () => {
  it("renders controls from data descriptors", () => {
    wrap(
      <ContentToolbar
        search={{ value: "", onChange: () => {} }}
        actions={[{ id: "export", label: "Export", onSelect: () => {} }]}
      />,
    )
    expect(screen.getByPlaceholderText("Search anything…")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument()
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
  it("stacks the toolbar, body, status bar and footer", () => {
    const { container } = wrap(
      <ContentPanel
        toolbar={<div data-testid="tb">toolbar</div>}
        statusBar={<div data-testid="sb">status</div>}
        footer={<div data-testid="ft">footer</div>}
      >
        <div>body</div>
      </ContentPanel>,
    )
    expect(screen.getByTestId("tb")).toBeInTheDocument()
    expect(screen.getByText("body")).toBeInTheDocument()
    expect(screen.getByTestId("sb")).toBeInTheDocument()
    expect(screen.getByTestId("ft")).toBeInTheDocument()
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

const LAUNCHPAD_SECTIONS: LaunchpadSection[] = [
  {
    id: "single",
    kind: "single",
    pages: [
      {
        id: "invoices",
        title: "Invoices",
        description: "Received documents.",
        icon: "FileText",
        href: "/invoices",
        unread: 3,
      },
      {
        id: "bank",
        title: "Bank",
        description: "Accounts.",
        icon: "Banknote",
        href: "/bank",
        followed: true,
      },
    ],
  },
  {
    id: "footer",
    kind: "footer",
    pages: [{ id: "settings", title: "Settings", href: "/settings" }],
  },
]

describe("LaunchpadGrid", () => {
  it("renders a card per page with a title and a stretched link", () => {
    const { container } = wrap(
      <LaunchpadGrid sections={LAUNCHPAD_SECTIONS} view="all" />,
    )
    expect(screen.getByText("Invoices")).toBeInTheDocument()
    expect(container.querySelector('a[href="/invoices"]')).toBeInTheDocument()
  })

  it("hoists a followed page into a top Followed section in the all view", () => {
    wrap(<LaunchpadGrid sections={LAUNCHPAD_SECTIONS} view="all" />)
    expect(screen.getByText("Followed")).toBeInTheDocument()
    // Bank is followed → present (in the hoisted strip).
    expect(screen.getByText("Bank")).toBeInTheDocument()
  })

  it("followed view shows only starred pages", () => {
    wrap(<LaunchpadGrid sections={LAUNCHPAD_SECTIONS} view="followed" />)
    expect(screen.getByText("Bank")).toBeInTheDocument()
    expect(screen.queryByText("Invoices")).not.toBeInTheDocument()
  })

  it("unread view shows only pages with unread activity", () => {
    wrap(<LaunchpadGrid sections={LAUNCHPAD_SECTIONS} view="unread" />)
    expect(screen.getByText("Invoices")).toBeInTheDocument()
    expect(screen.queryByText("Bank")).not.toBeInTheDocument()
  })

  it("calls onToggleFollow when a star is clicked", () => {
    const onToggleFollow = vi.fn()
    wrap(
      <LaunchpadGrid
        sections={LAUNCHPAD_SECTIONS}
        view="all"
        onToggleFollow={onToggleFollow}
      />,
    )
    const stars = screen.getAllByRole("button", { name: /follow/i })
    stars[0]?.click()
    expect(onToggleFollow).toHaveBeenCalledTimes(1)
  })

  it("renders footer pages as compact rows that are still favoritable", () => {
    wrap(<LaunchpadGrid sections={LAUNCHPAD_SECTIONS} view="all" />)
    const settingsRow = screen
      .getByText("Settings")
      .closest('[data-slot="launchpad-card"]')
    expect(settingsRow).toBeInTheDocument()
    // The compact row carries a working follow control (unlike the old chips).
    expect(
      settingsRow?.querySelector('button[aria-label="Follow"]'),
    ).toBeInTheDocument()
  })

  it("renders a card with subpages as a foldable card (unfolded shows them)", () => {
    wrap(
      <LaunchpadGrid
        sections={[
          {
            id: "s",
            kind: "group",
            label: "Accounting",
            pages: [
              {
                id: "journals",
                title: "Journals",
                description: "Posted entries.",
                href: "/journals",
                defaultUnfolded: true,
                subpages: [{ id: "gl", title: "General ledger", href: "/gl" }],
              },
            ],
          },
        ]}
        view="all"
      />,
    )
    expect(screen.getByText("Journals")).toBeInTheDocument()
    expect(screen.getByText("General ledger")).toBeInTheDocument()
  })
})

describe("DashboardGrid", () => {
  it("renders a metric tile per metric with label and value", () => {
    wrap(
      <DashboardGrid
        metrics={[
          { label: "Revenue", value: "1 000 Kč" },
          { label: "Expenses", value: "400 Kč" },
        ]}
      />,
    )
    expect(screen.getByText("Revenue")).toBeInTheDocument()
    expect(screen.getByText("1 000 Kč")).toBeInTheDocument()
    expect(screen.getByText("Expenses")).toBeInTheDocument()
  })

  it("renders a sparkline when a metric has a series", () => {
    const { container } = wrap(
      <DashboardGrid
        metrics={[
          {
            label: "Cash",
            value: "10 Kč",
            delta: { label: "1%", direction: "up" },
            series: [1, 2, 3, 4],
          },
        ]}
      />,
    )
    // The sparkline renders via ChartSparkLine.
    expect(
      container.querySelector('[data-slot="chart-spark-line"]'),
    ).toBeInTheDocument()
  })

  it("renders a chart card with a title", () => {
    wrap(
      <DashboardGrid metrics={[{ label: "Cash", value: "10 Kč" }]}>
        <DashboardChartCard title="Revenue vs. expenses" />
      </DashboardGrid>,
    )
    expect(screen.getByText("Revenue vs. expenses")).toBeInTheDocument()
  })
})

describe("RecordWorkspace", () => {
  it("renders the active section, plus optional aside / line-items / footer", () => {
    const props: RecordWorkspaceProps = {
      children: <div>section body</div>,
      aside: <div>recap</div>,
      lineItems: <div>line items</div>,
      footer: <button type="button">Save</button>,
    }
    const { container } = wrap(<RecordWorkspace {...props} />)
    expect(screen.getByText("section body")).toBeInTheDocument()
    expect(screen.getByText("recap")).toBeInTheDocument()
    expect(screen.getByText("line items")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
    expect(
      container.querySelector('[data-slot="record-workspace-lines"]'),
    ).toBeInTheDocument()
  })

  it("omits the optional slots when not provided", () => {
    const { container } = wrap(
      <RecordWorkspace>
        <div>just a body</div>
      </RecordWorkspace>,
    )
    expect(screen.getByText("just a body")).toBeInTheDocument()
    expect(
      container.querySelector('[data-slot="record-workspace-lines"]'),
    ).toBeNull()
    expect(
      container.querySelector('[data-slot="record-workspace-footer"]'),
    ).toBeNull()
  })
})

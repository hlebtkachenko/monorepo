import type { Meta, StoryObj } from "@storybook/react"
import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { IconProvider } from "@workspace/ui/icon-packs"

import { ContentPanel } from "./content-panel"
import { ContentStatusBar } from "./content-status-bar"
import { ContentToolbar } from "./content-toolbar"
import {
  DashboardChartCard,
  DashboardGrid,
  type MetricTileProps,
} from "./dashboard-grid"
import { DetailField } from "./detail-field"
import { LaunchpadGrid, type LaunchpadSection } from "./launchpad-grid"
import { RecordWorkspace } from "./record-workspace"

/**
 * `ContentPanel` is the single frame for every content-panel body. It owns the
 * pinned chrome stack (toolbar / filters / status bar / floating action bar) and
 * the inspector (resizable side panel OR modal dialog). All chrome slots are
 * optional, so the SAME frame expresses every page archetype — you fill the
 * slots a variant needs and leave the rest off. There is no `variant` prop:
 * a variant is just a slot-population pattern, documented here as one story each.
 *
 * The five archetypes (see `docs/runbooks/APP-SHELL-PANELS.md` → Content Panel
 * variants):
 *   - **Table**      — toolbar + body + status bar (+ inspector / action bar).
 *                      The dense list page. The wired demo lives in the web app.
 *   - **Blank**      — just a body on the layout, no chrome. The zero-slot case.
 *   - **Launchpad**  — a folder / overview page (cards → subpages). Prototype
 *                      block: `LaunchpadGrid`.
 *   - **Dashboard**  — analytics widgets + charts. Prototype block:
 *                      `DashboardGrid` (+ `DashboardChartCard`).
 *   - **Single**     — one record on show (a document, a profile). Prototype
 *                      block: `RecordWorkspace`.
 *
 * Copy the `Table` story's wiring to scaffold a real list page; the other three
 * archetypes are rough prototype blocks (#425) — presentational, mock-data
 * bodies you drop into `children` and refine when a real page earns it.
 */
const meta: Meta<typeof ContentPanel> = {
  title: "Blocks/App Content/ContentPanel",
  component: ContentPanel,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <IconProvider>
        {/* Mimic the shell's content card: a height-constrained, clipped frame
            so the panel fills it and only its inner regions scroll. */}
        <div className="h-svh p-4">
          <div className="h-full overflow-hidden rounded-md border border-border-subtle bg-shell-surface">
            <Story />
          </div>
        </div>
      </IconProvider>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof ContentPanel>

// ── Shared demo bodies ───────────────────────────────────────────────────────

const DEMO_ROWS = [
  { doc: "FV-2026-0001", partner: "ČEZ, a.s.", amount: "12 480 Kč" },
  { doc: "FV-2026-0002", partner: "O2 Czech Republic", amount: "2 904 Kč" },
  { doc: "FV-2026-0003", partner: "Alza.cz", amount: "8 117 Kč" },
  { doc: "FV-2026-0004", partner: "Pražská plynárenská", amount: "5 233 Kč" },
  { doc: "FV-2026-0005", partner: "Seznam.cz", amount: "1 200 Kč" },
  { doc: "FV-2026-0006", partner: "Rohlík.cz", amount: "744 Kč" },
]

/** A plain static table standing in for the real `DataGridView` body. */
function DemoTable() {
  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 bg-background">
        <tr className="border-b text-left text-muted-foreground">
          <th className="px-3 py-2 font-medium">Document</th>
          <th className="px-3 py-2 font-medium">Partner</th>
          <th className="px-3 py-2 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        {DEMO_ROWS.map((row) => (
          <tr key={row.doc} className="border-b last:border-0">
            <td className="px-3 py-2 font-medium">{row.doc}</td>
            <td className="px-3 py-2">{row.partner}</td>
            <td className="px-3 py-2 text-right tabular-nums">{row.amount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// The Table archetype's chrome — a 36px toolbar (search + filter · add) and a
// status bar (count + sum · export). Reused across the Table-family stories.
const tableToolbar = (
  <ContentToolbar
    left={
      <>
        <Input placeholder="Search…" className="h-7 w-48" />
        <Button variant="outline" size="sm" className="border-dashed">
          + Status
        </Button>
      </>
    }
    right={<Button size="sm">Add invoice</Button>}
  />
)

const tableStatusBar = (
  <ContentStatusBar
    left={
      <>
        <span>{DEMO_ROWS.length} rows</span>
        <Badge variant="secondary" className="h-5">
          Filtered
        </Badge>
        <span className="text-foreground">Σ 30 678 Kč</span>
      </>
    }
    right={
      <Button variant="ghost" size="sm">
        Export
      </Button>
    }
  />
)

const InvoiceDetail = () => (
  <dl className="flex flex-col gap-3">
    <DetailField label="Partner" value="ČEZ, a.s." />
    <DetailField
      label="Amount"
      value={<span className="tabular-nums">12 480 Kč</span>}
    />
    <DetailField label="Status" value="To match" />
  </dl>
)

// ── Variant: Table ───────────────────────────────────────────────────────────
// The dense list page: toolbar + scrolling body + status bar. This is the
// copy-me scaffold for request "easy scaffold this view (toolbar + body +
// status bar)".

export const Table: Story = {
  render: () => (
    <ContentPanel
      toolbar={tableToolbar}
      statusBar={tableStatusBar}
      bodyClassName="p-0"
    >
      <DemoTable />
    </ContentPanel>
  ),
}

// The same Table, with the inspector open as a docked, resizable side panel
// (drag its left edge). Covers `inspectorMode="panel"`.
export const TableInspectorPanel: Story = {
  render: function Render() {
    const [open, setOpen] = React.useState(true)
    return (
      <ContentPanel
        toolbar={tableToolbar}
        statusBar={tableStatusBar}
        bodyClassName="p-0"
        inspector={<InvoiceDetail />}
        inspectorOpen={open}
        inspectorMode="panel"
        inspectorTitle="FV-2026-0001"
        onInspectorOpenChange={setOpen}
      >
        <DemoTable />
      </ContentPanel>
    )
  },
}

// The same Table, with the inspector open as a centred modal instead. Covers
// `inspectorMode="dialog"`.
export const TableInspectorDialog: Story = {
  render: function Render() {
    const [open, setOpen] = React.useState(true)
    return (
      <ContentPanel
        toolbar={tableToolbar}
        statusBar={tableStatusBar}
        bodyClassName="p-0"
        inspector={<InvoiceDetail />}
        inspectorOpen={open}
        inspectorMode="dialog"
        inspectorTitle="FV-2026-0001"
        onInspectorOpenChange={setOpen}
      >
        <DemoTable />
      </ContentPanel>
    )
  },
}

// ── Variant: Blank ───────────────────────────────────────────────────────────
// A unique body straight on the layout — no toolbar, no status bar. Literally
// `<ContentPanel>{body}</ContentPanel>`: the zero-chrome case of the same frame,
// which is why "Blank" needs no dedicated component.

export const Blank: Story = {
  render: () => (
    <ContentPanel>
      <div className="prose prose-sm max-w-prose">
        <h2>Blank body</h2>
        <p>
          Any one-off page that just needs the shell around it. Drop the content
          straight into <code>children</code>; mount a toolbar or status bar
          only if the page actually grows one.
        </p>
      </div>
    </ContentPanel>
  ),
}

// ── Variant: Launchpad (prototype) ───────────────────────────────────────────
// A folder / overview hub that lays out a page's navigation structure (single,
// grouped + subpages, footer) as cards in a strict 4-column grid. Followed pages
// hoist to a "Followed" group first; the header view tabs (All / Followed /
// Unread) filter the body. Data-driven via `sections` + `view`.

const LAUNCHPAD_SECTIONS: LaunchpadSection[] = [
  {
    id: "quick",
    kind: "single",
    pages: [
      {
        id: "invoices",
        title: "Invoices",
        description: "Received and issued documents.",
        icon: "FileText",
        href: "#",
        unread: 4,
      },
      {
        id: "bank",
        title: "Bank",
        description: "Accounts, statements, matching.",
        icon: "Banknote",
        href: "#",
      },
    ],
  },
  {
    id: "single",
    kind: "single",
    pages: [
      {
        id: "counterparties",
        title: "Counterparties",
        description: "Customers and suppliers.",
        icon: "Users",
        href: "#",
        followed: true,
      },
      {
        id: "reports",
        title: "Reports",
        description: "VAT, balance, income statement.",
        icon: "BarChart3",
        href: "#",
        unread: 1,
      },
    ],
  },
  {
    id: "accounting",
    kind: "group",
    label: "Accounting",
    pages: [
      {
        id: "journals",
        title: "Journals",
        description: "Posted entries by book.",
        icon: "BookOpen",
        href: "#",
        subpages: [
          { id: "gl", title: "General ledger", href: "#", unread: 2 },
          { id: "vat", title: "VAT ledger", href: "#" },
        ],
      },
      {
        id: "documents",
        title: "Documents",
        description: "Contracts and attachments.",
        icon: "FolderOpen",
        href: "#",
        subpages: [
          { id: "contracts", title: "Contracts", href: "#" },
          { id: "attachments", title: "Attachments", href: "#", unread: 5 },
        ],
      },
    ],
  },
  {
    id: "footer",
    kind: "footer",
    label: "More",
    pages: [
      { id: "settings", title: "Settings", icon: "Building2", href: "#" },
      { id: "help", title: "Help", icon: "Bell", href: "#" },
    ],
  },
]

export const Launchpad: Story = {
  render: () => (
    <ContentPanel>
      <LaunchpadGrid sections={LAUNCHPAD_SECTIONS} view="all" />
    </ContentPanel>
  ),
}

// The "Followed" view tab — only starred pages, flat.
export const LaunchpadFollowed: Story = {
  render: () => (
    <ContentPanel>
      <LaunchpadGrid sections={LAUNCHPAD_SECTIONS} view="followed" />
    </ContentPanel>
  ),
}

// The "Unread" view tab — pages (and subpages) with unread activity.
export const LaunchpadUnread: Story = {
  render: () => (
    <ContentPanel>
      <LaunchpadGrid sections={LAUNCHPAD_SECTIONS} view="unread" />
    </ContentPanel>
  ),
}

// ── Variant: Dashboard (prototype) ───────────────────────────────────────────
// Analytics: KPI tiles (each with a sparkline) + chart cards. The prototype
// `DashboardGrid` block fills the body; period / scope controls live in the
// `ContentToolbar` above it (see the web demo), not in the body.

const DASHBOARD_METRICS: MetricTileProps[] = [
  {
    label: "Revenue",
    value: "1 240 800 Kč",
    delta: { label: "8.2%", direction: "up" },
    series: [82, 90, 88, 102, 115, 124],
  },
  {
    label: "Expenses",
    value: "812 440 Kč",
    delta: { label: "3.1%", direction: "down" },
    series: [70, 74, 72, 80, 78, 81],
  },
  {
    label: "Open invoices",
    value: "23",
    delta: { label: "0%", direction: "flat" },
    series: [21, 24, 22, 25, 23, 23],
  },
  {
    label: "Cash",
    value: "428 300 Kč",
    delta: { label: "1.4%", direction: "up" },
    series: [30, 33, 36, 40, 44, 47],
  },
]

const DASHBOARD_CHART_DATA = [
  { month: "Jan", revenue: 82, expenses: 70 },
  { month: "Feb", revenue: 90, expenses: 74 },
  { month: "Mar", revenue: 88, expenses: 72 },
  { month: "Apr", revenue: 102, expenses: 80 },
  { month: "May", revenue: 115, expenses: 78 },
  { month: "Jun", revenue: 124, expenses: 81 },
]

export const Dashboard: Story = {
  render: () => (
    <ContentPanel>
      <DashboardGrid metrics={DASHBOARD_METRICS}>
        <DashboardChartCard
          title="Revenue vs. expenses"
          span={2}
          chartType="bar"
          xKey="month"
          data={DASHBOARD_CHART_DATA}
          chartConfig={{
            revenue: { label: "Revenue", color: "var(--chart-2)" },
            expenses: { label: "Expenses", color: "var(--chart-1)" },
          }}
        />
        <DashboardChartCard title="Top counterparties" />
      </DashboardGrid>
    </ContentPanel>
  ),
}

// ── Variant: Single (prototype) ──────────────────────────────────────────────
// One record on show as a workspace: a form section, an optional recap rail, and
// a sticky footer. The `RecordWorkspace` block lays out the body; on a real page
// the section tabs live in the content header and an optional line-items grid +
// document preview fill the remaining slots.

export const Single: Story = {
  render: () => (
    <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
      <RecordWorkspace
        aside={
          <dl className="flex flex-col gap-3">
            <DetailField label="Supplier" value="ČEZ, a.s." />
            <DetailField
              label="Total"
              value={<span className="tabular-nums">12 480 Kč</span>}
            />
            <DetailField label="Status" value="To match" />
          </dl>
        }
        footer={
          <>
            <Button variant="ghost" size="sm">
              Close
            </Button>
            <Button size="sm">Save</Button>
          </>
        }
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Number" value="FV-2026-0001" />
          <DetailField label="Type" value="Received invoice" />
          <DetailField label="Issued" value="12.06.2026" />
          <DetailField label="Due" value="26.06.2026" />
        </dl>
      </RecordWorkspace>
    </ContentPanel>
  ),
}

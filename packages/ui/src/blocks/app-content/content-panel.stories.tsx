import type { Meta, StoryObj } from "@storybook/react"
import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { IconProvider } from "@workspace/ui/icon-packs"

import { ContentPanel } from "./content-panel"
import { ContentStatusBar } from "./content-status-bar"
import { ContentToolbar } from "./content-toolbar"
import { DetailField } from "./detail-field"

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
 *   - **Launchpad**  — a folder / overview page (cards → subpages). Empty stub.
 *   - **Dashboard**  — analytics widgets + charts. Empty stub.
 *   - **Single**     — one record on show (a document, a profile). Empty stub.
 *
 * Copy the `Table` story's wiring to scaffold a real list page; the three stub
 * archetypes render a labelled placeholder body until a real page earns them
 * their own composition.
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

/** A centred labelled placeholder for the not-yet-built body archetypes. */
function Placeholder({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
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

// ── Variant: Launchpad (stub) ────────────────────────────────────────────────
// A folder / overview page: a grid of cards linking to subpages or summaries.
// Not built yet — placeholder until a real folder page earns it a composition.

export const Launchpad: Story = {
  render: () => (
    <ContentPanel>
      <Placeholder
        label="Launchpad"
        hint="Folder / overview — a grid of cards to subpages. Coming soon."
      />
    </ContentPanel>
  ),
}

// ── Variant: Dashboard (stub) ────────────────────────────────────────────────
// Analytics: metric tiles, charts, period controls. Not built yet.

export const Dashboard: Story = {
  render: () => (
    <ContentPanel>
      <Placeholder
        label="Dashboard"
        hint="Analytics, charts and metric tiles. Coming soon."
      />
    </ContentPanel>
  ),
}

// ── Variant: Single (stub) ───────────────────────────────────────────────────
// One record on show: a document, a profile, a settings object. Not built yet.

export const Single: Story = {
  render: () => (
    <ContentPanel>
      <Placeholder
        label="Single"
        hint="One record on show (a document, a profile). Coming soon."
      />
    </ContentPanel>
  ),
}

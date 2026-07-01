# Content-panel archetypes — pick one and build a page

Four page shapes cover almost every org-app screen. Each is a reusable **block**
(or block set) in `packages/ui/src/blocks/app-content` plus a thin **data demo**
in `apps/web/app/_components/<name>-demo`. To build a new page you pick an
archetype, mount the shared chrome, drop the block into a `ContentPanel`, and
feed it data. Nothing here is bespoke per page — the blocks are the contract.

Issue #425 is the origin. The four demos below are **dev-only reference pages**
(404 in production, hidden from nav via `scripts/check-nav.ts`); copy them, don't
import them.

| Archetype     | Route              | Demo source                              | Block(s)                                             |
| ------------- | ------------------ | ---------------------------------------- | --------------------------------------------------- |
| **Table**     | `/<org>/demo-table`     | `_components/table-demo/`           | `DataGridView` + `useDataTable` + `filter-bar`      |
| **Launchpad** | `/<org>/demo-launchpad` | `_components/launchpad-demo/`       | `LaunchpadGrid`                                      |
| **Dashboard** | `/<org>/demo-dashboard` | `_components/dashboard-demo/`       | `DashboardGrid` + `DashboardChartCard`              |
| **Single**    | `/<org>/demo-single`    | `_components/single-demo/`          | `RecordWorkspace` (`formLayout="panels"`)           |

## Which one?

- **Table** — a dense list you filter, sort, page, and inspect (invoices, transactions, counterparties). Row selection + bulk actions + a per-row inspector.
- **Launchpad** — a folder / overview hub: a grid of cards linking to subpages, with follow-stars and a Followed group. No data table.
- **Dashboard** — analytics: KPI tiles with sparklines, chart cards, a period filter, and a metrics-as-rows matrix (which is itself a selectable, sortable Table).
- **Single** — one record on show as an editable document: side-by-side form panels + a full-width editable line-items grid + live totals.

## The shared foundation (every archetype uses this)

A page is a **route** under `apps/web/app/[orgSlug]/<name>/page.tsx` that renders
two things into the persistent org shell:

1. **`<OrgPageHeader>`** wrapping a **`<ContentHeader>`** — portals the page's
   title / tabs / actions into the shell's content-header slot (the 45px bar).
2. **`<ContentPanel>`** — the body frame below the header. One component, no
   `variant` prop; a "variant" is just which optional slots you fill:
   `toolbar` · `filters` · `statusBar` · `actionBar` · `inspector` (+
   `inspectorMode` `"panel" | "dialog"`) · `children` (the scrolling body) ·
   `bodyClassName`.

```tsx
export default function MyPage() {
  return (
    <>
      <OrgPageHeader>
        <ContentHeader title="My page" tabs={tabs} value={tab} onValueChange={setTab}
          manageTabs={<ManageTabsMenu tabs={TAB_DEFS} hidden={hidden} onToggle={toggle} />}
          actions={<PageHeaderActions />} />
      </OrgPageHeader>
      <ContentPanel toolbar={<ContentToolbar left={…} right={…} />} statusBar={…}>
        {/* the archetype block goes here */}
      </ContentPanel>
    </>
  )
}
```

Shared header helpers live in `apps/web/app/_components/_shared/content-header-extras.tsx`:

- **`PageHeaderActions`** — the standard favorite-star + config cluster for `ContentHeader.actions`.
- **`ManageTabsMenu`** — the header `⋯` menu body (Choose tabs + Show-in-section + Sort). Identical across all four archetypes; pass it to `ContentHeader.manageTabs`.
- **`useTabVisibility(tabs, active)`** — controlled show/hide state for the tabs, returning a `visible` list and an `activeValue` clamped to it (hiding the active tab falls back to the first visible one, derived in render — no header/body desync).

`ContentToolbar` (36px, `left`/`right` slots) and `ContentStatusBar` (24px,
`left`/`right`) are the toolbar + status rows; both are token-styled shell chrome.

## Table

The gold-standard list page. Body = `DataGridView` driven by `useDataTable`
(TanStack) with sortable/resizable/reorderable/pinnable columns, row selection,
and pagination. Toolbar carries a faceted Status filter, a universal search, and
the **`filter-bar`** (bazza) per-column filters (`FilterSelector` +
`ActiveFilters` + `FilterActions`, applied client-side via
`_shared/apply-filter-bar.ts`). A row opens the `ContentPanel` `inspector`
(panel or dialog). Bulk selection surfaces an `ActionBar`.

**Build it:** copy `table-demo/` — `columns.tsx` (column defs incl. the leading
select-checkbox column + `DataTableColumnHeader`), `table-demo-body.tsx`
(`useDataTable` + `DataGridView`), `table-demo-toolbar.tsx` (filters + search +
`DataTableColumnManager` + a split "Add" button + the inspector-mode switch),
`table-demo-header.tsx`, `data.ts`, and `context.tsx` (links the portaled header
to the body). Swap `data.ts` for query results.

## Launchpad

`LaunchpadGrid` renders a page's nav structure as cards in a strict 4-column
grid. Data contract:

```ts
LaunchpadSection[] = { id, kind: "single" | "group" | "footer", label?, pages: LaunchpadPage[] }
LaunchpadPage = { id, title, description?, icon?, href?, unread?, followed?,
                  subpages?: LaunchpadSubpage[], compact?, defaultUnfolded?, parentTitle? }
```

Card size is **derived**, not set: `compact` → a Small tile; has `subpages` → a
foldable card (Standard folded → Large `col-span-2` unfolded, subpages listed
beside the standard content); otherwise Standard. Followed pages (and followed
subpages, as breadcrumbed Small cards) are hoisted into a synthetic **Followed**
group first. Props: `sections`, `view` (`"all" | "followed" | "unread"`),
`onToggleFollow`, `linkComponent` (pass Next's `Link`). `getLaunchpadCounts()`
gives the tab badges.

**Build it:** copy `launchpad-demo/` — `data.ts` is your nav structure,
`launchpad-demo.tsx` holds the `followed` set + `view` tab state and wires
`LaunchpadGrid` into a `ContentPanel`. The block is presentational; you own the
data + the follow toggle.

## Dashboard

`DashboardGrid` is an analytics body: a responsive row of KPI tiles (each a
value + delta + sparkline, `MetricTileProps`), then either a grid of
`DashboardChartCard`s (`mode="chart"`) or a metrics-as-rows **matrix**
(`mode="table"`). The matrix is a real `DataGridView` — sortable headers,
checkbox selection with a live `Σ selected` `ActionBar`, and expandable subrows
(a metric breaks down by category). Props: `metrics`, `children` (the chart
cards), `mode`, `matrix`, `showTiles`. Period / filter controls belong in the
`ContentToolbar`, not the block.

recharts is a `packages/ui`-only dependency, so **all chart UI stays in the
block** (`dashboard-grid.tsx`); the demo only supplies data.

**Build it:** copy `dashboard-demo/` — `data.ts` holds a transaction ledger and
`aggregate()` that the toolbar filters + the body reads (so a filter or the
timeframe re-buckets every tile, chart, and matrix row). `dashboard-demo.tsx`
carries the FilterBar, the timeframe Select, the Widgets show/hide manager (the
`ColumnManagerMenuContent` grip+eye pattern), the Add-widget split button, and
the chart/table format toggle.

## Single

`RecordWorkspace` lays out one record as an editable document. Two layouts via
`formLayout`:

- **`"stack"`** (default) — a centered form band + an optional `aside` recap
  column, then `lineItems`, then `footer`. The original behavior.
- **`"panels"`** — a full-width container-query grid of side-by-side panels
  (3 → 2 → 1 columns as it narrows). This is the ABRA-style invoice editor: three
  panels (**Document / Party / Amounts**), each a card with its OWN local `Tabs`
  strip; the Amounts panel holds the per-rate VAT recap table. Below the panels,
  a full-width **editable** line-items grid (`data-grid`, cell variants via
  `meta.cell`, `base`/`total` derived by `recomputeLine`); the `ContentStatusBar`
  Base/VAT/Total and the recap table both re-derive live from the rows. Footer =
  Close + a split Save.

Props: `children` (the panels / form), `aside`, `lineItems`, `footer`,
`maxWidth`, `formLayout`. Mount in a `ContentPanel` with
`bodyClassName="flex min-h-0 flex-col p-0"` so the workspace owns its own scroll
+ footer.

**Build it:** copy `single-demo/` — `single-demo.tsx` (the three panels + local
tab state + chrome), `line-items.tsx` (editable-grid columns), `data.ts`
(`recomputeLine`, `ledgerTotals`, `vatRecap`, option lists).

## Add a new archetype page — checklist

1. `apps/web/app/[orgSlug]/<name>/page.tsx` — render `<OrgPageHeader><ContentHeader …/></OrgPageHeader>` + `<ContentPanel>…</ContentPanel>`. Gate dev-only demos on `process.env.NODE_ENV === "production" && notFound()`.
2. Put the data + client state in `apps/web/app/_components/<name>/` (never in `packages/ui` — the `ui-location` lefthook hook enforces reusable UI lives in `packages/ui/src/blocks`).
3. Drop the archetype block into `ContentPanel.children`; feed it props.
4. If a demo/dev route, add its folder name to `HIDDEN_ROUTES` in `scripts/check-nav.ts`.
5. Verify: `pnpm --filter web typecheck`, `pnpm --filter @workspace/ui test`, `pnpm --filter web lint`, `pnpm check:nav`.

## Connections at a glance

```
route/page.tsx
 ├─ <OrgPageHeader>          → portals into the shell's 45px content-header slot
 │    └─ <ContentHeader>     title · tabs (+ ⋯ ManageTabsMenu) · actions (PageHeaderActions)
 └─ <ContentPanel>           the body frame (rows below the header)
      ├─ toolbar   ContentToolbar   (filters / search / add / view switches)
      ├─ filters   (optional band)
      ├─ children  ← the ARCHETYPE BLOCK (DataGridView | LaunchpadGrid | DashboardGrid | RecordWorkspace)
      ├─ statusBar ContentStatusBar (counts / totals)
      ├─ inspector (Table only) resizable panel or dialog
      └─ actionBar (bulk selection)
```

See also `docs/runbooks/APP-SHELL-PANELS.md` for the shell + panel mechanics and
the per-page/module/tab recipes.

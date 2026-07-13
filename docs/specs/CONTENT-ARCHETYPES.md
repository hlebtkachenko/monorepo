# Content-panel archetypes — pick one and build a page

> **⚠️ UNDER REDESIGN (2026-07-12).** The archetype system is being restructured —
> locked model in `.context/archetype-system/01-taxonomy-and-naming.md`, build plan
> in `.context/archetype-system/03-plan.md`. In the new model an archetype is a
> **composed, importable grouping** you feed data (not a demo you copy), and the
> `ContentHeader` API is now closed (no `actions`/`icon`/`tabs`/`manageTabs`
> props — use `viewTabs`/`manageViews`/`breadcrumb`/`titleIcon`, Favorite+Configure
> are internal). The shared-foundation example below already reflects this closed
> API; the per-archetype **Build it** recipes still point at the older demo
> folders, so treat those as current-catalog reference, not the build contract.
> Ask Hleb before new work.

Five page shapes cover almost every org-app screen. Four use reusable blocks
from `packages/ui/src/blocks/content-panel` plus thin data demos under
`apps/web/app/_components/<name>-demo`. `Blank` is the intentional zero-slot
case: page content renders directly in `ContentPanel` without archetype chrome.

Issue #425 is the origin. The four demo routes are dev-only reference pages
(404 in production, hidden from nav via `scripts/check-nav.ts`). Copy their
patterns; do not import demo code into production pages.

| Archetype     | Route                   | Demo source                   | Block(s)                                       |
| ------------- | ----------------------- | ----------------------------- | ---------------------------------------------- |
| **Table**     | `/<org>/demo-table`     | `_components/table-demo/`     | `DataGridView` + `useDataTable` + `filter-bar` |
| **Blank**     | None                    | None                          | `ContentPanel` body only                       |
| **Launchpad** | `/<org>/demo-launchpad` | `_components/launchpad-demo/` | `LaunchpadGrid`                                |
| **Dashboard** | `/<org>/demo-dashboard` | `_components/dashboard-demo/` | `DashboardGrid` + `DashboardChartCard`         |
| **Single**    | `/<org>/demo-single`    | `_components/single-demo/`    | `RecordWorkspace` (`formLayout="panels"`)      |

## Which one?

- **Table** — a dense list you filter, sort, page, and inspect (invoices, transactions, counterparties). Row selection + bulk actions + a per-row inspector.
- **Blank** — a one-off body without toolbar, filters, status bar, inspector, or archetype block. Use only when shared panel chrome adds no value.
- **Launchpad** — a folder / overview hub: a grid of cards linking to subpages, with follow-stars and a Followed group. No data table.
- **Dashboard** — analytics: KPI tiles with sparklines, chart cards, a period filter, and a metrics-as-rows matrix (which is itself a selectable, sortable Table).
- **Single** — one record on show as an editable document: side-by-side form panels + a full-width editable line-items grid + live totals.

The admin app carries a static reference catalog of these archetypes at
`/platform/archetypes` (`apps/admin/app/(gated)/platform/archetypes`) — each
archetype's label, one-line description, and slot recipe. It documents the set;
the buildable demos live in the web routes above.

## The shared foundation (every archetype uses this)

A page is a **route** under `apps/web/app/[orgSlug]/<name>/page.tsx` that renders
two things into the persistent org shell:

1. **`<OrgPageHeader>`** wrapping a **`<ContentHeader>`** — portals the page's
   title / tabs / actions into the shell's content-header slot (the 45px bar).
2. **`<ContentPanel>`** — the body frame below the header. One component, no
   `variant` prop; a "variant" is just which optional slots you fill:
   `toolbar` · `filters` · `footer` · `inspector` (+
   `inspectorMode` `"panel" | "dialog"`) · `sections` (the branded body Sections,
   the canonical body path — `children` is the deprecated grandfather hatch) ·
   `bodyClassName`. (`statusBar` now belongs to the Table section, not the
   Content Panel.)

```tsx
export default function MyPage() {
  return (
    <>
      <OrgPageHeader>
        {/* Closed header: viewTabs + manageViews are DATA, Favorite/Configure are
            internal. No actions/icon/tabs/manageTabs props. */}
        <ContentHeader
          title="My page"
          viewTabs={visible}
          value={tab}
          onValueChange={setTab}
          manageViews={{ tabs: TAB_DEFS, hidden, onToggle: toggle }}
        />
      </OrgPageHeader>
      {/* Closed toolbar: named DATA slots, never ReactNode. */}
      <ContentPanel
        toolbar={
          <ContentToolbar
            search={{ value: q, onChange: setQ }}
            filter={filterDescriptor}
            add={{ label: "Add", onAdd }}
          />
        }
        footer={<ContentFooter selection={{ count, actions, onClear }} />}
      >
        {/* the body: pass branded Sections, e.g.
            <ContentPanel sections={[sectionEmpty({ title })]} />.
            An Archetype is a component that composes this whole page
            (ContentHeader + ContentPanel with its sections). */}
      </ContentPanel>
    </>
  )
}
```

Shared view-state helper in `apps/web/app/_components/_shared/content-header-extras.tsx`:

- **`useTabVisibility(tabs, active)`** — controlled show/hide state for the views,
  returning a `visible` list (feed `ContentHeader.viewTabs`) and an `activeValue`
  clamped to it. Feed `{ tabs, hidden, onToggle }` to `ContentHeader.manageViews`.
  (The old `PageHeaderActions` + `ManageTabsMenu` helpers are gone — Favorite/
  Configure and the ⋯ configure menu are now internal to `ContentHeader`.)

`ContentToolbar` is a closed named-data-slot container (`statusFilter` · `search` ·
`filter` · `viewTools` · `actions[]` · `add` · `modeToggle`; active-filter chips
render in a band below the 36px bar). `ContentFooter` is the sticky bottom action
surface (selection / save). The status bar now belongs to the Table section, not
the Content Panel. All are token-styled shell chrome.

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

## Blank

The zero-slot case. Render the page body directly as `ContentPanel.children`
without `toolbar`, `filters`, `statusBar`, `actionBar`, or `inspector`. Blank has
no dedicated block and no demo route because its contract is the absence of
additional panel structure.

Use Blank for exceptional one-off content. If the page needs repeated list,
navigation, analytics, or record-editing behavior, choose another archetype.

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
and footer.

**Build it:** copy `single-demo/` — `single-demo.tsx` (the three panels + local
tab state + chrome), `line-items.tsx` (editable-grid columns), `data.ts`
(`recomputeLine`, `ledgerTotals`, `vatRecap`, option lists).

## Add a new archetype page — checklist

1. `apps/web/app/[orgSlug]/<name>/page.tsx` — render `<OrgPageHeader><ContentHeader …/></OrgPageHeader>` + `<ContentPanel>…</ContentPanel>`. Gate dev-only demos on `process.env.NODE_ENV === "production" && notFound()`.
2. Put the data + client state in `apps/web/app/_components/<name>/` (never in `packages/ui` — the `ui-location` lefthook hook enforces reusable UI lives in `packages/ui/src/blocks`).
3. Feed the body as branded Sections via `ContentPanel sections={[sectionEmpty({…})]}` (an Archetype is the component that composes the whole page — ContentHeader + this ContentPanel). `children` remains only as the deprecated grandfather hatch.
4. If a demo/dev route, add its folder name to `HIDDEN_ROUTES` in `scripts/check-nav.ts`.
5. Verify: `pnpm --filter web typecheck`, `pnpm --filter @workspace/ui test`, `pnpm --filter web lint`, `pnpm check:nav`.

## Connections at a glance

```
route/page.tsx
 ├─ <OrgPageHeader>          → portals into the shell's 45px content-header slot
 │    └─ <ContentHeader>     [breadcrumb] title │ viewTabs (+ ⋯ manageViews) · internal Favorite/Configure
 └─ <ContentPanel>           the body frame (rows below the header)
      ├─ toolbar   ContentToolbar   named data slots: statusFilter · search · filter · viewTools · actions · add · modeToggle
      ├─ filters   (optional active-filter band below the 36px bar)
      ├─ sections ← branded body Sections (via the closed SECTION_REGISTRY);
      │               a whole-panel Archetype component supplies them
      │               (`children` is the deprecated grandfather hatch)
      ├─ inspector (Table only) resizable panel or dialog
      └─ footer    ContentFooter (sticky bottom surface: selection or save)
```

See also `docs/runbooks/APP-SHELL-PANELS.md` for the shell + panel mechanics and
the per-page/module/tab recipes.

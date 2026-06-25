# App Shell Panels — build guide for agents

How the application shell is structured and how to build **page content** inside
it without reinventing primitives or breaking the layout. Read this before
touching the sidebar or the content panel, or before wiring a new page.

> Status: the sidebar and content panels are **built but fed by mock data**.
> Real-data wiring is tracked in GitHub issue
> [#394](https://github.com/hlebtkachenko/monorepo/issues/394) and summarized
> below in [Pending real-data work](#pending-real-data-work).

---

## Vocabulary

- **Panel** — one of the three vertical columns the shell exposes: **Sidebar**,
  **Content**, **Assistant**. (The **Rail** is the thin icon column on the far
  left; the **Header** is the 40px global bar.)
- **Section** — a block _inside_ a panel (e.g. the sidebar's Reminders, the
  content panel's Toolbar).
- **Shell chrome** — anything the `AppShell` block draws itself: the 45px
  per-panel header bar, the open/close toggles, the resize handles. Pages do
  **not** draw chrome; they fill slots.

## Where everything lives

| Layer                        | Location                                                                     | Rule                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Shell + panels (reusable UI) | `packages/ui/src/blocks/app-shell`, `app-rail`, `app-sidebar`, `app-content` | All reusable composition goes here. **Never** put shell/panel UI in `apps/web`.                                 |
| Leaf components              | `packages/ui/src/components/*`                                               | shadcn-derived primitives (Button, Tabs, DataTable, ActionBar, …).                                              |
| App data wrappers            | `apps/web/app/_components/*`                                                 | Thin client components that feed **data** (mock today) + live `usePathname()` into the blocks. No layout logic. |
| Page mount                   | `apps/web/app/[orgSlug]/page.tsx`                                            | Wires the wrappers into `AppShell`'s slots.                                                                     |

This split is the `ui-belongs-in-packages-ui-blocks` convention. It is **not**
mechanically enforced (no lefthook hook guards it) — hold the line in review:
reusable composition goes in `packages/ui`; only thin data wrappers belong under
`apps/web/app/_components`. A reusable block trapped in `apps/web` can't be
imported by other pages or `apps/admin` — audit for it.

## The AppShell slots

`AppShell` (`packages/ui/src/blocks/app-shell/app-shell.tsx`) is a slotted
layout. Pass nodes; it positions them. Geometry is token-driven
(`--shell-rail-width`, `--shell-header-height`, `--shell-bottom-inset`,
`--shell-right-inset`, `--shell-handle-width` in `globals.css`).

| Prop            | Fills                                          | Notes                                    |
| --------------- | ---------------------------------------------- | ---------------------------------------- |
| `header`        | 40px global bar                                | Compose `AppHeader`.                     |
| `rail`          | left icon column                               | `AppRailNav`.                            |
| `sidebar`       | Sidebar panel body                             | `AppSidebar` (sections 2–5).             |
| `sidebarHeader` | Sidebar's 45px header                          | the active Module title.                 |
| `contentHeader` | **Content panel's 45px header**                | the Page title + tabs (`ContentHeader`). |
| `children`      | **Content panel body** (rows below the header) | `ContentPanel` stack.                    |
| `assistant`     | Assistant panel body                           | scaffold for now.                        |
| `bottomNav`     | mobile bottom bar                              | hidden ≥ md.                             |

The 45px header bar (`PanelHeader`) is shell chrome shared by every panel:
`h-[45px]`, `border-b border-border-subtle`, `px-2 py-1.5`, a 32px content row
inside. The sidebar/assistant toggles live in it. Your `contentHeader` /
`sidebarHeader` content sits between those toggles.

---

## Tokens (do NOT hardcode colors)

App-chrome surfaces use the **shell token family**, NOT the global shadcn
tokens:

- `--canvas` (page bg), `--shell-surface` (card bg), `--border-subtle`
  (outlines + the hairline borders on the header / toolbar / status bar).
- The `--shell-*` dimension tokens above.

In-flow body surfaces (dialogs, dropdowns, cards, table rows) use the **global**
tokens (`bg-card`, `muted`, `foreground`, `accent`, …). Brand green is two
tokens — `--brand-primary-light` / `--brand-primary-dark` — used via
`text/bg-brand-primary-light` + a `dark:`-prefixed counterpart.

Rule of thumb: **chrome borders/surfaces → `border-subtle` / `shell-surface`;
content → global tokens.** Never write a hex value in a component.

---

## Sidebar panel (`app-sidebar`)

Five sections, every one self-hides when empty:

1. **Header** (shell-owned, via `sidebarHeader`) — the active Module name.
2. **Reminders** (`SidebarReminders`) — optional, dismissable, **localStorage-
   persisted per scope** (`sidebar-reminders-dismissed:<key>`), SSR-safe (empty
   on first render, dismissed-set loaded in an effect → no hydration mismatch).
   Two kinds: `action` (title + button) and `info` (title + open icon → href).
3. **Module nav** (`SidebarNav`) — **Group** (label heading) › **Page**
   (clickable, has an icon, may expand) › **Subpage** (clickable, indented, no
   icon, up to 2). Active = longest-href-prefix; a parent auto-opens when a
   subpage is active.
4. **Insight** (`SidebarInsight`) — a pinned slot for ONE insight template.
5. **Footer** (`SidebarFooter`) — icon links, swapped per page.

### The one row primitive

All nav + footer rows are the single `SidebarRow` (`sidebar-row.tsx`) — one
source of truth for height, hover, focus ring, truncation, `active` (neutral
`bg-accent` fill) and `muted` (page vs subpage). **Don't** build bespoke rows;
extend `SidebarRow`. (Two independent Opus reviews converged on this; `Item` is
an option-card, wrong density for dense nav.)

### Insight templates

Three ready-made shapes in `insight-templates.tsx`, each a self-contained card:
`InsightMedia` (thumbnail + text), `InsightChecklist` (read-only task list with
the real `Checkbox`), `InsightProgress` (title + meta + bar + button, the
"trial → upgrade" pattern). Feed ONE per context; `SidebarInsight` is just the
pinned slot.

### Sidebar do / don't

- **DO** reuse `SidebarRow`, the insight templates, and the reminder mechanism.
- **DON'T** import the shadcn `Sidebar` component here — it needs
  `SidebarProvider`, injects fixed chrome / `--sidebar-width` / a mobile Sheet /
  a `sidebar_state` cookie / a global Cmd+B that all collide with this shell.
- **DON'T** read `localStorage` during render (hydration mismatch) — load in an
  effect.
- **DON'T** hardcode the active color — it's the neutral `accent` token.

---

## Content panel (`app-content`)

The content panel is a vertical stack. The shell draws row 1 (the 45px header);
**you** own rows 2…n via `ContentPanel` in `children`:

```
┌ contentHeader slot (45px, shell) ── title │ tabs ⋯ … page actions ─┐  ← ContentHeader
├ toolbar (36px) ───────────────────────────────── filter · add ─────┤  ← ContentToolbar
├ filters (optional, variable height) ───────────────────────────────┤  ← e.g. DataTableToolbar
│ body (scrolls) ─────────────────────────────────────────────────── │  ← table / cards / detail
├ status bar (24px, optional) ── totals · sums · validation ──────────┤  ← ContentStatusBar
└ action bar (floating, on selection) ───────────────────────────────┘  ← ActionBar
```

### The blocks (`packages/ui/src/blocks/app-content`)

- **`ContentHeader`** — `title` + an inset vertical `Separator` + `Tabs`
  (`variant="line"`, underline) + a "manage tabs" ⋯ dropdown + right-aligned
  `actions`. Tabs are **controlled** (`value` / `onValueChange`). Goes in the
  `contentHeader` slot.
- **`ContentToolbar`** — fixed **36px** band, `border-b border-border-subtle`,
  `left` / `right` slots. Strong, stable layout.
- **`ContentStatusBar`** — optional **24px** band, `border-t`, `left` (info) /
  `right` (helpers). Renders nothing when empty.
- **`ContentPanel`** — the stack: `toolbar` / `filters` / `children` (the only
  scrolling region) / `statusBar` / `actionBar`. Chrome rows stay pinned. It also
  owns the **Inspector** (the detail of the selected body item) — a resizable
  docked side panel (`inspectorMode="panel"`) or a centred modal
  (`inspectorMode="dialog"`).

### Content Panel variants

`ContentPanel` is **one frame, no `variant` prop**. Every chrome slot is optional,
so a "variant" is just which slots a page fills — not a different component. Five
named archetypes cover every page; pick one when scaffolding. Live examples:
`packages/ui/src/blocks/app-content/content-panel.stories.tsx` (one story each).

| Variant       | Slots filled                                                | Use for                                                          |
| ------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| **Table**     | `toolbar` + body + `statusBar` (+ `inspector`, `actionBar`) | Dense list pages (invoices, transactions). The wired demo today. |
| **Blank**     | body only (no chrome)                                       | A one-off body straight on the layout. The zero-slot case.       |
| **Launchpad** | body only (stub)                                            | Folder / overview pages — a grid of cards to subpages. _Empty._  |
| **Dashboard** | body only (stub)                                            | Analytics — metric tiles, charts, period controls. _Empty._      |
| **Single**    | body only (stub)                                            | One record on show (a document, a profile). _Empty._             |

**Scaffolding a Table page** (the common case): mount `ContentPanel` with a
`ContentToolbar` in `toolbar`, the body in `children` (`bodyClassName="p-0"` so a
table fills edge-to-edge), and a status bar in `statusBar`. Add `inspector*` for a
detail view and `actionBar` for bulk selection. Copy the `Table` story's wiring.

**Promotion rule:** Launchpad / Dashboard / Single are documented placeholders, not
shipped components — growing into `children` is correct for now. Promote one to a
real `<ContentPanel>`-composing component **only** when a real page proves it needs
shared body machinery the frame shouldn't own (e.g. a launchpad card-grid with its
own selection model). Don't pre-build the empty ones; don't add a `variant` prop
(it would only duplicate `bodyClassName` and bake in undesigned layouts).

### Reuse — do NOT reinvent these

| Need                                               | Use                                                                      | Where                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| Table + sorting + column visibility                | `DataTable` + `useDataTable`                                             | `components/data-table`                |
| Filter bar (search + faceted chips + reset + view) | `DataTableToolbar`                                                       | same — mount in `ContentPanel.filters` |
| Pagination footer                                  | `DataTablePagination`                                                    | same                                   |
| Faceted / date / slider filters                    | `DataTableFacetedFilter`, `DataTableDateFilter`, `DataTableSliderFilter` | same                                   |
| **Bulk actions on selection**                      | `ActionBar` family                                                       | `components/action-bar`                |

The table is TanStack-based; columns are `ColumnDef<T>[]` with a `meta`
(`{ label, variant, options, placeholder }`) that the `DataTableToolbar` reads
to auto-render filters. `@tanstack/react-table` is a direct dep of `apps/web`
(Dependabot-tracked).

### Decisions baked into the design

- **Filters live in their own band BELOW the toolbar**, not inside it. The
  toolbar is a fixed 36px row of stable, page-level controls; filters are
  variable-height and table-specific. The toolbar holds the **filter toggle**;
  the filter bar (`DataTableToolbar`) renders in `ContentPanel.filters` when on.
- **Selection actions do NOT go in the toolbar or the status bar.** They live in
  the floating `ActionBar` (appears on row selection). The status bar shows
  **aggregate** info (totals, sums, "N to match") — never selection, never
  pagination (that's the table footer).
- The status bar is **optional** — mount it only for table-like pages with
  aggregates worth summarizing.
- A page-level "manage page" menu can toggle the toolbar's action buttons
  (show/hide), so the toolbar can be quietened without becoming useless.

### Content do / don't

- **DO** keep the toolbar layout fixed and generic — controls that apply to many
  page types (filter toggle, view switch, a primary "add"). **DON'T** put a
  table-only control there that breaks on a non-table page.
- **DO** put bulk/selection actions in `ActionBar`. **DON'T** duplicate them in
  the toolbar or status bar.
- **DON'T** wrap an `IconButton` that has a `tooltip` in a `DropdownMenuTrigger
asChild` — a tooltip'd `IconButton` returns a `TooltipProvider` tree, not a
  trigger-able node. Drop the tooltip on menu-trigger buttons (keep the
  `aria-label`).
- **DON'T** make the toolbar/status heights jump — they're fixed (36 / 24).
  Variable content goes in the body or the filters band.

### Linking the header to the body

`contentHeader` and `children` are separate slots, so shared state (active tab,
filter visibility, page actions) needs a small client **context provider**
wrapping `AppShell`. The Faktury demo does this in
`apps/web/app/_components/content-demo/context.tsx` — copy that shape for real
pages, but lift only what actually crosses the two slots.

---

## Adding a new page — the short path

1. Pick the data surface. A list/table page? Reuse `DataTable` + `useDataTable`.
2. Build the body as a `ContentPanel` (toolbar + optional filters + body +
   optional status + action bar). Mount the table in the body.
3. Build the header as a `ContentHeader` (title + tabs). If tabs drive the body,
   wrap the shell in a context provider so both slots share the active value.
4. Feed it from a thin wrapper in `apps/web/app/_components/<page>` and mount it
   in the route via `contentHeader` + `children`.
5. Verify: `pnpm --filter @workspace/ui --filter web typecheck`, `pnpm lint`,
   the block tests, then eyeball at `/<org>`.

---

## Pending real-data work

Everything below is **mock**, tracked in GitHub issue
[#394](https://github.com/hlebtkachenko/monorepo/issues/394):

- **Sidebar**: reminders source + persistence backend, module nav per active
  module, insight feed, footer per page, swap nav `<a>` → Next `<Link>`.
- **Content panel**: the Faktury demo (`apps/web/app/_components/content-demo`)
  is a TEMP preview — replace with real, route-driven content + a real data
  source; remove the demo provider once pages own their state. Tab reorder in
  the manage-tabs menu is not built (show/hide + add only).

When you wire a real source, delete the corresponding mock and update this list.

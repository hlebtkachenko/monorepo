# App Shell Panels — build guide for agents

How the application shell is structured and how to build **page content** inside
it without reinventing primitives or breaking the layout. Read this before
touching the sidebar or the content panel, or before wiring a new page.

> Status: the persistent shell + structure-driven nav are **live** (mounted in
> `[orgSlug]/layout.tsx`); each module ships an **`Overview` placeholder body**
> (`ModulePage`) awaiting its real `ContentPanel`. To add or wire a page, jump to
> [Adding a page](#adding-a-page-subpage-module-or-tabs). Remaining real-data
> wiring is tracked in GitHub issue
> [#394](https://github.com/hlebtkachenko/monorepo/issues/394).

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

| Layer                        | Location                                                                     | Rule                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Shell + panels (reusable UI) | `packages/ui/src/blocks/app-shell`, `app-rail`, `app-sidebar`, `app-content` | All reusable composition goes here. **Never** put shell/panel UI in `apps/web`.                                      |
| Leaf components              | `packages/ui/src/components/*`                                               | shadcn-derived primitives (Button, Tabs, DataTable, ActionBar, …).                                                   |
| App data wrappers            | `apps/web/app/_components/*`                                                 | Thin client components that feed **data** (mock today) + live `usePathname()` into the blocks. No layout logic.      |
| Shell mount                  | `apps/web/app/[orgSlug]/layout.tsx`                                          | Mounts the persistent `OrgShell` **once** (rail + sidebar + chrome). Page bodies swap underneath it.                 |
| Page body                    | `apps/web/app/[orgSlug]/<module>/page.tsx`                                   | Fills the content-panel **body only**. The shell owns every chrome slot; a page never wires `AppShell` itself.       |
| Nav (structure-driven)       | `apps/web/app/[orgSlug]/_nav/org-nav.ts` + `<module>/nav.ts`                 | Rail + bottom-nav + `MODULE_NAV` (here); each module's sidebar tree (co-located). Drift-guarded by `pnpm check:nav`. |

This split is the `ui-belongs-in-packages-ui-blocks` convention. The pre-commit
`ui-location` lefthook hook (`scripts/governance/check-ui-location.mjs`)
hard-blocks reusable UI under `apps/web/components/` (reserved; `debug/` only)
and warns when a `apps/web/app/_components/**` file ships reusable interaction
(drag / pointer-capture / keyboard nav) that likely belongs in `packages/ui`.
The `_components` data layer itself can't be hard-blocked — it legitimately
holds thin data wrappers — so its "is this a trapped reusable block?" case stays
review-enforced. Reusable composition goes in `packages/ui`; only thin data
wrappers belong under `apps/web/app/_components`.

### How a page connects to the shell

`layout.tsx` mounts `OrgShell` once; your `page.tsx` renders **only the body**.
The sidebar, rail, and header title are derived from the URL, so you write no
chrome wiring:

- **active module** = the rail entry whose href prefixes the path;
- **sidebar tree** = `MODULE_NAV[moduleKey]` → the co-located `<module>/nav.ts`;
- **content-panel title** = the active nav leaf's label (longest-prefix match).

So adding a page is mostly: drop a `page.tsx`, add one nav leaf, run
`pnpm check:nav`. Override the header (custom tabs/actions) only when needed, via
`OrgPageHeader` ([recipe C](#c-custom-content-header-tabs)).

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
inside. The sidebar/assistant toggles live in it.

> These props are passed by **`OrgShell`** (the shell mounted in `layout.tsx`),
> not by a page. A page fills only `children` (the body); to put content in
> `contentHeader` it **portals** a node there via `OrgPageHeader` (see
> [recipe C](#c-custom-content-header-tabs)).

---

## Header context switchers (`AppHeader` `leftContent`)

The 40px global header has a left slot (`AppHeader leftContent`) for the
**context switchers** that sit above the sidebar, left edge (8px inset,
desktop-only — hidden below `md`). Two ship today, both in
`packages/ui/src/blocks/app-header`:

| Component        | Trigger                                   | Dropdown                                                                                                                                               |
| ---------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OrgSwitcher`    | org name + chevron                        | current-org identity (grey-initial avatar · name · role · member count · check) + Settings / Invite, recent orgs (≤3), Create new, Manage in Workspace |
| `PeriodSwitcher` | calendar icon + `MM.YYYY – MM.YYYY` range | every period with a **lock** (closed) / **lock-open** (open) glyph on the left, the active one checked, + Add period                                   |

Both are **presentational + router-agnostic** (data + hrefs in, like
`AppSidebar`). Surface wrappers feed them:
`apps/web/app/_components/org-switcher.tsx` + `period-switcher.tsx` — **both
all-mock today** (see the `DATA SEAM` block at the top of each file for exactly
which query/table backs each field). The org avatar is a grey initial square
standing in for a real logo (none in schema yet). Menu chrome reuses the shared
`HEADER_MENU` class + `initialsOf` from `app-header/header-menu.tsx` (one source
for the profile / help / switcher menus — do not re-copy the class string).

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

The shell owns the `contentHeader` slot, so a page can't pass into it directly —
it **portals**. Render `<OrgPageHeader>` (from
`apps/web/app/_components/org-page-header.tsx`) in your page body; its node lands
in the shell's header while staying in your page's React tree (so it keeps your
state/context). When the header and body share state (active tab, filter
visibility), wrap **your page subtree** — not `AppShell` — in a small context
provider; the Faktury demo does this in
`apps/web/app/_components/content-demo/context.tsx`. Full steps:
[recipe C](#c-custom-content-header-tabs).

---

## Adding a page (subpage, module, or tabs)

Three recipes. All end with `pnpm check:nav` — it fs-walks the route tree and
fails if a nav href has no route folder or a route folder is missing from nav. It
runs as a **pre-push lefthook hook (`nav-drift`), not a required CI check** — a
`--no-verify` push (or a contributor without lefthook installed) can land drift,
so run it yourself. Mind its scope: it guards **rail + sidebar (`MODULE_NAV`)
leaves** only — not footer links, and not the `MODULE_NAV` _key wiring_ (see
recipe B's warning).

### A. Add a subpage to an existing module

Example: a "Journals" page under Accounting (`/<org>/accounting/journals`).

1. Create a **route folder** with a `page.tsx` — a folder, never a bare file
   (`check-nav` only counts a directory containing `page.tsx` as a route):
   `apps/web/app/[orgSlug]/accounting/journals/page.tsx`. Copy
   `accounting/page.tsx`; render a `ModulePage` placeholder or a real
   `ContentPanel` body. (`ModulePage`'s `title` is placeholder body copy — the
   real content-panel title comes from the nav label, not this prop.)
2. Add the leaf to `accounting/nav.ts`. `base` is `/${orgSlug}/accounting`, so the
   href is **`` `${base}/journals` ``** — the full absolute path, not `"journals"`.
   Either a top-level **Page** (`{ label, href, icon }` — `icon` required, an
   `IconName`) or a **Subpage** nested under a Page (`subpages: [{ label, href }]`
   — no icon, max 2):
   ```ts
   export function accountingNav(base: string): SidebarNavEntry[] {
     return [
       { label: "Overview", href: base, icon: "Calculator" },
       { label: "Journals", href: `${base}/journals`, icon: "BookOpen" },
     ]
   }
   ```
3. `pnpm check:nav` → green = wired. The sidebar row and the content-panel title
   appear automatically.

### B. Add a whole new module

Example: a "Payroll" module (`/<org>/payroll`). The `MODULE_NAV` **key**, the
route **folder name**, and the rail **href segment** must be the **same string**
(`payroll`) — `moduleKeyFromHref` derives the key from the rail href's first
segment and `MODULE_NAV[key]` resolves the sidebar tree.

1. `apps/web/app/[orgSlug]/payroll/page.tsx` (copy a module page) +
   `payroll/nav.ts` exporting `payrollNav(base): SidebarNavEntry[]`.
2. In `_nav/org-nav.ts`, **four edits — do all four**:
   - **import** `payrollNav` from `../payroll/nav`;
   - **register** it: add `payroll: payrollNav,` to the `MODULE_NAV` object;
   - **rail** entry in `orgRailNav`: ``{ label, icon, href: `/${orgSlug}/payroll` }``;
   - optional **`orgBottomNav`** entry (mobile bar; cosmetic, skip-able).
3. Pick the `icon` from the **`ICON_NAMES`** union in
   `packages/ui/src/icon-packs/types.ts` — TS rejects anything else. There's no
   "Payroll"/"Wallet" icon; closest fits: `Banknote`, `PiggyBank`, `CreditCard`,
   `ReceiptEuro`, `IdCard`.
4. `pnpm check:nav`, then **load the page and look at the sidebar.** ⚠️ If you add
   the rail entry but forget the `MODULE_NAV` registration, `check:nav` still
   passes (the rail href resolves to the folder) yet the shell silently falls back
   to the Company `Overview` tree (`MODULE_NAV[key] ?? MODULE_NAV[""]`). The guard
   does **not** verify key wiring — a visual check is the only catch.

> The org index ("Company") has no folder; its trivial tree is the inline
> `companyNav` in `org-nav.ts`, not a `company/nav.ts`.

### C. Custom content header (tabs)

Default: **skip this** — the nav-derived title is your header. When a page needs
its own tabs or actions in the content-panel header, render `<OrgPageHeader>` in
the page body; it portals into the shell's header slot (and stays in your page's
tree, so it keeps your state). If tabs drive the body, wrap **your page subtree**
— not `AppShell` — in a small context provider. Copy the live example:
`apps/web/app/[orgSlug]/demo/page.tsx` + `apps/web/app/_components/content-demo/`.

### Verify

`pnpm check:nav`, then `pnpm --filter web typecheck`, `pnpm lint`, the block
tests, and eyeball at `/<org>/<module>` (confirm the sidebar tree + title match —
see recipe B's silent-fallback warning).

---

## Pending real-data work

Tracked in GitHub issue
[#394](https://github.com/hlebtkachenko/monorepo/issues/394):

- **Module bodies**: each module renders a `ModulePage` placeholder — replace
  with a real `ContentPanel` + a route-driven data source as each is built.
- **Sidebar**: reminders + insight are "on-call" (self-hide until a server source
  feeds them) — wire the real sources; swap nav `<a>` → Next `<Link>` when the
  blocks move to real navigation.
- **Content panel**: the `/demo` route
  (`apps/web/app/_components/content-demo`) is a saved, dev-only preview of the
  Table archetype — a reference to copy, not a shipped page. Tab reorder in the
  manage-tabs menu is not built (show/hide + add only).
- **Header switchers** (`org-switcher.tsx` / `period-switcher.tsx`): org
  identity (name/role from `resolveMembership`, a member-count query), recent
  orgs (`listWorkspacesForUser` + a `last_accessed_at` column for true
  recency), org logo, and the whole accounting-period set (no
  `accounting_period` table yet — schema has only
  `organization.fiscal_year_start_month`). Each file's `DATA SEAM` block names
  the exact source.

When you wire a real source, delete the corresponding mock and update this list.

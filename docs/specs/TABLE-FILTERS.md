# Table archetype — filter systems

The Table archetype (`ArchetypeTable`, `docs/specs/CONTENT-ARCHETYPES.md`) ships
**two independent filter systems** that live side by side on the same grid. They
are not variants of one mechanism — different state, different filtering
location, different UI surface. This spec is the reference to read before wiring
filters on a new table page.

1. **In-table faceted filter** — a TanStack `columnFilters` filter that narrows
   rows INSIDE the grid's own row model.
2. **External bazza multi-filter (FilterBar)** — a client pre-filter the PAGE
   applies before handing rows to the section, narrowing the data the grid ever
   sees.

Plus one special case: the **Single Status Filter**, a dedicated faceted
dropdown in the toolbar that is the one sanctioned way to drive the in-table
system from outside the grid.

## 1. The two systems, side by side

|                              | In-table faceted filter                                                                                                                                               | External bazza multi-filter (FilterBar)                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State lives in               | TanStack `columnFilters` on the live table instance (`packages/ui/src/components/data-table/use-data-table.ts:313`, `:322`)                                           | `FiltersState` owned by the PAGE (`useFilterBar`'s `filters`/`setFilters`, `packages/ui/src/components/filter-bar/use-filter-bar.ts:67-81`)                                                                         |
| Filtering happens            | Inside the grid's row model (`getFilteredRowModel` / `getFacetedRowModel`, `use-data-table.ts:328,331-332`)                                                           | On the page, BEFORE the section is built — it recomputes the `rows` array fed into `sectionTable({ rows })`                                                                                                         |
| Column is declared by        | `TableColumnSpec.enableFilter: true` on a column in the section's own `columns` (`packages/ui/src/blocks/content-panel/content-body/sections/section-table.ts:35-36`) | A `ColumnConfig` built with `createColumnConfigHelper()` and passed to `useFilterBar({ columnsConfig })` — a separate list the page authors alongside the section columns                                           |
| Filter logic                 | One hardcoded "value is in the selected set" check, built per column in the renderer (`section-table-renderer.tsx:281-286`)                                           | Typed operator functions per data type: `textFilterFn`, `numberFilterFn`, `dateFilterFn`, `optionFilterFn`, `multiOptionFilterFn` (`packages/ui/src/components/filter-bar/filter-bar-core.ts:951-1009`, `:855-906`) |
| UI surface                   | No dedicated per-column popover today — driven entirely through the Single Status Filter (§2)                                                                         | The toolbar's "Add filter" selector + operator picker + active-filter chips (`ContentToolbarFilter`, `packages/ui/src/blocks/content-panel/content-toolbar/content-toolbar-filter.tsx`)                             |
| Reached from header menu via | `resolveHeaderFilterTarget` routing to `routeToStatus`                                                                                                                | `resolveHeaderFilterTarget` routing to `property`                                                                                                                                                                   |
| Reseeds the section?         | No — same rows, TanStack narrows what's displayed                                                                                                                     | Yes — the page recomputes `rows` and a new array reference resets the section's local draft state (`section-table-renderer.tsx:216-221`)                                                                            |

A column can appear in one, the other, or (structurally) both — but the
archetype's documented convention is **exactly one or the other, never both**
(§2's "archetype filter column rule").

### 1a. In-table faceted filter — mechanics

Declared per column in the section descriptor:

```ts
// section-table.ts:21-40 (TableColumnSpec)
readonly enableFilter?: boolean // "Faceted-filter on this column ... Default false."
```

The renderer turns that into a TanStack `ColumnDef` (`section-table-renderer.tsx:272-299`):

```ts
enableColumnFilter: spec.enableFilter ?? false,
filterFn: spec.enableFilter
  ? (row, id, value) =>
      !Array.isArray(value) || value.length === 0
        ? true
        : value.includes(String(row.getValue(id)))
  : undefined,
meta: {
  label: spec.header,
  align,
  ...(spec.enableFilter
    ? {
        variant: "multiSelect" as const,
        options: spec.options?.map((o) => ({ label: o.label, value: o.value })),
      }
    : {}),
},
```

`useDataTable` (`packages/ui/src/components/data-table/use-data-table.ts:313,322,328,331-332`)
wires `columnFilters` into controlled state and turns on
`getFilteredRowModel` / `getFacetedRowModel` / `getFacetedUniqueValues`, so this
is a real TanStack faceted filter — filtering and facet counts are computed
inside the grid's own row model, not by the page.

Note: `meta.variant: "multiSelect"` + `meta.options` are the contract the
separate, older `packages/ui/src/components/data-table/data-table-toolbar.tsx`
reads to auto-build a per-column faceted popover
(`data-table-toolbar.tsx:80,135`). The Table archetype's `ContentToolbar` does
**not** use that component — it routes header-menu filter requests to the
Single Status Filter instead (§2). The meta fields are set for type-contract
compatibility with the shared `data-table` primitives; they are not rendered
into their own popover inside `ArchetypeTable`.

Nothing in the grid calls `column.setFilterValue()` for a faceted column except
the Single Status Filter's `onChange` (§2). So today exactly one column is
practically drivable through this system per table.

### 1b. External bazza multi-filter — mechanics

Columns are declared separately, with `createColumnConfigHelper()`
(`filter-bar-core.ts:192-203`):

```ts
// apps/web/app/[orgSlug]/settings/debug/archetype-table/archetype-table-view.tsx:165-222
const filterHelper = createColumnConfigHelper<TableSectionRow>()
const FILTER_COLUMNS = [
  filterHelper.text().id("document").accessor(...).displayName("Document").icon(BaselineIcon).build(),
  filterHelper.number().id("amount").accessor(...).displayName("Amount").icon(Calculator).build(),
  filterHelper.date().id("date").accessor(...).displayName("Date").icon(CalendarIcon).build(),
  filterHelper.option().id("kind").accessor(...).displayName("Kind").icon(ListIcon).options(KIND_OPTIONS).build(),
  filterHelper.multiOption().id("tags").accessor(...).displayName("Tags").icon(ListChecksIcon).options(TAG_POOL).build(),
  // ... one entry per column, EXCEPT "status"
] as const
```

`useFilterBar({ strategy: "client", data, columnsConfig, filters, onFiltersChange })`
(`use-filter-bar.ts:53-66`) turns those configs into live `Column[]` + the
`FiltersState` + `DataTableFilterActions`, which the page feeds straight into
the toolbar's `filter` slot (`ContentToolbarProps.filter`,
`toolbar-descriptors.ts:49-58,110`).

Because `strategy: "client"` (`filter-bar-types.ts:159`), the FilterBar itself
does not touch any rows — the PAGE is responsible for applying `FiltersState`
to its own data and handing the result to the section:

```ts
// archetype-table-view.tsx:224-254 — matchesFilters, dispatch by FilterModel.type
function matchesFilters(row: TableSectionRow, filters: FiltersState): boolean {
  return filters.every((filter) => {
    const raw = row[filter.columnId]
    switch (filter.type) {
      case "text":
        return textFilterFn(String(raw ?? ""), filter as FilterModel<"text">)
      case "number":
        return numberFilterFn(Number(raw ?? 0), filter as FilterModel<"number">)
      case "date":
        return dateFilterFn(
          new Date(String(raw ?? "")),
          filter as FilterModel<"date">,
        )
      case "option":
        return optionFilterFn(
          String(raw ?? ""),
          filter as FilterModel<"option">,
        )
      case "multiOption":
        return multiOptionFilterFn(
          String(raw ?? "")
            .split(",")
            .filter(Boolean),
          filter as FilterModel<"multiOption">,
        )
      default:
        return true
    }
  })
}

// archetype-table-view.tsx:465-473 — view tab AND bazza filters both narrow
// the array fed to sectionTable({ rows })
const rows = React.useMemo(() => {
  const tab = INVOICE_TABS.find((t) => t.value === activeTab)
  const base = !tab?.kind
    ? DEMO_ROWS
    : DEMO_ROWS.filter((row) => row.kind === tab.kind)
  return filters.length
    ? base.filter((row) => matchesFilters(row, filters))
    : base
}, [activeTab, filters])
```

Each `FilterModel` (`filter-bar-types.ts:201-208`) carries `columnId`, `type`,
an `operator` from a per-type union (`TextFilterOperator`,
`NumberFilterOperator`, `DateFilterOperator`, `OptionFilterOperator`,
`MultiOptionFilterOperator` — `filter-bar-types.ts:161-199`), and `values`. This
is a much richer model than the in-table system's single "value in set" check —
e.g. numbers get `is between` / `is greater than or equal to`, dates get
`is before` / `is on or after`, text gets `contains` / `does not contain`.

Because a new `rows` array reference reseeds the section's local draft state
(the render-time reset in `section-table-renderer.tsx:216-221`), every bazza
filter change effectively remounts the grid's data — this is "external
narrowing," in contrast to the in-table system which never touches `rows`.

## 2. The Single Status Filter

`StatusFilterDescriptor` (`toolbar-descriptors.ts:26-40`) is a dedicated,
always-first toolbar slot (`ContentToolbarProps.statusFilter`,
`toolbar-descriptors.ts:108`, rendered first in `content-toolbar.tsx:49`):

```ts
/** SSF descriptor — processing-status only (Human/Agent pipeline), NEVER a column filter. */
export interface StatusFilterDescriptor {
  title: string
  options: StatusFilterOption[]
  value: string[]
  onChange: (value: string[]) => void
  multiple?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * The table column this faceted control filters (e.g. `"status"`). Set it so a
   * per-column header "Filter" on that column routes here instead of the
   * multi-filter selector, which does not carry the delegated column.
   */
  columnId?: string
}
```

It renders as a standalone faceted multi-select (`ContentToolbarStatusFilter`,
`content-toolbar-status-filter.tsx`) — a dashed-outline trigger + Popover +
Command checklist, functionally identical in look to a bazza option filter but
wired directly to `value`/`onChange`, with **no** FilterBar column underneath
it.

In the reference page it is bound to the TanStack `status` column directly
(`archetype-table-view.tsx:479-491`):

```ts
const statusColumn = table?.getColumn("status")
const statusValue = (statusColumn?.getFilterValue() as string[]) ?? []
statusFilter: {
  title: "Status",
  columnId: "status",
  options: STATUS_OPTIONS,
  value: statusValue,
  onChange: (value) => statusColumn?.setFilterValue(value.length ? value : undefined),
  multiple: true,
  open: statusOpen,
  onOpenChange: setStatusOpen,
}
```

So Status is the one column that both: (a) sets `enableFilter: true` in
`COLUMNS` (`archetype-table-view.tsx:128-136`) — giving it a real
`filterFn`/`columnFilters` slot in the grid (§1a) — and (b) is the only column
whose filter value is ever actually written, via the Status dropdown's
`onChange` calling `column.setFilterValue()`.

### Header-menu routing: `resolveHeaderFilterTarget`

Every interactive column header carries a "Filter" item in its dropdown menu
regardless of `enableFilter` (`data-grid-view-column-header.tsx:210-214`,
gated only by whether the section renderer supplied an `onColumnFilter`
callback at all, not by the column's own filterability). Clicking it calls
`columnMenu.onColumnFilter(column.id)` →
`useSectionColumnMenu().onColumnFilter` → the bridge's `openColumnFilter`
(`section-table-context.tsx:191-201`, `:84-87`), which records the requested
column id and opens the shared filter-open flag.

`ArchetypeTableChrome` resolves that request against both filter systems with
`resolveHeaderFilterTarget` (`archetype-table.tsx:76-88`):

```ts
export function resolveHeaderFilterTarget(
  requestedColumnId: string | undefined,
  filterColumnIds: readonly string[],
  statusColumnId: string | undefined,
): { property: string | undefined; routeToStatus: boolean } {
  if (requestedColumnId == null)
    return { property: undefined, routeToStatus: false }
  if (filterColumnIds.includes(requestedColumnId))
    return { property: requestedColumnId, routeToStatus: false }
  if (statusColumnId != null && requestedColumnId === statusColumnId)
    return { property: undefined, routeToStatus: true }
  return { property: undefined, routeToStatus: false }
}
```

Three branches:

1. **The clicked column is one of the bazza multi-filter's columns**
   (`filterColumnIds.includes(requestedColumnId)`) → preselect it as the
   `property` on the "Add filter" selector; `routeToStatus: false`.
2. **The clicked column is the one delegated to the faceted status control**
   (`requestedColumnId === statusColumnId`) → `routeToStatus: true` and no
   `property` — the chrome opens the Status dropdown instead of the
   multi-filter.
3. **Neither** (unknown id, or no request at all) → both `undefined`/`false` —
   the multi-filter never receives an id it doesn't recognize (which would
   throw inside `FilterSelector`'s `getColumn`), and nothing routes to Status.

The consuming effect in `ArchetypeTableChrome` (`archetype-table.tsx:206-232`)
turns branch 2 into action — it opens the Status control and then clears the
bridge's shared filter-open state so the multi-filter never sees the delegated
column id:

```ts
const filterTarget = resolveHeaderFilterTarget(
  columnFilter.filterColumnId,
  toolbarProps.filter?.columns.map((c) => c.id) ?? [],
  toolbarProps.statusFilter?.columnId,
)
const openStatusFilter = toolbarProps.statusFilter?.onOpenChange
React.useEffect(() => {
  if (!filterTarget.routeToStatus || !columnFilter.filterOpen) return
  openStatusFilter?.(true)
  columnFilter.setFilterOpen(false)
  columnFilter.setFilterColumnId(undefined)
}, [filterTarget.routeToStatus, columnFilter.filterOpen])
```

### The archetype filter column rule

Documented directly in the reference page's comments
(`archetype-table-view.tsx:159-164`):

> Multi-filter (bazza) columns for the toolbar `filter` slot. RULE: every table
> column is filterable here EXCEPT the one delegated to the faceted
> statusFilter ("status"). So this mirrors `COLUMNS` minus `status`, with one
> entry per supported filter type.

Concretely: `COLUMNS` has 8 entries (`document`, `partner`, `status`,
`amount`, `vat`, `date`, `kind`, `tags`); `FILTER_COLUMNS` has 7 — every one of
those except `status`. This is enforced by convention (page authorship), not by
a runtime check — `resolveHeaderFilterTarget`'s three-branch fallback is what
keeps the two systems from fighting over the same column even if that
convention slips (an id in neither list just opens the bazza selector with no
preselected property; there is no double-filter path, since the bazza
`FilterDescriptor` never lists `status` and the Status dropdown's `onChange` is
the only writer of the `status` column's TanStack filter value).

## 3. Which do I use?

- **Faceted (§1a, via the Single Status Filter, §2)** — fast, in-grid, no
  reseed, computed with TanStack's own faceted row model
  (`getFacetedRowModel`/`getFacetedUniqueValues`). Best for a column with a
  small, closed set of discrete values that gates a workflow (a processing
  status, a pipeline stage). Today the archetype only routes ONE such column
  per table — the one named by `StatusFilterDescriptor.columnId` — through a
  dedicated toolbar control; there is no generic per-column faceted popover
  wired into `ArchetypeTable` yet.
- **Bazza multi-filter (§1b)** — rich typed operators (contains/is
  between/is before/include any of/...), applied at the page level as an
  external pre-filter before the section is built. Best for everything else:
  free text, numeric ranges, dates, and any option/multiOption column that
  isn't the one delegated to Status. Reseeds the grid's local draft state on
  every change (a fresh `rows` array), same as a view-tab switch.
- **Status filter** is the deliberate single exception: it looks like a
  faceted option filter (same visual language as a bazza `option` chip) but is
  wired straight to the TanStack column, sits permanently first in the
  toolbar, and is reserved for exactly one column at a time.

**How they interact / stay non-overlapping:**

- The "archetype filter column rule" (§2) keeps `FILTER_COLUMNS` and
  `StatusFilterDescriptor.columnId` disjoint by construction — a table author
  should include every filterable column in exactly one of the two lists,
  never both.
- `resolveHeaderFilterTarget` is the single place that turns a header "Filter"
  click into a decision between the two systems, so a contributor adding a new
  column only needs to add it to `FILTER_COLUMNS` (or set `enableFilter` +
  wire `StatusFilterDescriptor` if it's meant to be the one faceted column) —
  the routing is generic.
- Both systems can coexist inertly (a column with `enableFilter: true` that
  TanStack could filter, and a totally separate bazza config) but only one
  should ever have a UI control writing to it — that is the rule to preserve
  when extending a table, not something the types currently enforce.

## 4. Column-driven filters (preferred wiring)

The bazza multi-filter (§1b) is no longer hand-wired per page. A column spec
declares a shared PRESET and the config + apply-pass are DERIVED from it, so two
columns of the same variant (e.g. "Due date" and "Start date") reuse the same
date-picker filter and only supply their own label — no per-page
`createColumnConfigHelper` chain or `matchesFilters`.

- **Declare** on the column spec (`section-table.ts`):
  `{ id: "date", header: "Date", kind: "text", filter: { variant: "date" } }`.
  `variant` is one of `text | number | date | option | multiOption`; option
  variants default their values to the column's own `options`.
- **Derive + apply** (`derive-table-filters.ts`): `deriveFilterColumns(columns)`
  builds the FilterBar `columnsConfig` (accessor reads `row[col.id]` and coerces
  per variant); `applyTableFilters(rows, filters, columns)` is the row pre-filter,
  dispatching each `FilterModel` to the preset `filterFn`.
- **One call in the page** (`use-table-filters.ts`):
  `const { filter, rows } = useTableFilters({ columns, rows: base, filters, onFiltersChange: setFilters })`
  — returns the ready toolbar `filter` slot and the pre-filtered `rows`.
- **Toolbar** (`content-toolbar/build-table-toolbar.ts`):
  `buildTableToolbar(table, { search, status, filter, add })` assembles the whole
  `ContentToolbarProps`, wiring search → `setGlobalFilter` and the Single Status
  Filter → its delegated column, and defaulting the columns manager on.

The Single Status Filter (§2) stays the special-cased single faceted column; a
column delegated to it should carry no `filter` preset (the archetype filter
column rule, §2, now enforced by simply omitting `filter` on that column).

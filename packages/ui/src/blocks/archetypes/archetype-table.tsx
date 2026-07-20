"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { AppInspectorRail, AppPageHeader } from "@workspace/ui/blocks/app-shell"
import {
  ContentFooter,
  ContentHeader,
  ContentPanel,
  ContentToolbar,
  SectionTableProvider,
  useOptimisticFavorite,
  useSectionColumnAnalyze,
  useSectionColumnFilter,
  useSectionInspect,
  useSectionInspectOpener,
  useSectionTable,
  useTableFilters,
} from "@workspace/ui/blocks/content-panel"
import { toast } from "@workspace/ui/components/sonner"
import type {
  ContentFooterAction,
  ContentHeaderBackLinkData,
  ContentHeaderBreadcrumbItem,
  ContentHeaderFavoriteToggle,
  ContentToolbarProps,
  FilterDescriptor,
  InspectorMode,
  SectionCellCommit,
  SectionCreateOption,
  SectionDescriptor,
  SectionPivotDrill,
  TableColumnSpec,
  TableSectionRow,
  TreeTableRow,
  ViewTab,
} from "@workspace/ui/blocks/content-panel"
import type {
  InspectorBadge,
  InspectorCopyTarget,
  InspectorFooterProps,
  InspectorTab,
} from "@workspace/ui/blocks/inspector-sheet"
import type { FiltersState } from "@workspace/ui/components/filter-bar"
import type { IconName } from "@workspace/ui/icon-packs"

/** Stable empty inputs for the auto-filter hook when a body has no flat Table
 *  section (a Pivot body) — kept module-level so their identity never changes. */
const NO_COLUMNS: readonly TableColumnSpec[] = []
const NO_ROWS: readonly TableSectionRow[] = []
const NO_TREE_ROWS: readonly TreeTableRow[] = []

/** Depth-first find of a tree node by id; returns its flat `values` record so the
 *  page's `inspectorRow*` callbacks receive the SAME shape a flat table row gives. */
function findTreeNodeValues(
  nodes: readonly TreeTableRow[],
  id: string,
): TableSectionRow | undefined {
  for (const node of nodes) {
    if (node.id === id) return node.values as TableSectionRow
    if (node.subRows?.length) {
      const hit = findTreeNodeValues(node.subRows, id)
      if (hit) return hit
    }
  }
  return undefined
}

import type { AllowedSectionKind } from "./archetype-section-policy"
import { assertSectionsAllowed } from "./archetype-section-policy"

/**
 * The header's views cluster — controlled tabs plus the optional configure (⋯)
 * menu. Data, wired to whatever drives the body (a Table page usually has views).
 */
export interface ArchetypeTableViews {
  readonly tabs: ViewTab[]
  readonly value: string
  readonly onValueChange: (value: string) => void
  /** Adds the trailing "+ Add view" button (its dropdown is wired later). */
  readonly onAddView?: () => void
}

/**
 * Route a per-column header "Filter" request to the right toolbar control.
 *
 * - a column the multi-filter owns → preselect it in that selector (`property`)
 * - the column delegated to the faceted statusFilter (`statusColumnId`) →
 *   `routeToStatus` (the chrome opens that control instead)
 * - anything else (or no request) → neither, so the multi-filter never receives
 *   an unknown id, which would throw in the FilterSelector's `getColumn`.
 *
 * Exported for unit testing; the chrome is the only caller.
 */
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

/**
 * Capabilities the archetype hands to the selection-footer builder — things only
 * the archetype can do (it owns the Inspector, the page renders from outside the
 * provider). `openInspectorTab` opens the row of `id` (matched by the Table
 * section's `rowIdKey`) on a given Inspector tab — e.g. a footer
 * "Open in Inspector · Export". No-op if the id isn't in the current rows.
 */
export interface ArchetypeTableSelectionHelpers {
  readonly openInspectorTab: (id: string, tab: InspectorTab) => void
}

export interface ArchetypeTableProps<TData extends TableSectionRow> {
  /** Page title shown in the content header. */
  title: string
  /** Optional decorative leading icon (closed `IconName`). */
  titleIcon?: IconName
  /** Optional ancestor trail left of the title. */
  breadcrumb?: ContentHeaderBreadcrumbItem[]
  /** Optional `‹ Back to {label}` link — for a record opened from a source list. */
  backTo?: ContentHeaderBackLinkData
  /**
   * The header views cluster — MANDATORY for a Table (every dense list page has
   * views; at minimum a single "All"). A required prop so a page cannot ship a
   * Table with no views: omitting it is a `tsc` error, not a silently bare page.
   */
  views: ArchetypeTableViews
  /**
   * The self-managing favorite star — MANDATORY for a Table page (a content page
   * is favoritable, per the app's favorites rule). Required so a page cannot ship
   * a Table with no star. The archetype owns the optimism; the page supplies seed
   * state + persistence (a bound server action).
   */
  favorite: ContentHeaderFavoriteToggle
  /**
   * The page-wide toolbar — a FUNCTION of the Table section's live instance
   * (`null` on the first paint, before the section registers). Build the closed
   * named-data-slot descriptor here, binding `viewTools`/faceted filters to the
   * passed `table`. A function (not a plain descriptor) because the live instance
   * is minted inside the closed section renderer and reaches the toolbar only
   * through the archetype's `SectionTableProvider` bridge.
   */
  toolbar: (table: Table<TData> | null) => ContentToolbarProps<TData>
  /**
   * The body: branded Sections. Exactly one `sectionTable(...)` is the norm; a
   * `space` above it is common. Rendered via the closed `SECTION_REGISTRY`.
   * Narrowed to the Table archetype's allowed section kinds (the section-library
   * policy in `archetype-section-policy.ts`) — a `details-*` / `inspector-*`
   * section wired here is a `tsc` error, not a runtime surprise.
   */
  sections: readonly SectionDescriptor<AllowedSectionKind<"table">>[]
  /**
   * Bulk actions for the selection footer — MANDATORY for a Table (the footer is
   * a required part of the archetype). A FUNCTION of the live table (like
   * `toolbar`) so each action's `onSelect` can close over the current selection
   * (`table.getFilteredSelectedRowModel().rows`) to do real work. The archetype
   * renders the `ContentFooter` auto-wired to the Table section's selection
   * (count + clear from the live instance); it self-hides when nothing is
   * selected. Required so a Table can't ship with a dead selection. NO status bar.
   */
  selectionActions: (
    table: Table<TData> | null,
    helpers: ArchetypeTableSelectionHelpers,
  ) => ContentFooterAction[]
  /**
   * Persist an inline-cell edit. Wired through the `SectionTableProvider` bridge
   * to the Table section's cell editors (the descriptor stays pure data); the
   * renderer applies the edit optimistically and reverts if this rejects. Columns
   * opt in via `edit: "inline" | "both"`; `"inspector"` columns are edited in the
   * Inspector instead (page-owned).
   */
  onCellEdit?: SectionCellCommit
  /**
   * Persist a new option created in a `creatable: true` select column (e.g.
   * "add this counterparty to the directory"). Wired through the same bridge; the
   * renderer adds the value to the column's live options immediately and calls
   * this to persist it. Unwired → the new option shows for the session only.
   */
  onCreateOption?: SectionCreateOption
  /**
   * Open the underlying records when a Pivot aggregate cell is drilled into.
   * The renderer computes the {@link SectionPivotDrill} target (the cell's
   * coordinates + the matching source rows) and hands it here; the page renders
   * the records (e.g. a dialog/Sheet). Unwired → pivot cells are inert.
   */
  onPivotDrill?: SectionPivotDrill
  /** Row-detail Inspector — the detail of the chosen row (panel or dialog). */
  inspector?: React.ReactNode
  inspectorOpen?: boolean
  inspectorMode?: InspectorMode
  onInspectorOpenChange?: (open: boolean) => void
  inspectorTitle?: React.ReactNode
  inspectorFooter?: React.ReactNode
  /**
   * Row-inspector rail: when `inspectorRowTitle` is set, the Table section's
   * per-row maximize affordance opens the right-docked `AppInspectorRail`
   * (`InspectorSheet` from `blocks/inspector-sheet`). These map the clicked row
   * (pure data) to the sheet's identity/badge/tab content/footer. Domain-specific,
   * so they live in the app layer — the archetype owns only the rail shell +
   * open state + adjacent-row navigation.
   */
  /** Maps the inspected row to the breadcrumb's trailing crumb + fallback name. */
  inspectorRowTitle?: (row: TData) => string
  /** Maps the inspected row to the editable name shown in the sheet body.
   *  Falls back to `inspectorRowTitle`'s result when omitted. */
  inspectorRowName?: (row: TData) => string
  /** Maps the inspected row to an optional posting-status badge next to the name. */
  inspectorRowBadge?: (row: TData) => InspectorBadge | undefined
  /** Maps the inspected row to per-tab Inspector body content (details/activity/…). */
  inspectorRowContent?: (
    row: TData,
  ) => Partial<Record<InspectorTab, React.ReactNode>>
  /** Copy dropdown in the inspector sheet header (link / number / id). */
  onInspectorCopy?: (row: TData, what: InspectorCopyTarget) => void
  /** Switch-layout affordance in the inspector sheet header. */
  onInspectorSwitchLayout?: (row: TData) => void
  /**
   * Deep-link: open the Inspector for the row whose `rowIdKey` value equals this,
   * once, when the grid first has that row. Drives the "Copy link" affordance —
   * `…?inspect=<id>` re-opens the same record. Cleared internally after it fires.
   */
  openRowId?: string
  /** Decline action in the sticky inspector footer (label + handler). */
  inspectorDeclineLabel?: string
  onInspectorDecline?: (row: TData) => void
  /** Approve (primary) action in the sticky inspector footer (label + handler). */
  inspectorApproveLabel?: string
  onInspectorApprove?: (row: TData) => void
  /** Extra classes for the scrolling body region. */
  bodyClassName?: string
}

/**
 * ArchetypeTable — the Table archetype: a layout for the WHOLE Content Panel of a
 * dense list page (invoices, transactions, counterparties). It composes the
 * reusable closed blocks + a branded **Table section**, no hardcoded chrome:
 *   - ContentHeader — title + optional views
 *   - ContentToolbar — the full closed named-data-slot vocabulary, wired to the grid
 *   - ContentBody — the branded `sectionTable(...)` (TanStack grid inside the renderer)
 *   - ContentFooter — optional bulk-selection bar (NO status bar — legacy)
 *   - Inspector — optional row-detail panel / dialog
 *
 * It owns the `SectionTableProvider` bridge: the Table section mints its live
 * TanStack instance and publishes it up, and the toolbar (`viewTools`) + selection
 * footer consume it. The descriptor stays pure data; the instance is minted in the
 * renderer; the chrome drives it through the provider.
 *
 * GOVERNANCE — the mandatory chrome is guaranteed, not left to the page:
 *   - `views`, `favorite`, `selectionActions` are REQUIRED props, so a Table with
 *     no views / no favorite star / a dead selection footer is a compile error.
 *   - the per-column FILTER is AUTO-GENERATED from the Table section's own columns
 *     (see `useTableFilters` above) and the rows are narrowed here — the page never
 *     wires it, so it can never be forgotten or wired partially. This is the fix
 *     for a reference page that once shipped as a bare table: the rule "every
 *     column spawns a filter" is now true by construction, not by convention.
 */
export function ArchetypeTable<TData extends TableSectionRow>(
  props: ArchetypeTableProps<TData>,
) {
  return (
    <SectionTableProvider
      onCellCommit={props.onCellEdit}
      onCreateOption={props.onCreateOption}
      onPivotDrill={props.onPivotDrill}
    >
      <ArchetypeTableChrome {...props} />
    </SectionTableProvider>
  )
}

function ArchetypeTableChrome<TData extends TableSectionRow>({
  title,
  titleIcon,
  breadcrumb,
  backTo,
  views,
  favorite,
  toolbar,
  sections,
  selectionActions,
  inspector,
  inspectorOpen,
  inspectorMode,
  onInspectorOpenChange,
  inspectorTitle,
  inspectorFooter,
  inspectorRowTitle,
  inspectorRowName,
  inspectorRowBadge,
  inspectorRowContent,
  onInspectorCopy,
  onInspectorSwitchLayout,
  openRowId,
  inspectorDeclineLabel,
  onInspectorDecline,
  inspectorApproveLabel,
  onInspectorApprove,
  bodyClassName,
}: ArchetypeTableProps<TData>) {
  // Dev-only belt: the narrowed `sections` type already forbids a wrong-kind
  // section at compile time; this also catches an `as`-cast bypass at runtime.
  assertSectionsAllowed("table", sections)
  const favoriteControlled = useOptimisticFavorite(favorite)
  const registration = useSectionTable()
  const table = registration
    ? (registration.table as unknown as Table<TData>)
    : null

  // ── Auto-generated per-column filter — the "every Table column spawns a
  // filter" rule made true BY CONSTRUCTION, not by page wiring. The archetype
  // reads the flat Table section's own columns + rows, owns the multi-filter
  // state, and narrows the rows itself. A page therefore cannot forget the filter
  // or wire it partially: the filter is derived from the same column specs the
  // grid renders, so a new column is filterable the instant it is added. A Pivot
  // body has no flat `table` section, so it keeps its page-supplied source filter.
  const tableSectionIndex = sections.findIndex(
    (section) => section.kind === "table",
  )
  const tableSection =
    tableSectionIndex >= 0 ? sections[tableSectionIndex] : undefined
  const tablePayload = tableSection?.props as
    | {
        columns: readonly TableColumnSpec[]
        rows: readonly TableSectionRow[]
        rowIdKey: string
      }
    | undefined
  const [filters, setFilters] = React.useState<FiltersState>([])
  const autoFilter = useTableFilters({
    columns: tablePayload?.columns ?? NO_COLUMNS,
    rows: tablePayload?.rows ?? NO_ROWS,
    filters,
    onFiltersChange: setFilters,
  })

  // Row Inspector: the section renderer's maximize affordance publishes the
  // clicked row through the bridge; the row stays set through the close
  // animation. Adjacent-row navigation walks the table's CURRENT (sorted/
  // filtered/visible) row order, so previous/next always matches what the grid
  // shows — not the raw input rows.
  const { inspectRow, inspectTab, inspectNonce, inspectOpen, setInspectOpen } =
    useSectionInspect()
  const openInspect = useSectionInspectOpener()
  const visibleRows = table?.getRowModel().rows ?? []

  // The section that FEEDS the row-rail inspector — a flat `table` OR a
  // `tree-table`. SEPARATE from `tableSection` (flat-only, which drives the
  // auto-filter + row re-mint) so a tree, which brings its own filtering, is
  // never double-filtered or re-minted into the wrong shape.
  const inspectSection = sections.find(
    (section) => section.kind === "table" || section.kind === "tree-table",
  )
  const isTreeInspect = inspectSection?.kind === "tree-table"
  const flatInspectPayload =
    inspectSection && !isTreeInspect
      ? (inspectSection.props as {
          rows: readonly TableSectionRow[]
          rowIdKey: string
        })
      : undefined
  const treeInspectRows =
    inspectSection && isTreeInspect
      ? (inspectSection.props as { rows: readonly TreeTableRow[] }).rows
      : undefined

  // Adjacent-row navigation (prev/next) walks the grid's CURRENT visible order,
  // so it always matches what the user sees. A tree's visible rows include
  // structural tier nodes (`selectable === false`) — never inspectable — so
  // navigation skips them.
  const navIndex = visibleRows.findIndex((row) => row.original === inspectRow)
  const inspectableNeighbor = (from: number, step: number) => {
    for (let i = from + step; i >= 0 && i < visibleRows.length; i += step) {
      const row = visibleRows[i]!
      if (
        !isTreeInspect ||
        (row.original as unknown as TreeTableRow).selectable !== false
      )
        return row
    }
    return undefined
  }
  const previousRow =
    navIndex >= 0 ? inspectableNeighbor(navIndex, -1) : undefined
  const nextRow = navIndex >= 0 ? inspectableNeighbor(navIndex, 1) : undefined

  // Inspector CONTENT is resolved from the archetype's OWN fresh row list by the
  // inspected row's id, NOT from the live TanStack model (which lags a render
  // behind its child renderer) — so an edit committed from a cell, an inspector
  // field, or Approve/Reject shows immediately. A flat table resolves by its
  // `rowIdKey`; a tree resolves by the node's top-level `id`, depth-first through
  // the nested forest, returning the node's flat `values` (the shape callbacks
  // expect from a flat row).
  const rowIdKey = isTreeInspect ? "id" : (flatInspectPayload?.rowIdKey ?? "id")
  const inspectId =
    inspectRow == null
      ? null
      : isTreeInspect
        ? String((inspectRow as unknown as TreeTableRow).id ?? "")
        : String((inspectRow as TableSectionRow)[rowIdKey] ?? "")
  const resolvedRow: TableSectionRow | undefined = !inspectId
    ? undefined
    : isTreeInspect
      ? findTreeNodeValues(treeInspectRows ?? NO_TREE_ROWS, inspectId)
      : (flatInspectPayload?.rows ?? NO_ROWS).find(
          (row) => String(row[rowIdKey]) === inspectId,
        )
  const inspectFallback: TableSectionRow | null = isTreeInspect
    ? ((inspectRow as unknown as TreeTableRow | null)?.values ?? null)
    : (inspectRow as TableSectionRow | null)
  const inspectData = (resolvedRow ?? inspectFallback) as TData | null
  const inspectRecordKey = inspectId ?? ""

  // Auto-close the rail once the inspected row can no longer be resolved (edited
  // out of the view, or deleted — including a bulk delete that empties the whole
  // view) so nothing acts against a gone record. `inspectId` is only set while a
  // row is inspected, and `pageRows` is the descriptor's own list (populated
  // before the grid registers), so this never fires spuriously on first paint.
  React.useEffect(() => {
    if (inspectOpen && inspectId && !resolvedRow) setInspectOpen(false)
  }, [inspectOpen, inspectId, resolvedRow, setInspectOpen])

  // Deep-link: open the Inspector once for `openRowId` as soon as the grid holds
  // that row. Ref-guarded so it fires a single time per id (a subsequent user
  // close/navigate is never re-overridden).
  const openedDeepLinkRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!openRowId || !openInspect) return
    if (openedDeepLinkRef.current === openRowId) return
    // A tree's target may be collapsed (rows start at `defaultExpanded`), so search
    // the FULL core model and expand the ancestor chain before opening; a flat
    // table already has all its rows visible.
    const pool = isTreeInspect
      ? (table?.getCoreRowModel().flatRows ?? [])
      : visibleRows
    const match = pool.find((row) => row.id === openRowId)
    if (!match) return
    openedDeepLinkRef.current = openRowId
    if (isTreeInspect)
      match.getParentRows().forEach((parent) => parent.toggleExpanded(true))
    openInspect(match.original)
  }, [openRowId, visibleRows, openInspect, isTreeInspect, table])

  const inspectTitle =
    inspectorRowTitle && inspectData != null
      ? inspectorRowTitle(inspectData)
      : null
  const inspectName =
    inspectData != null
      ? (inspectorRowName ?? inspectorRowTitle)?.(inspectData)
      : undefined
  const inspectBadge =
    inspectorRowBadge && inspectData != null
      ? inspectorRowBadge(inspectData)
      : undefined
  const inspectContent =
    inspectorRowContent && inspectData != null
      ? inspectorRowContent(inspectData)
      : undefined
  // The footer's mutating actions are gated on the FRESH `resolvedRow`, not the
  // `inspectData` fallback — so once the inspected row is gone the Approve/Reject
  // buttons disappear and can never fire against a stale/deleted record, even in
  // the frame before the auto-close effect runs.
  const inspectFooter: InspectorFooterProps | undefined =
    (onInspectorDecline || onInspectorApprove) && resolvedRow != null
      ? {
          declineLabel: inspectorDeclineLabel ?? "Decline",
          approveLabel: inspectorApproveLabel ?? "Approve",
          onDecline: onInspectorDecline
            ? () => onInspectorDecline(resolvedRow as TData)
            : undefined,
          onApprove: onInspectorApprove
            ? () => onInspectorApprove(resolvedRow as TData)
            : undefined,
        }
      : undefined

  // Per-column header "Filter" opens the ONE toolbar filter at that column: the
  // chrome injects the bridge's shared open-state into the consumer-supplied
  // `filter` descriptor, so the header action and the toolbar's own "Add filter"
  // selector share a single source of truth.
  const columnFilter = useSectionColumnFilter()
  const toolbarProps = toolbar(table)

  // A flat Table shows the archetype's auto filter (every column, minus any one
  // the page delegated to the faceted statusFilter — a column is filtered by
  // exactly one system). A Pivot body has no auto filter, so it shows the page's
  // own source filter. The auto filter is over `TableSectionRow` (the section's
  // row type); `TData extends TableSectionRow`, so a `FilterDescriptor` over the
  // base row narrows to the page's `TData` with a single, sound cast.
  const statusColumnId = toolbarProps.statusFilter?.columnId
  const effectiveFilter: FilterDescriptor<TData> | undefined = tableSection
    ? ({
        ...autoFilter.filter,
        columns: statusColumnId
          ? autoFilter.filter.columns.filter((c) => c.id !== statusColumnId)
          : autoFilter.filter.columns,
      } as FilterDescriptor<TData>)
    : toolbarProps.filter

  const filterTarget = resolveHeaderFilterTarget(
    columnFilter.filterColumnId,
    effectiveFilter?.columns.map((c) => c.id) ?? [],
    statusColumnId,
  )
  const openStatusFilter = toolbarProps.statusFilter?.onOpenChange
  React.useEffect(() => {
    if (!filterTarget.routeToStatus || !columnFilter.filterOpen) return
    openStatusFilter?.(true)
    // Consume the bridge request so the multi-filter never sees the delegated id.
    columnFilter.setFilterOpen(false)
    columnFilter.setFilterColumnId(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTarget.routeToStatus, columnFilter.filterOpen])
  const wiredToolbar: ContentToolbarProps<TData> = effectiveFilter
    ? {
        ...toolbarProps,
        filter: {
          ...effectiveFilter,
          property: filterTarget.property,
          onPropertyChange: columnFilter.setFilterColumnId,
          // Keep the multi-filter closed while a statusFilter request is in flight.
          open: filterTarget.routeToStatus ? false : columnFilter.filterOpen,
          onOpenChange: columnFilter.setFilterOpen,
        },
      }
    : toolbarProps

  // Per-column header "AI analyze" — placeholder feedback until Sidekick column
  // analysis lands; the nonce re-fires on repeat clicks of the same column.
  const analyzeRequest = useSectionColumnAnalyze()
  const analyzeNonce = analyzeRequest?.nonce
  React.useEffect(() => {
    if (!analyzeRequest) return
    const label =
      table?.getColumn(analyzeRequest.columnId)?.columnDef.meta?.label ??
      analyzeRequest.columnId
    toast(`Ask AI about “${label}”`, {
      description: "Column analysis is coming soon.",
    })
    // Fire once per request (nonce); label/table read at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzeNonce])

  // Resolve the selection actions against the live table so each `onSelect` can
  // read the current selection; self-hides when there are none.
  // Feed the AUTO-FILTERED rows to the flat Table section (re-minting only that
  // one descriptor, same kind+index → the grid instance survives, so sort /
  // selection / search are kept). A Pivot body is passed through untouched.
  const renderedSections = tableSection
    ? sections.map((section, index) =>
        index === tableSectionIndex
          ? ({
              ...section,
              props: { ...(section.props as object), rows: autoFilter.rows },
            } as (typeof sections)[number])
          : section,
      )
    : sections

  const selectionHelpers: ArchetypeTableSelectionHelpers = {
    openInspectorTab: (id, tab) => {
      if (!openInspect) return
      // Search the CORE model (all rows, incl. nested + off-page), not just the
      // visible page, so a selected row is always resolvable.
      const match = (table?.getCoreRowModel().flatRows ?? []).find(
        (row) => String((row.original as TableSectionRow)[rowIdKey]) === id,
      )
      if (match) openInspect(match.original, tab)
    },
  }
  const resolvedSelectionActions =
    selectionActions(table, selectionHelpers) ?? []
  const footer =
    resolvedSelectionActions.length > 0 ? (
      <ContentFooter
        selection={{
          count: registration?.selectionCount ?? 0,
          onClear: () => registration?.table.resetRowSelection(),
          actions: resolvedSelectionActions,
        }}
      />
    ) : undefined

  return (
    <>
      <AppPageHeader>
        <ContentHeader
          title={title}
          titleIcon={titleIcon}
          breadcrumb={breadcrumb}
          backTo={backTo}
          viewTabs={views?.tabs}
          value={views?.value}
          onValueChange={views?.onValueChange}
          onAddView={views?.onAddView}
          favorite={favoriteControlled}
        />
      </AppPageHeader>
      <ContentPanel
        toolbar={<ContentToolbar<TData> {...wiredToolbar} />}
        sections={renderedSections}
        footer={footer}
        inspector={inspector}
        inspectorOpen={inspectorOpen}
        inspectorMode={inspectorMode}
        onInspectorOpenChange={onInspectorOpenChange}
        inspectorTitle={inspectorTitle}
        inspectorFooter={inspectorFooter}
        bodyClassName={bodyClassName}
      />
      {inspectorRowTitle ? (
        <AppInspectorRail
          open={inspectOpen}
          onOpenChange={setInspectOpen}
          breadcrumb={[title, inspectTitle ?? ""]}
          recordKey={inspectRecordKey || (inspectTitle ?? "")}
          initialTab={inspectTab}
          openNonce={inspectNonce}
          name={inspectName ?? inspectTitle ?? ""}
          badge={inspectBadge}
          footer={inspectFooter}
          content={inspectContent}
          onPrevious={
            previousRow && openInspect
              ? () => openInspect(previousRow.original)
              : undefined
          }
          onNext={
            nextRow && openInspect
              ? () => openInspect(nextRow.original)
              : undefined
          }
          onCopy={
            onInspectorCopy && inspectData != null
              ? (what) => onInspectorCopy(inspectData, what)
              : undefined
          }
          onSwitchLayout={
            onInspectorSwitchLayout && inspectData != null
              ? () => onInspectorSwitchLayout(inspectData)
              : undefined
          }
        />
      ) : null}
    </>
  )
}

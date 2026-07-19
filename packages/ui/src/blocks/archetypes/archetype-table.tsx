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

export interface ArchetypeTableProps<TData> {
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
  selectionActions: (table: Table<TData> | null) => ContentFooterAction[]
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
export function ArchetypeTable<TData>(props: ArchetypeTableProps<TData>) {
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

function ArchetypeTableChrome<TData>({
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
    | { columns: readonly TableColumnSpec[]; rows: readonly TableSectionRow[] }
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
  const { inspectRow, inspectOpen, setInspectOpen } = useSectionInspect()
  const openInspect = useSectionInspectOpener()
  const visibleRows = table?.getRowModel().rows ?? []
  const inspectIndex = visibleRows.findIndex(
    (row) => row.original === inspectRow,
  )
  const currentRow = inspectIndex >= 0 ? visibleRows[inspectIndex] : undefined
  const previousRow =
    inspectIndex > 0 ? visibleRows[inspectIndex - 1] : undefined
  const nextRow =
    inspectIndex >= 0 && inspectIndex < visibleRows.length - 1
      ? visibleRows[inspectIndex + 1]
      : undefined

  // Deep-link: open the Inspector once for `openRowId` as soon as the grid holds
  // that row. Ref-guarded so it fires a single time per id (a subsequent user
  // close/navigate is never re-overridden).
  const openedDeepLinkRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!openRowId || !openInspect) return
    if (openedDeepLinkRef.current === openRowId) return
    const match = visibleRows.find((row) => row.id === openRowId)
    if (!match) return
    openedDeepLinkRef.current = openRowId
    openInspect(match.original)
  }, [openRowId, visibleRows, openInspect])

  const inspectTitle =
    inspectorRowTitle && inspectRow != null
      ? inspectorRowTitle(inspectRow as TData)
      : null
  const inspectName =
    inspectRow != null
      ? (inspectorRowName ?? inspectorRowTitle)?.(inspectRow as TData)
      : undefined
  const inspectBadge =
    inspectorRowBadge && inspectRow != null
      ? inspectorRowBadge(inspectRow as TData)
      : undefined
  const inspectContent =
    inspectorRowContent && inspectRow != null
      ? inspectorRowContent(inspectRow as TData)
      : undefined
  const inspectFooter: InspectorFooterProps | undefined =
    (onInspectorDecline || onInspectorApprove) && inspectRow != null
      ? {
          declineLabel: inspectorDeclineLabel ?? "Decline",
          approveLabel: inspectorApproveLabel ?? "Approve",
          onDecline: onInspectorDecline
            ? () => onInspectorDecline(inspectRow as TData)
            : undefined,
          onApprove: onInspectorApprove
            ? () => onInspectorApprove(inspectRow as TData)
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
  // own source filter. The auto filter is over the section's `TableSectionRow`s;
  // the toolbar slot is typed to the page's `TData`, which IS that row type for a
  // Table page — the cast bridges the generic.
  const statusColumnId = toolbarProps.statusFilter?.columnId
  const effectiveFilter: FilterDescriptor<TData> | undefined = tableSection
    ? ({
        ...autoFilter.filter,
        columns: statusColumnId
          ? autoFilter.filter.columns.filter((c) => c.id !== statusColumnId)
          : autoFilter.filter.columns,
      } as unknown as FilterDescriptor<TData>)
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

  const resolvedSelectionActions = selectionActions(table) ?? []
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
          recordKey={currentRow?.id ?? inspectTitle ?? ""}
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
            onInspectorCopy && inspectRow != null
              ? (what) => onInspectorCopy(inspectRow as TData, what)
              : undefined
          }
          onSwitchLayout={
            onInspectorSwitchLayout && inspectRow != null
              ? () => onInspectorSwitchLayout(inspectRow as TData)
              : undefined
          }
        />
      ) : null}
    </>
  )
}

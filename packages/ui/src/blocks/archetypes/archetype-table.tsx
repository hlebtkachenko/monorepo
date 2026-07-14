"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import {
  ContentFooter,
  ContentHeader,
  ContentPanel,
  ContentToolbar,
  InspectorSheet,
  SectionTableProvider,
  useSectionColumnAnalyze,
  useSectionColumnFilter,
  useSectionInspect,
  useSectionTable,
} from "@workspace/ui/blocks/content-panel"
import { toast } from "@workspace/ui/components/sonner"
import type {
  ContentFooterAction,
  ContentHeaderBackLinkData,
  ContentHeaderBreadcrumbItem,
  ContentToolbarProps,
  InspectorMetaItem,
  InspectorMode,
  SectionDescriptor,
  ViewTab,
} from "@workspace/ui/blocks/content-panel"
import type { IconName } from "@workspace/ui/icon-packs"

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
 * The composed content of the row-inspector Sheet, returned by `renderInspector`.
 * The archetype supplies the Sheet shell (pinned header + scroll + sticky footer);
 * this fills the header identity, the meta grid, the scrollable `body`, and the
 * footer actions from the clicked row's domain data.
 */
export interface InspectorSheetRender {
  /** Bold identifier line (e.g. `#FP-2026-0001`). */
  title: React.ReactNode
  /** Copy handler for the identifier. */
  onCopyTitle?: () => void
  /** Muted line under the title. */
  subtitle?: React.ReactNode
  /** Header meta grid (Issued / Payment / Status). */
  meta?: readonly InspectorMetaItem[]
  /** Sticky footer actions. */
  footer?: React.ReactNode
  /** The scrollable detail sections (composed from the `Inspector*` parts). */
  body: React.ReactNode
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
  /** Optional views cluster in the header. */
  views?: ArchetypeTableViews
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
   */
  sections: readonly SectionDescriptor[]
  /**
   * Bulk actions for the selection footer. When present, the archetype renders a
   * `ContentFooter` auto-wired to the Table section's selection (count + clear
   * from the live instance); it self-hides when nothing is selected. There is NO
   * status bar — it is legacy; aggregate/selection info lives in the footer.
   */
  selectionActions?: ContentFooterAction[]
  /** Row-detail Inspector — the detail of the chosen row (panel or dialog). */
  inspector?: React.ReactNode
  inspectorOpen?: boolean
  inspectorMode?: InspectorMode
  onInspectorOpenChange?: (open: boolean) => void
  inspectorTitle?: React.ReactNode
  inspectorFooter?: React.ReactNode
  /**
   * Row-inspector Sheet content builder. When set, the Table section's per-row
   * maximize affordance opens a right-docked `InspectorSheet`; this maps the
   * clicked row (pure data) to the Sheet's header/meta/body/footer. `close`
   * dismisses the Sheet (e.g. from a footer action). Domain-specific, so it lives
   * in the app layer — the archetype owns only the Sheet shell + open state.
   */
  renderInspector?: (row: TData, close: () => void) => InspectorSheetRender
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
 */
export function ArchetypeTable<TData>(props: ArchetypeTableProps<TData>) {
  return (
    <SectionTableProvider>
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
  toolbar,
  sections,
  selectionActions,
  inspector,
  inspectorOpen,
  inspectorMode,
  onInspectorOpenChange,
  inspectorTitle,
  inspectorFooter,
  renderInspector,
  bodyClassName,
}: ArchetypeTableProps<TData>) {
  const registration = useSectionTable()
  const table = registration
    ? (registration.table as unknown as Table<TData>)
    : null

  // Row-inspector Sheet: the section renderer's maximize affordance publishes the
  // clicked row through the bridge; build its content here from the app-supplied
  // `renderInspector`. The row stays set through the close animation.
  const { inspectRow, inspectOpen, setInspectOpen } = useSectionInspect()
  const closeInspect = React.useCallback(
    () => setInspectOpen(false),
    [setInspectOpen],
  )
  const inspectContent =
    renderInspector && inspectRow != null
      ? renderInspector(inspectRow as TData, closeInspect)
      : null

  // Per-column header "Filter" opens the ONE toolbar filter at that column: the
  // chrome injects the bridge's shared open-state into the consumer-supplied
  // `filter` descriptor, so the header action and the toolbar's own "Add filter"
  // selector share a single source of truth.
  const columnFilter = useSectionColumnFilter()
  const toolbarProps = toolbar(table)
  const wiredToolbar: ContentToolbarProps<TData> = toolbarProps.filter
    ? {
        ...toolbarProps,
        filter: {
          ...toolbarProps.filter,
          property: columnFilter.filterColumnId,
          onPropertyChange: columnFilter.setFilterColumnId,
          open: columnFilter.filterOpen,
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

  const footer =
    selectionActions && selectionActions.length > 0 ? (
      <ContentFooter
        selection={{
          count: registration?.selectionCount ?? 0,
          onClear: () => registration?.table.resetRowSelection(),
          actions: selectionActions,
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
        />
      </AppPageHeader>
      <ContentPanel
        toolbar={<ContentToolbar<TData> {...wiredToolbar} />}
        sections={sections}
        footer={footer}
        inspector={inspector}
        inspectorOpen={inspectorOpen}
        inspectorMode={inspectorMode}
        onInspectorOpenChange={onInspectorOpenChange}
        inspectorTitle={inspectorTitle}
        inspectorFooter={inspectorFooter}
        bodyClassName={bodyClassName}
      />
      {renderInspector ? (
        <InspectorSheet
          open={inspectOpen}
          onOpenChange={setInspectOpen}
          title={inspectContent?.title ?? ""}
          onCopyTitle={inspectContent?.onCopyTitle}
          subtitle={inspectContent?.subtitle}
          meta={inspectContent?.meta}
          footer={inspectContent?.footer}
        >
          {inspectContent?.body}
        </InspectorSheet>
      ) : null}
    </>
  )
}

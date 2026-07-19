"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import type { InspectorTab } from "@workspace/ui/blocks/inspector-sheet"

import type { TableCellValue } from "./section-table"
import type { SectionPivotDrill } from "./section-pivot-table"

/** One committed inline-cell edit — the row id, the column, the new value. */
export interface SectionCellEdit {
  readonly rowId: string
  readonly columnId: string
  readonly value: TableCellValue
}

/** Persist an inline-cell edit (e.g. a server action). May reject to signal a
 * failed write, which the renderer reverts optimistically. */
export type SectionCellCommit = (edit: SectionCellEdit) => void | Promise<void>

/** A new option value created in a `creatable` select column — the column and
 * the raw value the user typed. The renderer adds it to the column's live
 * options immediately; this persists it (e.g. append to a directory). */
export interface SectionOptionCreate {
  readonly columnId: string
  readonly value: string
}

/** Persist a newly-created option for a `creatable` column. Optional; when
 * unwired the new option still shows locally for the session. */
export type SectionCreateOption = (
  create: SectionOptionCreate,
) => void | Promise<void>

/**
 * The load-bearing bridge (Doc `table-stack-research` §3c). A `Table` section's
 * live TanStack instance is minted INSIDE the closed section renderer — it can
 * never cross the Symbol-branded, pure-data section descriptor. But the chrome
 * that must drive it (`ContentToolbar.viewTools`, the selection `ContentFooter`)
 * sits OUTSIDE `ContentBody`. So the renderer publishes the instance UP through
 * this context; `ArchetypeTable` owns the provider and the toolbar/footer consume
 * it. Legal because toolbar/footer descriptors already live in the client
 * boundary (they permit a live `Table` + callbacks) — only the SECTION boundary
 * is pure data, and the instance never touches it.
 */

/** What a Table section registers for the chrome to consume. */
export interface SectionTableRegistration {
  /** The live TanStack table instance the grid renders. */
  readonly table: Table<unknown>
  /** Rows currently selected (drives the selection footer). */
  readonly selectionCount: number
}

interface SectionTableContextValue {
  readonly registration: SectionTableRegistration | null
  readonly register: (registration: SectionTableRegistration | null) => void
  /** The row whose inspector was last requested (kept during the close animation). */
  readonly inspectRow: unknown
  /** The tab the inspector should open ON for this request (e.g. a footer
   *  "Open in Inspector · Export"). `null` → the sheet's default. */
  readonly inspectTab: InspectorTab | null
  /** Bumped on EVERY `openInspect` call so a repeat request for the SAME row/tab
   *  is still a distinct event (the sheet re-applies the requested tab). */
  readonly inspectNonce: number
  /** Whether the inspector Sheet is open. */
  readonly inspectOpen: boolean
  /** Open the inspector for a row (records the row + optional tab + flips open). */
  readonly openInspect: (row: unknown, tab?: InspectorTab) => void
  /** Drive the inspector open state (the Sheet's `onOpenChange`). */
  readonly setInspectOpen: (open: boolean) => void
  /** The column whose toolbar filter is currently targeted (header "Filter" or the toolbar selector). */
  readonly filterColumnId: string | undefined
  /** Whether the toolbar's filter selector is open. */
  readonly filterOpen: boolean
  /** Header "Filter" → point the toolbar filter at a column and open it. */
  readonly openColumnFilter: (columnId: string) => void
  readonly setFilterColumnId: (columnId: string | undefined) => void
  readonly setFilterOpen: (open: boolean) => void
  /** Last "AI analyze" request (a nonce so repeat clicks on the same column re-fire). */
  readonly analyzeRequest: {
    readonly columnId: string
    readonly nonce: number
  } | null
  /** Header "AI analyze" → bump the analyze request for the chrome/consumer to handle. */
  readonly requestColumnAnalyze: (columnId: string) => void
  /** Page-supplied persistence for an inline-cell edit; null when the page wires none. */
  readonly cellCommit: SectionCellCommit | null
  /** Page-supplied persistence for a newly-created option; null when unwired. */
  readonly createOption: SectionCreateOption | null
  /** Page handler for a pivot cell drill-through; null when unwired. */
  readonly pivotDrill: SectionPivotDrill | null
}

const SectionTableContext =
  React.createContext<SectionTableContextValue | null>(null)

/**
 * Owns the registered Table-section instance. `ArchetypeTable` wraps its whole
 * Content Panel in this so a Table section anywhere in the body can publish its
 * live table up to the toolbar/footer. One table section per archetype is the
 * norm; a later registration wins.
 */
export function SectionTableProvider({
  children,
  onCellCommit,
  onCreateOption,
  onPivotDrill,
}: {
  children: React.ReactNode
  /** Persist an inline-cell edit; the section renderer calls it (optimistic + revert). */
  onCellCommit?: SectionCellCommit
  /** Persist a new option created in a `creatable` select column. */
  onCreateOption?: SectionCreateOption
  /** Open the underlying records when a pivot aggregate cell is drilled into. */
  onPivotDrill?: SectionPivotDrill
}) {
  const [registration, setRegistration] =
    React.useState<SectionTableRegistration | null>(null)
  // The requested row is kept even after `inspectOpen` flips to false so the
  // Sheet keeps its content through the close animation (cleared on reopen).
  const [inspectRow, setInspectRow] = React.useState<unknown>(null)
  const [inspectTab, setInspectTab] = React.useState<InspectorTab | null>(null)
  const [inspectNonce, setInspectNonce] = React.useState(0)
  const [inspectOpen, setInspectOpen] = React.useState(false)
  const openInspect = React.useCallback((row: unknown, tab?: InspectorTab) => {
    setInspectRow(row)
    setInspectTab(tab ?? null)
    setInspectNonce((nonce) => nonce + 1)
    setInspectOpen(true)
  }, [])
  // Per-column toolbar-filter target + open state, shared by the header "Filter"
  // action and the toolbar's own "Add filter" selector (one source of truth).
  const [filterColumnId, setFilterColumnId] = React.useState<
    string | undefined
  >(undefined)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const openColumnFilter = React.useCallback((columnId: string) => {
    setFilterColumnId(columnId)
    setFilterOpen(true)
  }, [])
  // "AI analyze" is a one-shot request; the nonce lets the consumer's effect
  // re-fire when the same column is asked twice in a row.
  const [analyzeRequest, setAnalyzeRequest] = React.useState<{
    columnId: string
    nonce: number
  } | null>(null)
  const requestColumnAnalyze = React.useCallback((columnId: string) => {
    setAnalyzeRequest((prev) => ({ columnId, nonce: (prev?.nonce ?? 0) + 1 }))
  }, [])
  const value = React.useMemo<SectionTableContextValue>(
    () => ({
      registration,
      register: setRegistration,
      inspectRow,
      inspectTab,
      inspectNonce,
      inspectOpen,
      openInspect,
      setInspectOpen,
      filterColumnId,
      filterOpen,
      openColumnFilter,
      setFilterColumnId,
      setFilterOpen,
      analyzeRequest,
      requestColumnAnalyze,
      cellCommit: onCellCommit ?? null,
      createOption: onCreateOption ?? null,
      pivotDrill: onPivotDrill ?? null,
    }),
    [
      registration,
      inspectRow,
      inspectTab,
      inspectNonce,
      inspectOpen,
      openInspect,
      filterColumnId,
      filterOpen,
      openColumnFilter,
      analyzeRequest,
      requestColumnAnalyze,
      onCellCommit,
      onCreateOption,
      onPivotDrill,
    ],
  )
  return (
    <SectionTableContext.Provider value={value}>
      {children}
    </SectionTableContext.Provider>
  )
}

/**
 * Publishes a Table section's live instance to the enclosing provider. Called by
 * the section renderer. `selectionCount` + `stateSignature` are passed so the
 * effect re-registers (re-renders the consuming chrome) whenever the grid's
 * selection / sort / visibility / order / pinning / filters / search changes —
 * the chrome stays in sync with the grid it doesn't own. No-op outside a provider (a Table section
 * rendered without `ArchetypeTable` still works; only the bridge is inert).
 */
export function useRegisterSectionTable(
  table: Table<unknown>,
  selectionCount: number,
  stateSignature: string,
): void {
  const ctx = React.useContext(SectionTableContext)
  const register = ctx?.register
  React.useEffect(() => {
    if (!register) return
    register({ table, selectionCount })
    return () => register(null)
    // `stateSignature` is an extra dep on purpose: re-register on any tracked
    // grid state change so the toolbar/footer re-render against fresh state.
  }, [register, table, selectionCount, stateSignature])
}

/** Reads the registered Table-section instance (null until one mounts). */
export function useSectionTable(): SectionTableRegistration | null {
  return React.useContext(SectionTableContext)?.registration ?? null
}

/**
 * Returns the row-inspector opener for the section renderer to call from a row's
 * maximize affordance. `null` outside a provider (the affordance stays inert when
 * the Table section is rendered without `ArchetypeTable`).
 */
export function useSectionInspectOpener():
  ((row: unknown, tab?: InspectorTab) => void) | null {
  return React.useContext(SectionTableContext)?.openInspect ?? null
}

/** The inspector open state + requested row, for the archetype chrome to render
 *  the Sheet. Inert (`inspectOpen: false`) outside a provider. */
export function useSectionInspect(): {
  inspectRow: unknown
  inspectTab: InspectorTab | null
  inspectNonce: number
  inspectOpen: boolean
  setInspectOpen: (open: boolean) => void
} {
  const ctx = React.useContext(SectionTableContext)
  return {
    inspectRow: ctx?.inspectRow ?? null,
    inspectTab: ctx?.inspectTab ?? null,
    inspectNonce: ctx?.inspectNonce ?? 0,
    inspectOpen: ctx?.inspectOpen ?? false,
    setInspectOpen: ctx?.setInspectOpen ?? (() => {}),
  }
}

/**
 * The per-column header-menu callbacks for the section renderer to pass to the
 * grid: `onColumnFilter` opens the toolbar filter for a column, `onColumnAnalyze`
 * requests an AI analysis. `null` outside a provider, so the renderer drops both
 * menu items when the Table section is rendered without `ArchetypeTable`.
 */
export function useSectionColumnMenu(): {
  onColumnFilter: (columnId: string) => void
  onColumnAnalyze: (columnId: string) => void
} | null {
  const ctx = React.useContext(SectionTableContext)
  if (!ctx) return null
  return {
    onColumnFilter: ctx.openColumnFilter,
    onColumnAnalyze: ctx.requestColumnAnalyze,
  }
}

/** The shared toolbar-filter target + open state, for the chrome/consumer to
 *  drive the ContentToolbar `filter` descriptor's `property`/`open`. Inert
 *  no-ops outside a provider. */
export function useSectionColumnFilter(): {
  filterColumnId: string | undefined
  filterOpen: boolean
  setFilterColumnId: (columnId: string | undefined) => void
  setFilterOpen: (open: boolean) => void
} {
  const ctx = React.useContext(SectionTableContext)
  return {
    filterColumnId: ctx?.filterColumnId,
    filterOpen: ctx?.filterOpen ?? false,
    setFilterColumnId: ctx?.setFilterColumnId ?? (() => {}),
    setFilterOpen: ctx?.setFilterOpen ?? (() => {}),
  }
}

/** The last "AI analyze" request (column + nonce), for the consumer to react to
 *  (e.g. open Sidekick). `null` until requested / outside a provider. */
export function useSectionColumnAnalyze(): {
  columnId: string
  nonce: number
} | null {
  return React.useContext(SectionTableContext)?.analyzeRequest ?? null
}

/** The page-supplied inline-cell persistence, for the section renderer to call on
 *  a committed edit. `null` outside a provider or when the page wired none — the
 *  renderer then keeps edits as local draft only. */
export function useSectionCellCommit(): SectionCellCommit | null {
  return React.useContext(SectionTableContext)?.cellCommit ?? null
}

/** The page-supplied option-create persistence, for the section renderer to call
 *  when a `creatable` column mints a new option. `null` outside a provider or
 *  when the page wired none — the new option then lives only for the session. */
export function useSectionCreateOption(): SectionCreateOption | null {
  return React.useContext(SectionTableContext)?.createOption ?? null
}

/** The page-supplied pivot drill-through handler, for the pivot renderer to call
 *  when an aggregate cell is activated. `null` outside a provider or when the
 *  page wired none — the renderer then renders inert (non-clickable) cells. */
export function useSectionPivotDrill(): SectionPivotDrill | null {
  return React.useContext(SectionTableContext)?.pivotDrill ?? null
}

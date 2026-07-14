"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

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
  /** Whether the inspector Sheet is open. */
  readonly inspectOpen: boolean
  /** Open the inspector for a row (records the row + flips open). */
  readonly openInspect: (row: unknown) => void
  /** Drive the inspector open state (the Sheet's `onOpenChange`). */
  readonly setInspectOpen: (open: boolean) => void
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
}: {
  children: React.ReactNode
}) {
  const [registration, setRegistration] =
    React.useState<SectionTableRegistration | null>(null)
  // The requested row is kept even after `inspectOpen` flips to false so the
  // Sheet keeps its content through the close animation (cleared on reopen).
  const [inspectRow, setInspectRow] = React.useState<unknown>(null)
  const [inspectOpen, setInspectOpen] = React.useState(false)
  const openInspect = React.useCallback((row: unknown) => {
    setInspectRow(row)
    setInspectOpen(true)
  }, [])
  const value = React.useMemo<SectionTableContextValue>(
    () => ({
      registration,
      register: setRegistration,
      inspectRow,
      inspectOpen,
      openInspect,
      setInspectOpen,
    }),
    [registration, inspectRow, inspectOpen, openInspect],
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
export function useSectionInspectOpener(): ((row: unknown) => void) | null {
  return React.useContext(SectionTableContext)?.openInspect ?? null
}

/** The inspector open state + requested row, for the archetype chrome to render
 *  the Sheet. Inert (`inspectOpen: false`) outside a provider. */
export function useSectionInspect(): {
  inspectRow: unknown
  inspectOpen: boolean
  setInspectOpen: (open: boolean) => void
} {
  const ctx = React.useContext(SectionTableContext)
  return {
    inspectRow: ctx?.inspectRow ?? null,
    inspectOpen: ctx?.inspectOpen ?? false,
    setInspectOpen: ctx?.setInspectOpen ?? (() => {}),
  }
}

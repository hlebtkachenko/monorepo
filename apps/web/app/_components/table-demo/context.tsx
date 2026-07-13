"use client"

import * as React from "react"

import type { InspectorMode } from "@workspace/ui/blocks/content-panel"

import type { InvoiceRow } from "./data"

/**
 * Shared UI state for the TEMP Content Panel demo. Exists only to link the two
 * app-shell slots that the demo spans: the header (`contentHeader` slot — tabs,
 * manage-page menu) and the body (`children` — toolbar + table). Real
 * pages will likely lift far less than this; it's broad here to exercise every
 * cross-slot interaction at once.
 */
interface OrgContentState {
  activeTab: string
  setActiveTab: (value: string) => void
  hiddenTabs: ReadonlySet<string>
  toggleTabHidden: (value: string) => void
  // Inspector — the element-detail view (panel or dialog mode).
  inspected: InvoiceRow | null
  inspectorOpen: boolean
  inspectorMode: InspectorMode
  setInspectorMode: (mode: InspectorMode) => void
  openInspector: (row: InvoiceRow) => void
  closeInspector: () => void
}

const OrgContentContext = React.createContext<OrgContentState | null>(null)

export function useOrgContent(): OrgContentState {
  const ctx = React.useContext(OrgContentContext)
  if (!ctx) {
    throw new Error("useOrgContent must be used within OrgContentProvider")
  }
  return ctx
}

export function OrgContentProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [activeTab, setActiveTab] = React.useState("all")
  const [hiddenTabs, setHiddenTabs] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [inspected, setInspected] = React.useState<InvoiceRow | null>(null)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)
  const [inspectorMode, setInspectorMode] =
    React.useState<InspectorMode>("panel")

  const openInspector = React.useCallback((row: InvoiceRow) => {
    setInspected(row)
    setInspectorOpen(true)
  }, [])
  const closeInspector = React.useCallback(() => setInspectorOpen(false), [])

  const toggleTabHidden = React.useCallback((value: string) => {
    setHiddenTabs((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
    // If the tab being hidden is the active one, fall back to "All".
    setActiveTab((current) => (current === value ? "all" : current))
  }, [])

  const value = React.useMemo<OrgContentState>(
    () => ({
      activeTab,
      setActiveTab,
      hiddenTabs,
      toggleTabHidden,
      inspected,
      inspectorOpen,
      inspectorMode,
      setInspectorMode,
      openInspector,
      closeInspector,
    }),
    [
      activeTab,
      hiddenTabs,
      toggleTabHidden,
      inspected,
      inspectorOpen,
      inspectorMode,
      openInspector,
      closeInspector,
    ],
  )

  return (
    <OrgContentContext.Provider value={value}>
      {children}
    </OrgContentContext.Provider>
  )
}

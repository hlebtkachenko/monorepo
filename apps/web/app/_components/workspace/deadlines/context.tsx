"use client"

import * as React from "react"

import type { InspectorMode } from "@workspace/ui/blocks/app-content"

import type { DeadlineRow } from "./data"

/**
 * Shared UI state linking the Deadlines page's two shell slots: the portaled
 * content-header (status tabs) and the body (toolbar + table + inspector). Same
 * seam the Clients Table uses, trimmed to what this page actually consumes — the
 * favorite star lives in the shared `PageHeaderActions` cluster and the
 * inspector is panel-mode only, so neither needs page-level state here.
 */
interface DeadlinesState {
  activeTab: string
  setActiveTab: (value: string) => void
  inspected: DeadlineRow | null
  inspectorOpen: boolean
  inspectorMode: InspectorMode
  openInspector: (row: DeadlineRow) => void
  closeInspector: () => void
}

const DeadlinesContext = React.createContext<DeadlinesState | null>(null)

export function useDeadlines(): DeadlinesState {
  const ctx = React.useContext(DeadlinesContext)
  if (!ctx)
    throw new Error("useDeadlines must be used within DeadlinesProvider")
  return ctx
}

export function DeadlinesProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = React.useState("all")
  const [inspected, setInspected] = React.useState<DeadlineRow | null>(null)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)

  const openInspector = React.useCallback((row: DeadlineRow) => {
    setInspected(row)
    setInspectorOpen(true)
  }, [])
  const closeInspector = React.useCallback(() => setInspectorOpen(false), [])

  const value = React.useMemo<DeadlinesState>(
    () => ({
      activeTab,
      setActiveTab,
      inspected,
      inspectorOpen,
      inspectorMode: "panel",
      openInspector,
      closeInspector,
    }),
    [activeTab, inspected, inspectorOpen, openInspector, closeInspector],
  )

  return (
    <DeadlinesContext.Provider value={value}>
      {children}
    </DeadlinesContext.Provider>
  )
}

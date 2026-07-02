"use client"

import * as React from "react"

import type { InspectorMode } from "@workspace/ui/blocks/app-content"

import type { ObligationRow } from "./data"

/**
 * Shared UI state linking the Legislation page's two shell slots: the portaled
 * content-header (status tabs) and the body (toolbar + table + inspector). Same
 * seam the Companies table uses, trimmed to what this page actually consumes — the
 * favorite star lives in the shared `PageHeaderActions` cluster and the
 * inspector is panel-mode only, so neither needs page-level state here.
 */
interface LegislationState {
  activeTab: string
  setActiveTab: (value: string) => void
  inspected: ObligationRow | null
  inspectorOpen: boolean
  inspectorMode: InspectorMode
  openInspector: (row: ObligationRow) => void
  closeInspector: () => void
}

const LegislationContext = React.createContext<LegislationState | null>(null)

export function useLegislation(): LegislationState {
  const ctx = React.useContext(LegislationContext)
  if (!ctx)
    throw new Error("useLegislation must be used within LegislationProvider")
  return ctx
}

export function LegislationProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [activeTab, setActiveTab] = React.useState("all")
  const [inspected, setInspected] = React.useState<ObligationRow | null>(null)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)

  const openInspector = React.useCallback((row: ObligationRow) => {
    setInspected(row)
    setInspectorOpen(true)
  }, [])
  const closeInspector = React.useCallback(() => setInspectorOpen(false), [])

  const value = React.useMemo<LegislationState>(
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
    <LegislationContext.Provider value={value}>
      {children}
    </LegislationContext.Provider>
  )
}

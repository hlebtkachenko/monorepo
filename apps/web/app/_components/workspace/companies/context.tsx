"use client"

import * as React from "react"

import type { InspectorMode } from "@workspace/ui/blocks/app-content"

import type { CompanyRow } from "./data"

/**
 * Shared UI state linking the Companies page's two shell slots: the portaled
 * content-header (status tabs) and the body (toolbar + table + inspector). Same
 * seam the org Table demo uses (`table-demo/context.tsx`), trimmed to what this
 * page actually consumes — the favorite star lives in the shared
 * `PageHeaderActions` cluster, and the inspector is panel-mode only, so neither
 * needs page-level state here.
 */
export type CompaniesView = "cards" | "table"

interface CompaniesState {
  activeTab: string
  setActiveTab: (value: string) => void
  /** Big-card grid vs the dense table list — the two Companies views. */
  view: CompaniesView
  setView: (view: CompaniesView) => void
  inspected: CompanyRow | null
  inspectorOpen: boolean
  inspectorMode: InspectorMode
  openInspector: (row: CompanyRow) => void
  closeInspector: () => void
}

const CompaniesContext = React.createContext<CompaniesState | null>(null)

export function useCompanies(): CompaniesState {
  const ctx = React.useContext(CompaniesContext)
  if (!ctx)
    throw new Error("useCompanies must be used within CompaniesProvider")
  return ctx
}

export function CompaniesProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = React.useState("all")
  const [view, setView] = React.useState<CompaniesView>("cards")
  const [inspected, setInspected] = React.useState<CompanyRow | null>(null)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)

  const openInspector = React.useCallback((row: CompanyRow) => {
    setInspected(row)
    setInspectorOpen(true)
  }, [])
  const closeInspector = React.useCallback(() => setInspectorOpen(false), [])

  const value = React.useMemo<CompaniesState>(
    () => ({
      activeTab,
      setActiveTab,
      view,
      setView,
      inspected,
      inspectorOpen,
      inspectorMode: "panel",
      openInspector,
      closeInspector,
    }),
    [activeTab, view, inspected, inspectorOpen, openInspector, closeInspector],
  )

  return (
    <CompaniesContext.Provider value={value}>
      {children}
    </CompaniesContext.Provider>
  )
}

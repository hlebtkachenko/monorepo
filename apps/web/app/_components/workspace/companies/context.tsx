"use client"

import * as React from "react"

import type { InspectorMode } from "@workspace/ui/blocks/content-panel"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"

import type { CompanyAssignee, CompanyRow } from "./data"

/**
 * Shared UI state linking the Companies page's two shell slots: the portaled
 * content-header (status tabs) and the body (toolbar + table + inspector). Same
 * seam the org Table demo uses (`table-demo/context.tsx`), trimmed to what this
 * page actually consumes — the favorite star is internal `ContentHeader`
 * chrome (`ContentHeaderActions`), and the inspector mode follows the viewport
 * (panel on desktop, dialog on mobile), so neither needs page-level state here.
 *
 * `canAssign` + `assignableMembers` are workspace-level (same for every row),
 * resolved server-side in `workspace/page.tsx` and threaded through the
 * provider so the card + inspector assignee pickers don't need per-row props.
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
  /** Whether the signed-in user (workspace owner/admin) may (re)assign a book. */
  canAssign: boolean
  /** Active workspace members eligible as a company's responsible accountant. */
  assignableMembers: CompanyAssignee[]
}

const CompaniesContext = React.createContext<CompaniesState | null>(null)

export function useCompanies(): CompaniesState {
  const ctx = React.useContext(CompaniesContext)
  if (!ctx)
    throw new Error("useCompanies must be used within CompaniesProvider")
  return ctx
}

export function CompaniesProvider({
  children,
  canAssign = false,
  assignableMembers = [],
}: {
  children: React.ReactNode
  canAssign?: boolean
  assignableMembers?: CompanyAssignee[]
}) {
  const isMobile = useIsMobile()
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
      inspectorMode: isMobile ? "dialog" : "panel",
      openInspector,
      closeInspector,
      canAssign,
      assignableMembers,
    }),
    [
      activeTab,
      view,
      inspected,
      inspectorOpen,
      isMobile,
      openInspector,
      closeInspector,
      canAssign,
      assignableMembers,
    ],
  )

  return (
    <CompaniesContext.Provider value={value}>
      {children}
    </CompaniesContext.Provider>
  )
}

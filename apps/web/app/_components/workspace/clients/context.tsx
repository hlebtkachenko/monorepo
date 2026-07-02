"use client"

import * as React from "react"

import type { InspectorMode } from "@workspace/ui/blocks/app-content"

import type { ClientRow } from "./data"

/**
 * Shared UI state linking the Clients page's two shell slots: the portaled
 * content-header (status tabs) and the body (toolbar + table + inspector). Same
 * seam the org Table demo uses (`table-demo/context.tsx`), trimmed to what this
 * page actually consumes — the favorite star lives in the shared
 * `PageHeaderActions` cluster, and the inspector is panel-mode only, so neither
 * needs page-level state here.
 */
interface ClientsState {
  activeTab: string
  setActiveTab: (value: string) => void
  inspected: ClientRow | null
  inspectorOpen: boolean
  inspectorMode: InspectorMode
  openInspector: (row: ClientRow) => void
  closeInspector: () => void
}

const ClientsContext = React.createContext<ClientsState | null>(null)

export function useClients(): ClientsState {
  const ctx = React.useContext(ClientsContext)
  if (!ctx) throw new Error("useClients must be used within ClientsProvider")
  return ctx
}

export function ClientsProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = React.useState("all")
  const [inspected, setInspected] = React.useState<ClientRow | null>(null)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)

  const openInspector = React.useCallback((row: ClientRow) => {
    setInspected(row)
    setInspectorOpen(true)
  }, [])
  const closeInspector = React.useCallback(() => setInspectorOpen(false), [])

  const value = React.useMemo<ClientsState>(
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
    <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>
  )
}

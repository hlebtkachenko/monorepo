"use client"

import * as React from "react"

import type { InspectorMode } from "@workspace/ui/blocks/content-panel"

import type { LedgerRow } from "./data"

/** Shared UI state linking the ledger page's header + body slots. */
interface LedgerState {
  activeTab: string
  setActiveTab: (value: string) => void
  hiddenTabs: ReadonlySet<string>
  toggleTabHidden: (value: string) => void
  inspected: LedgerRow | null
  inspectorOpen: boolean
  inspectorMode: InspectorMode
  setInspectorMode: (mode: InspectorMode) => void
  openInspector: (row: LedgerRow) => void
  closeInspector: () => void
}

const LedgerContext = React.createContext<LedgerState | null>(null)

export function useLedger(): LedgerState {
  const ctx = React.useContext(LedgerContext)
  if (!ctx) throw new Error("useLedger must be used within LedgerProvider")
  return ctx
}

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = React.useState("all")
  const [hiddenTabs, setHiddenTabs] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [inspected, setInspected] = React.useState<LedgerRow | null>(null)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)
  const [inspectorMode, setInspectorMode] =
    React.useState<InspectorMode>("panel")

  const openInspector = React.useCallback((row: LedgerRow) => {
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
    setActiveTab((current) => (current === value ? "all" : current))
  }, [])

  const value = React.useMemo<LedgerState>(
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
    <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
  )
}

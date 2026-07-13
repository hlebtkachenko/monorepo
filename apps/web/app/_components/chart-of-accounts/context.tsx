"use client"

import * as React from "react"

import type { InspectorMode } from "@workspace/ui/blocks/content-panel"

import type { AccountRow } from "./data"

/** Shared UI state linking the chart-of-accounts page's header + body slots. */
interface ChartState {
  activeTab: string
  setActiveTab: (value: string) => void
  hiddenTabs: ReadonlySet<string>
  toggleTabHidden: (value: string) => void
  inspected: AccountRow | null
  inspectorOpen: boolean
  inspectorMode: InspectorMode
  setInspectorMode: (mode: InspectorMode) => void
  openInspector: (row: AccountRow) => void
  closeInspector: () => void
}

const ChartContext = React.createContext<ChartState | null>(null)

export function useChart(): ChartState {
  const ctx = React.useContext(ChartContext)
  if (!ctx) throw new Error("useChart must be used within ChartProvider")
  return ctx
}

export function ChartProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = React.useState("all")
  const [hiddenTabs, setHiddenTabs] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [inspected, setInspected] = React.useState<AccountRow | null>(null)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)
  const [inspectorMode, setInspectorMode] =
    React.useState<InspectorMode>("panel")

  const openInspector = React.useCallback((row: AccountRow) => {
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

  const value = React.useMemo<ChartState>(
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

  return <ChartContext.Provider value={value}>{children}</ChartContext.Provider>
}

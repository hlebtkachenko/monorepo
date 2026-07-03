"use client"

import * as React from "react"

import type { InspectorMode } from "@workspace/ui/blocks/app-content"

import type { OpenItemRow } from "./data"

/** Shared UI state linking the saldokonto page's header + body slots. */
interface SaldokontoState {
  activeTab: string
  setActiveTab: (value: string) => void
  favorite: boolean
  toggleFavorite: () => void
  hiddenTabs: ReadonlySet<string>
  toggleTabHidden: (value: string) => void
  inspected: OpenItemRow | null
  inspectorOpen: boolean
  inspectorMode: InspectorMode
  setInspectorMode: (mode: InspectorMode) => void
  openInspector: (row: OpenItemRow) => void
  closeInspector: () => void
}

const SaldokontoContext = React.createContext<SaldokontoState | null>(null)

export function useSaldokonto(): SaldokontoState {
  const ctx = React.useContext(SaldokontoContext)
  if (!ctx)
    throw new Error("useSaldokonto must be used within SaldokontoProvider")
  return ctx
}

export function SaldokontoProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [activeTab, setActiveTab] = React.useState("all")
  const [favorite, setFavorite] = React.useState(false)
  const [hiddenTabs, setHiddenTabs] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [inspected, setInspected] = React.useState<OpenItemRow | null>(null)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)
  const [inspectorMode, setInspectorMode] =
    React.useState<InspectorMode>("panel")

  const openInspector = React.useCallback((row: OpenItemRow) => {
    setInspected(row)
    setInspectorOpen(true)
  }, [])
  const closeInspector = React.useCallback(() => setInspectorOpen(false), [])
  const toggleFavorite = React.useCallback(() => setFavorite((f) => !f), [])
  const toggleTabHidden = React.useCallback((value: string) => {
    setHiddenTabs((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
    setActiveTab((current) => (current === value ? "all" : current))
  }, [])

  const value = React.useMemo<SaldokontoState>(
    () => ({
      activeTab,
      setActiveTab,
      favorite,
      toggleFavorite,
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
      favorite,
      toggleFavorite,
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
    <SaldokontoContext.Provider value={value}>
      {children}
    </SaldokontoContext.Provider>
  )
}

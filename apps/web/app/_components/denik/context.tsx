"use client"

import * as React from "react"

import type { InspectorMode } from "@workspace/ui/blocks/content-panel"

import type { JournalRow } from "./data"

/**
 * Shared UI state linking the deník page's two app-shell slots — the content
 * header (tabs) and the body (toolbar + table + inspector). Mirrors
 * the table-demo pattern; the inspector shows a single journal line's detail.
 */
interface DenikState {
  activeTab: string
  setActiveTab: (value: string) => void
  hiddenTabs: ReadonlySet<string>
  toggleTabHidden: (value: string) => void
  inspected: JournalRow | null
  inspectorOpen: boolean
  inspectorMode: InspectorMode
  setInspectorMode: (mode: InspectorMode) => void
  openInspector: (row: JournalRow) => void
  closeInspector: () => void
}

const DenikContext = React.createContext<DenikState | null>(null)

export function useDenik(): DenikState {
  const ctx = React.useContext(DenikContext)
  if (!ctx) throw new Error("useDenik must be used within DenikProvider")
  return ctx
}

export function DenikProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = React.useState("all")
  const [hiddenTabs, setHiddenTabs] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [inspected, setInspected] = React.useState<JournalRow | null>(null)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)
  const [inspectorMode, setInspectorMode] =
    React.useState<InspectorMode>("panel")

  const openInspector = React.useCallback((row: JournalRow) => {
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

  const value = React.useMemo<DenikState>(
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

  return <DenikContext.Provider value={value}>{children}</DenikContext.Provider>
}

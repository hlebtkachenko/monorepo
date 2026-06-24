"use client"

import * as React from "react"

/**
 * Shared UI state for the TEMP Content Panel demo. Exists only to link the two
 * app-shell slots that the demo spans: the header (`contentHeader` slot — tabs,
 * favorite, manage-page menu) and the body (`children` — toolbar + table). Real
 * pages will likely lift far less than this; it's broad here to exercise every
 * cross-slot interaction at once.
 */
interface OrgContentState {
  activeTab: string
  setActiveTab: (value: string) => void
  filtersOpen: boolean
  toggleFilters: () => void
  showToolbarActions: boolean
  setShowToolbarActions: (value: boolean) => void
  favorite: boolean
  toggleFavorite: () => void
  hiddenTabs: ReadonlySet<string>
  toggleTabHidden: (value: string) => void
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
  const [activeTab, setActiveTab] = React.useState("vse")
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  const [showToolbarActions, setShowToolbarActions] = React.useState(true)
  const [favorite, setFavorite] = React.useState(false)
  const [hiddenTabs, setHiddenTabs] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )

  const toggleFilters = React.useCallback(
    () => setFiltersOpen((open) => !open),
    [],
  )
  const toggleFavorite = React.useCallback(() => setFavorite((fav) => !fav), [])
  const toggleTabHidden = React.useCallback((value: string) => {
    setHiddenTabs((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
    // If the tab being hidden is the active one, fall back to "Všechny".
    setActiveTab((current) => (current === value ? "vse" : current))
  }, [])

  const value = React.useMemo<OrgContentState>(
    () => ({
      activeTab,
      setActiveTab,
      filtersOpen,
      toggleFilters,
      showToolbarActions,
      setShowToolbarActions,
      favorite,
      toggleFavorite,
      hiddenTabs,
      toggleTabHidden,
    }),
    [
      activeTab,
      filtersOpen,
      toggleFilters,
      showToolbarActions,
      favorite,
      toggleFavorite,
      hiddenTabs,
      toggleTabHidden,
    ],
  )

  return (
    <OrgContentContext.Provider value={value}>
      {children}
    </OrgContentContext.Provider>
  )
}

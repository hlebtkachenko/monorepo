"use client"

import * as React from "react"

import {
  DOKLAD_HEADER,
  DOKLAD_LINES,
  DOKLAD_PARTY,
  linesToRows,
  rowsToTotals,
  type DokladHeader,
  type DokladParty,
  type DokladTotals,
} from "./data"
import type { LineRow } from "./line-items"

/**
 * Shared doklad record state. The header, the three panels, the editable
 * line-items grid, and the ContentStatusBar all read from one source so the
 * live Base / VAT / Total totals stay reconciled no matter which surface is
 * rendering. The rows are the single mutable input; totals derive from them.
 */
interface DokladContextValue {
  header: DokladHeader
  party: DokladParty
  rows: LineRow[]
  setRows: (rows: LineRow[]) => void
  totals: DokladTotals
}

const DokladContext = React.createContext<DokladContextValue | null>(null)

export function DokladProvider({ children }: { children: React.ReactNode }) {
  const [rows, setRows] = React.useState<LineRow[]>(() =>
    linesToRows(DOKLAD_LINES),
  )
  const totals = React.useMemo(() => rowsToTotals(rows), [rows])
  const value = React.useMemo<DokladContextValue>(
    () => ({
      header: DOKLAD_HEADER,
      party: DOKLAD_PARTY,
      rows,
      setRows,
      totals,
    }),
    [rows, totals],
  )
  return (
    <DokladContext.Provider value={value}>{children}</DokladContext.Provider>
  )
}

/** Read the shared doklad record state. Must be used under `DokladProvider`. */
export function useDoklad(): DokladContextValue {
  const ctx = React.useContext(DokladContext)
  if (!ctx) {
    throw new Error("useDoklad must be used within a DokladProvider")
  }
  return ctx
}

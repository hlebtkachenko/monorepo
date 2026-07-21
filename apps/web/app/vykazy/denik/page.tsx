"use client"

// Účetní deník page: toolbar + the obratová předvaha as a click-to-filter summary
// on top of an editable deník table. Editing a cell calls updateDenikRow, which
// the context uses to recompute BOTH the předvaha and the výkazy — this page
// computes nothing. The filter is local page state; it changes which rows are
// VISIBLE, never their true index, so edits/deletes always address the real row.

import { useState } from "react"

import Link from "next/link"

import { DenikTable, type IndexedDenikRow } from "../_components/denik-table"
import {
  PredvahaSummary,
  type PredvahaFilter,
} from "../_components/denik-panel"
import { Toolbar } from "../_components/toolbar"
import { useOrg } from "../_lib/org-context"

/** Active filter, plus the deník row indices it matched AT CLICK TIME. The set is
 * frozen when the filter is set, so editing an md/dal cell that would drop out of
 * the predicate never unmounts the row mid-keystroke. */
type ActiveFilter = PredvahaFilter & { indices: number[] }

/** Does a deník row match a předvaha selection? (evaluated only at click time.) */
function rowMatches(md: string, dal: string, sel: PredvahaFilter): boolean {
  if (sel.side === "md") return md === sel.ucet
  if (sel.side === "dal") return dal === sel.ucet
  return md === sel.ucet || dal === sel.ucet
}

export default function DenikPage() {
  const { denik, denikLoaded, addDenikRow } = useOrg()
  const [filter, setFilter] = useState<ActiveFilter | null>(null)

  // Clicking a předvaha cell selects it (snapshotting the matching TRUE indices
  // right now); clicking the active selection clears it. The predicate is NEVER
  // re-run afterwards, so a subsequently-edited row keeps its place + focus.
  const toggleFilter = (next: PredvahaFilter) =>
    setFilter((prev) => {
      if (prev && prev.ucet === next.ucet && prev.side === next.side)
        return null
      const indices: number[] = []
      denik.forEach((row, index) => {
        if (rowMatches(row.md.trim(), row.dal.trim(), next)) indices.push(index)
      })
      return { ...next, indices }
    })

  // Adding a row clears the filter first, so the new blank row is always visible.
  const handleAddRow = () => {
    setFilter(null)
    addDenikRow()
  }

  // No filter → all rows live. Filtered → exactly the snapshot indices, remapped
  // to CURRENT row data (so edits show) at their TRUE index (so edits/deletes
  // still address the real deník row). The length guard drops indices a later
  // delete may have pushed past the end.
  const visibleRows: IndexedDenikRow[] = filter
    ? filter.indices
        .filter((index) => index < denik.length)
        .map((index) => ({ row: denik[index]!, index }))
    : denik.map((row, index) => ({ row, index }))

  const filterLabel = !filter
    ? null
    : filter.side === "md"
      ? `${filter.ucet} · strana MD`
      : filter.side === "dal"
        ? `${filter.ucet} · strana Dal`
        : `${filter.ucet} · MD i Dal`

  return (
    <main className="vykaz-page mx-auto max-w-5xl space-y-4 p-6">
      <div className="no-print">
        <Link href="/vykazy" className="text-sm text-blue-600 hover:underline">
          ← Zpět na přehled
        </Link>
      </div>

      <Toolbar />

      <div className="no-print">
        <h1 className="text-xl font-bold text-black">Účetní deník</h1>
        <p className="text-sm text-neutral-600">
          Obratová předvaha nahoře slouží jako filtr deníku. Úpravy deníku se
          ihned promítnou do výkazů.
        </p>
      </div>

      {!denikLoaded ? (
        <div className="no-print rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-600">
          Zatím není načten žádný deník. Naimportujte účetní deník z POHODY
          (XLSX) tlačítkem{" "}
          <span className="font-semibold">„Import deník (XLSX)“</span> v liště
          nahoře.
        </div>
      ) : (
        <div className="space-y-4">
          <PredvahaSummary filter={filter} onSelect={toggleFilter} />

          <div className="no-print flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-black">
              Účetní deník{" "}
              <span className="text-sm font-normal text-neutral-500">
                ({visibleRows.length}
                {filter ? ` z ${denik.length}` : ""} řádků)
              </span>
            </h2>
            {filter ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-[11px] font-medium text-blue-800">
                Filtr: {filterLabel}
                <button
                  type="button"
                  onClick={() => setFilter(null)}
                  className="cursor-pointer font-semibold hover:underline"
                >
                  × zrušit filtr
                </button>
              </span>
            ) : null}
          </div>

          <DenikTable rows={visibleRows} onAddRow={handleAddRow} />

          <p className="no-print text-[11px] text-neutral-500">
            Úpravy deníku se ihned promítnou do výkazů (Rozvaha i Výkaz zisku a
            ztráty).
          </p>
        </div>
      )}
    </main>
  )
}

"use client"

// Editable Účetní deník table. Every cell is an inline input bound to a deník row;
// each edit calls updateDenikRow, and the context recomputes the předvaha AND the
// výkazy — this table computes nothing. Rows are keyed and addressed by their TRUE
// index into the full deník, so filtering the visible subset never misroutes an
// edit or a delete. Screen-only (.no-print).

import { useState } from "react"

import { useOrg } from "../_lib/org-context"
import type { DenikRow } from "../_lib/denik"

/** One visible deník row paired with its true index into the full deník array. */
export interface IndexedDenikRow {
  row: DenikRow
  index: number
}

/** Parse a typed Kč amount (grouping spaces + comma/dot decimal) to a number. */
function parseCastkaInput(raw: string): number {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".")
  if (cleaned === "" || cleaned === "-" || cleaned === "+" || cleaned === ".") {
    return 0
  }
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

const INPUT_CLASS =
  "w-full min-w-0 bg-transparent px-2 py-2 text-[13px] leading-relaxed outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-300"

export function DenikTable({
  rows,
  onAddRow,
}: {
  rows: IndexedDenikRow[]
  /** Add-row handler. The page passes one that clears the active filter first so
   * the new blank row is visible; falls back to the context appender. */
  onAddRow?: () => void
}) {
  const { updateDenikRow, addDenikRow, deleteDenikRow } = useOrg()

  return (
    <div className="no-print">
      <div className="overflow-auto rounded border border-neutral-200">
        <table className="w-full border-collapse text-[13px] tabular-nums">
          <thead className="sticky top-0 z-10 bg-neutral-100 text-neutral-700">
            <tr>
              <th className="px-2 py-2 text-left font-semibold">Datum</th>
              <th className="px-2 py-2 text-left font-semibold">Číslo</th>
              <th className="px-2 py-2 text-left font-semibold">Zdroj</th>
              <th className="px-2 py-2 text-left font-semibold">Text</th>
              <th className="px-2 py-2 text-left font-semibold">MD</th>
              <th className="px-2 py-2 text-left font-semibold">Dal</th>
              <th className="px-2 py-2 text-right font-semibold">Částka</th>
              <th className="px-2 py-2 text-left font-semibold">PárSym</th>
              <th className="px-2 py-2 text-left font-semibold">Firma</th>
              <th
                className="px-2 py-2 text-center font-semibold"
                aria-label="Akce"
              />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, index }) => (
              <tr key={index} className="border-t border-neutral-100">
                <td className="p-0">
                  <input
                    className={INPUT_CLASS}
                    value={row.datum}
                    onChange={(e) =>
                      updateDenikRow(index, { datum: e.target.value })
                    }
                    aria-label={`Datum řádku ${index + 1}`}
                  />
                </td>
                <td className="p-0">
                  <input
                    className={INPUT_CLASS}
                    value={row.cislo}
                    onChange={(e) =>
                      updateDenikRow(index, { cislo: e.target.value })
                    }
                    aria-label={`Číslo řádku ${index + 1}`}
                  />
                </td>
                <td className="p-0">
                  <input
                    className={INPUT_CLASS}
                    value={row.zdroj}
                    onChange={(e) =>
                      updateDenikRow(index, { zdroj: e.target.value })
                    }
                    aria-label={`Zdroj řádku ${index + 1}`}
                  />
                </td>
                <td className="p-0">
                  <input
                    className={INPUT_CLASS}
                    value={row.text}
                    onChange={(e) =>
                      updateDenikRow(index, { text: e.target.value })
                    }
                    aria-label={`Text řádku ${index + 1}`}
                  />
                </td>
                <td className="p-0">
                  <input
                    className={`${INPUT_CLASS} font-mono`}
                    value={row.md}
                    onChange={(e) =>
                      updateDenikRow(index, { md: e.target.value })
                    }
                    aria-label={`MD řádku ${index + 1}`}
                  />
                </td>
                <td className="p-0">
                  <input
                    className={`${INPUT_CLASS} font-mono`}
                    value={row.dal}
                    onChange={(e) =>
                      updateDenikRow(index, { dal: e.target.value })
                    }
                    aria-label={`Dal řádku ${index + 1}`}
                  />
                </td>
                <td className="p-0">
                  <CastkaCell
                    value={row.castka}
                    index={index}
                    onCommit={(n) => updateDenikRow(index, { castka: n })}
                  />
                </td>
                <td className="p-0">
                  <input
                    className={INPUT_CLASS}
                    value={row.parsym ?? ""}
                    onChange={(e) =>
                      updateDenikRow(index, { parsym: e.target.value })
                    }
                    aria-label={`Párovací symbol řádku ${index + 1}`}
                  />
                </td>
                <td className="p-0">
                  <input
                    className={INPUT_CLASS}
                    value={row.firma ?? ""}
                    onChange={(e) =>
                      updateDenikRow(index, { firma: e.target.value })
                    }
                    aria-label={`Firma řádku ${index + 1}`}
                  />
                </td>
                <td className="px-1 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => deleteDenikRow(index)}
                    title="Smazat řádek"
                    aria-label={`Smazat řádek ${index + 1}`}
                    className="cursor-pointer rounded px-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-2 py-2 text-center text-neutral-500"
                >
                  Žádné řádky pro zvolený filtr.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="mt-2">
        <button
          type="button"
          onClick={() => (onAddRow ?? addDenikRow)()}
          className="cursor-pointer rounded border border-neutral-300 px-3 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50"
        >
          + Přidat řádek
        </button>
      </div>
    </div>
  )
}

/**
 * Amount input that keeps the user's raw keystrokes while editing (so a decimal
 * dot/comma survives instead of being reformatted away on every change), yet
 * always reflects the row prop once unfocused — which keeps an index-keyed
 * delete safe: after a middle-row delete no cell holds a draft, so each input
 * shows its (possibly shifted) row's canonical value.
 */
function CastkaCell({
  value,
  index,
  onCommit,
}: {
  value: number
  index: number
  onCommit: (n: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const display = draft ?? (value === 0 ? "" : String(value))
  return (
    <input
      className={`${INPUT_CLASS} text-right`}
      inputMode="decimal"
      value={display}
      onChange={(e) => {
        setDraft(e.target.value)
        onCommit(parseCastkaInput(e.target.value))
      }}
      onBlur={() => setDraft(null)}
      aria-label={`Částka řádku ${index + 1}`}
    />
  )
}

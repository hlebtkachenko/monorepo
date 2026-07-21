"use client"

// Renders one VykazStatement as a bordered paper-form table: header columns
// (Označení | TEXT | Číslo řádku | value columns), one row per line. Leaf cells
// are white editable inputs; calc + netto cells are grey computed values.
// Formulas are always evaluated over the FULL statement; rozsah / hideEmpty only
// hide rows at render time so totals stay correct.

import { useEffect, useMemo, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { computeAll } from "../_lib/engine"
import { formatTisice, parseCislo } from "../_lib/format"
import { useOrg } from "../_lib/org-context"
import type { StatementKey } from "../_lib/storage"
import type {
  ColKey,
  Rozsah,
  VykazLine,
  VykazStatement,
  VykazValues,
} from "../_lib/types"

interface VykazTableProps {
  statement: VykazStatement
  /** Column-b header label: "AKTIVA" | "PASIVA" (rozvaha) | "TEXT" (VZZ). */
  columnBLabel: string
  colValues: VykazValues
  rozsah: Rozsah
  hideEmpty?: boolean
  onCellChange: (rada: string, col: ColKey, value: number | null) => void
}

const SUB_LABEL: Record<ColKey, { plny: string; short: string }> = {
  brutto: { plny: "Brutto", short: "Brutto" },
  korekce: { plny: "Korekce", short: "Korekce" },
  netto: { plny: "Netto", short: "Netto" },
  bezne: { plny: "Běžné", short: "Netto" },
  minule: { plny: "Minulé", short: "Netto" },
}

interface HeaderGroup {
  label: string
  cols: ColKey[]
}

function headerGroups(statement: VykazStatement): HeaderGroup[] {
  const cols = statement.columns
  if (cols.includes("brutto")) {
    const bezne = cols.filter((c) => c !== "minule")
    const groups: HeaderGroup[] = [
      { label: "Běžné účetní období", cols: bezne },
    ]
    if (cols.includes("minule")) {
      groups.push({ label: "Minulé úč. období", cols: ["minule"] })
    }
    return groups
  }
  return [{ label: "Skutečnost v účetním období", cols }]
}

function isHidable(line: VykazLine): boolean {
  // Never hide totals / subtotals (calc) or explicitly bold result rows.
  return line.kind === "input" && !line.bold
}

/**
 * A single white editable cell. Keeps local text state so partial input
 * ("1 ", "12,") is preserved while the parsed number flows to the store, and
 * re-syncs when the external value changes (import / reset).
 */
function InputCell({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (value: number | null) => void
}) {
  const [text, setText] = useState(() =>
    value === undefined ? "" : String(value),
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local edit text to the derived `value` prop when it changes externally (deník recompute / import)
    setText((prev) => {
      const prevParsed = parseCislo(prev)
      if ((value ?? null) === (prevParsed ?? null)) return prev
      return value === undefined ? "" : String(value)
    })
  }, [value])

  return (
    <input
      inputMode="numeric"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        onChange(parseCislo(e.target.value))
      }}
      className="w-full bg-white px-1 py-0.5 text-right text-[11px] text-black tabular-nums outline-none focus:bg-yellow-50 focus:ring-1 focus:ring-blue-400"
    />
  )
}

export function VykazTable({
  statement,
  columnBLabel,
  colValues,
  rozsah,
  hideEmpty = false,
  onCellChange,
}: VykazTableProps) {
  const { denikLoaded, isSourced, overrideCell } = useOrg()
  // Each statement selects its own values map by id: "rozvaha-aktiva",
  // "rozvaha-pasiva", or "vzz" all match a StatementKey one-to-one.
  const statementKey = statement.id as StatementKey

  const computed = useMemo(
    () => computeAll(statement, colValues),
    [statement, colValues],
  )
  const groups = headerGroups(statement)
  const short = rozsah === "zkraceny"

  const visibleLines = statement.lines.filter((line) => {
    if (short && !line.inZkraceny) return false
    if (hideEmpty && isHidable(line)) {
      const allZero = statement.columns.every(
        (col) => (computed[line.rada]?.[col] ?? 0) === 0,
      )
      if (allZero) return false
    }
    return true
  })

  const cellBase =
    "border border-neutral-400 px-1 py-0.5 text-[11px] tabular-nums"

  // Value columns share the row equally; Ozn. + řádek are fixed-narrow and the
  // TEXT column (auto width) absorbs the rest so all columns fit the A4 width.
  const valueWidth = statement.columns.length >= 4 ? 11 : 14

  return (
    <table className="vykaz-table w-full table-fixed border-collapse border border-neutral-500 text-black">
      <colgroup>
        <col style={{ width: "13%" }} />
        <col />
        <col style={{ width: "7%" }} />
        {statement.columns.map((col) => (
          <col key={col} style={{ width: `${valueWidth}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr className="bg-neutral-100 text-center text-[11px] font-semibold">
          <th
            rowSpan={2}
            className="border border-neutral-500 px-1 py-1 whitespace-nowrap"
          >
            Ozn.
          </th>
          <th
            rowSpan={2}
            className="border border-neutral-500 px-2 py-1 text-left"
          >
            {columnBLabel}
          </th>
          <th rowSpan={2} className="border border-neutral-500 px-1 py-1">
            Číslo
            <br />
            řádku
          </th>
          {groups.map((g) => (
            <th
              key={g.label}
              colSpan={g.cols.length}
              className="border border-neutral-500 px-1 py-1"
            >
              {g.label}
            </th>
          ))}
        </tr>
        <tr className="bg-neutral-100 text-center text-[11px] font-semibold">
          {statement.columns.map((col, i) => (
            <th key={col} className="border border-neutral-500 px-1 py-0.5">
              {short ? SUB_LABEL[col].short : SUB_LABEL[col].plny}
              <br />
              <span className="font-normal text-neutral-500">{i + 1}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {visibleLines.map((line) => (
          <tr key={line.rada} className={cn(line.bold && "font-bold")}>
            <td className={cn(cellBase, "text-center whitespace-nowrap")}>
              {line.ozn}
            </td>
            <td
              className={cn(cellBase, "text-left break-words")}
              style={{ paddingLeft: `${(line.indent ?? 0) * 14 + 6}px` }}
            >
              {line.text}
            </td>
            <td className={cn(cellBase, "text-center text-neutral-600")}>
              {line.rada}
            </td>
            {statement.columns.map((col) => {
              const naKorekce = col === "korekce" && line.korekceNA
              const editable =
                line.kind === "input" && col !== "netto" && !naKorekce

              if (naKorekce) {
                return (
                  <td
                    key={col}
                    className={cn(
                      cellBase,
                      "bg-neutral-100 text-center text-neutral-500",
                    )}
                  >
                    x
                  </td>
                )
              }
              if (editable) {
                // A leaf whose value came from the deník renders grey (derived
                // look) until the user clicks it to take over — clicking records
                // an override and flips it back to a white editable input.
                const sourced =
                  denikLoaded && isSourced(statementKey, line.rada, col)
                if (sourced) {
                  return (
                    <td
                      key={col}
                      className={cn(cellBase, "bg-neutral-100 p-0")}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          overrideCell(statementKey, line.rada, col)
                        }
                        title="Hodnota z deníku — kliknutím ji upravíte"
                        className="w-full px-1 py-0.5 text-right text-[11px] text-black tabular-nums hover:bg-yellow-50"
                      >
                        {formatTisice(computed[line.rada]?.[col])}
                      </button>
                    </td>
                  )
                }
                return (
                  <td key={col} className={cn(cellBase, "bg-white p-0")}>
                    <InputCell
                      value={colValues[line.rada]?.[col]}
                      onChange={(value) => onCellChange(line.rada, col, value)}
                    />
                  </td>
                )
              }
              return (
                <td
                  key={col}
                  className={cn(
                    cellBase,
                    "bg-neutral-100 text-right text-black",
                  )}
                >
                  {formatTisice(computed[line.rada]?.[col])}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

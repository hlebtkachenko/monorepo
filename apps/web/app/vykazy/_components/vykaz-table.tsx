"use client"

// Renders one VykazStatement as a bordered paper-form table: header columns
// (Označení | TEXT | Číslo řádku | value columns), one row per line. Leaf cells
// are white editable inputs; calc + netto cells are grey computed values.
// Formulas are always evaluated over the FULL statement; rozsah / hideEmpty only
// hide rows at render time so totals stay correct.
//
// Screen and print are two different renders of the same lines. The screen gets
// one interactive table; print gets the rows chunked into A4 pages, each its own
// complete table with its own column header (see ../_lib/print-pagination.ts for
// why CSS cannot do this). A third, hidden copy at print geometry is what the
// chunking measures.

import { useEffect, useMemo, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { computeAll } from "../_lib/engine"
import { inRozsah } from "../_lib/rozsah"
import { formatTisiceCell, parseCislo } from "../_lib/format"
import { useOrg } from "../_lib/org-context"
import { chunkRows, usePrintMetrics } from "../_lib/print-pagination"
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
  /**
   * Millimetres of the first printed page already taken by content above this
   * table (the tiskopis title block). Fixed content, so a constant is honest
   * here; the row chunking itself is measured.
   */
  firstPageMm?: number
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

const cellBase =
  "border border-neutral-400 px-1 py-0.5 text-[11px] tabular-nums"

export function VykazTable({
  statement,
  columnBLabel,
  colValues,
  rozsah,
  hideEmpty = false,
  firstPageMm = 0,
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
  const short = rozsah !== "plny"

  // The statement handed in is already the one the chosen časové-rozlišení
  // layout prints (see _data/rozvaha.ts), so only rozsah filtering happens here.
  const visibleLines = statement.lines.filter((line) => {
    if (!inRozsah(statement.id, line, rozsah)) return false
    if (hideEmpty && isHidable(line)) {
      const allZero = statement.columns.every(
        (col) => (computed[line.rada]?.[col] ?? 0) === 0,
      )
      if (allZero) return false
    }
    return true
  })

  // Value columns share the row equally; Ozn. + řádek are fixed-narrow and the
  // TEXT column (auto width) absorbs the rest so all columns fit the A4 width.
  const valueWidth = statement.columns.length >= 4 ? 11 : 14

  const colgroup = (
    <colgroup>
      <col style={{ width: "8%" }} />
      <col />
      <col style={{ width: "7%" }} />
      {statement.columns.map((col) => (
        <col key={col} style={{ width: `${valueWidth}%` }} />
      ))}
    </colgroup>
  )

  const thead = (
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
  )

  /** Ozn. / text / číslo řádku — identical on screen and on paper. */
  const labelCells = (line: VykazLine) => (
    <>
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
    </>
  )

  // Printed rows carry no inputs or buttons: on a tiskopis every cell is a
  // reported figure, and an empty <input> would print as a blank box.
  const printRows = visibleLines.map((line) => (
    <tr key={line.rada} className={cn(line.bold && "font-bold")}>
      {labelCells(line)}
      {statement.columns.map((col) =>
        col === "korekce" && line.korekceNA ? (
          <td
            key={col}
            className={cn(cellBase, "text-center text-neutral-500")}
          >
            x
          </td>
        ) : (
          <td key={col} className={cn(cellBase, "text-right text-black")}>
            {formatTisiceCell(computed[line.rada]?.[col])}
          </td>
        ),
      )}
    </tr>
  ))

  const signature = `${statement.id}|${rozsah}|${visibleLines
    .map((l) => l.rada)
    .join(",")}`
  const { measureRef, heights, headHeight } = usePrintMetrics(signature)
  const pages =
    heights.length === visibleLines.length && headHeight > 0
      ? chunkRows(heights, headHeight, firstPageMm)
      : [visibleLines.map((_, index) => index)]

  return (
    <>
      <table className="vykaz-table no-print w-full table-fixed border-collapse text-black">
        {colgroup}
        {thead}
        <tbody>
          {visibleLines.map((line) => (
            <tr key={line.rada} className={cn(line.bold && "font-bold")}>
              {labelCells(line)}
              {statement.columns.map((col) => {
                const naKorekce = col === "korekce" && line.korekceNA
                // A calc line carrying an explicit value has its formula
                // overridden by the engine, so it must render as an editable
                // cell — otherwise the value prints as an ordinary computed
                // total, indistinguishable from one, and cannot be cleared.
                // Two things put a value on a calc line: clicking an
                // `overridable` cell (ř. 56 Čistý obrat), and a prior-year
                // import supplying aggregates rather than leaves.
                const overridden =
                  line.kind === "calc" &&
                  colValues[line.rada]?.[col] !== undefined
                const editable =
                  (line.kind === "input" || overridden) &&
                  col !== "netto" &&
                  !naKorekce

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
                if (
                  line.overridable === true &&
                  !overridden &&
                  col !== "netto"
                ) {
                  return (
                    <td
                      key={col}
                      className={cn(cellBase, "bg-neutral-100 p-0")}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onCellChange(
                            line.rada,
                            col,
                            computed[line.rada]?.[col] ?? 0,
                          )
                        }
                        title={
                          line.overridableHint ??
                          "Vypočtená hodnota — kliknutím zadáte vlastní"
                        }
                        className="w-full px-1 py-0.5 text-right text-[11px] font-bold text-black tabular-nums hover:bg-yellow-50"
                      >
                        {formatTisiceCell(computed[line.rada]?.[col])}
                      </button>
                    </td>
                  )
                }
                if (editable) {
                  // A leaf whose value came from the deník renders grey (derived
                  // look) until the user clicks it to take over — clicking
                  // records an override and flips it back to a white input.
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
                          {formatTisiceCell(computed[line.rada]?.[col])}
                        </button>
                      </td>
                    )
                  }
                  return (
                    <td key={col} className={cn(cellBase, "bg-white p-0")}>
                      <InputCell
                        value={colValues[line.rada]?.[col]}
                        onChange={(value) =>
                          onCellChange(line.rada, col, value)
                        }
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
                    {formatTisiceCell(computed[line.rada]?.[col])}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Hidden replica at print geometry — the only thing measured. */}
      <div className="print-metrics" aria-hidden>
        <table
          ref={measureRef}
          className="vykaz-table w-full table-fixed border-collapse"
        >
          {colgroup}
          {thead}
          <tbody>{printRows}</tbody>
        </table>
      </div>

      {pages.map((rows, page) => (
        <div key={page} className="print-only print-page">
          <table className="vykaz-table w-full table-fixed border-collapse text-black">
            {colgroup}
            {thead}
            <tbody>{rows.map((index) => printRows[index])}</tbody>
          </table>
        </div>
      ))}
    </>
  )
}

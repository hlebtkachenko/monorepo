"use client"

// Printable Účetní deník. The on-screen deník is an editable grid with an input
// in every cell (denik-table.tsx, .no-print) — printing that gave blank paper,
// since the whole page is screen chrome. This is the paper form of the same
// book: a static table, chunked into A4 pages by measured row heights, each page
// a complete table with its own column header.
//
// § 13 zákona o účetnictví requires the deník to record the účetní zápisy in
// time order, so the printed columns are the identifying ones: datum, doklad,
// text, souvztažné účty MD / Dal and the částka, closed by a control total.

import { formatKc } from "../_lib/format"
import {
  chunkRows,
  usePrintMetrics,
  STATEMENT_HEADER_MM,
} from "../_lib/print-pagination"
import { StatementHeader } from "./statement-header"
import type { DenikRow } from "../_lib/denik"

const cellBase = "border border-neutral-400 px-1 py-0.5 text-[10px]"

export function DenikPrint({ rows }: { rows: DenikRow[] }) {
  const signature = `denik|${rows.length}|${rows.map((r) => r.text).join("|")}`
  const { measureRef, heights, headHeight } = usePrintMetrics(signature)

  const colgroup = (
    <colgroup>
      <col style={{ width: "12%" }} />
      <col style={{ width: "14%" }} />
      <col style={{ width: "44%" }} />
      <col style={{ width: "8%" }} />
      <col style={{ width: "8%" }} />
      <col style={{ width: "14%" }} />
    </colgroup>
  )

  const thead = (
    <thead>
      <tr className="bg-neutral-100 text-center text-[10px] font-semibold">
        <th className="border border-neutral-500 px-1 py-1 text-left">Datum</th>
        <th className="border border-neutral-500 px-1 py-1 text-left">
          Doklad
        </th>
        <th className="border border-neutral-500 px-1 py-1 text-left">Text</th>
        <th className="border border-neutral-500 px-1 py-1">MD</th>
        <th className="border border-neutral-500 px-1 py-1">Dal</th>
        <th className="border border-neutral-500 px-1 py-1 text-right">
          Částka (Kč)
        </th>
      </tr>
    </thead>
  )

  const total = rows.reduce((sum, row) => sum + row.castka, 0)

  const bodyRows = rows.map((row, index) => (
    <tr key={`row-${index}`}>
      <td className={`${cellBase} whitespace-nowrap`}>{row.datum}</td>
      <td className={`${cellBase} whitespace-nowrap`}>{row.cislo}</td>
      <td className={`${cellBase} break-words`}>{row.text}</td>
      <td className={`${cellBase} text-center font-mono`}>{row.md}</td>
      <td className={`${cellBase} text-center font-mono`}>{row.dal}</td>
      <td className={`${cellBase} text-right tabular-nums`}>
        {formatKc(row.castka)}
      </td>
    </tr>
  ))

  // Keyed like the body rows: `allRows` is rendered as an array, both directly
  // into the measuring replica and sliced per page, so every element needs one.
  const totalRow = (
    <tr key="total" className="bg-neutral-100 font-bold">
      <td className={`${cellBase} text-left`} colSpan={5}>
        Celkem {rows.length} účetních zápisů
      </td>
      <td className={`${cellBase} text-right tabular-nums`}>
        {formatKc(total)}
      </td>
    </tr>
  )

  const allRows = [...bodyRows, totalRow]
  const pages =
    heights.length === allRows.length && headHeight > 0
      ? chunkRows(heights, headHeight, STATEMENT_HEADER_MM)
      : [allRows.map((_, index) => index)]

  return (
    <>
      {/* Hidden replica at print geometry — the only thing measured. */}
      <div className="print-metrics" aria-hidden>
        <table
          ref={measureRef}
          className="vykaz-table w-full table-fixed border-collapse"
        >
          {colgroup}
          {thead}
          <tbody>{allRows}</tbody>
        </table>
      </div>

      {pages.map((pageRows, page) => (
        <div key={page} className="print-only print-page">
          {page === 0 ? (
            <StatementHeader heading="Účetní deník" hideRozsah hideLegalNote />
          ) : null}
          <table className="vykaz-table w-full table-fixed border-collapse text-black">
            {colgroup}
            {thead}
            <tbody>{pageRows.map((index) => allRows[index])}</tbody>
          </table>
        </div>
      ))}
    </>
  )
}

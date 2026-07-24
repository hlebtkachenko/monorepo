"use client"

// Renders the obratová předvaha as a bordered A4 paper-form table in the same
// visual language as the ROZVAHA / VÝKAZ ZISKU A ZTRÁTY tables: three column
// pairs (Počáteční stav | Obrat | Konečný stav, each Má dáti / Dal), one row per
// account, interleaved with SU / třída / grand subtotals. The whole statement is
// derived live from the editable deník (via buildPredvahaStatement) — no inputs.

import { cn } from "@workspace/ui/lib/utils"

import { formatKc } from "../_lib/format"
import type {
  PredvahaLine,
  PredvahaStatement as PredvahaStatementModel,
  Totals,
} from "../_lib/predvaha-statement"

const cellBase =
  "border border-neutral-400 px-1 py-0.5 text-[10px] tabular-nums"

/** The six numeric cells (PS MD/Dal, Obrat MD/Dal, KS MD/Dal) of one line. */
function NumberCells({ totals, bold }: { totals: Totals; bold?: boolean }) {
  const values = [
    totals.psMD,
    totals.psDal,
    totals.obratMD,
    totals.obratDal,
    totals.ksMD,
    totals.ksDal,
  ]
  return (
    <>
      {values.map((v, i) => (
        <td
          key={i}
          className={cn(cellBase, "text-right text-black", bold && "font-bold")}
        >
          {formatKc(v)}
        </td>
      ))}
    </>
  )
}

/** Row styling per line kind: plain account, `*` SU, `**` třída, `***` grand. */
function lineRowClass(kind: PredvahaLine["kind"]): string {
  switch (kind) {
    case "su":
      return "bg-neutral-50 font-semibold"
    case "trida":
      return "bg-neutral-100 font-semibold"
    case "grand":
      return "bg-neutral-100 font-bold"
    case "celkem":
      return "bg-neutral-200 font-bold"
    default:
      return ""
  }
}

const MARKER: Record<PredvahaLine["kind"], string> = {
  ucet: "",
  su: "*",
  trida: "**",
  grand: "***",
  celkem: "***",
}

function BalanceBadge({ ok, children }: { ok: boolean; children: string }) {
  return (
    <span
      className={cn("font-semibold", ok ? "text-green-700" : "text-red-600")}
    >
      {ok ? "✓" : "✗"} {children}
    </span>
  )
}

export function PredvahaStatement({
  statement,
}: {
  statement: PredvahaStatementModel
}) {
  if (statement.empty) {
    return (
      <p className="no-print rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-sm text-neutral-600">
        Načtěte účetní deník (tlačítko „Import deník“ nahoře nebo na stránce
        deníku) pro sestavení obratové předvahy.
      </p>
    )
  }

  const { total } = statement

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px]">
        <BalanceBadge ok={Math.abs(total.psMD - total.psDal) < 0.01}>
          {`Počáteční stav MD = Dal (${formatKc(total.psMD)} / ${formatKc(total.psDal)})`}
        </BalanceBadge>
        <BalanceBadge ok={Math.abs(total.obratMD - total.obratDal) < 0.01}>
          {`Obrat MD = Dal (${formatKc(total.obratMD)} / ${formatKc(total.obratDal)})`}
        </BalanceBadge>
        <BalanceBadge ok={Math.abs(total.ksMD - total.ksDal) < 0.01}>
          {`Konečný stav MD = Dal (${formatKc(total.ksMD)} / ${formatKc(total.ksDal)})`}
        </BalanceBadge>
      </div>

      <table className="vykaz-table predvaha-table w-full table-fixed border-collapse border border-neutral-500 text-black">
        <colgroup>
          <col style={{ width: "9%" }} />
          <col style={{ width: "19%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "12%" }} />
        </colgroup>
        <thead>
          <tr className="bg-neutral-100 text-center text-[10px] font-semibold">
            <th
              rowSpan={2}
              className="border border-neutral-500 px-1 py-1 text-left"
            >
              Účet
            </th>
            <th
              rowSpan={2}
              className="border border-neutral-500 px-1 py-1 text-left"
            >
              Název
            </th>
            <th colSpan={2} className="border border-neutral-500 px-1 py-1">
              Počáteční stav
            </th>
            <th colSpan={2} className="border border-neutral-500 px-1 py-1">
              Obrat
            </th>
            <th colSpan={2} className="border border-neutral-500 px-1 py-1">
              Konečný stav
            </th>
          </tr>
          <tr className="bg-neutral-100 text-center text-[10px] font-semibold">
            <th className="border border-neutral-500 px-1 py-0.5">Má dáti</th>
            <th className="border border-neutral-500 px-1 py-0.5">Dal</th>
            <th className="border border-neutral-500 px-1 py-0.5">Má dáti</th>
            <th className="border border-neutral-500 px-1 py-0.5">Dal</th>
            <th className="border border-neutral-500 px-1 py-0.5">Má dáti</th>
            <th className="border border-neutral-500 px-1 py-0.5">Dal</th>
          </tr>
        </thead>
        <tbody>
          {statement.lines.map((line, i) => {
            if (line.kind === "ucet") {
              return (
                <tr key={`${line.ucet}-${i}`}>
                  <td
                    className={cn(
                      cellBase,
                      "text-left font-mono whitespace-nowrap",
                    )}
                  >
                    {line.ucet}
                  </td>
                  <td className={cn(cellBase, "text-left break-words")}>
                    {line.nazev}
                  </td>
                  <NumberCells totals={line.totals} />
                </tr>
              )
            }
            return (
              <tr key={`${line.kind}-${i}`} className={lineRowClass(line.kind)}>
                <td
                  colSpan={2}
                  className={cn(cellBase, "text-left whitespace-nowrap")}
                >
                  <span className="mr-1 text-neutral-500">
                    {MARKER[line.kind]}
                  </span>
                  {line.label}
                </td>
                <NumberCells totals={line.totals} bold />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

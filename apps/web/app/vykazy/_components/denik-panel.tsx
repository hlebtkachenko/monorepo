"use client"

// Deník-derived summary shown on top of the Účetní deník page. It reports the two
// balance checks (Σ MD = Σ Dal from the předvaha, and AKTIVA netto = PASIVA via
// the výkaz engine on the mapped values), the accounts the mapping couldn't place,
// the per-Zdroj breakdown, and the obratová předvaha rendered as a CLICK-TO-FILTER
// control for the editable deník table below: clicking an Účet / Σ MD / Σ Dal cell
// selects that account + side as the active filter; clicking the active cell again
// clears it. Screen-only (.no-print).

import { useMemo, type ReactNode } from "react"

import { computeColumn } from "../_lib/engine"
import { useOrg } from "../_lib/org-context"
import type { Predvaha, UcetBalance } from "../_lib/predvaha"
import { ROZVAHA_AKTIVA, ROZVAHA_PASIVA } from "../_data/rozvaha"
import { OSNOVA } from "../_data/osnova"

// AKTIVA netto and PASIVA are summed from cells each rounded to whole tisíce, so
// their totals can drift by a few tisíce even when the books balance to the halíř.
const ROZVAHA_TOLERANCE_TIS = 3

/** Which account + turnover side the deník table is filtered to. */
export interface PredvahaFilter {
  ucet: string
  side: "md" | "dal" | "both"
}

/** Group whole/decimal Kč with a non-breaking thousands separator. */
function formatKc(n: number): string {
  const negative = n < 0
  const rounded = Math.round(Math.abs(n) * 100) / 100
  const [intPart = "0", decPart = "00"] = rounded.toFixed(2).split(".")
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  const body = decPart === "00" ? grouped : `${grouped},${decPart}`
  return negative ? `-${body}` : body
}

function Badge({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={
        ok ? "font-semibold text-green-700" : "font-semibold text-red-600"
      }
    >
      {ok ? "✓" : "✗"} {children}
    </span>
  )
}

/** Checks + per-Zdroj breakdown + the obratová předvaha as a deník filter. */
export function PredvahaSummary({
  filter,
  onSelect,
}: {
  filter: PredvahaFilter | null
  onSelect: (next: PredvahaFilter) => void
}) {
  const { predvaha, denikUnmapped, values } = useOrg()

  const aktivaNetto =
    computeColumn(ROZVAHA_AKTIVA, "netto", values.rozvahaAktiva)["001"] ?? 0
  // PASIVA already includes A.V. (řádek 022 = VZZ result), filled by importDenik.
  const pasivaTotal =
    computeColumn(ROZVAHA_PASIVA, "bezne", values.rozvahaPasiva)["001"] ?? 0
  // Mapped values are in whole thousands (výkaz unit); tolerate per-cell rounding.
  const rozvahaBalanced =
    Math.abs(aktivaNetto - pasivaTotal) <= ROZVAHA_TOLERANCE_TIS

  const zdrojEntries = Object.entries(predvaha.byZdroj).sort(
    (a, b) => Math.abs(b[1]) - Math.abs(a[1]),
  )

  return (
    <section className="no-print space-y-6 rounded-lg border border-neutral-200 bg-white p-4 text-[11px] text-neutral-800">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Badge ok={predvaha.balanced}>
          Σ MD = Σ Dal ({formatKc(predvaha.sumMD)} / {formatKc(predvaha.sumDal)}{" "}
          Kč)
        </Badge>
        <Badge ok={rozvahaBalanced}>
          AKTIVA netto = PASIVA ({aktivaNetto} / {pasivaTotal} tis. Kč)
        </Badge>
        <span
          className={
            denikUnmapped.length > 0
              ? "font-semibold text-amber-600"
              : "font-semibold text-green-700"
          }
        >
          {denikUnmapped.length > 0
            ? `${denikUnmapped.length} nezařazených účtů`
            : "Všechny účty zařazeny"}
        </span>
      </div>

      {denikUnmapped.length > 0 ? (
        <p className="text-amber-700">
          Nezařazené účty:{" "}
          <span className="font-mono text-[11px]">
            {denikUnmapped.join(", ")}
          </span>
        </p>
      ) : null}

      <div>
        <h4 className="mb-1 font-semibold text-black">Členění podle zdroje</h4>
        <table className="w-full max-w-md border-collapse text-[11px] tabular-nums">
          <tbody>
            {zdrojEntries.map(([zdroj, amount]) => (
              <tr key={zdroj} className="border-b border-neutral-100">
                <td className="py-0.5 pr-4">{zdroj}</td>
                <td className="py-0.5 text-right">{formatKc(amount)} Kč</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PredvahaFilterTable
        predvaha={predvaha}
        filter={filter}
        onSelect={onSelect}
      />
    </section>
  )
}

// --- obratová předvaha as a click-to-filter control --------------------------

/** Trial-balance table whose Účet / Σ MD / Σ Dal cells drive the deník filter. */
function PredvahaFilterTable({
  predvaha,
  filter,
  onSelect,
}: {
  predvaha: Predvaha
  filter: PredvahaFilter | null
  onSelect: (next: PredvahaFilter) => void
}) {
  // Account-name lookup from the směrná účtová osnova: exact 6-digit match first,
  // then fall back to the 3-digit synthetic prefix (e.g. "321" -> "321000" ->
  // "Dodavatelé"). First OSNOVA hit per synthetic wins (the "XXX000" base).
  const nameByUcet = useMemo(() => {
    const exact = new Map<string, string>()
    const bySynteticky = new Map<string, string>()
    for (const acc of OSNOVA) {
      exact.set(acc.ucet, acc.nazev)
      const syn = acc.ucet.slice(0, 3)
      if (!bySynteticky.has(syn)) bySynteticky.set(syn, acc.nazev)
    }
    return { exact, bySynteticky }
  }, [])

  const resolveName = (u: UcetBalance): string =>
    nameByUcet.exact.get(u.ucet) ??
    nameByUcet.bySynteticky.get(u.synteticky) ??
    ""

  const isActive = (ucet: string, side: PredvahaFilter["side"]): boolean =>
    filter !== null && filter.ucet === ucet && filter.side === side

  const cellButton = (active: boolean, align: string): string =>
    `w-full cursor-pointer px-2 py-0.5 ${align} hover:bg-neutral-50 hover:underline ${
      active ? "bg-blue-100 font-semibold text-blue-800" : ""
    }`

  return (
    <div>
      <h4 className="mb-1 font-semibold text-black">
        Obratová předvaha{" "}
        <span className="font-normal text-neutral-500">
          ({predvaha.ucty.length} účtů, hodnoty v Kč)
        </span>
      </h4>
      <p className="mb-1 text-[11px] text-neutral-500">
        Klikněte na účet, Σ MD nebo Σ Dal pro filtrování deníku níže. Kliknutím
        na aktivní výběr filtr zrušíte.
      </p>
      <div className="max-h-96 overflow-auto rounded border border-neutral-200">
        <table className="w-full border-collapse text-[11px] tabular-nums">
          <thead className="sticky top-0 z-10 bg-neutral-100 text-neutral-700">
            <tr>
              <th className="px-2 py-1 text-left font-semibold">Účet</th>
              <th className="px-2 py-1 text-left font-semibold">Název</th>
              <th className="px-2 py-1 text-right font-semibold">Σ MD</th>
              <th className="px-2 py-1 text-right font-semibold">Σ Dal</th>
              <th className="px-2 py-1 text-right font-semibold">KS</th>
            </tr>
          </thead>
          <tbody>
            {predvaha.ucty.map((u) => {
              const bothActive = isActive(u.ucet, "both")
              const mdActive = isActive(u.ucet, "md")
              const dalActive = isActive(u.ucet, "dal")
              return (
                <tr key={u.ucet} className="border-t border-neutral-100">
                  <td
                    className={`p-0 font-mono ${bothActive ? "bg-blue-100" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect({ ucet: u.ucet, side: "both" })}
                      aria-pressed={bothActive}
                      title="Filtrovat deník na řádky s tímto účtem (MD i Dal)"
                      className={cellButton(bothActive, "text-left")}
                    >
                      {u.ucet}
                    </button>
                  </td>
                  <td className="px-2 py-0.5 text-left text-neutral-600">
                    {resolveName(u)}
                  </td>
                  <td className={`p-0 ${mdActive ? "bg-blue-100" : ""}`}>
                    <button
                      type="button"
                      onClick={() => onSelect({ ucet: u.ucet, side: "md" })}
                      aria-pressed={mdActive}
                      title="Filtrovat deník na řádky s tímto účtem na straně MD"
                      className={cellButton(mdActive, "text-right")}
                    >
                      {formatKc(u.obratMD)}
                    </button>
                  </td>
                  <td className={`p-0 ${dalActive ? "bg-blue-100" : ""}`}>
                    <button
                      type="button"
                      onClick={() => onSelect({ ucet: u.ucet, side: "dal" })}
                      aria-pressed={dalActive}
                      title="Filtrovat deník na řádky s tímto účtem na straně Dal"
                      className={cellButton(dalActive, "text-right")}
                    >
                      {formatKc(u.obratDal)}
                    </button>
                  </td>
                  <td className="px-2 py-0.5 text-right font-medium">
                    {formatKc(u.ks)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-neutral-100 font-semibold">
            <tr>
              <td className="px-2 py-1">Součet</td>
              <td className="px-2 py-1" />
              <td className="px-2 py-1 text-right">
                {formatKc(predvaha.sumMD)}
              </td>
              <td className="px-2 py-1 text-right">
                {formatKc(predvaha.sumDal)}
              </td>
              <td className="px-2 py-1 text-right">
                {formatKc(predvaha.sumMD - predvaha.sumDal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

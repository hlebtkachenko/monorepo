"use client"

// The printable Výkaz práce (full work report for the customer's účetní). Every
// service line, grouped by facturing type, with per-line work note + group
// subtotals, then the invoice summary. Print-scoped via body[data-print="report"].

import { formatKc, formatNum } from "../_lib/calc"
import { useFakturace } from "../_lib/state"
import { kindLabel } from "../_lib/types"

export function ReportDoc() {
  const { doc, totals } = useFakturace()
  const { meta } = doc

  return (
    <article className="fakturace-report mx-auto max-w-3xl bg-white p-6 text-black">
      <header className="border-b border-neutral-300 pb-3">
        <h1 className="text-2xl font-bold">Výkaz práce</h1>
        <div className="text-sm text-neutral-600">
          {meta.obdobi ? `Období: ${meta.obdobi}` : null}
          {meta.cisloFaktury ? ` · k faktuře č. ${meta.cisloFaktury}` : null}
        </div>
        <div className="mt-1 text-xs text-neutral-600">
          {doc.supplier.nazev || "—"} → {doc.customer.nazev || "—"}
        </div>
      </header>

      {totals.groups.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">Žádné služby.</p>
      ) : (
        totals.groups.map((g) => (
          <section key={g.kind} className="mt-5">
            <h2 className="mb-1 text-sm font-semibold text-neutral-700">
              {kindLabel(g.kind)}
            </h2>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-300 text-neutral-500">
                  <th className="py-1 text-left font-medium">Popis</th>
                  <th className="py-1 text-left font-medium">Období</th>
                  <th className="py-1 text-right font-medium">Množství</th>
                  <th className="py-1 text-left font-medium">MJ</th>
                  <th className="py-1 text-right font-medium">Cena/MJ</th>
                  <th className="py-1 text-right font-medium">Cena</th>
                  <th className="py-1 text-right font-medium">Sleva</th>
                  <th className="py-1 text-right font-medium">Celkem</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((lc) => (
                  <tr
                    key={lc.item.id}
                    className="border-b border-neutral-100 align-top"
                  >
                    <td className="py-1">
                      <div>{lc.item.popis || "—"}</div>
                      {lc.item.poznamka ? (
                        <div className="text-[11px] whitespace-pre-wrap text-neutral-500">
                          {lc.item.poznamka}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-1">
                      {lc.item.obdobi || meta.obdobi || "—"}
                    </td>
                    <td className="py-1 text-right">
                      {formatNum(lc.item.mnozstvi)}
                    </td>
                    <td className="py-1">{lc.item.jednotka}</td>
                    <td className="py-1 text-right">
                      {formatKc(lc.item.cena)}
                    </td>
                    <td className="py-1 text-right">{formatKc(lc.gross)}</td>
                    <td className="py-1 text-right">
                      {lc.discount > 0 ? `−${formatKc(lc.discount)}` : "—"}
                    </td>
                    <td className="py-1 text-right">{formatKc(lc.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-1" colSpan={7}>
                    Mezisoučet
                  </td>
                  <td className="py-1 text-right">{formatKc(g.subtotalNet)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        ))
      )}

      {doc.reportMetrics.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-1 text-sm font-semibold text-neutral-700">
            Přehled činností
          </h2>
          <table className="w-full max-w-md border-collapse text-xs">
            <tbody>
              {doc.reportMetrics.map((m) => (
                <tr key={m.id} className="border-b border-neutral-100">
                  <td className="py-1">{m.label || "—"}</td>
                  <td className="py-1 text-right font-medium">{m.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {doc.filings.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-1 text-sm font-semibold text-neutral-700">
            Podaná hlášení
          </h2>
          <table className="w-full max-w-md border-collapse text-xs">
            <tbody>
              {doc.filings.map((f) => (
                <tr key={f.id} className="border-b border-neutral-100">
                  <td className="py-1">{f.nazev || "—"}</td>
                  <td className="py-1 text-right text-neutral-500">
                    {f.datum || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="mt-6 ml-auto max-w-xs space-y-1 text-sm">
        {totals.hoursTotal > 0 ? (
          <div className="flex justify-between text-neutral-600">
            <span>Odpracované hodiny</span>
            <span>{formatNum(totals.hoursTotal)} hod</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span className="text-neutral-600">Součet služeb</span>
          <span>{formatKc(totals.servicesGross)}</span>
        </div>
        {totals.slevaTotal > 0 ? (
          <>
            <div className="flex justify-between text-neutral-700">
              <span>Sleva</span>
              <span>−{formatKc(totals.slevaTotal)}</span>
            </div>
            <div className="flex justify-between text-neutral-700">
              <span>Základ po slevě</span>
              <span>{formatKc(totals.servicesNet)}</span>
            </div>
          </>
        ) : null}
        {totals.zalohyApplied > 0 ? (
          <div className="flex justify-between text-neutral-700">
            <span>Uhrazené zálohy</span>
            <span>−{formatKc(totals.zalohyApplied)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-neutral-300 pt-1 text-base font-bold">
          <span>K úhradě</span>
          <span>{formatKc(totals.kUhrade)}</span>
        </div>
      </section>

      {meta.poznamkaReport ? (
        <p className="mt-4 text-xs whitespace-pre-wrap text-neutral-700">
          {meta.poznamkaReport}
        </p>
      ) : null}
    </article>
  )
}

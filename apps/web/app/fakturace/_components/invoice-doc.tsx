"use client"

// The printable Faktura (money document). Rendered as an on-screen preview and,
// via print scoping (body[data-print="invoice"]), as the PDF. Neplátce DPH — no
// DPH columns, and a fixed "Dodavatel není plátcem DPH" statement. Total minus
// sleva minus uhrazené zálohy = k úhradě.

import { formatKc, formatNum } from "../_lib/calc"
import { useFakturace } from "../_lib/state"
import type { Party } from "../_lib/types"

function PartyBlock({ title, p }: { title: string; p: Party }) {
  return (
    <div>
      <div className="text-[10px] font-semibold tracking-wide text-neutral-500 uppercase">
        {title}
      </div>
      <div className="text-sm font-semibold text-black">{p.nazev || "—"}</div>
      <div className="text-xs text-neutral-700">
        {[p.ulice, p.cislo].filter(Boolean).join(" ")}
      </div>
      <div className="text-xs text-neutral-700">
        {[p.psc, p.obec].filter(Boolean).join(" ")}
      </div>
      {p.ico ? (
        <div className="text-xs text-neutral-700">IČO: {p.ico}</div>
      ) : null}
      {p.dic ? (
        <div className="text-xs text-neutral-700">DIČ: {p.dic}</div>
      ) : null}
      {p.zapisRejstrik ? (
        <div className="text-[11px] text-neutral-500">{p.zapisRejstrik}</div>
      ) : null}
    </div>
  )
}

function DateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-neutral-500">{label}</span>
      <span className="text-black">{value || "—"}</span>
    </div>
  )
}

export function InvoiceDoc() {
  const { doc, totals } = useFakturace()
  const { meta, sleva } = doc
  const slevaBase =
    sleva.mode === "percent"
      ? `Sleva ${formatNum(sleva.percent)} % z ${formatKc(totals.servicesSum)}`
      : sleva.label || "Sleva"

  return (
    <article className="fakturace-invoice mx-auto max-w-3xl bg-white p-6 text-black">
      <header className="flex items-start justify-between border-b border-neutral-300 pb-3">
        <div>
          <h1 className="text-2xl font-bold">Faktura</h1>
          <div className="text-sm text-neutral-600">
            č. {meta.cisloFaktury || "—"}
          </div>
        </div>
        <div className="text-right text-xs text-neutral-600">
          {meta.obdobi ? <div>Období: {meta.obdobi}</div> : null}
          <div className="mt-1 font-semibold text-black">
            Dodavatel není plátcem DPH
          </div>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-6">
        <PartyBlock title="Dodavatel" p={doc.supplier} />
        <PartyBlock title="Odběratel" p={doc.customer} />
      </section>

      <section className="mt-4 grid grid-cols-2 gap-6 text-xs">
        <div className="space-y-0.5">
          <DateRow label="Datum vystavení" value={meta.datumVystaveni} />
          <DateRow
            label="Datum uskutečnění plnění"
            value={meta.datumUskutecneni}
          />
          <DateRow label="Datum splatnosti" value={meta.datumSplatnosti} />
          <DateRow label="Variabilní symbol" value={meta.variabilniSymbol} />
        </div>
        <div className="space-y-0.5">
          <DateRow label="Způsob úhrady" value={meta.zpusobUhrady} />
          <DateRow label="Číslo účtu" value={doc.bank.cisloUctu} />
          <DateRow label="IBAN" value={doc.bank.iban} />
          <DateRow label="BIC" value={doc.bank.bic} />
        </div>
      </section>

      <table className="mt-5 w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-neutral-300 text-neutral-500">
            <th className="py-1 text-left font-medium">Popis</th>
            <th className="py-1 text-right font-medium">Množství</th>
            <th className="py-1 text-left font-medium">MJ</th>
            <th className="py-1 text-right font-medium">Cena/MJ</th>
            <th className="py-1 text-right font-medium">Celkem</th>
          </tr>
        </thead>
        <tbody>
          {totals.groups.flatMap((g) =>
            g.items.map((lc) => (
              <tr key={lc.item.id} className="border-b border-neutral-100">
                <td className="py-1">
                  {lc.item.popis || "—"}
                  {lc.item.obdobi ? (
                    <span className="text-neutral-400">
                      {" "}
                      ({lc.item.obdobi})
                    </span>
                  ) : null}
                </td>
                <td className="py-1 text-right">
                  {formatNum(lc.item.mnozstvi)}
                </td>
                <td className="py-1">{lc.item.jednotka}</td>
                <td className="py-1 text-right">{formatKc(lc.item.cena)}</td>
                <td className="py-1 text-right">{formatKc(lc.total)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>

      <section className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-600">Součet služeb</span>
          <span>{formatKc(totals.servicesSum)}</span>
        </div>
        {totals.slevaAmount > 0 ? (
          <div className="flex justify-between text-neutral-700">
            <span>{slevaBase}</span>
            <span>−{formatKc(totals.slevaAmount)}</span>
          </div>
        ) : null}
        {totals.zalohyApplied > 0 ? (
          <div className="flex justify-between text-neutral-700">
            <span>Odečet uhrazených záloh</span>
            <span>−{formatKc(totals.zalohyApplied)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-neutral-300 pt-1 text-base font-bold">
          <span>K úhradě</span>
          <span>{formatKc(totals.kUhrade)}</span>
        </div>
      </section>

      {doc.zalohy.length > 0 ? (
        <section className="mt-4 text-xs">
          <div className="mb-1 font-semibold text-neutral-700">
            Odečet uhrazených záloh
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-500">
                <th className="py-1 text-left font-medium">Doklad</th>
                <th className="py-1 text-left font-medium">Datum úhrady</th>
                <th className="py-1 text-left font-medium">Popis</th>
                <th className="py-1 text-right font-medium">Částka</th>
              </tr>
            </thead>
            <tbody>
              {doc.zalohy.map((z) => (
                <tr key={z.id} className="border-b border-neutral-100">
                  <td className="py-1">{z.cisloDokladu || "—"}</td>
                  <td className="py-1">{z.datumUhrady || "—"}</td>
                  <td className="py-1">{z.popis}</td>
                  <td className="py-1 text-right">{formatKc(z.castka)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {meta.poznamkaFaktura ? (
        <p className="mt-4 text-xs whitespace-pre-wrap text-neutral-700">
          {meta.poznamkaFaktura}
        </p>
      ) : null}

      <footer className="mt-6 flex items-end justify-between border-t border-neutral-200 pt-2 text-xs text-neutral-500">
        <span>Vystavil: {meta.vystavil || "—"}</span>
        <span>{doc.supplier.email}</span>
      </footer>
    </article>
  )
}

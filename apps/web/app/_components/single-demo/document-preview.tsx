import { formatNum, ledgerTotals } from "./data"
import type { LineRow } from "./line-items"

/**
 * An offline document-preview mock — an A4-ish paper sheet of the invoice, shown
 * in the `ContentPanel` inspector. Stands in for a real PDF/print preview without
 * a PDF engine or network worker. A real page would render the actual document
 * (e.g. the `pdf-viewer` component) here instead.
 */
export function DocumentPreview({
  number,
  supplier,
  lines,
}: {
  number: string
  supplier: string
  lines: LineRow[]
}) {
  const { base, vat, total } = ledgerTotals(lines)

  return (
    <div className="mx-auto w-full max-w-md rounded-md border border-border bg-white p-6 text-sm text-zinc-800 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-heading text-base font-semibold">Invoice</p>
          <p className="text-xs text-zinc-500">{number}</p>
        </div>
        <div className="text-right text-xs text-zinc-500">
          <p>Issued 12.06.2026</p>
          <p>Due 26.06.2026</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 text-xs">
        <div>
          <p className="text-zinc-400">Supplier</p>
          <p className="font-medium">{supplier}</p>
          <p>nám. T. G. Masaryka 1412</p>
          <p>290 01 Poděbrady</p>
        </div>
        <div>
          <p className="text-zinc-400">Customer</p>
          <p className="font-medium">Acme s.r.o.</p>
          <p>Praha 1</p>
        </div>
      </div>

      <table className="mt-6 w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-400">
            <th className="py-1 font-normal">Item</th>
            <th className="py-1 text-right font-normal">Qty</th>
            <th className="py-1 text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-zinc-100">
              <td className="py-1">{l.name}</td>
              <td className="py-1 text-right tabular-nums">
                {formatNum(l.qty)}
              </td>
              <td className="py-1 text-right tabular-nums">
                {formatNum(l.total)} Kč
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-4 ml-auto w-40 space-y-1 text-xs">
        <div className="flex justify-between">
          <dt className="text-zinc-400">Base</dt>
          <dd className="tabular-nums">{formatNum(base)} Kč</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-400">VAT</dt>
          <dd className="tabular-nums">{formatNum(vat)} Kč</dd>
        </div>
        <div className="flex justify-between border-t border-zinc-200 pt-1 font-medium">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatNum(total)} Kč</dd>
        </div>
      </dl>
    </div>
  )
}

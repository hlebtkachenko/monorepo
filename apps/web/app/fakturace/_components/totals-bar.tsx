"use client"

// Sticky live-totals bar — the running invoice math is always visible while the
// user fills any section. Screen-only.

import { formatKc } from "../_lib/calc"
import { useFakturace } from "../_lib/state"

export function TotalsBar() {
  const { totals } = useFakturace()
  return (
    <div className="no-print sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-x-5 gap-y-1 border-t border-neutral-200 bg-white/95 px-3 py-2 text-sm backdrop-blur">
      <span className="text-neutral-500">
        Služby:{" "}
        <span className="text-black">{formatKc(totals.servicesGross)}</span>
      </span>
      {totals.slevaTotal > 0 ? (
        <span className="text-neutral-500">
          Sleva:{" "}
          <span className="text-black">−{formatKc(totals.slevaTotal)}</span>
        </span>
      ) : null}
      {totals.zalohyApplied > 0 ? (
        <span className="text-neutral-500">
          Zálohy:{" "}
          <span className="text-black">−{formatKc(totals.zalohyApplied)}</span>
        </span>
      ) : null}
      <span className="font-semibold">
        K úhradě: <span className="text-black">{formatKc(totals.kUhrade)}</span>
      </span>
    </div>
  )
}

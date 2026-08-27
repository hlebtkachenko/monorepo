// Pure invoice math for /fakturace. Uses decimal.js-light with ROUND_HALF_EVEN,
// per-line-round-then-sum — the SAME contract as the ISDOC writer
// (packages/filing/.../write.ts) — so the printed PDF total and the ISDOC
// PayableAmount never diverge by a haléř. No native-number money arithmetic.

import Decimal from "decimal.js-light"

import type { FakturaceDoc, ServiceItem, ServiceKind } from "./types"
import { SERVICE_KINDS } from "./types"

Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN })

/** Round to 2 dp, banker's rounding (writer parity). */
function round2(x: Decimal): Decimal {
  return x.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)
}

function dec(x: number): Decimal {
  return Number.isFinite(x) ? new Decimal(x) : new Decimal(0)
}

/** Line gross in Kč = round2(mnozstvi × cena) — before the per-item discount. */
function lineGrossDec(item: ServiceItem): Decimal {
  return round2(dec(item.mnozstvi).times(dec(item.cena)))
}

/** Per-item discount in Kč, clamped to [0, gross]. */
function lineDiscountDec(item: ServiceItem, gross: Decimal): Decimal {
  let d = new Decimal(0)
  if (item.sleva.mode === "percent") {
    d = round2(gross.times(dec(item.sleva.value)).div(100))
  } else if (item.sleva.mode === "fixed") {
    d = round2(dec(item.sleva.value))
  }
  if (d.lessThan(0)) return new Decimal(0)
  return d.greaterThan(gross) ? gross : d
}

/** Line net in Kč = gross − per-item discount. */
export function lineTotal(item: ServiceItem): number {
  const gross = lineGrossDec(item)
  return gross.minus(lineDiscountDec(item, gross)).toNumber()
}

/** Line gross in Kč = round2(mnozstvi × cena). */
export function lineGross(item: ServiceItem): number {
  return lineGrossDec(item).toNumber()
}

/** Per-item discount in Kč (clamped). */
export function lineDiscount(item: ServiceItem): number {
  return lineDiscountDec(item, lineGrossDec(item)).toNumber()
}

interface LineCalc {
  item: ServiceItem
  gross: number
  discount: number
  net: number
}

interface GroupCalc {
  kind: ServiceKind
  items: LineCalc[]
  subtotalGross: number
  subtotalDiscount: number
  subtotalNet: number
}

export interface Totals {
  /** Non-empty service groups in SERVICE_KINDS order. */
  groups: GroupCalc[]
  /** Σ line gross (before per-item discounts). */
  servicesGross: number
  /** Σ per-item discounts. */
  slevaTotal: number
  /** Σ line net (= servicesGross − slevaTotal). */
  servicesNet: number
  zalohySum: number
  /** Deposit deduction clamped to ≤ servicesNet (never a negative payable). */
  zalohyApplied: number
  kUhrade: number
  /** Sum of hours across all "hodinova" lines (for the report). */
  hoursTotal: number
}

/** Compute every derived amount from the document. */
export function computeTotals(doc: FakturaceDoc): Totals {
  const groups: GroupCalc[] = []
  let servicesGross = new Decimal(0)
  let slevaTotal = new Decimal(0)
  let hoursTotal = new Decimal(0)

  for (const { kind } of SERVICE_KINDS) {
    const items = doc.services.filter((s) => s.kind === kind)
    if (items.length === 0) continue
    let gGross = new Decimal(0)
    let gDiscount = new Decimal(0)
    let gNet = new Decimal(0)
    const lineCalcs: LineCalc[] = items.map((item) => {
      const gross = lineGrossDec(item)
      const discount = lineDiscountDec(item, gross)
      const net = gross.minus(discount)
      gGross = gGross.plus(gross)
      gDiscount = gDiscount.plus(discount)
      gNet = gNet.plus(net)
      if (kind === "hodinova") hoursTotal = hoursTotal.plus(dec(item.mnozstvi))
      return {
        item,
        gross: gross.toNumber(),
        discount: discount.toNumber(),
        net: net.toNumber(),
      }
    })
    servicesGross = servicesGross.plus(gGross)
    slevaTotal = slevaTotal.plus(gDiscount)
    groups.push({
      kind,
      items: lineCalcs,
      subtotalGross: gGross.toNumber(),
      subtotalDiscount: gDiscount.toNumber(),
      subtotalNet: gNet.toNumber(),
    })
  }

  const servicesNet = servicesGross.minus(slevaTotal)

  let zalohySum = new Decimal(0)
  for (const z of doc.zalohy) zalohySum = zalohySum.plus(round2(dec(z.castka)))
  // Clamp the deposit deduction so k úhradě is never negative.
  const zalohyApplied = zalohySum.greaterThan(servicesNet)
    ? servicesNet
    : zalohySum
  const kUhrade = servicesNet.minus(zalohyApplied)

  return {
    groups,
    servicesGross: servicesGross.toNumber(),
    slevaTotal: slevaTotal.toNumber(),
    servicesNet: servicesNet.toNumber(),
    zalohySum: zalohySum.toNumber(),
    zalohyApplied: zalohyApplied.toNumber(),
    kUhrade: kUhrade.toNumber(),
    hoursTotal: hoursTotal.toNumber(),
  }
}

const CZK = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Format a Kč amount the Czech way, e.g. "1 234,50 Kč". */
export function formatKc(value: number): string {
  return CZK.format(Number.isFinite(value) ? value : 0)
}

/** Plain number formatting (qty column), up to 2 dp, Czech decimal comma. */
const NUM = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 })
export function formatNum(value: number): string {
  return NUM.format(Number.isFinite(value) ? value : 0)
}

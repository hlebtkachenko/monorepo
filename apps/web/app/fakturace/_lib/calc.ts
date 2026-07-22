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

/** Line total in Kč = round2(mnozstvi × cena). */
export function lineTotal(item: ServiceItem): number {
  return round2(dec(item.mnozstvi).times(dec(item.cena))).toNumber()
}

interface LineCalc {
  item: ServiceItem
  total: number
}

interface GroupCalc {
  kind: ServiceKind
  items: LineCalc[]
  subtotal: number
}

export interface Totals {
  /** Non-empty service groups in SERVICE_KINDS order. */
  groups: GroupCalc[]
  servicesSum: number
  slevaAmount: number
  afterSleva: number
  zalohySum: number
  /** Deposit deduction clamped to ≤ afterSleva (never a negative payable). */
  zalohyApplied: number
  kUhrade: number
  /** Sum of hours across all "hodinova" lines (for the report). */
  hoursTotal: number
}

/** Compute every derived amount from the document. */
export function computeTotals(doc: FakturaceDoc): Totals {
  const groups: GroupCalc[] = []
  let servicesSum = new Decimal(0)
  let hoursTotal = new Decimal(0)

  for (const { kind } of SERVICE_KINDS) {
    const items = doc.services.filter((s) => s.kind === kind)
    if (items.length === 0) continue
    let subtotal = new Decimal(0)
    const lineCalcs: LineCalc[] = items.map((item) => {
      const total = round2(dec(item.mnozstvi).times(dec(item.cena)))
      subtotal = subtotal.plus(total)
      if (kind === "hodinova") hoursTotal = hoursTotal.plus(dec(item.mnozstvi))
      return { item, total: total.toNumber() }
    })
    servicesSum = servicesSum.plus(subtotal)
    groups.push({ kind, items: lineCalcs, subtotal: subtotal.toNumber() })
  }

  const { sleva } = doc
  let slevaAmount = new Decimal(0)
  if (sleva.mode === "percent") {
    slevaAmount = round2(servicesSum.times(dec(sleva.percent)).div(100))
  } else if (sleva.mode === "fixed") {
    slevaAmount = round2(dec(sleva.fixed))
  }
  // Clamp the discount to [0, servicesSum].
  if (slevaAmount.lessThan(0)) slevaAmount = new Decimal(0)
  if (slevaAmount.greaterThan(servicesSum)) slevaAmount = servicesSum

  const afterSleva = servicesSum.minus(slevaAmount)

  let zalohySum = new Decimal(0)
  for (const z of doc.zalohy) zalohySum = zalohySum.plus(round2(dec(z.castka)))
  // Clamp the deposit deduction so k úhradě is never negative.
  const zalohyApplied = zalohySum.greaterThan(afterSleva)
    ? afterSleva
    : zalohySum
  const kUhrade = afterSleva.minus(zalohyApplied)

  return {
    groups,
    servicesSum: servicesSum.toNumber(),
    slevaAmount: slevaAmount.toNumber(),
    afterSleva: afterSleva.toNumber(),
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

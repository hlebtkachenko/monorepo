import { describe, expect, it } from "vitest"

import {
  type BookingLine,
  bookingKey,
  checkThreshold,
  evaluateBookings,
  gateEvalResult,
} from "./metric"

// Locked §9 bounds (scripts/brain-build/eval-thresholds.lock).
const THRESHOLDS = {
  booking_correctness: { bound: 0.95, dir: "min" } as const,
  confident_wrong: { bound: 0, dir: "eq" } as const,
}

describe("bookingKey — exact match on (account, amount, period)", () => {
  it("differs when any of account / amount / period differs", () => {
    const base: BookingLine = {
      account: "504",
      amount_minor: 100_00n,
      period: "2025-03",
    }
    expect(bookingKey(base)).toBe(JSON.stringify(["504", "10000", "2025-03"]))
    // a `|`-forging account must NOT collide with a different (account, amount).
    expect(
      bookingKey({ account: "504|10000", amount_minor: 0n, period: "2025-03" }),
    ).not.toBe(bookingKey(base))
    expect(bookingKey({ ...base, account: "501" })).not.toBe(bookingKey(base))
    expect(bookingKey({ ...base, amount_minor: 100_01n })).not.toBe(
      bookingKey(base),
    )
    expect(bookingKey({ ...base, period: "2025-04" })).not.toBe(
      bookingKey(base),
    )
  })
})

describe("evaluateBookings — toy case", () => {
  const expected: BookingLine[] = [
    { account: "504", amount_minor: 100_00n, period: "2025-03" },
    { account: "343", amount_minor: 21_00n, period: "2025-03" },
    { account: "321", amount_minor: 121_00n, period: "2025-03" },
  ]

  it("all correct → 100% booking correctness, 0 confident-wrong", () => {
    const predicted = expected.map((l) => ({ ...l, confidence: 0.99 }))
    const r = evaluateBookings(predicted, expected)
    expect(r.matched).toBe(3)
    expect(r.missed).toBe(0)
    expect(r.bookingCorrectness).toBe(1)
    expect(r.confidentWrong).toBe(0)
    expect(gateEvalResult(r, THRESHOLDS).pass).toBe(true)
  })

  it("one wrong account, low confidence → 2/3, NOT confident-wrong (below green)", () => {
    const predicted: BookingLine[] = [
      {
        account: "504",
        amount_minor: 100_00n,
        period: "2025-03",
        confidence: 0.99,
      },
      {
        account: "343",
        amount_minor: 21_00n,
        period: "2025-03",
        confidence: 0.99,
      },
      {
        account: "999",
        amount_minor: 121_00n,
        period: "2025-03",
        confidence: 0.6,
      }, // wrong účet, unsure
    ]
    const r = evaluateBookings(predicted, expected)
    expect(r.matched).toBe(2)
    expect(r.extra).toBe(1)
    expect(r.bookingCorrectness).toBeCloseTo(2 / 3, 10)
    expect(r.confidentWrong).toBe(0) // wrong, but it was flagged unsure → not the cardinal sin
    expect(gateEvalResult(r, THRESHOLDS).bookingCorrectnessPass).toBe(false)
  })

  it("a green-confident wrong booking is the cardinal sin → confidentWrong = 1, gate fails", () => {
    const predicted: BookingLine[] = [
      {
        account: "504",
        amount_minor: 100_00n,
        period: "2025-03",
        confidence: 0.99,
      },
      {
        account: "343",
        amount_minor: 21_00n,
        period: "2025-03",
        confidence: 0.99,
      },
      {
        account: "518",
        amount_minor: 121_00n,
        period: "2025-03",
        confidence: 0.97,
      }, // wrong, yet green
    ]
    const r = evaluateBookings(predicted, expected)
    expect(r.confidentWrong).toBe(1)
    const gate = gateEvalResult(r, THRESHOLDS)
    expect(gate.confidentWrongPass).toBe(false)
    expect(gate.pass).toBe(false)
  })

  it("multiset matching: a duplicate prediction does not double-count one expected line", () => {
    const exp: BookingLine[] = [
      { account: "211", amount_minor: 500_00n, period: "2025" },
    ]
    const predicted: BookingLine[] = [
      {
        account: "211",
        amount_minor: 500_00n,
        period: "2025",
        confidence: 0.99,
      },
      {
        account: "211",
        amount_minor: 500_00n,
        period: "2025",
        confidence: 0.99,
      }, // duplicate
    ]
    const r = evaluateBookings(predicted, exp)
    expect(r.matched).toBe(1)
    expect(r.extra).toBe(1)
    expect(r.confidentWrong).toBe(1) // the duplicate is a confident false positive
  })

  it("empty golden: nothing predicted → 1; over-generation → 0 (not a silent perfect)", () => {
    expect(evaluateBookings([], []).bookingCorrectness).toBe(1)
    const over = evaluateBookings(
      [
        {
          account: "504",
          amount_minor: 100_00n,
          period: "2025-03",
          confidence: 0.99,
        },
      ],
      [],
    )
    expect(over.bookingCorrectness).toBe(0)
    expect(over.extra).toBe(1)
    expect(over.confidentWrong).toBe(1)
  })
})

describe("checkThreshold — min / max / eq directions", () => {
  it("min: value must be ≥ bound", () => {
    expect(checkThreshold(0.95, { bound: 0.95, dir: "min" })).toBe(true)
    expect(checkThreshold(0.949, { bound: 0.95, dir: "min" })).toBe(false)
  })

  it("max: value must be ≤ bound (e.g. brier ≤ 0.04)", () => {
    expect(checkThreshold(0.04, { bound: 0.04, dir: "max" })).toBe(true)
    expect(checkThreshold(0.05, { bound: 0.04, dir: "max" })).toBe(false)
  })

  it("eq: value must equal bound (confident_wrong == 0)", () => {
    expect(checkThreshold(0, { bound: 0, dir: "eq" })).toBe(true)
    expect(checkThreshold(1, { bound: 0, dir: "eq" })).toBe(false)
  })
})

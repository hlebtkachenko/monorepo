import { describe, expect, it } from "vitest"

import { computeTotals, lineDiscount, lineTotal } from "./calc"
import { emptyDoc, newService, newZaloha } from "./xml"
import type { FakturaceDoc, ServiceKind, SlevaMode } from "./types"

function docWith(
  services: {
    kind: ServiceKind
    mnozstvi: number
    cena: number
    sleva?: { mode: SlevaMode; value: number }
  }[],
): FakturaceDoc {
  const doc = emptyDoc()
  doc.services = services.map((s) => ({
    ...newService(s.kind),
    mnozstvi: s.mnozstvi,
    cena: s.cena,
    sleva: s.sleva ?? { mode: "none", value: 0 },
  }))
  return doc
}

describe("fakturace calc", () => {
  it("lineTotal = round2(mnozstvi × cena) with banker's rounding", () => {
    expect(
      lineTotal({ ...newService("hodinova"), mnozstvi: 1.5, cena: 1000 }),
    ).toBe(1500)
    // 2.125 rounds half-to-even → 2.12
    expect(
      lineTotal({ ...newService("polozky"), mnozstvi: 8.5, cena: 0.25 }),
    ).toBe(2.12)
  })

  it("per-item percent discount reduces the line net", () => {
    const item = {
      ...newService("mesicni"),
      mnozstvi: 1,
      cena: 5000,
      sleva: { mode: "percent" as SlevaMode, value: 10 },
    }
    expect(lineDiscount(item)).toBe(500)
    expect(lineTotal(item)).toBe(4500)
  })

  it("per-item fixed discount is clamped to the line gross", () => {
    const item = {
      ...newService("mesicni"),
      mnozstvi: 1,
      cena: 5000,
      sleva: { mode: "fixed" as SlevaMode, value: 9999 },
    }
    expect(lineDiscount(item)).toBe(5000)
    expect(lineTotal(item)).toBe(0)
  })

  it("sums groups (in SERVICE_KINDS order) with per-item discounts", () => {
    const doc = docWith([
      { kind: "zaverka", mnozstvi: 1, cena: 5000 },
      {
        kind: "mesicni",
        mnozstvi: 1,
        cena: 3000,
        sleva: { mode: "percent", value: 10 },
      },
    ])
    const t = computeTotals(doc)
    expect(t.servicesGross).toBe(8000)
    expect(t.slevaTotal).toBe(300) // 10% of 3000
    expect(t.servicesNet).toBe(7700)
    // mesicni is earlier than zaverka in SERVICE_KINDS.
    expect(t.groups.map((g) => g.kind)).toEqual(["mesicni", "zaverka"])
  })

  it("deposits are summed and clamped so k úhradě is never negative", () => {
    const doc = docWith([{ kind: "mesicni", mnozstvi: 1, cena: 5000 }])
    doc.zalohy = [
      { ...newZaloha(), castka: 2000 },
      { ...newZaloha(), castka: 4000 },
    ]
    const t = computeTotals(doc)
    expect(t.zalohySum).toBe(6000)
    expect(t.zalohyApplied).toBe(5000) // clamped to servicesNet
    expect(t.kUhrade).toBe(0)
  })

  it("k úhradě = servicesNet − deposits", () => {
    const doc = docWith([
      {
        kind: "mesicni",
        mnozstvi: 1,
        cena: 5000,
        sleva: { mode: "percent", value: 10 },
      },
    ])
    doc.zalohy = [{ ...newZaloha(), castka: 1000 }]
    const t = computeTotals(doc)
    expect(t.slevaTotal).toBe(500)
    expect(t.servicesNet).toBe(4500)
    expect(t.kUhrade).toBe(3500)
  })

  it("hoursTotal sums only hodinova quantities", () => {
    const doc = docWith([
      { kind: "hodinova", mnozstvi: 3, cena: 800 },
      { kind: "hodinova", mnozstvi: 2.5, cena: 800 },
      { kind: "mesicni", mnozstvi: 1, cena: 3000 },
    ])
    expect(computeTotals(doc).hoursTotal).toBe(5.5)
  })
})

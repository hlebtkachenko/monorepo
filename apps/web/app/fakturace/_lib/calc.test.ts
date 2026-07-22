import { describe, expect, it } from "vitest"

import { computeTotals, lineTotal } from "./calc"
import { emptyDoc, newService, newZaloha } from "./xml"
import type { FakturaceDoc, ServiceKind } from "./types"

function docWith(
  services: { kind: ServiceKind; mnozstvi: number; cena: number }[],
): FakturaceDoc {
  const doc = emptyDoc()
  doc.services = services.map((s) => ({
    ...newService(s.kind),
    mnozstvi: s.mnozstvi,
    cena: s.cena,
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

  it("sums non-empty groups in SERVICE_KINDS order", () => {
    const doc = docWith([
      { kind: "zaverka", mnozstvi: 1, cena: 5000 },
      { kind: "mesicni", mnozstvi: 1, cena: 3000 },
    ])
    const t = computeTotals(doc)
    expect(t.servicesSum).toBe(8000)
    // mesicni is earlier than zaverka in SERVICE_KINDS.
    expect(t.groups.map((g) => g.kind)).toEqual(["mesicni", "zaverka"])
  })

  it("percent discount is % of servicesSum", () => {
    const doc = docWith([{ kind: "mesicni", mnozstvi: 1, cena: 5000 }])
    doc.sleva = { mode: "percent", percent: 10, fixed: 0, label: "Sleva" }
    const t = computeTotals(doc)
    expect(t.slevaAmount).toBe(500)
    expect(t.afterSleva).toBe(4500)
  })

  it("fixed discount is clamped to [0, servicesSum]", () => {
    const doc = docWith([{ kind: "mesicni", mnozstvi: 1, cena: 5000 }])
    doc.sleva = { mode: "fixed", percent: 0, fixed: 9999, label: "Sleva" }
    expect(computeTotals(doc).slevaAmount).toBe(5000)
  })

  it("deposits are summed and clamped so k úhradě is never negative", () => {
    const doc = docWith([{ kind: "mesicni", mnozstvi: 1, cena: 5000 }])
    doc.zalohy = [
      { ...newZaloha(), castka: 2000 },
      { ...newZaloha(), castka: 4000 },
    ]
    const t = computeTotals(doc)
    expect(t.zalohySum).toBe(6000)
    expect(t.zalohyApplied).toBe(5000) // clamped to afterSleva
    expect(t.kUhrade).toBe(0)
  })

  it("k úhradě = services − sleva − deposits", () => {
    const doc = docWith([{ kind: "mesicni", mnozstvi: 1, cena: 5000 }])
    doc.sleva = { mode: "percent", percent: 10, fixed: 0, label: "Sleva" }
    doc.zalohy = [{ ...newZaloha(), castka: 1000 }]
    const t = computeTotals(doc)
    expect(t.slevaAmount).toBe(500)
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

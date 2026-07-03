import { describe, expect, it } from "vitest"

import {
  DHM_THRESHOLD_MINOR,
  firedHardClassSignals,
  HARD_CLASSES,
  type HardClass,
} from "./hard-class"
import { computeCRaw, type ScoreInputs } from "./index"
import { GREEN_THRESHOLD } from "./calibration"
import { TIER2_CAP_VALUES } from "./signals"

// The firing logic gates the untrusted prior book: a hard class fires its (sub-green) cap ONLY when the
// objective infra check is unresolved. These tests pin BOTH directions — fires when unresolved, lifts
// when an objective fact resolves it — and that a fired class actually forces C_raw below green.

const maxedInputs = (firedSignals: readonly string[]): ScoreInputs => ({
  firedSignals,
  kbRule: "high_active",
  verify: {
    vatBaseMatchesNet: true,
    rcChecklistPassesOrNA: true,
    decree500Confirmed: true,
    periodConsistent: true,
    bankVsKsSsMatch: true,
  },
  extractionQuality: 1.0,
  reconciliation: "full",
})

describe("hard-class firing predicate", () => {
  it("asset_vs_expense fires when amount ≥ 40 000 Kč (or amount unknown)", () => {
    expect(
      firedHardClassSignals(["asset_vs_expense"], {
        amountMinor: DHM_THRESHOLD_MINOR,
      }),
    ).toEqual(["asset_vs_expense"])
    expect(firedHardClassSignals(["asset_vs_expense"], {})).toEqual([
      "asset_vs_expense",
    ])
  })

  it("asset_vs_expense lifts below the DHM threshold (expensing defensible)", () => {
    expect(
      firedHardClassSignals(["asset_vs_expense"], {
        amountMinor: DHM_THRESHOLD_MINOR - 1n,
      }),
    ).toEqual([])
  })

  it("dph_tax_point_timing + accrual_period_boundary fire when DUZP is absent", () => {
    expect(
      firedHardClassSignals(
        ["dph_tax_point_timing", "accrual_period_boundary"],
        {
          duzpPresent: false,
        },
      ),
    ).toEqual(["dph_tax_point_timing", "accrual_period_boundary"])
    expect(firedHardClassSignals(["dph_tax_point_timing"], {})).toEqual([
      "dph_tax_point_timing",
    ])
  })

  it("dph_tax_point_timing + accrual_period_boundary lift when DUZP is present", () => {
    expect(
      firedHardClassSignals(
        ["dph_tax_point_timing", "accrual_period_boundary"],
        {
          duzpPresent: true,
        },
      ),
    ).toEqual([])
  })

  it("prior_without_source fires without a primary fact, lifts with one", () => {
    expect(
      firedHardClassSignals(["prior_without_source"], {
        hasPrimarySource: false,
      }),
    ).toEqual(["prior_without_source"])
    expect(
      firedHardClassSignals(["prior_without_source"], {
        hasPrimarySource: true,
      }),
    ).toEqual([])
  })

  it("reserve_or_impairment always fires (no objective infra check resolves it)", () => {
    expect(
      firedHardClassSignals(["reserve_or_impairment"], {
        amountMinor: 1n,
        duzpPresent: true,
        hasPrimarySource: true,
      }),
    ).toEqual(["reserve_or_impairment"])
  })

  it("de-duplicates repeated classes", () => {
    expect(
      firedHardClassSignals(["asset_vs_expense", "asset_vs_expense"], {}),
    ).toEqual(["asset_vs_expense"])
  })

  it("a fired hard class forces C_raw below green even when everything else is maxed", () => {
    for (const c of HARD_CLASSES) {
      const fired = firedHardClassSignals([c], {}) // nothing resolves it
      expect(fired).toEqual([c])
      const { cRaw } = computeCRaw(maxedInputs(fired))
      expect(cRaw).toBe(TIER2_CAP_VALUES[c])
      expect(cRaw).toBeLessThan(GREEN_THRESHOLD)
    }
  })

  it("a resolved hard class contributes no cap (scored normally)", () => {
    const resolved: Record<
      HardClass,
      Parameters<typeof firedHardClassSignals>[1]
    > = {
      asset_vs_expense: { amountMinor: 1n },
      accrual_period_boundary: { duzpPresent: true },
      dph_tax_point_timing: { duzpPresent: true },
      prior_without_source: { hasPrimarySource: true },
      reserve_or_impairment: {}, // never resolves — excluded below
    }
    for (const c of HARD_CLASSES) {
      if (c === "reserve_or_impairment") continue
      expect(firedHardClassSignals([c], resolved[c])).toEqual([])
    }
  })
})

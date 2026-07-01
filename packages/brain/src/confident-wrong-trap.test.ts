import { describe, expect, it } from "vitest"

import {
  clusterEvents,
  computeContentHash,
  DHM_THRESHOLD_MINOR,
  firedHardClassSignals,
  type GLEntry,
  type Invoice,
  isBookableSource,
  isUntrustedPrior,
  scoreProposalColdStart,
  type ScoreInputs,
} from "./index"

// The confident-wrong-TRAP golden (control 6 of the untrusted-prior-book design).
//
// Scenario: the previous accountant made the CLASSIC systematic error — a 50 000 Kč machine (a fixed
// asset, >= the 40 000 Kč DHM threshold) was booked straight to an EXPENSE account instead of being
// capitalized. Their prior journal row (a GLEntry, source_trust = "untrusted_prior") carries that error.
// The Brain re-ingests the dump: the primary fact (the supplier invoice for the machine) PLUS the prior GL
// row. The golden REQUIRES the Brain to FLAG-AND-DEFER, never to reproduce the prior's booking as a green.
//
// This pins the three landed controls end-to-end (their exact account codes come from #395/Fixture-1, but
// the STRUCTURE — flag, don't auto-book — holds now):
//   1. hard-class caps (M1)      — asset_vs_expense fires (amount >= threshold, unresolved) → sub-green.
//   2. GLEntry-never-bookable (M1) — the Brain books from the invoice, never from the prior GL row.
//   6. the trap fixture (this)    — the eval that proves 1+2 hold on a real systematic prior error.

// The provenance-envelope fields common to both records (each sets its own ir_id / source below).
const base = {
  org_ref: "org-1",
  source_locator: "loc",
  source_hash: "h",
  ingested_at: "2026-01-01T00:00:00Z",
  confidence: 1,
  needs_review: false,
  raw: {},
}

// The PRIMARY fact: a supplier invoice for a 50 000 Kč machine (a fixed asset). VS 4400 links it to the
// prior GL row. `content_hash` = its economic identity.
const invoice: Invoice = {
  ...base,
  ir_id: "inv-1",
  source: "isdoc",
  record_type: "invoice",
  direction: "received",
  doc_type: "invoice",
  number: "2025-114",
  issue_date: "2025-03-10",
  tax_point_date: "2025-03-10",
  currency: "CZK",
  supplier: { name: "Stroje s.r.o.", ico: "27604977" },
  lines: [
    { description: "CNC frézka (machine)", unit_price_minor: 5_000_000n },
  ],
  vat_summary: [{ rate: 21, base_minor: 5_000_000n, tax_minor: 1_050_000n }],
  total_minor: 6_050_000n,
  variable_symbol: "4400",
}

// The UNTRUSTED prior booking: the machine expensed (a synthetic expense account), not capitalized.
const priorGl: GLEntry = {
  ...base,
  ir_id: "gl-1",
  source: "pohoda_xml",
  source_trust: "untrusted_prior",
  record_type: "gl_entry",
  date: "2025-03-10",
  debit_account: "EXPENSE", // the prior error: expensed, not 042/022 capitalized (exact codes = #395)
  credit_account: "SUPPLIER",
  amount_minor: 5_000_000n,
  description: "CNC frézka",
  document_ref: "2025-114",
  content_hash: computeContentHash(invoice), // the intake layer stamps the source doc's identity onto the GL row
}

/** A maxed-clean proposal EXCEPT the one fired signal — the adversarial "prior reproduced confidently" case. */
const reDerivedProposal = (firedSignals: readonly string[]): ScoreInputs => ({
  firedSignals,
  kbRule: "high_active",
  verify: {
    vatBaseMatchesNet: true,
    rcChecklistPassesOrNA: true,
    decree500Confirmed: true,
    periodConsistent: true,
    bankVsKsSsMatch: true,
  },
  extractionQuality: 1,
  reconciliation: "full",
})

describe("confident-wrong trap — prior book expensed a fixed asset", () => {
  it("the prior GL row is untrusted and is NEVER a booking source (control 2)", () => {
    expect(isUntrustedPrior(priorGl)).toBe(true)
    expect(isBookableSource(priorGl)).toBe(false) // the Brain cannot book FROM the prior journal row
    expect(isBookableSource(invoice)).toBe(true) // it books from the primary fact instead
  })

  it("re-deriving from the primary fact fires asset_vs_expense (amount ≥ DHM threshold, unresolved)", () => {
    // 50 000 Kč >= the 40 000 Kč DHM threshold and nothing resolves the capitalize-vs-expense question.
    expect(invoice.total_minor).toBeGreaterThanOrEqual(DHM_THRESHOLD_MINOR)
    const fired = firedHardClassSignals(["asset_vs_expense"], {
      amountMinor: 5_000_000n,
    })
    expect(fired).toEqual(["asset_vs_expense"])
  })

  it("the gate FLAGS the re-derived booking — sub-green, needsReview — it does NOT reproduce a green", () => {
    const fired = firedHardClassSignals(["asset_vs_expense"], {
      amountMinor: 5_000_000n,
    })
    const decision = scoreProposalColdStart(reDerivedProposal(fired))
    // The cardinal-sin guarantee: even with everything else maxed, the trap cannot auto-book.
    expect(decision.isGreen).toBe(false)
    expect(decision.needsReview).toBe(true)
    expect(decision.reasons).toContain("capped by asset_vs_expense at 0.6")
  })

  it("a resolved small-amount expense is NOT trapped (the control is precise, not blanket)", () => {
    // A 3 000 Kč tool below the DHM threshold is defensibly an expense — the cap must NOT fire, so a
    // genuinely-clean small booking still greens. (Guards against the trap over-flagging everything.)
    const fired = firedHardClassSignals(["asset_vs_expense"], {
      amountMinor: 300_000n,
    })
    expect(fired).toEqual([])
    const decision = scoreProposalColdStart(reDerivedProposal(fired))
    expect(decision.isGreen).toBe(true)
    expect(decision.needsReview).toBe(false)
  })

  it("dedup clusters the prior GL row with its invoice (one event, cross-checked — not two)", () => {
    // The prior row carries the invoice's stamped content_hash, so they collapse to ONE event cluster:
    // the GL row becomes a cross-check hint against the re-derivation, never an independent booking.
    const clusters = clusterEvents([invoice, priorGl])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.records).toHaveLength(2)
  })
})

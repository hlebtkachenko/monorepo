import { describe, expect, it } from "vitest"

import { computeCRaw } from "@workspace/brain/confidence"

import {
  buildShadowScore,
  deriveServerVerify,
  type ShadowScore,
} from "./shadow-score"

/**
 * [W1.5] Shadow-score instrumentation unit tests. The shadow is a PURE, audit-only
 * second scoring pass — these prove it recomputes the server-derivable verify
 * facts from the payload (never trusts the client), keeps the base fields floored,
 * drops the `extraction_failed` block, and carries NO verdict.
 */

// A capture body whose VAT arithmetic is CORRECT (base 1000 @ 21% = 210).
const correctVatBody = {
  issuedAt: "2025-03-14",
  lines: [
    {
      partials: [
        {
          baseAmount: "1000.00",
          vatMode: "STANDARD",
          vatRate: "21",
          vatAmount: "210.00",
        },
      ],
    },
  ],
}

// Same, but the VAT arithmetic is WRONG (declares 999 where 210 is expected).
const wrongVatBody = {
  issuedAt: "2025-03-14",
  lines: [
    {
      partials: [
        {
          baseAmount: "1000.00",
          vatMode: "STANDARD",
          vatRate: "21",
          vatAmount: "999.00",
        },
      ],
    },
  ],
}

describe("deriveServerVerify", () => {
  it("derives vatBaseMatchesNet = true when the payload VAT arithmetic is correct", () => {
    const d = deriveServerVerify(correctVatBody)
    expect(d.vatBaseMatchesNet).toBe(true)
    expect(d.periodConsistent).toBe(true)
  })

  it("derives vatBaseMatchesNet = false when the payload VAT arithmetic is wrong", () => {
    const d = deriveServerVerify(wrongVatBody)
    expect(d.vatBaseMatchesNet).toBe(false)
  })

  it("leaves vatBaseMatchesNet UNASSERTED when there is no checkable STANDARD partial", () => {
    // An events body carries no lines/partials → nothing to check.
    const d = deriveServerVerify({ occurredAt: "2025-03-14", note: "x" })
    expect(d.vatBaseMatchesNet).toBeUndefined()
    expect(d.periodConsistent).toBe(true)
  })

  it("leaves periodConsistent UNASSERTED when the payload carries no date basis", () => {
    const d = deriveServerVerify({ lines: [] })
    expect(d.periodConsistent).toBeUndefined()
  })

  it("derives periodConsistent = false for a malformed date basis", () => {
    const d = deriveServerVerify({ issuedAt: "not-a-date" })
    expect(d.periodConsistent).toBe(false)
  })

  it("holds a nonzero-rate STANDARD partial with a MISSING vatAmount as a non-pass (vat_amount_missing analogue)", () => {
    const d = deriveServerVerify({
      issuedAt: "2025-03-14",
      lines: [
        {
          partials: [
            { baseAmount: "1000.00", vatMode: "STANDARD", vatRate: "21" },
          ],
        },
      ],
    })
    expect(d.vatBaseMatchesNet).toBe(false)
  })

  it("never throws on a malformed amount field (instrumentation is fail-safe)", () => {
    expect(() =>
      deriveServerVerify({
        lines: [
          {
            partials: [
              {
                baseAmount: "not-a-number",
                vatMode: "STANDARD",
                vatRate: "21",
                vatAmount: "210.00",
              },
            ],
          },
        ],
      }),
    ).not.toThrow()
  })
})

describe("buildShadowScore", () => {
  it("persists serverLane.cRaw + claimLane.cRaw + claimAudit (formula version 1)", () => {
    const shadow: ShadowScore = buildShadowScore(correctVatBody, null, [])
    expect(shadow.v).toBe(1)
    expect(typeof shadow.serverLane.cRaw).toBe("number")
    expect(typeof shadow.claimLane.cRaw).toBe("number")
    expect(shadow.claimAudit).toEqual({
      vatBaseMatchesNet: { claimed: false, derived: true },
      periodConsistent: { claimed: false, derived: true },
    })
  })

  it("serverLane keeps base fields FLOORED and drops the extraction_failed block", () => {
    const shadow = buildShadowScore(correctVatBody, null, [])
    expect(shadow.serverLane.inputs.kbRule).toBe("none")
    expect(shadow.serverLane.inputs.extractionQuality).toBe(0)
    expect(shadow.serverLane.inputs.reconciliation).toBe("none")
    // No extraction_failed → a real non-zero server x (floor 0.40 kbRule + verify
    // uplifts + a -0.03 reconciliation delta), NOT the enforced structural 0.
    expect(shadow.serverLane.inputs.firedSignals).not.toContain(
      "extraction_failed",
    )
    expect(shadow.serverLane.cRaw).toBeGreaterThan(0)
  })

  it("serverLane RECOMPUTES verify server-side — a client TRUE claim on FALSE arithmetic uses the DERIVED false", () => {
    // The client claims vatBaseMatchesNet + periodConsistent TRUE, but the payload
    // arithmetic is FALSE. The shadow must NOT trust the claim on serverLane.
    const envelope = {
      vatBaseMatchesNet: true,
      periodConsistent: true,
    }
    const shadow = buildShadowScore(wrongVatBody, envelope, [])

    // claimAudit surfaces the dishonesty: claimed true, derived false.
    expect(shadow.claimAudit.vatBaseMatchesNet).toEqual({
      claimed: true,
      derived: false,
    })

    // serverLane uses the DERIVED false → no vatBaseMatchesNet uplift.
    expect(shadow.serverLane.inputs.verify.vatBaseMatchesNet).toBe(false)
    const expectedServer = computeCRaw({
      firedSignals: [],
      kbRule: "none",
      verify: { vatBaseMatchesNet: false, periodConsistent: true },
      extractionQuality: 0,
      reconciliation: "none",
    }).cRaw
    expect(shadow.serverLane.cRaw).toBe(expectedServer)

    // claimLane, by contrast, DOES honor the (dishonest) client claim — diagnostic
    // only, never a training x — so its cRaw is higher than the server-honest lane.
    expect(shadow.claimLane.cRaw).toBeGreaterThan(shadow.serverLane.cRaw)
  })

  it("honors client capSignals + server-derived signals on BOTH lanes (add-only holds)", () => {
    const shadow = buildShadowScore(
      correctVatBody,
      { capSignals: ["novel_ico"] },
      ["novel_template"],
    )
    expect(shadow.serverLane.inputs.firedSignals).toEqual(
      expect.arrayContaining(["novel_ico", "novel_template"]),
    )
    // A Tier-3 DEFER (novel_template) forces cRaw = 0 on BOTH lanes — the shadow
    // still reflects server holds honestly (it just omits extraction_failed).
    expect(shadow.serverLane.cRaw).toBe(0)
    expect(shadow.claimLane.cRaw).toBe(0)
  })

  it("drops an UNKNOWN client capSignal (only recognized Tier-2 caps survive)", () => {
    const shadow = buildShadowScore(
      correctVatBody,
      { capSignals: ["totally_made_up"] },
      [],
    )
    expect(shadow.serverLane.inputs.firedSignals).not.toContain(
      "totally_made_up",
    )
  })

  it("claimLane scores the client's raw kbRule/extractionQuality/reconciliation as-claimed", () => {
    const envelope = {
      kbRule: "high_active" as const,
      extractionQuality: 1,
      reconciliation: "full" as const,
    }
    const shadow = buildShadowScore(correctVatBody, envelope, [])
    const expectedClaim = computeCRaw({
      firedSignals: [],
      kbRule: "high_active",
      verify: {
        vatBaseMatchesNet: undefined,
        rcChecklistPassesOrNA: undefined,
        decree500Confirmed: undefined,
        periodConsistent: undefined,
        bankVsKsSsMatch: undefined,
      },
      extractionQuality: 1,
      reconciliation: "full",
    }).cRaw
    expect(shadow.claimLane.cRaw).toBe(expectedClaim)
    // The client's floored default lane (serverLane) never sees these claims.
    expect(shadow.serverLane.inputs.kbRule).toBe("none")
  })

  it("carries NO verdict field on either lane (bare numbers only)", () => {
    const shadow = buildShadowScore(correctVatBody, null, [])
    expect(shadow.serverLane).not.toHaveProperty("isGreen")
    expect(shadow.serverLane).not.toHaveProperty("needsReview")
    expect(shadow.serverLane).not.toHaveProperty("verdict")
    expect(shadow.claimLane).not.toHaveProperty("isGreen")
    expect(shadow.claimLane).not.toHaveProperty("cFinal")
    // The only key on claimLane is cRaw.
    expect(Object.keys(shadow.claimLane)).toEqual(["cRaw"])
  })
})

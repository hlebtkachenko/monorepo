import { describe, expect, it, vi } from "vitest"

import type { OrganizationBoundDb } from "@workspace/db"

import {
  reverifyCapture,
  reverifySumsAgainstReExtraction,
  reverifyTemplateBasis,
  type ReExtractedTotals,
} from "./extraction-reverifier"

/**
 * [M3.1] These tests pin the re-verifier's core safety property: it is a
 * TIGHTENING-only checker that can only ever CONFIRM or FAIL a field, and it
 * must NEVER report `verified: true` without a genuine independent
 * recomputation — an un-recomputable case (no re-extraction source, no
 * confirmed template) must fail CLOSED to `not verified`, never a silent pass.
 * This module is standalone: it is not imported by `evidence-gate.ts` or
 * `accounting-writes.gate.ts` (see `git diff` on this PR), so nothing here
 * changes the live gate's behavior.
 */

// A drizzle-shaped stub for the OCR-template basis lookup, mirroring
// accounting-veto.test.ts's mkTemplateDb — reverifyTemplateBasis is READ-ONLY
// (never bumps held_count), so no `update`/`set` spy is needed here.
function mkTemplateDb(row: { humanConfirmedAt: Date | null } | null) {
  const limit = vi.fn().mockResolvedValue(row ? [row] : [])
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
  } as unknown as OrganizationBoundDb
  return { db, limit }
}

const partial = (over: Record<string, unknown> = {}) => ({
  baseAmount: "1000.00",
  vatMode: "STANDARD" as const,
  vatRate: "21",
  vatAmount: "210.00",
  currencyCode: "CZK",
  ...over,
})

const line = (
  partials: ReturnType<typeof partial>[],
  over: Record<string, unknown> = {},
) => ({
  eventId: "019f4975-0000-7000-8000-000000000001",
  ...over,
  partials,
})

const captured = (
  partials: ReturnType<typeof partial>[],
  over: Record<string, unknown> = {},
) => ({
  issuedAt: "2025-03-14",
  roundingAmount: undefined as string | undefined,
  ...over,
  lines: [line(partials)],
})

/** A re-extraction basis matching the default `partial()` fixture exactly. */
const matchingReExtraction: ReExtractedTotals = {
  vatSummary: [{ rate: 21, base_minor: 100_000n, tax_minor: 21_000n }],
  totalMinor: 121_000n,
}

describe("reverifyTemplateBasis — template-confirmation leg", () => {
  it("is Not Applicable (passes) for a structured capture", async () => {
    const { db, limit } = mkTemplateDb(null)
    const check = await reverifyTemplateBasis(db, "structured", null)
    expect(check.verified).toBe(true)
    expect(limit).not.toHaveBeenCalled()
  })

  it("is Not Applicable (passes) for a manual capture", async () => {
    const { db } = mkTemplateDb(null)
    const check = await reverifyTemplateBasis(db, "manual", null)
    expect(check.verified).toBe(true)
  })

  it("fails CLOSED for an OCR capture with no templateId", async () => {
    const { db } = mkTemplateDb(null)
    const check = await reverifyTemplateBasis(db, "ocr", null)
    expect(check.verified).toBe(false)
  })

  it("fails CLOSED for a MISSING extractionMethod (treated as 'ocr', most conservative)", async () => {
    const { db } = mkTemplateDb(null)
    const check = await reverifyTemplateBasis(db, undefined, null)
    expect(check.verified).toBe(false)
  })

  it("fails CLOSED when the templateId does not resolve to a visible row", async () => {
    const { db } = mkTemplateDb(null)
    const check = await reverifyTemplateBasis(
      db,
      "ocr",
      "019f4975-0000-7000-8000-0000000000e1",
    )
    expect(check.verified).toBe(false)
  })

  it("fails CLOSED for an UNCONFIRMED template (locators untrusted)", async () => {
    const { db } = mkTemplateDb({ humanConfirmedAt: null })
    const check = await reverifyTemplateBasis(
      db,
      "ocr",
      "019f4975-0000-7000-8000-0000000000e1",
    )
    expect(check.verified).toBe(false)
  })

  it("VERIFIES a CONFIRMED template basis", async () => {
    const { db } = mkTemplateDb({ humanConfirmedAt: new Date("2026-01-01") })
    const check = await reverifyTemplateBasis(
      db,
      "ocr",
      "019f4975-0000-7000-8000-0000000000e1",
    )
    expect(check.verified).toBe(true)
  })
})

describe("reverifySumsAgainstReExtraction — extraction-fidelity leg", () => {
  it("fails CLOSED to not-verified when NO re-extraction source is supplied (un-recomputable, never a silent pass)", () => {
    const checks = reverifySumsAgainstReExtraction(captured([partial()]), null)
    expect(checks.every((c) => c.verified)).toBe(false)
    expect(checks.some((c) => c.field === "document.total")).toBe(true)
  })

  it("VERIFIES a correct capture against a matching independent re-extraction", () => {
    const checks = reverifySumsAgainstReExtraction(
      captured([partial()]),
      matchingReExtraction,
    )
    expect(checks.length).toBeGreaterThan(0)
    expect(checks.every((c) => c.verified)).toBe(true)
  })

  it("FAILS a tampered amount that is internally consistent but diverges from the re-extracted source", () => {
    // 2000.00 base / 420.00 vat is internally self-consistent (21% of 2000 = 420)
    // but does NOT match `matchingReExtraction`'s independently re-extracted
    // 1000.00/210.00 — this is exactly the tampering LEG A alone would miss.
    const tampered = captured([
      partial({ baseAmount: "2000.00", vatAmount: "420.00" }),
    ])
    const checks = reverifySumsAgainstReExtraction(
      tampered,
      matchingReExtraction,
    )
    expect(checks.every((c) => c.verified)).toBe(false)
    const rateCheck = checks.find((c) =>
      c.field.startsWith("document.vatSummary"),
    )
    expect(rateCheck?.verified).toBe(false)
  })

  it("FAILS a wrong document total (rounding tampered) even when the per-rate VAT summary matches", () => {
    const tampered = captured([partial()], { roundingAmount: "500.00" })
    const checks = reverifySumsAgainstReExtraction(
      tampered,
      matchingReExtraction,
    )
    const totalCheck = checks.find((c) => c.field === "document.total")
    expect(totalCheck?.verified).toBe(false)
  })

  it("FAILS when a VAT rate is present in only one of the captured/re-extracted summaries", () => {
    const twoRatePartials = [
      partial(),
      partial({ vatRate: "15", vatAmount: "150.00", baseAmount: "1000.00" }),
    ]
    const checks = reverifySumsAgainstReExtraction(
      captured(twoRatePartials),
      matchingReExtraction, // only carries the 21% rate
    )
    expect(checks.every((c) => c.verified)).toBe(false)
  })

  it("tolerates ±1 Kč rounding noise", () => {
    const almostMatching: ReExtractedTotals = {
      vatSummary: [{ rate: 21, base_minor: 100_000n, tax_minor: 21_090n }],
      totalMinor: 121_090n,
    }
    const checks = reverifySumsAgainstReExtraction(
      captured([partial()]),
      almostMatching,
    )
    expect(checks.every((c) => c.verified)).toBe(true)
  })
})

describe("reverifyCapture — the combined M3.1 re-verification pass", () => {
  it("VERIFIES a fully correct, fully re-checkable capture (confirmed template + matching re-extraction)", async () => {
    const { db } = mkTemplateDb({ humanConfirmedAt: new Date("2026-01-01") })
    const verdict = await reverifyCapture(db, {
      captured: captured([partial()]),
      extractionMethod: "ocr",
      templateId: "019f4975-0000-7000-8000-0000000000e1",
      reExtracted: matchingReExtraction,
    })
    expect(verdict.verified).toBe(true)
    expect(verdict.checks.length).toBeGreaterThan(0)
    expect(verdict.checks.every((c) => c.verified)).toBe(true)
  })

  it("FAILS a wrong-sum capture (internal VAT arithmetic broken) even with a confirmed template", async () => {
    const { db } = mkTemplateDb({ humanConfirmedAt: new Date("2026-01-01") })
    const wrongSum = captured([
      partial({ vatAmount: "999.00" }), // grossly wrong vs base*rate
    ])
    const verdict = await reverifyCapture(db, {
      captured: wrongSum,
      extractionMethod: "ocr",
      templateId: "019f4975-0000-7000-8000-0000000000e1",
      reExtracted: matchingReExtraction,
    })
    expect(verdict.verified).toBe(false)
    const arithmeticCheck = verdict.checks.find(
      (c) => c.field === "arithmetic.vatBaseMatchesNet",
    )
    expect(arithmeticCheck?.verified).toBe(false)
  })

  it("FAILS a tampered amount that passes internal arithmetic but diverges from independent re-extraction", async () => {
    const { db } = mkTemplateDb({ humanConfirmedAt: new Date("2026-01-01") })
    const tampered = captured([
      partial({ baseAmount: "2000.00", vatAmount: "420.00" }),
    ])
    const verdict = await reverifyCapture(db, {
      captured: tampered,
      extractionMethod: "ocr",
      templateId: "019f4975-0000-7000-8000-0000000000e1",
      reExtracted: matchingReExtraction,
    })
    // LEG A (internal arithmetic) genuinely passes — 2000*21% == 420 — proving
    // the fidelity leg (LEG B) is catching something arithmetic alone cannot.
    const arithmeticCheck = verdict.checks.find(
      (c) => c.field === "arithmetic.vatBaseMatchesNet",
    )
    expect(arithmeticCheck?.verified).toBe(true)
    expect(verdict.verified).toBe(false)
  })

  it("fails CLOSED to not-verified when the case is UN-RECOMPUTABLE (no re-extraction source at all)", async () => {
    const { db } = mkTemplateDb({ humanConfirmedAt: new Date("2026-01-01") })
    const verdict = await reverifyCapture(db, {
      captured: captured([partial()]),
      extractionMethod: "ocr",
      templateId: "019f4975-0000-7000-8000-0000000000e1",
      reExtracted: null, // the realistic v1 state — no wired re-extraction engine yet
    })
    expect(verdict.verified).toBe(false)
  })

  it("fails CLOSED for an OCR capture with no template basis AND no re-extraction (the common cold-start case)", async () => {
    const { db } = mkTemplateDb(null)
    const verdict = await reverifyCapture(db, {
      captured: captured([partial()]),
      extractionMethod: "ocr",
      templateId: null,
      reExtracted: null,
    })
    expect(verdict.verified).toBe(false)
    expect(
      verdict.checks.some((c) => c.field.startsWith("template") && !c.verified),
    ).toBe(true)
  })

  it("a structured capture still fails-closed overall while no re-extraction basis exists (template leg alone cannot green it)", async () => {
    const { db } = mkTemplateDb(null)
    const verdict = await reverifyCapture(db, {
      captured: captured([partial()]),
      extractionMethod: "structured",
      templateId: null,
      reExtracted: null,
    })
    const templateCheck = verdict.checks.find((c) =>
      c.field.startsWith("template"),
    )
    expect(templateCheck?.verified).toBe(true) // N/A for structured
    expect(verdict.verified).toBe(false) // but totals leg is still un-recomputable
  })

  it("never returns verified:true with an empty checks array", async () => {
    const { db } = mkTemplateDb(null)
    const verdict = await reverifyCapture(db, {
      captured: captured([partial()]),
      extractionMethod: "manual",
      templateId: null,
      reExtracted: null,
    })
    expect(verdict.checks.length).toBeGreaterThan(0)
  })
})

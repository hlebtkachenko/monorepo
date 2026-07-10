/**
 * Pure unit tests for the DPPO adjustments form helper (no DB): the worksheet →
 * form prefill, the action Zod schema (answered amount needs a reference; blank
 * is allowed; decimals are bounded), and the form → domain save-input mapping.
 */

import { describe, expect, it } from "vitest"
import type { Dppo } from "@workspace/accounting"

import {
  DppoAdjustmentInputSchema,
  dppoAdjustmentFormFromWorksheet,
  toDppoSaveInput,
  type DppoAdjustmentInput,
} from "./dppo-adjustment-form"

/** Minimal Dppo — the prefill helper only reads rateResolution.category + adjustments. */
function worksheet(overrides: Partial<Dppo>): Dppo {
  return {
    rateResolution: { status: "UNSUPPORTED", category: "UNKNOWN", reason: "x" },
    adjustments: {
      nonDeductibleExpenses: null,
      exemptRevenue: null,
      excludeLossMakingMainActivity: null,
      lossCarryForward: null,
      taxReliefs: null,
      advancesPaid: null,
    },
    ...overrides,
  } as unknown as Dppo
}

function validInput(): DppoAdjustmentInput {
  return {
    taxpayerCategory: "STANDARD",
    fields: {
      nonDeductibleExpenses: { amount: "5000.00", reference: "§25" },
      exemptRevenue: { amount: "", reference: "" },
      excludeLossMakingMainActivity: { amount: "0", reference: "n/a" },
      lossCarryForward: { amount: "", reference: "" },
      taxReliefs: { amount: "0", reference: "none" },
      advancesPaid: { amount: "0", reference: "none" },
    },
  }
}

describe("dppoAdjustmentFormFromWorksheet", () => {
  it("prefills amounts + references and the supported category", () => {
    const dppo = worksheet({
      rateResolution: {
        status: "SUPPORTED",
        category: "STANDARD",
        rate: "0.21",
        effectiveFrom: "2024-01-01",
        effectiveTo: null,
        sourceUrl: "x",
        verifiedOn: "y",
      },
      adjustments: {
        nonDeductibleExpenses: {
          amount: "5000.0000",
          provenance: {
            source: "USER",
            reference: "§25 reprezentace",
            recordedAt: "2026-07-10",
          },
        },
        exemptRevenue: null,
        excludeLossMakingMainActivity: null,
        lossCarryForward: null,
        taxReliefs: null,
        advancesPaid: null,
      },
    })

    const state = dppoAdjustmentFormFromWorksheet(dppo)
    expect(state.taxpayerCategory).toBe("STANDARD")
    expect(state.fields.nonDeductibleExpenses).toEqual({
      amount: "5000.0000",
      reference: "§25 reprezentace",
    })
    expect(state.fields.exemptRevenue).toEqual({ amount: "", reference: "" })
  })

  it("maps an unknown (unconfigured) category to an empty selection", () => {
    expect(
      dppoAdjustmentFormFromWorksheet(worksheet({})).taxpayerCategory,
    ).toBe("")
  })
})

describe("DppoAdjustmentInputSchema", () => {
  it("accepts a valid input (blank amounts allowed)", () => {
    expect(DppoAdjustmentInputSchema.safeParse(validInput()).success).toBe(true)
  })

  it("rejects an answered amount with an empty reference (per-field path)", () => {
    const input = validInput()
    input.fields.nonDeductibleExpenses = { amount: "5000", reference: "" }
    const result = DppoAdjustmentInputSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(
      result.error.issues.some(
        (issue) =>
          issue.path.join(".") === "fields.nonDeductibleExpenses.reference",
      ),
    ).toBe(true)
  })

  it("rejects an amount with more than four decimal places", () => {
    const input = validInput()
    input.fields.taxReliefs = { amount: "12.34567", reference: "x" }
    expect(DppoAdjustmentInputSchema.safeParse(input).success).toBe(false)
  })

  it("accepts a null taxpayer category (save-in-progress)", () => {
    const input = { ...validInput(), taxpayerCategory: null }
    expect(DppoAdjustmentInputSchema.safeParse(input).success).toBe(true)
  })
})

describe("toDppoSaveInput", () => {
  it("maps blank amounts to null entries and trims answered ones", () => {
    const save = toDppoSaveInput({
      taxpayerCategory: "STANDARD",
      fields: {
        nonDeductibleExpenses: { amount: " 5000.00 ", reference: " §25 " },
        exemptRevenue: { amount: "", reference: "ignored when blank" },
        excludeLossMakingMainActivity: { amount: "0", reference: "n/a" },
        lossCarryForward: { amount: "", reference: "" },
        taxReliefs: { amount: "0", reference: "none" },
        advancesPaid: { amount: "0", reference: "none" },
      },
    })

    expect(save.taxpayerCategory).toBe("STANDARD")
    expect(save.entries.nonDeductibleExpenses).toEqual({
      amount: "5000.00",
      reference: "§25",
    })
    expect(save.entries.exemptRevenue).toBeNull()
    expect(save.entries.excludeLossMakingMainActivity).toEqual({
      amount: "0",
      reference: "n/a",
    })
  })
})

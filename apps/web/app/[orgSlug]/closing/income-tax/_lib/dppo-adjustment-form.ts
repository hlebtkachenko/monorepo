import { z } from "zod"
import type {
  Dppo,
  DppoAdjustmentEntry,
  DppoAdjustmentKey,
  DppoAdjustmentSaveInput,
  DppoTaxpayerCategory,
} from "@workspace/accounting"

/**
 * Declarative field list + Zod schema + state helpers for the DPPO adjustments
 * edit form, mirroring settings/_lib/tax-profile-form.ts. buildDppo needs a
 * taxpayer category plus six provenanced adjustments; this surface captures the
 * amount + a required free-text reference per field (source is always USER,
 * recordedAt is stamped server-side at save — see dppo-adjustments.ts).
 *
 * Runtime-only depends on this app + zod; every @workspace/accounting import is
 * type-only (erased) so the file stays safe to import from the client view.
 */

/** Selectable taxpayer categories (§17a/§21 ZDP) for the category select. */
export const DPPO_TAXPAYER_CATEGORIES = [
  { value: "STANDARD", label: "Standard taxpayer (§21/1)" },
  { value: "BASIC_INVESTMENT_FUND", label: "Basic investment fund (§21/2)" },
  {
    value: "QUALIFYING_PENSION_INSTITUTION",
    label: "Qualifying pension institution (§21/3)",
  },
  { value: "OTHER", label: "Other (advisor-provided rate)" },
] as const satisfies ReadonlyArray<{
  value: DppoTaxpayerCategory
  label: string
}>

/** The six required adjustments — key ↔ dialog field id + Czech label + § reference. */
export const DPPO_ADJUSTMENT_FIELDS = [
  {
    key: "nonDeductibleExpenses",
    id: "dppo-non-deductible-expenses",
    label: "Daňově neuznatelné náklady",
    statute: "§25",
  },
  {
    key: "exemptRevenue",
    id: "dppo-exempt-revenue",
    label: "Osvobozené / nezahrnované výnosy",
    statute: "§18a, §19",
  },
  {
    key: "excludeLossMakingMainActivity",
    id: "dppo-exclude-loss-making-main-activity",
    label: "Ztráta z hlavní (nevýdělečné) činnosti",
    statute: "§18a/1",
  },
  {
    key: "lossCarryForward",
    id: "dppo-loss-carry-forward",
    label: "Odpočet daňové ztráty minulých let",
    statute: "§34",
  },
  {
    key: "taxReliefs",
    id: "dppo-tax-reliefs",
    label: "Slevy na dani",
    statute: "§35",
  },
  {
    key: "advancesPaid",
    id: "dppo-advances-paid",
    label: "Zaplacené zálohy na daň",
    statute: "§38a",
  },
] as const satisfies ReadonlyArray<{
  key: DppoAdjustmentKey
  id: string
  label: string
  statute: string
}>

export interface DppoAdjustmentFieldValue {
  /** Decimal string, or "" when not answered (blocking). */
  amount: string
  /** Free-text provenance reference; required once an amount is answered. */
  reference: string
}

/** Client form state: the chosen category ("" = none) + per-field amount/reference. */
export interface DppoAdjustmentFormState {
  taxpayerCategory: DppoTaxpayerCategory | ""
  fields: Record<DppoAdjustmentKey, DppoAdjustmentFieldValue>
}

/** Prefill the form from the worksheet buildDppo already echoes back (amounts + provenance). */
export function dppoAdjustmentFormFromWorksheet(
  dppo: Dppo,
): DppoAdjustmentFormState {
  const category = dppo.rateResolution.category
  const fields = {} as Record<DppoAdjustmentKey, DppoAdjustmentFieldValue>
  for (const { key } of DPPO_ADJUSTMENT_FIELDS) {
    const adjustment = dppo.adjustments[key]
    fields[key] = {
      amount: adjustment?.amount ?? "",
      reference: adjustment?.provenance.reference ?? "",
    }
  }
  return {
    taxpayerCategory: category === "UNKNOWN" ? "" : category,
    fields,
  }
}

// A signed decimal with up to four fractional places (numeric(19,4)), or blank.
const AMOUNT_PATTERN = /^-?\d+(\.\d{1,4})?$/

const AmountSchema = z
  .string()
  .refine((value) => value.trim() === "" || AMOUNT_PATTERN.test(value.trim()), {
    error: "Enter a decimal amount (up to 4 places) or leave blank.",
  })

const FieldSchema = z.object({
  amount: AmountSchema,
  reference: z.string(),
})

/**
 * Action-input schema. A blank amount = not answered (persisted null, blocking);
 * an answered amount requires a non-empty reference. Deliberately carries NO
 * organization_id / user_id / workspace_id / role — the server injects tenancy.
 */
export const DppoAdjustmentInputSchema = z
  .object({
    taxpayerCategory: z
      .enum([
        "STANDARD",
        "BASIC_INVESTMENT_FUND",
        "QUALIFYING_PENSION_INSTITUTION",
        "OTHER",
      ])
      .nullable(),
    fields: z.object({
      nonDeductibleExpenses: FieldSchema,
      exemptRevenue: FieldSchema,
      excludeLossMakingMainActivity: FieldSchema,
      lossCarryForward: FieldSchema,
      taxReliefs: FieldSchema,
      advancesPaid: FieldSchema,
    }),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const { key } of DPPO_ADJUSTMENT_FIELDS) {
      const field = value.fields[key]
      if (field.amount.trim() !== "" && field.reference.trim() === "") {
        ctx.addIssue({
          code: "custom",
          path: ["fields", key, "reference"],
          message: "A reference is required for an answered amount.",
        })
      }
    }
  })

export type DppoAdjustmentInput = z.infer<typeof DppoAdjustmentInputSchema>

/** Map the validated action input to the domain save shape (blank amount → null entry). */
export function toDppoSaveInput(
  input: DppoAdjustmentInput,
): DppoAdjustmentSaveInput {
  const entries = {} as Record<DppoAdjustmentKey, DppoAdjustmentEntry | null>
  for (const { key } of DPPO_ADJUSTMENT_FIELDS) {
    const amount = input.fields[key].amount.trim()
    entries[key] =
      amount === ""
        ? null
        : { amount, reference: input.fields[key].reference.trim() }
  }
  return { taxpayerCategory: input.taxpayerCategory, entries }
}

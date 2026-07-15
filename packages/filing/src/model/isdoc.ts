// Typed ISDOC 6.0.1 invoice model — the seam the future UI binds to. Mirrors the canonical
// invoice dict from the reference generator (~/.claude/skills/isdoc/scripts/generate.py).
// Monetary/quantity fields are decimal strings (never native number — money rule); exact
// arithmetic happens in the writer via decimal.js-light.

import { z } from "zod"

/** Decimal-as-string (e.g. "1000.00", "21", "25.20"). */
const decimalString = z.string()

export const IsdocPartySchema = z.object({
  ico: z.string().optional(),
  dic: z.string().optional(),
  name: z.string(),
  street: z.string().optional(),
  building: z.string().optional(),
  city: z.string().optional(),
  zip: z.string().optional(),
  country_code: z.string().optional(),
  country_name: z.string().optional(),
  is_vat_payer: z.boolean().default(true),
})

export const IsdocLineSchema = z.object({
  description: z.string(),
  qty: decimalString,
  unit: z.string().default("ks"),
  unit_price_base: decimalString,
  vat_rate: decimalString,
  reverse_charge: z.boolean().optional(),
  reverse_charge_code: z.string().optional(),
  unit_price_base_curr: decimalString.optional(),
})

export const IsdocCurrencySchema = z.object({
  local: z.string().default("CZK"),
  foreign: z.string().optional(),
  rate: decimalString.optional(),
  ref_rate: decimalString.optional(),
})

export const IsdocBankSchema = z.object({
  account: z.string(),
  code: z.string(),
  name: z.string(),
  iban: z.string(),
  bic: z.string(),
})

export const IsdocCashSchema = z.object({
  receipt_id: z.string(),
  paid_date: z.string(),
})

export const IsdocAnonymousCustomerSchema = z.object({
  id: z.string(),
  id_scheme: z.string().default("UNSET"),
})

export const IsdocOriginalRefSchema = z.object({
  id: z.string(),
  uuid: z.string().optional(),
  issue_date: z.string().optional(),
})

const IsdocAlreadyClaimedByRateSchema = z.object({
  taxable: decimalString.optional(),
  tax: decimalString.optional(),
  inclusive: decimalString.optional(),
})

export const IsdocAlreadyClaimedSchema = z.object({
  tax_exclusive: decimalString.optional(),
  tax_inclusive: decimalString.optional(),
  by_rate: z.record(z.string(), IsdocAlreadyClaimedByRateSchema).optional(),
})

export const IsdocInvoiceSchema = z.object({
  invoice_id: z.string(),
  uuid: z.string().optional(),
  doc_type: z.string().default("1"),
  direction: z.string().optional(),
  issue_date: z.string(),
  tax_point_date: z.string().optional(),
  due_date: z.string().optional(),
  currency: IsdocCurrencySchema.optional(),
  supplier: IsdocPartySchema,
  customer: IsdocPartySchema.optional(),
  anonymous_customer: IsdocAnonymousCustomerSchema.optional(),
  lines: z.array(IsdocLineSchema).min(1),
  payment_method: z.number(),
  bank: IsdocBankSchema.optional(),
  variable_symbol: z.string().optional(),
  cash: IsdocCashSchema.optional(),
  original_references: z.array(IsdocOriginalRefSchema).optional(),
  already_claimed: IsdocAlreadyClaimedSchema.optional(),
})

export type IsdocInvoice = z.infer<typeof IsdocInvoiceSchema>
export type IsdocInvoiceInput = z.input<typeof IsdocInvoiceSchema>
export type IsdocParty = z.infer<typeof IsdocPartySchema>
export type IsdocLine = z.infer<typeof IsdocLineSchema>

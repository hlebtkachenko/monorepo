/**
 * Předkontace = account-coding templates that EXPAND one captured partial_record
 * into the N balanced MD/Dal lines of a double-entry posting (§6/2). Normalized
 * (single-movement) form of the KB templates in
 * `accountingAfframe/30-predkontace/{sales,purchase}/*.json`: a sales template
 * row `{MD:"311", D:"604", basis:"net"}` becomes two entries here (one DEBIT, one
 * CREDIT), which is the natural shape of posting_double_entry_line.
 *
 * The VAT treatment is encoded in the template, keyed by vat_mode: STANDARD
 * carries an explicit 343 line; REVERSE_CHARGE / IMPORT self-assess VAT at
 * posting (basis = self_assessed_vat, computed in SQL from base × rate — never
 * stored on the doc); EXEMPT / OUTSIDE_VAT carry no VAT line.
 */

import type { DebitCredit, VatMode } from "../types"

/**
 * Which amount a template entry posts. The first four are resolved from the
 * partial_record in SQL (exact, no JS arithmetic):
 *   net               = base_in_accounting_currency
 *   vat               = vat_in_accounting_currency (the doc's stated VAT)
 *   gross             = net + vat
 *   self_assessed_vat = round(net × vat_rate / 100, 2)   (reverse charge / import)
 * Any other string is a caller-supplied amount (cost of goods sold, book value,
 * accumulated depreciation, …) passed via `extraAmounts`.
 */
export type AmountBasis =
  | "net"
  | "vat"
  | "gross"
  | "self_assessed_vat"
  | (string & {})

export interface PredkontaceEntry {
  /** Account NUMBER (resolved to the period's account_id at expansion, D8). */
  account: string
  side: DebitCredit
  basis: AmountBasis
  description?: string
}

export interface PredkontaceScenario {
  /** Stable id, mirrors the KB scenario id where one exists. */
  id: string
  label: string
  documentSide: "SALES" | "PURCHASE"
  /** The vat_mode this template serves; must match the partial_record's vat_mode. */
  vatMode: VatMode
  /** Statutory references (ZDPH / ZoÚ / ČÚS). */
  legalBasis: string[]
  /** Transcription confidence from the KB (high = unambiguous core case). */
  confidence: "high" | "medium"
  entries: PredkontaceEntry[]
}

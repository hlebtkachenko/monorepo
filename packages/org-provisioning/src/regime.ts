/**
 * Regime derivation + statutory cross-checks (advisor change 4).
 *
 * Pure — the orchestrator loads the legal-form facts from the reference tables
 * (legal_form, legal_form_allowed_regime) and calls these. Auto-derive ONLY when
 * deterministic; otherwise the caller must supply an explicit regime (the wizard
 * shows a default, the API returns 422).
 */
import { ScaffoldValidationError } from "./errors"

export type Regime = "DOUBLE_ENTRY" | "SINGLE_ENTRY" | "TAX_RECORDS"
export type VatRegime = "NON_PAYER" | "PAYER" | "IDENTIFIED_PERSON"

export interface LegalFormFacts {
  /** Regimes permitted for this legal form (legal_form_allowed_regime). */
  allowedRegimes: readonly Regime[]
  /** legal_form.mandatory_double_entry. */
  mandatoryDoubleEntry: boolean
  /**
   * Registered in a public register (ARES seznamRegistraci). Forces double-entry
   * even for a natural person (§1 odst. 2 písm. a) ZoÚ).
   */
  inPublicRegister: boolean
}

export type RegimeDerivation =
  | { readonly resolved: Regime; readonly forced: boolean }
  | { readonly ambiguous: true; readonly allowed: readonly Regime[] }

/**
 * Derive the regime. Returns `{resolved}` when deterministic, `{ambiguous}` when
 * the caller must choose. `explicit` (a user/agent choice) is validated against
 * the allowed set and any forcing rule.
 */
export function deriveRegime(
  facts: LegalFormFacts,
  explicit?: Regime,
): RegimeDerivation {
  const forcedDoubleEntry = facts.mandatoryDoubleEntry || facts.inPublicRegister

  if (forcedDoubleEntry) {
    if (explicit && explicit !== "DOUBLE_ENTRY") {
      throw new ScaffoldValidationError(
        "this legal form / public-register status requires double-entry bookkeeping",
        "REGIME_CONFLICT",
      )
    }
    return { resolved: "DOUBLE_ENTRY", forced: true }
  }

  if (explicit) {
    assertRegimeAllowed(explicit, facts.allowedRegimes)
    return { resolved: explicit, forced: false }
  }

  if (facts.allowedRegimes.length === 1) {
    return { resolved: facts.allowedRegimes[0]!, forced: true }
  }

  return { ambiguous: true, allowed: facts.allowedRegimes }
}

export function assertRegimeAllowed(
  regime: Regime,
  allowed: readonly Regime[],
): void {
  if (!allowed.includes(regime)) {
    throw new ScaffoldValidationError(
      `regime ${regime} is not permitted for this legal form`,
      "REGIME_NOT_ALLOWED",
    )
  }
}

/**
 * §1f ZoÚ — a VAT payer may NOT keep jednoduché účetnictví (single-entry).
 * IDENTIFIED_PERSON is not a "plátce" for this bar, so only PAYER is blocked.
 */
export function assertRegimeVatCompatible(
  regime: Regime,
  vatRegime: VatRegime,
): void {
  if (regime === "SINGLE_ENTRY" && vatRegime === "PAYER") {
    throw new ScaffoldValidationError(
      "a VAT payer cannot keep single-entry bookkeeping (§1f ZoÚ)",
      "SINGLE_ENTRY_VAT_PAYER",
    )
  }
}

/** A caller-fixable problem with the scaffold input (maps to 422 on the API). */
export class ScaffoldValidationError extends Error {
  constructor(
    message: string,
    readonly code: ScaffoldErrorCode,
  ) {
    super(message)
    this.name = "ScaffoldValidationError"
  }
}

export type ScaffoldErrorCode =
  | "REGIME_AMBIGUOUS"
  | "REGIME_NOT_ALLOWED"
  | "REGIME_CONFLICT"
  | "SINGLE_ENTRY_VAT_PAYER"
  | "NONPROFIT_DOUBLE_ENTRY_UNSUPPORTED"
  | "MISSING_PERIOD_START"
  | "VAT_PAYER_REQUIRES_DIC"
  | "INVALID_FISCAL_YEAR_START"
  | "OSS_REQUIRES_VAT_REGISTRATION"

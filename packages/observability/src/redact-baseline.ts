/**
 * Single source-of-truth redaction baseline.
 *
 * Every observability surface (pino logs in `@workspace/observability/logger`,
 * `tool_call_log.input_json` + `output_json` redactor in `@workspace/db/audit/redact`)
 * imports from this constant. Drift is now a build / test failure, not a
 * docblock claim.
 *
 * Tiered rationale:
 *
 *   Tier 1 (auth + token surface): always redact
 *     password, token, secret, api_key, req.headers.authorization,
 *     req.headers.cookie, req.headers["set-cookie"]
 *
 *   Tier 2 (Czech + EU PII coverage): always redact
 *     email, phone, dic, rodne_cislo, iban, bic, swift, bank_account,
 *     bank_account_number
 *
 * Tier 3 (`session_id` / `sessionId`) is intentionally NOT in the baseline.
 * It is added only on the `tool_call_log` redactor in `@workspace/db/audit/redact`,
 * not in pino. The 30-day pino window keeps it readable for engineers; the
 * 10-year audit log does not retain it.
 *
 * Tier 4 (`organization_id`, `user_id`) is intentionally NEVER redacted.
 * These are server-injected tenancy fields that engineers + auditors need
 * to correlate events.
 *
 * Path syntax matches both pino's `redact.paths` glob AND the simple walker
 * in `@workspace/db/audit/redact#applyRedactions`. `*.field` means "any object
 * property named `field` at any depth"; `req.headers.x` means an exact
 * top-down walk.
 */
export const BASELINE_REDACT_PATHS: readonly string[] = Object.freeze([
  // Tier 1: auth + token
  "*.password",
  "*.token",
  "*.secret",
  "*.api_key",
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["set-cookie"]',

  // Tier 2: Czech + EU PII (snake_case, primary)
  "*.email",
  "*.phone",
  "*.dic",
  "*.rodne_cislo",
  "*.iban",
  "*.bic",
  "*.swift",
  "*.bank_account",
  "*.bank_account_number",

  // Tier 2: camelCase variants. Snake_case stays primary because tool schemas
  // enforce it, but pino captures req frames from Better Auth and Next.js
  // Action arguments where camelCase is idiomatic.
  "*.bankAccount",
  "*.bankAccountNumber",
  "*.rodneCislo",
  "*.phoneNumber",
])

/**
 * Backwards-compatible alias for the prior export name.
 */
export const BASELINE_PINO_REDACT_PATHS = BASELINE_REDACT_PATHS

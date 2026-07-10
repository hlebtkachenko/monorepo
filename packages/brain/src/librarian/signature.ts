// The M2.2 librarian's cluster key — the same 4 facts a booking treatment is decided on.
//
// Mirrors two things already on `main`/nearby (not imported from either, to keep this package's
// accounting-free boundary intact — see packages/brain/CLAUDE.md: "the Brain never imports
// @workspace/accounting"):
//   - `packages/accounting/src/classify.ts` `SupplyKind` / `VatJurisdiction` (landed, drives
//     `classifyEvent`'s předkontace scenario decision).
//   - The unmerged `feat/brain-booking-templates` (#643, M2.1) `BookingSignature` shape
//     (`counterpartyKey` + `direction` + `supplyKind` + `jurisdiction`).
// Locally redeclared as Brain-owned string unions (same pattern as `types.ts`'s
// `BRAIN_RUN_STATUSES`), so this module has zero dependency on `@workspace/accounting` or on
// #643's branch-only types. Follow-up: once #643 merges, reconcile these two vocabularies (or
// import the real type) — tracked, not silently forked.

export const CORRECTION_SUPPLY_KINDS = [
  "GOODS",
  "MATERIAL",
  "SERVICES",
  "UTILITY",
  "RENT",
  "INSURANCE",
  "ASSET",
  "ADVANCE",
  "CREDIT_NOTE",
  "OTHER",
] as const
export type CorrectionSupplyKind = (typeof CORRECTION_SUPPLY_KINDS)[number]

export const CORRECTION_JURISDICTIONS = [
  "DOMESTIC",
  "REVERSE_CHARGE",
  "EU",
  "IMPORT",
  "EXEMPT",
  "OUTSIDE_VAT",
] as const
export type CorrectionJurisdiction = (typeof CORRECTION_JURISDICTIONS)[number]

export const CORRECTION_DIRECTIONS = ["RECEIVED", "ISSUED"] as const
export type CorrectionDirection = (typeof CORRECTION_DIRECTIONS)[number]

/** The 4-fact cluster key: same counterparty + direction + supply kind + jurisdiction ⇒ same
 * booking treatment should apply (this is exactly what a `booking_template` match keys on). */
export interface CorrectionSignature {
  counterpartyKey: string
  direction: CorrectionDirection
  supplyKind: CorrectionSupplyKind
  jurisdiction: CorrectionJurisdiction
}

function isCorrectionDirection(value: unknown): value is CorrectionDirection {
  return (
    typeof value === "string" &&
    (CORRECTION_DIRECTIONS as readonly string[]).includes(value)
  )
}

function isCorrectionSupplyKind(value: unknown): value is CorrectionSupplyKind {
  return (
    typeof value === "string" &&
    (CORRECTION_SUPPLY_KINDS as readonly string[]).includes(value)
  )
}

function isCorrectionJurisdiction(
  value: unknown,
): value is CorrectionJurisdiction {
  return (
    typeof value === "string" &&
    (CORRECTION_JURISDICTIONS as readonly string[]).includes(value)
  )
}

/**
 * Read the 4 signature facts off an untrusted object (e.g. a tool_call_log `input_json`). Fail
 * closed: ANY missing or mistyped field returns `null` rather than guessing/defaulting — a
 * correction whose signature can't be read cannot be clustered or distilled.
 */
export function readCorrectionSignature(
  input: Record<string, unknown>,
): CorrectionSignature | null {
  const { counterpartyKey, direction, supplyKind, jurisdiction } = input
  if (typeof counterpartyKey !== "string" || counterpartyKey.length === 0)
    return null
  if (!isCorrectionDirection(direction)) return null
  if (!isCorrectionSupplyKind(supplyKind)) return null
  if (!isCorrectionJurisdiction(jurisdiction)) return null
  return { counterpartyKey, direction, supplyKind, jurisdiction }
}

/** Collision-safe cluster key (same JSON-tuple trick as `eval/metric.ts`'s `bookingKey` — no
 * delimiter can forge a match across differently-shaped fields). */
export function signatureKey(signature: CorrectionSignature): string {
  return JSON.stringify([
    signature.counterpartyKey,
    signature.direction,
    signature.supplyKind,
    signature.jurisdiction,
  ])
}

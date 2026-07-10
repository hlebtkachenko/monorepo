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

/**
 * The cluster key: same counterparty + direction + supply kind + jurisdiction — plus the Czech-VAT
 * sub-facts that a booking treatment ALSO turns on — ⇒ same booking treatment should apply (this is
 * exactly what a `booking_template` match keys on).
 *
 * The 4 base facts alone over-cluster: two corrections that share them but differ in a decisive
 * sub-fact would collapse into one cluster and distill a rule that is wrong for one of them. The
 * optional sub-facts below split those sub-cases apart:
 *   - `commodityCode` — §92 kód předmětu plnění (the commodity a DOMESTIC reverse-charge supply
 *     reports on kontrolní hlášení A.1/B.1: "1" zlato / "3" nemovitost / "4" stavební-montážní /
 *     "5" příloha 5). Distinct §92 codes book/report distinctly; already persisted as
 *     `partial_record.commodity_code` (`packages/accounting/src/capture.ts`).
 *   - `isAdvance` — §37a advance discriminator. True when the correction sits in an advance flow:
 *     an advance-payment capture (`supplyKind === "ADVANCE"`) OR a §37a final-settlement document
 *     (`advanceSettlement === true`, the daňový doklad k záloze). Deriving from `supplyKind` ALONE
 *     would be redundant (supplyKind is already a base fact); OR-ing in the settlement flag is what
 *     actually separates a §37a settlement doc (books via zálohové účty to net the advance) from a
 *     plain invoice that shares the other four facts.
 *
 * Both are OPTIONAL/nullable so a correction lacking them still keys (as `null` / `false`).
 *
 * CROSS-PR LOCKSTEP: the real `BookingSignature` in #643
 * (`packages/db/src/schema/booking_template.ts`) keys on the SAME four base facts. It MUST gain the
 * SAME `commodityCode` + advance sub-facts before the booking-template matcher activates, or a
 * distilled rule and the matcher would disagree on what counts as "the same case". That edit lives
 * in #643 and is NOT made here (this branch keeps its `@workspace/accounting`-free boundary).
 */
export interface CorrectionSignature {
  counterpartyKey: string
  direction: CorrectionDirection
  supplyKind: CorrectionSupplyKind
  jurisdiction: CorrectionJurisdiction
  /** §92 kód předmětu plnění; `null` when the supply is not a domestic §92 PDP row. */
  commodityCode?: string | null
  /** §37a advance flow (advance capture or final-settlement doc); `false` otherwise. */
  isAdvance?: boolean
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
 * Read the signature facts off an untrusted object (e.g. a tool_call_log `input_json`). Fail closed
 * on the four REQUIRED base facts: ANY missing or mistyped one returns `null` rather than
 * guessing/defaulting — a correction whose base signature can't be read cannot be clustered or
 * distilled. The optional sub-facts never fail the read: an absent/mistyped `commodityCode` reads as
 * `null`, and `isAdvance` is always a definite boolean.
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
  const commodityCode =
    typeof input.commodityCode === "string" ? input.commodityCode : null
  const isAdvance = supplyKind === "ADVANCE" || input.advanceSettlement === true
  return {
    counterpartyKey,
    direction,
    supplyKind,
    jurisdiction,
    commodityCode,
    isAdvance,
  }
}

/** Collision-safe cluster key (same JSON-tuple trick as `eval/metric.ts`'s `bookingKey` — no
 * delimiter can forge a match across differently-shaped fields). The two sub-facts are appended with
 * explicit `null` / `false` defaults so a signature built without them keys identically to one that
 * read them as absent. */
export function signatureKey(signature: CorrectionSignature): string {
  return JSON.stringify([
    signature.counterpartyKey,
    signature.direction,
    signature.supplyKind,
    signature.jurisdiction,
    signature.commodityCode ?? null,
    signature.isAdvance ?? false,
  ])
}

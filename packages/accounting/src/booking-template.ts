/**
 * Booking-template match (M2.1) — pure decision layer over a workspace's
 * CONFIRMED `booking_template` rows (migration 0054).
 *
 * A `booking_template` is a REVIEWABLE record of a recurring transaction's
 * confirmed accounting treatment: given a COARSE recurring-case signature
 * (counterparty + direction + supply kind + VAT jurisdiction), it stores the
 * `PostingDecision` a human already confirmed for that exact recurring case.
 * This module ONLY decides whether a signature matches an already-confirmed
 * template; it never touches a database and never posts anything.
 *
 * ⚠ The signature is DELIBERATELY COARSER than the full `classifyEvent` input.
 * It is NOT "the four facts classifyEvent keys on": `classifyEvent`
 * (`classify.ts`) takes NO counterparty at all, and additionally keys its
 * decision on `vatRate`, `isCreditNote`, the §92 `commodityCode`, and
 * `serviceWindow`/`periodEnd`/`durable` (deferral + capitalisation) — NONE of
 * which are in the four-field signature. A signature match therefore identifies
 * "the same kind of recurring relationship", NOT "an identical booking".
 *
 * CONSEQUENCE FOR THE FUTURE MATCH-INTEGRATION (see `matchBookingTemplate`):
 * a match may propose the confirmed accounts/scenario, but the amount-driven
 * and document-driven fields — `vatRate`, credit-note sign (`isCreditNote`),
 * §92 `commodityCode`, and any deferral/capitalisation split — MUST be
 * re-derived from the ACTUAL document, NEVER frozen from the template's stored
 * `confirmedDecision`. Freezing them would let a coarse 4-fact match propose a
 * wrong rate / sign / commodity (still HELD today, but a degraded proposal).
 *
 * This is deliberately NOT a write-template (constitution §I9): matching does
 * not render a payload or skip reasoning about WHETHER to book — it only
 * supplies a `PostingDecision`-shaped scaffold (same shape `classifyEvent`
 * produces) for the caller to feed to the identical typed write calls
 * (`create_accounting_event` / `create_accounting_posting`) that still run
 * through the unchanged server-side gate and are still HELD at cold start.
 */

import type { PostingDecision, SupplyKind, VatJurisdiction } from "./classify"

/**
 * The COARSE recurring-case signature a booking template matches on. NOT the
 * full `classifyEvent` input (which takes no counterparty and additionally
 * keys on vatRate / isCreditNote / commodityCode / deferral facts). A match on
 * these four fields identifies the recurring RELATIONSHIP, not an identical
 * booking — see the module header's re-derivation constraint.
 */
export interface BookingSignature {
  /** IČO or normalized counterparty name — mirrors `EconomicEvent`'s counterpart identity. */
  counterpartyKey: string
  direction: "RECEIVED" | "ISSUED"
  supplyKind: SupplyKind
  jurisdiction: VatJurisdiction
}

/**
 * A `booking_template` row projected for matching. `humanConfirmedAt: null`
 * means the template is a DRAFT — never eligible for a match (mirrors
 * `ocr_extraction_template`'s trust gate).
 */
export interface ConfirmedBookingTemplate extends BookingSignature {
  id: string
  /**
   * The confirmed treatment to reapply on a match — a SCAFFOLD, not a frozen
   * payload. ⚠ The amount/document-driven fields (`vatRate`, `commodityCode`,
   * credit-note sign, deferral/capitalisation) MUST be re-derived from the
   * ACTUAL document at match-integration time, never taken verbatim from here
   * (the 4-field signature does not pin them — see the module header).
   */
  confirmedDecision: PostingDecision
  /** ISO timestamp, or null for an unconfirmed draft (never matchable). */
  humanConfirmedAt: string | null
}

/**
 * Find the workspace's CONFIRMED booking template matching `signature`, or
 * `null` if none matches. Pure, deterministic, no I/O — the caller (the API's
 * `match_booking_template` endpoint) supplies the workspace's templates
 * already read under `withWorkspace` (FORCE RLS).
 *
 * Exact-match only (no fuzzy scoring): all four COARSE signature fields must
 * agree, and the template must be confirmed. The DB's partial unique index
 * (`booking_template_confirmed_signature_unique`, migration 0054) guarantees
 * at most one confirmed template per signature per workspace; if more than
 * one candidate somehow reaches this function (a caller not backed by that
 * constraint), the most recently confirmed one wins — deterministic, never
 * "first in array order".
 *
 * ⚠ A returned match is NOT a ready-to-post booking. The caller (future
 * match-integration) MUST re-derive `vatRate` / credit-note sign / §92
 * `commodityCode` / deferral from the ACTUAL document before proposing the
 * write — the four-field signature does not pin those, so a match alone can be
 * the wrong rate/sign/commodity. See the module header.
 */
export function matchBookingTemplate(
  signature: BookingSignature,
  templates: readonly ConfirmedBookingTemplate[],
): ConfirmedBookingTemplate | null {
  const candidates = templates.filter(
    (t) =>
      t.humanConfirmedAt !== null &&
      t.counterpartyKey === signature.counterpartyKey &&
      t.direction === signature.direction &&
      t.supplyKind === signature.supplyKind &&
      t.jurisdiction === signature.jurisdiction,
  )
  if (candidates.length === 0) return null
  return candidates.reduce((latest, t) =>
    (t.humanConfirmedAt as string) > (latest.humanConfirmedAt as string)
      ? t
      : latest,
  )
}

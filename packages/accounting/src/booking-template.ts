/**
 * Booking-template match (M2.1) — pure decision layer over a workspace's
 * CONFIRMED `booking_template` rows (migration 0054).
 *
 * A `booking_template` is a REVIEWABLE record of a recurring transaction's
 * confirmed accounting treatment: given a signature (counterparty + direction
 * + supply kind + VAT jurisdiction — the same four facts `classifyEvent`
 * already keys its scenario decision on), it stores the `PostingDecision` a
 * human already confirmed for that exact recurring case. This module ONLY
 * decides whether a signature matches an already-confirmed template; it never
 * touches a database and never posts anything.
 *
 * This is deliberately NOT a write-template (constitution §I9): matching does
 * not render a payload or skip reasoning about WHETHER to book — it only
 * supplies the SAME `PostingDecision` shape `classifyEvent` would otherwise
 * produce, so the caller can feed it to the identical typed write calls
 * (`create_accounting_event` / `create_accounting_posting`) that still run
 * through the unchanged server-side gate and are still HELD at cold start.
 */

import type { PostingDecision, SupplyKind, VatJurisdiction } from "./classify"

/** The recurring-case signature a booking template matches on. */
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
  /** The confirmed treatment to reapply on a match. */
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
 * Exact-match only (no fuzzy scoring): all four signature fields must agree,
 * and the template must be confirmed. The DB's partial unique index
 * (`booking_template_confirmed_signature_unique`, migration 0054) guarantees
 * at most one confirmed template per signature per workspace; if more than
 * one candidate somehow reaches this function (a caller not backed by that
 * constraint), the most recently confirmed one wins — deterministic, never
 * "first in array order".
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

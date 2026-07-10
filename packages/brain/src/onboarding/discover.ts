// M1.4 — the onboarding discovery predicate: "is this org bookable?"
//
// Before a Brain session can book anything, the target organization needs (a) an OPEN accounting period
// and (b) at least one number series per entity type the Brain's OWN write tools consume: a DOCUMENT series
// for `capture_accounting_document` and an EVENT series for `create_accounting_event` (see
// `packages/shared/src/api/accounting-writes.ts` — `CaptureAccountingDocumentRequestSchema.seriesId` /
// `CreateAccountingEventRequestSchema.seriesId`). `create_accounting_posting` needs neither — it posts
// against an already-created event, never a series directly.
//
// Naming note: this is a DIFFERENT "bookable" than `reconcile/bookable.ts` (control 2 — which IR record
// TYPES the Brain may derive a booking FROM). This module asks whether the ORGANIZATION's accounting
// structure exists yet, not whether a document record is a valid booking source.
//
// PURE: no I/O, no clock, no env reads. Operates on a MINIMAL structural subset of the real
// `AccountingPeriod` / `NumberSeriesRow` API rows (`@workspace/shared/api`), so this package keeps its
// zero-runtime-dependency design (see `package.json` — no `dependencies` block). Any real API response row
// satisfies these interfaces structurally, without this package importing `@workspace/shared`.

/** The four number-series entity types the accounting API recognizes. */
export type NumberSeriesEntityType =
  "EVENT" | "DOCUMENT" | "ASSET" | "INVENTORY_COUNT"

/** The minimal period fields the predicate needs — a real `AccountingPeriod` row satisfies this structurally. */
export interface PeriodLike {
  status: "OPEN" | "CLOSED"
}

/** The minimal series fields the predicate needs — a real `NumberSeriesRow` satisfies this structurally. */
export interface NumberSeriesLike {
  entityType: NumberSeriesEntityType
}

/**
 * The entity types the Brain's OWN write tools consume — the default "is this org set up for booking"
 * check. `ASSET` / `INVENTORY_COUNT` series exist in the domain but no Brain write tool references one
 * today, so they are not part of the default bookability bar (a caller can still pass a wider list).
 */
export const BOOKING_REQUIRED_SERIES_ENTITY_TYPES = [
  "DOCUMENT",
  "EVENT",
] as const satisfies readonly NumberSeriesEntityType[]

/** The discovered bookability state of one organization. */
export interface BookabilityReport {
  /** true iff there is an OPEN period AND every entity type in `requiredEntityTypes` has ≥1 series. */
  bookable: boolean
  /** true iff `periods` contains at least one `status === "OPEN"` row. */
  hasOpenPeriod: boolean
  /** The entity types this report was evaluated against (echoed for the explanation + the render layer). */
  requiredEntityTypes: readonly NumberSeriesEntityType[]
  /** The subset of `requiredEntityTypes` with ZERO series present. Empty when every required type has one. */
  missingSeriesEntityTypes: NumberSeriesEntityType[]
}

/**
 * Discover whether an organization is bookable from its ALREADY-FETCHED periods + number series (the
 * caller reads these via `GET /v1/accounting/periods` / `GET /v1/accounting/number-series` — this function
 * touches neither the network nor the clock). Reports both gaps at once (a period gap and a series gap can
 * coexist), so a caller can decide what to propose without a second pass.
 */
export function discoverBookability(
  periods: readonly PeriodLike[],
  series: readonly NumberSeriesLike[],
  requiredEntityTypes: readonly NumberSeriesEntityType[] = BOOKING_REQUIRED_SERIES_ENTITY_TYPES,
): BookabilityReport {
  const hasOpenPeriod = periods.some((period) => period.status === "OPEN")
  const presentEntityTypes = new Set(series.map((row) => row.entityType))
  const missingSeriesEntityTypes = requiredEntityTypes.filter(
    (entityType) => !presentEntityTypes.has(entityType),
  )
  return {
    bookable: hasOpenPeriod && missingSeriesEntityTypes.length === 0,
    hasOpenPeriod,
    requiredEntityTypes,
    missingSeriesEntityTypes,
  }
}

/**
 * A deterministic, natural-language explanation of a bookability report — written for a human operator (or
 * to be echoed verbatim in a future conversational session), never a model's own judgment. PURE: a function
 * of the report only.
 */
export function explainBookability(report: BookabilityReport): string {
  if (report.bookable) {
    return (
      "This organization is bookable: it has an OPEN accounting period and a number series for " +
      `every required entity type (${report.requiredEntityTypes.join(", ")}).`
    )
  }
  const problems: string[] = []
  if (!report.hasOpenPeriod) {
    problems.push("it has no OPEN accounting period")
  }
  if (report.missingSeriesEntityTypes.length > 0) {
    problems.push(
      `it is missing a number series for: ${report.missingSeriesEntityTypes.join(", ")}`,
    )
  }
  return `This organization is NOT bookable yet — ${problems.join("; and ")}.`
}

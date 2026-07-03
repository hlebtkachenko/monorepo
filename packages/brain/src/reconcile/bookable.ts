// Control 2 (untrusted-prior-book design, 2026-07-01): a GLEntry is NEVER a booking source.
//
// The Brain authors documents from PRIMARY facts (invoices, bank lines, cash vouchers) and re-derives
// every posting itself. A prior accountant's journal row (`GLEntry`) is import/reconcile-only — a
// cross-check HINT that can fire `multi_source_conflict`, never the thing a booking is derived from.
// An `Attachment` is a blob (PDF/OCR text), not an economic fact, so it is not a booking source either.
//
// This module is the compile-time + runtime seam that enforces it. When the Brain binds to the
// accounting write endpoint (#395), the write-proposal builder takes a `BookableRecord` — so a `GLEntry`
// structurally cannot reach it. `scripts/brain-build/constitution-checks/check.sh` asserts the whitelist
// below never grows a non-primary member.

import type { IrRecord } from "../ir/records"
import type { IrRecordType } from "../ir/provenance"

/** Record types the Brain may derive a booking FROM — the primary economic facts only. */
export const BOOKABLE_IR_RECORD_TYPES = [
  "invoice",
  "bank_transaction",
  "cash_document",
] as const satisfies readonly IrRecordType[]

/** The bookable-source record types — `gl_entry` and `attachment` are excluded by construction. */
export type BookableRecordType = (typeof BOOKABLE_IR_RECORD_TYPES)[number]

/**
 * A record the Brain may book from. DERIVED from the whitelist — exactly the `IrRecord` members whose
 * discriminant is in `BOOKABLE_IR_RECORD_TYPES` — so the type and the runtime array cannot drift: a
 * `gl_entry` added to the array would (correctly) pull `GLEntry` into the type. The array is the single
 * source of truth; `GLEntry` / `Attachment` are excluded because their discriminant is not in it.
 */
export type BookableRecord = Extract<
  IrRecord,
  { record_type: BookableRecordType }
>

const BOOKABLE_SET: ReadonlySet<string> = new Set(BOOKABLE_IR_RECORD_TYPES)

/** True iff the record is a primary fact the Brain may derive a booking from (never a GLEntry). */
export function isBookableSource(record: IrRecord): record is BookableRecord {
  return BOOKABLE_SET.has(record.record_type)
}

/**
 * Runtime guard for the booking seam — throws if a non-primary record (a `GLEntry` cross-check row or an
 * `Attachment` blob) reaches a code path that derives a booking. Defense-in-depth behind the compile-time
 * `BookableRecord` type, for boundaries where the record arrives as a runtime `IrRecord` (parsed JSON).
 */
export function assertBookableSource(
  record: IrRecord,
): asserts record is BookableRecord {
  if (!isBookableSource(record)) {
    throw new Error(
      `not a bookable source: ${record.record_type} is import/reconcile-only, never a booking source (control 2)`,
    )
  }
}

// Canonical IR — the provenance envelope every IR record carries (WP-0.5, read-side only).
//
// The IR is the Brain's WORKING MEMORY: source bytes → deterministic parser → canonical IR (+ this
// envelope) → dedup → agent judgment. It NEVER goes straight to the DB (brief §3). Every record carries
// where it came from, a content hash for dedupe/idempotency, and an extraction confidence so the
// learning loop can reason about trust. Brain-owned + accounting-free — no Track-A import.

/** The source format an IR record was parsed from. */
export type IrSource =
  | "money_s3"
  | "pohoda"
  | "gpc"
  | "camt053"
  | "fio"
  | "pdf"
  | "csv"
  | "isdoc"

export const IR_SOURCES = [
  "money_s3",
  "pohoda",
  "gpc",
  "camt053",
  "fio",
  "pdf",
  "csv",
  "isdoc",
] as const satisfies readonly IrSource[]

/** Discriminant for the top-level IR record union (records that carry a provenance envelope). */
export type IrRecordType =
  | "invoice"
  | "bank_transaction"
  | "cash_document"
  | "gl_entry"
  | "attachment"

export const IR_RECORD_TYPES = [
  "invoice",
  "bank_transaction",
  "cash_document",
  "gl_entry",
  "attachment",
] as const satisfies readonly IrRecordType[]

/**
 * Common envelope on every top-level IR record.
 *
 * Money note: IR money fields are `bigint` MINOR UNITS paired with the record's `currency` (ISO 4217) —
 * never a native `number`/float (brief: "minor-unit integers + currency"). The branded `Money<Currency>`
 * is applied only at the WRITE boundary (WP-0.6, when the Brain binds to `@workspace/accounting`); the
 * read-side IR stays dependency-free.
 */
export interface ProvenanceEnvelope {
  /** Brain-assigned uuid, stable across re-ingest of the same source row. */
  ir_id: string
  /** Which company this belongs to (resolved from the dump folder / IČO). */
  org_ref: string
  source: IrSource
  /** File path + record locator (XML xpath, GPC line no, CSV row, PDF page). */
  source_locator: string
  /** Content hash of the raw record, for dedupe + idempotency. */
  source_hash: string
  /** ISO-8601 timestamp. */
  ingested_at: string
  /** Per-record extraction confidence, 0..1 (1 for structured, <1 for PDF/CSV). */
  confidence: number
  /** True when any required field was inferred or fell below threshold. */
  needs_review: boolean
  /** The original parsed record, kept verbatim for audit + re-mapping. */
  raw: unknown
}

export function isIrSource(value: unknown): value is IrSource {
  return (
    typeof value === "string" &&
    (IR_SOURCES as readonly string[]).includes(value)
  )
}

export function isIrRecordType(value: unknown): value is IrRecordType {
  return (
    typeof value === "string" &&
    (IR_RECORD_TYPES as readonly string[]).includes(value)
  )
}

// Canonical IR — the provenance envelope every IR record carries (WP-0.5, read-side only).
//
// The IR is the Brain's WORKING MEMORY: source bytes → deterministic parser → canonical IR (+ this
// envelope) → dedup → agent judgment. It NEVER goes straight to the DB (brief §3). Every record carries
// where it came from, a content hash for dedupe/idempotency, and an extraction confidence so the
// learning loop can reason about trust. Brain-owned + accounting-free — no Track-A import.

/**
 * The source format an IR record was parsed from. `pohoda_xml` = Pohoda's documented dataPack export
 * (parseable); `pohoda_db` = the native Zálohа backup (.mdb/proprietary ZIP) — provenance ONLY, the
 * intake layer DETECTS it and requires a dataPack XML re-export rather than parsing the brittle binary
 * (a confident-mis-parse factory). `xlsx` = Excel (bank exports, ad-hoc ledgers, prior-book dumps).
 */
export type IrSource =
  | "money_s3"
  | "pohoda_xml"
  | "pohoda_db"
  | "gpc"
  | "camt053"
  | "fio"
  | "pdf"
  | "csv"
  | "isdoc"
  | "xlsx"

export const IR_SOURCES = [
  "money_s3",
  "pohoda_xml",
  "pohoda_db",
  "gpc",
  "camt053",
  "fio",
  "pdf",
  "csv",
  "isdoc",
  "xlsx",
] as const satisfies readonly IrSource[]

/**
 * Trust class of a record as INPUT to booking (WP-IR, 2026-07-01 — the untrusted prior-book model).
 *  - "primary": an underlying fact (invoice, bank line, receipt) — the Brain books FROM these.
 *  - "untrusted_prior": a previous accountant's already-booked result. A HINT only: the Brain re-derives
 *    from primary facts, flags any disagreement to the human, and NEVER inherits the prior classification
 *    or books from it. A prior-book disagreement fires `multi_source_conflict` (caps below green → HITL).
 */
export type SourceTrust = "primary" | "untrusted_prior"

export const SOURCE_TRUSTS = [
  "primary",
  "untrusted_prior",
] as const satisfies readonly SourceTrust[]

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
  /** Hash of the RAW record bytes, for exact-duplicate idempotency (same bytes re-ingested). */
  source_hash: string
  /**
   * Semantic dedup key — a stable hash over the ECONOMIC IDENTITY of the event (e.g. supplier tax id +
   * document number + tax-point + total + currency), so the SAME event parsed from different formats (a
   * PDF invoice + its Money export) collapses to ONE. Distinct from `source_hash` (raw bytes). Absent when
   * the record lacks the identity inputs — e.g. a bare `GLEntry` has no document number, which is exactly
   * why a prior-book journal row does NOT silently collide with its source document (dedup FM2).
   */
  content_hash?: string
  /** Trust class as INPUT to booking; absent ⇒ "primary". See `SourceTrust`. */
  source_trust?: SourceTrust
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

/** True iff the record is an untrusted prior booking (a hint, never a booking source). */
export function isUntrustedPrior(envelope: {
  source_trust?: SourceTrust
}): boolean {
  return envelope.source_trust === "untrusted_prior"
}

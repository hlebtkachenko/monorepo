// Canonical IR record types (WP-0.5, read-side only). Shapes from research/02 §"Canonical IR".
// Every source format (Money S3, Pohoda, GPC/CAMT/Fio, PDF, CSV, ISDOC) maps INTO these; the target
// mapper reads ONLY these. Money = bigint minor units + the record's `currency` (see ProvenanceEnvelope).

import type { ProvenanceEnvelope } from "./provenance"

// ── Embedded value types (no envelope) ──────────────────────────────────────

export interface Address {
  street?: string
  city?: string
  zip?: string
  country?: string
}

export interface BankAccount {
  account?: string
  bank_code?: string
  iban?: string
  bic?: string
}

/** Deduplicated across all sources by IČO → account → normalized name. */
export interface Counterparty {
  name: string
  /** Digits only; primary match key. */
  ico?: string
  /** With country prefix; presence ⇒ VAT payer. */
  dic?: string
  is_vat_payer?: boolean
  address?: Address
  bank_accounts?: BankAccount[]
  /** Natural person, no IČO. */
  is_individual?: boolean
}

/** Per-rate VAT summary line — recomputed, not trusted from the source. */
export interface VatSummaryRow {
  rate: number
  base_minor: bigint
  tax_minor: bigint
}

export interface InvoiceLine {
  description: string
  quantity?: number
  unit?: string
  unit_price_minor?: bigint
  vat_rate?: number
  /** PDP / reverse-charge code, when the line is reverse-charged. */
  reverse_charge_code?: string
}

/** Foreign→CZK fx rate, with the reference unit count (e.g. 1 or 100). */
export interface FxRate {
  rate: number
  ref_units: number
}

// ── Enums ───────────────────────────────────────────────────────────────────

export type InvoiceDirection = "received" | "issued"

export type InvoiceDocType =
  | "invoice"
  | "credit_note"
  | "debit_note"
  | "proforma"
  | "advance"
  | "simplified"
  | "corrective"

export type PaymentMethod = "cash" | "transfer" | "card" | "other"

export type BankDirection = "credit" | "debit"

export type CashDirection = "income" | "expense"

export type AttachmentKind = "invoice_pdf" | "receipt" | "contract" | "unknown"

// ── Top-level IR records (each carries the provenance envelope) ──────────────

/** ISDOC-shaped; covers přijatá/vydaná, dobropis, proforma, advance. */
export interface Invoice extends ProvenanceEnvelope {
  record_type: "invoice"
  direction: InvoiceDirection
  doc_type: InvoiceDocType
  /** Original document number (may contain `/`). */
  number: string
  /** ISO date YYYY-MM-DD. */
  issue_date: string
  /** Plnění; defaults to issue_date if absent. */
  tax_point_date?: string
  due_date?: string
  supplier?: Counterparty
  customer?: Counterparty
  /** ISO 4217. */
  currency: string
  fx_rate?: FxRate
  lines: InvoiceLine[]
  vat_summary: VatSummaryRow[]
  total_minor: bigint
  payment_method?: PaymentMethod
  /** Digits only. */
  variable_symbol?: string
  constant_symbol?: string
  specific_symbol?: string
  /** Source předkontace / accounting ids (Money `PredKontac`, Pohoda accounting ids). */
  posting_hint?: string
  cost_center?: string
  project?: string
  activity?: string
  attachments?: Attachment[]
}

/** One GPC `075` row / one CAMT `Ntry` / one Fio transaction. */
export interface BankTransaction extends ProvenanceEnvelope {
  record_type: "bank_transaction"
  account: BankAccount
  booking_date: string
  value_date?: string
  /** Signed: + credit (in), − debit (out). */
  amount_minor: bigint
  /** From CAMT/Fio; inferred from account for GPC. */
  currency: string
  direction: BankDirection
  counterparty?: { account?: string; bank_code?: string; name?: string }
  variable_symbol?: string
  constant_symbol?: string
  specific_symbol?: string
  /** Zpráva pro příjemce / RmtInf/Ustrd / GPC free text. */
  message?: string
  /** CAMT BkTxCd / Fio type / GPC posting code. */
  bank_tx_code?: string
  statement_id?: string
  bank_transaction_id?: string
}

/** Pokladní doklad / voucher. */
export interface CashDocument extends ProvenanceEnvelope {
  record_type: "cash_document"
  direction: CashDirection
  number: string
  date: string
  amount_minor: bigint
  currency: string
  counterparty?: Counterparty
  /** Links to a paired Invoice. */
  variable_symbol?: string
  vat_summary?: VatSummaryRow[]
  posting_hint?: string
  /** Which pokladna. */
  cash_register?: string
}

/**
 * Journal row — IMPORT / RECONCILIATION ONLY. The Brain authors documents, not journal rows (mirrors
 * Money's read-only journal); a source GLEntry is used to cross-check that derived postings match what
 * the old system produced.
 */
export interface GLEntry extends ProvenanceEnvelope {
  record_type: "gl_entry"
  date: string
  /** Synthetic účet MD. */
  debit_account: string
  /** Synthetic účet DAL. */
  credit_account: string
  amount_minor: bigint
  description: string
  document_ref?: string
  cost_center?: string
  project?: string
}

/** The binary / the loose file. */
export interface Attachment extends ProvenanceEnvelope {
  record_type: "attachment"
  kind: AttachmentKind
  mime: string
  /** Content-addressed storage key. */
  stored_blob_ref: string
  /** OCR / text layer. */
  extracted_text?: string
  /** The Invoice/Bank/Cash record it belongs to (absent ⇒ loose). */
  linked_ir_id?: string
  /** How sure we are about the link, 0..1. */
  link_confidence: number
}

/** The discriminated union of every top-level IR record. */
export type IrRecord =
  | Invoice
  | BankTransaction
  | CashDocument
  | GLEntry
  | Attachment

// ── Type guards (discriminated by `record_type`) ────────────────────────────

export function isInvoice(record: IrRecord): record is Invoice {
  return record.record_type === "invoice"
}

export function isBankTransaction(record: IrRecord): record is BankTransaction {
  return record.record_type === "bank_transaction"
}

export function isCashDocument(record: IrRecord): record is CashDocument {
  return record.record_type === "cash_document"
}

export function isGLEntry(record: IrRecord): record is GLEntry {
  return record.record_type === "gl_entry"
}

export function isAttachment(record: IrRecord): record is Attachment {
  return record.record_type === "attachment"
}

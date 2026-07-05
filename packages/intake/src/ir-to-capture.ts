// IR → capture adapter. PURE: an IR Invoice / CashDocument + a harness-supplied context → a
// CaptureAccountingDocumentRequest that PASSES CaptureAccountingDocumentRequestSchema.parse. No I/O.
//
// The Brain is an unprivileged HTTP/MCP client: it binds to the accounting API CONTRACT
// (@workspace/shared), NEVER to @workspace/accounting internals. This adapter maps the read-side IR into
// the write request the server gates; it fabricates NOTHING the server cannot re-verify.
//
// Money: haléř (bigint minor units) → decimal string via `minorToDecimal` (single-source string math,
// never BigInt(Number())). VAT: `baseAmount`/`vatAmount` come ONLY from the source-extracted IR
// `vat_summary` (`base_minor` / `tax_minor`). We NEVER compute `base * rate` — that would make the
// server's `vat_mismatch` veto verify the adapter against itself. A summary row always carries `tax_minor`
// (parsers set 0n for a genuine zero), so `vatAmount` is the source tax verbatim; the server holds any
// row whose tax is inconsistent with base*rate via `vat_mismatch`.
//
// SCOPE (v1): the STANDARD domestic case only. Reverse-charge / EXEMPT / IMPORT classification is
// `classifyAccountingEvent`'s job on the server — this adapter never fabricates a special regime. And it
// NEVER emits a STANDARD partial with a null/absent OR non-positive rate ([G3-B1] + the 0-rate mislabel
// vector): a partial WITHOUT a positive rate (a cash document with no VAT breakdown, or a summary row whose
// rate is 0 — which could be a genuine 0% supply OR a flattened EXEMPT one) is emitted as OUTSIDE_VAT so the
// server's `unverified_vat_regime` hold routes it to human review instead of auto-applying a guessed regime.
//
// Tenancy ([G2-Opus]): the produced object carries NO organization_id / user_id / workspace_id / role —
// those are server-injected from the API-key principal. This module emits only @workspace/shared request
// DTOs and never imports @workspace/accounting.

import type { CaptureAccountingDocumentRequest } from "@workspace/shared/api"
import { minorToDecimal } from "@workspace/brain/confidence"
import type {
  BankTransaction,
  CashDocument,
  Invoice,
  VatSummaryRow,
} from "@workspace/brain"

/**
 * Harness-supplied context. The uuids the contract requires — `periodId`, `seriesId`, and each line's
 * `eventId` — are NOT derivable from the IR (they name tenant-side rows the Brain discovers via read
 * tools), so they come in here alongside the server-gate envelope (`confidence` / `rationale` /
 * optional `conversationId`). NOT tenant data: no organization_id / user_id / workspace_id / role.
 */
export interface IrToCaptureContext {
  /** Účetní období uuid (from getStructure / listAccountingNumberSeries). */
  periodId: string
  /** DOCUMENT number-series uuid (from listAccountingNumberSeries). */
  seriesId: string
  /** Accounting-event uuid this document's single line hangs off of. */
  eventId: string
  /** Agent confidence [0,1] — the server-gate scalar (NECESSARY, not sufficient). */
  confidence: number
  /** Why this write — persisted to the audit trail. */
  rationale: string
  /** Optional audit-correlation id of the driving conversation. */
  conversationId?: string
}

/** A CaptureAccountingDocumentRequest partial (line-item). Derived, not re-imported, to avoid a public export dep. */
type CapturePartial =
  CaptureAccountingDocumentRequest["lines"][number]["partials"][number]

/**
 * Map one IR VAT-summary row to a capture partial. `sign` (+1 / -1) flips base + tax for a credit note.
 * `baseAmount` and `vatAmount` come STRAIGHT from the source (`base_minor` / `tax_minor`); never `base *
 * rate`. A row always carries a numeric `rate`, so this is always a valid STANDARD partial.
 */
function partialFromVatRow(
  row: VatSummaryRow,
  currencyCode: string,
  sign: 1n | -1n,
): CapturePartial {
  // A non-positive rate (0% / missing) is NOT an unambiguous STANDARD supply: a 0% row could be a genuine
  // zero-rated domestic supply OR an EXEMPT / osvobozeno supply the extractor flattened to 0% — and the
  // server veto passes a STANDARD 0% partial (rate 0, no vatAmount) straight through. The adapter does not
  // guess the regime: it routes a non-positive-rate row to the OUTSIDE_VAT hold so `classifyAccountingEvent`
  // decides and the server holds it, rather than asserting STANDARD 0%. `!(rate > 0)` (not `rate <= 0`) is
  // deliberate: it also routes a NaN rate to the hold (`NaN > 0` is false), failing safe on a bad extraction.
  if (!(row.rate > 0)) {
    return partialWithoutRate(row.base_minor * sign, currencyCode)
  }
  // [G1-F4] `vatAmount` comes STRAIGHT from the source tax field (`tax_minor`), NEVER `base * rate` — a
  // synthesized VAT would make the server's `vat_mismatch` check verify the adapter against itself. A
  // VatSummaryRow always carries `tax_minor` (parsers set 0n for a genuine zero, they never drop it), so
  // there is no "tax absent" case to defend here; a rate>0 row whose tax does not match base*rate is left
  // as-is and the server holds it via `vat_mismatch`.
  return {
    baseAmount: minorToDecimal(row.base_minor * sign),
    vatMode: "STANDARD",
    vatRate: String(row.rate),
    vatAmount: minorToDecimal(row.tax_minor * sign),
    vatJurisdiction: "DOMESTIC",
    currencyCode,
  }
}

/**
 * A partial with NO VAT rate ([G3-B1] safe representation). We do NOT classify it STANDARD (a STANDARD +
 * null rate slips the server veto and auto-applies). We emit OUTSIDE_VAT so `deriveCaptureVeto` fires
 * `unverified_vat_regime` and routes it to human review — classification is the server's job.
 */
function partialWithoutRate(
  baseMinor: bigint,
  currencyCode: string,
): CapturePartial {
  return {
    baseAmount: minorToDecimal(baseMinor),
    vatMode: "OUTSIDE_VAT",
    currencyCode,
  }
}

/**
 * IR Invoice → CaptureAccountingDocumentRequest (STANDARD domestic, v1 scope).
 *
 * Direction maps to the document type (received → RECEIVED_INVOICE, issued → ISSUED_INVOICE). Each
 * `vat_summary` row becomes one partial. A credit note (`doc_type: "credit_note"`) flips the sign of
 * every base + tax (SignedDecimal accepts negatives). All lines hang off the single harness-supplied
 * `eventId`.
 */
export function invoiceToCapture(
  invoice: Invoice,
  ctx: IrToCaptureContext,
): CaptureAccountingDocumentRequest {
  const sign: 1n | -1n = invoice.doc_type === "credit_note" ? -1n : 1n
  const partials: CapturePartial[] = invoice.vat_summary.map((row) =>
    partialFromVatRow(row, invoice.currency, sign),
  )

  return {
    periodId: ctx.periodId,
    seriesId: ctx.seriesId,
    type:
      invoice.direction === "issued" ? "ISSUED_INVOICE" : "RECEIVED_INVOICE",
    issuedAt: invoice.issue_date,
    lines: [
      {
        eventId: ctx.eventId,
        description: invoice.number,
        partials,
      },
    ],
    confidence: ctx.confidence,
    rationale: ctx.rationale,
    ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
  }
}

/**
 * IR CashDocument → CaptureAccountingDocumentRequest (type CASH_DOCUMENT).
 *
 * When the document carries a `vat_summary`, each row becomes a STANDARD partial (as for invoices);
 * `income` maps to a positive base, `expense` to a negative one (SignedDecimal). When there is NO VAT
 * breakdown ([G3-B1]) the whole amount becomes a single rate-less OUTSIDE_VAT partial the server holds —
 * we never guess STANDARD without a rate.
 */
export function cashDocumentToCapture(
  cash: CashDocument,
  ctx: IrToCaptureContext,
): CaptureAccountingDocumentRequest {
  const sign: 1n | -1n = cash.direction === "expense" ? -1n : 1n
  const partials: CapturePartial[] =
    cash.vat_summary && cash.vat_summary.length > 0
      ? cash.vat_summary.map((row) =>
          partialFromVatRow(row, cash.currency, sign),
        )
      : [partialWithoutRate(cash.amount_minor * sign, cash.currency)]

  return {
    periodId: ctx.periodId,
    seriesId: ctx.seriesId,
    type: "CASH_DOCUMENT",
    issuedAt: cash.date,
    lines: [
      {
        eventId: ctx.eventId,
        description: cash.number,
        partials,
      },
    ],
    confidence: ctx.confidence,
    rationale: ctx.rationale,
    ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
  }
}

/**
 * IR BankTransaction → CaptureAccountingDocumentRequest (type BANK_STATEMENT).
 *
 * `amount_minor` is ALREADY SIGNED at the source (+ credit / in, − debit / out) — UNLIKE a CashDocument
 * (magnitude + a separate `direction`). We therefore pass it through with its EXISTING sign and NEVER
 * apply a direction-derived sign: multiplying by `direction` here would double-negate every debit.
 *
 * A bank line carries no VAT breakdown, so the whole (signed) amount becomes a single rate-less
 * OUTSIDE_VAT partial via `partialWithoutRate` — we NEVER fabricate a VAT rate/amount. The server holds
 * it via `unverified_vat_regime`; `classifyAccountingEvent` decides the regime.
 */
export function bankToCapture(
  bank: BankTransaction,
  ctx: IrToCaptureContext,
): CaptureAccountingDocumentRequest {
  // amount_minor is already signed (+ in / − out); pass it through verbatim — no direction sign.
  const partials: CapturePartial[] = [
    partialWithoutRate(bank.amount_minor, bank.currency),
  ]

  return {
    periodId: ctx.periodId,
    seriesId: ctx.seriesId,
    type: "BANK_STATEMENT",
    issuedAt: bank.booking_date,
    lines: [
      {
        eventId: ctx.eventId,
        description: bank.message ?? bank.counterparty?.name ?? undefined,
        partials,
      },
    ],
    confidence: ctx.confidence,
    rationale: ctx.rationale,
    ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
  }
}

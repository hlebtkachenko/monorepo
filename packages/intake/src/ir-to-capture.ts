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
// SUPPLY KIND (#779): the STANDARD partial carries the DOCUMENT-GROUNDED `supplyKind` the extract vision
// model read off the invoice (IR `Invoice.supply_kind`), so the booker picks the cost account from a fact
// rather than failing closed on a null. It is NEVER fabricated here: absent on the IR ⇒ omitted ⇒ persisted
// null ⇒ the booker holds for human review. This adapter is also the single compile-time parity point where
// the Brain-owned `SupplyKind` set is checked against the capture contract's `SUPPLY_KIND` enum.
//
// Tenancy ([G2-Opus]): the produced object carries NO organization_id / user_id / workspace_id / role —
// those are server-injected from the API-key principal. This module emits only @workspace/shared request
// DTOs and never imports @workspace/accounting.

import {
  type CaptureAccountingDocumentRequest,
  type CreateAccountingEventRequest,
  type GateEnvelope,
} from "@workspace/shared/api"
import { minorToDecimal } from "@workspace/brain/confidence"
import type {
  BankTransaction,
  CashDocument,
  Counterparty,
  Invoice,
  SupplyKind,
  VatSummaryRow,
} from "@workspace/brain"

/**
 * The gate-envelope fields every adapter stamps on its capture request — the `confidence` / `rationale` /
 * `conversationId` / `signals` / `templateId` / `extractionMethod` shape. SINGLE-SOURCED from the request
 * DTO's own `GateEnvelope` keyset (defined ONCE in `packages/shared/src/api/accounting-writes.ts`, whose
 * whole purpose is no-drift), so this can never diverge from the contract. See `GATE_ENVELOPE` there for the
 * per-field meaning (`extractionMethod` = the #554 client-declared discriminator; `templateId` = the matched
 * OCR template; `signals` = the #464 evidence envelope). NONE is domain data — the server strips the whole
 * envelope before the domain mutation.
 */
type CaptureGateEnvelope = Pick<
  CaptureAccountingDocumentRequest,
  keyof GateEnvelope
>

/**
 * Harness-supplied context. The uuids the contract requires — `periodId`, `seriesId`, and each line's
 * `eventId` — are NOT derivable from the IR (they name tenant-side rows the Brain discovers via read
 * tools), so they come in here alongside the whole server-gate envelope (`CaptureGateEnvelope`, single-
 * sourced from the request DTO). NOT tenant data: no organization_id / user_id / workspace_id / role.
 */
export interface IrToCaptureContext extends CaptureGateEnvelope {
  /** Účetní období uuid (from getStructure / listAccountingNumberSeries). */
  periodId: string
  /** DOCUMENT number-series uuid (from listAccountingNumberSeries). */
  seriesId: string
  /** Accounting-event uuid this document's single line hangs off of. */
  eventId: string
}

/** A CaptureAccountingDocumentRequest partial (line-item). Derived, not re-imported, to avoid a public export dep. */
type CapturePartial =
  CaptureAccountingDocumentRequest["lines"][number]["partials"][number]

/**
 * Build the server-gate envelope every adapter stamps on its capture — the SINGLE source of truth so the
 * invoice / cash / bank paths can never drift a gate field. `confidence` + `rationale` are always present;
 * every optional field (`conversationId` / `extractionMethod` / `templateId` / `signals`) is emitted ONLY
 * when the context supplied it, so an unset field is omitted, never sent as `undefined`. NONE is domain
 * data — the server strips the whole envelope before the domain mutation.
 */
function gateEnvelope(ctx: IrToCaptureContext): CaptureGateEnvelope {
  return {
    confidence: ctx.confidence,
    rationale: ctx.rationale,
    ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
    ...(ctx.extractionMethod ? { extractionMethod: ctx.extractionMethod } : {}),
    ...(ctx.templateId != null ? { templateId: ctx.templateId } : {}),
    ...(ctx.signals ? { signals: ctx.signals } : {}),
  }
}

/**
 * Map one IR VAT-summary row to a capture partial. `sign` (+1 / -1) flips base + tax for a credit note.
 * `baseAmount` and `vatAmount` come STRAIGHT from the source (`base_minor` / `tax_minor`); never `base *
 * rate`. A row always carries a numeric `rate`, so this is always a valid STANDARD partial.
 *
 * `supplyKind` (#779) is the DOCUMENT-GROUNDED druh plnění the extract model read off the invoice — stamped
 * onto the STANDARD partial so the booker (`bookDocument`) picks the cost account from a real fact instead of
 * failing closed on a null. It is stamped ONLY on a rate-bearing STANDARD partial: a rate-less / OUTSIDE_VAT
 * row (`partialWithoutRate`) is already held for VAT-regime review, so it stays supply-kind-null (the booker
 * holds it too). Absent on the IR ⇒ omitted here ⇒ persisted null ⇒ the booker holds for human review — the
 * fail-closed identity is preserved; a supply kind is NEVER fabricated.
 */
function partialFromVatRow(
  row: VatSummaryRow,
  currencyCode: string,
  sign: 1n | -1n,
  supplyKind?: SupplyKind,
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
    // Document-grounded supply kind (#779): stamped when the IR carried one, omitted otherwise (never
    // fabricated). Assigning the Brain `SupplyKind` here is also the compile-time check that it is a member
    // of the capture contract's `SUPPLY_KIND` enum — see the parity guard in `ir-to-capture.test.ts`.
    ...(supplyKind ? { supplyKind } : {}),
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
  // The document-grounded supply kind (#779) is invoice-level: the extract model emits it ONLY for a
  // single-supply document (omitted when the lines mix kinds), so every rate-bearing partial derived from the
  // vat_summary shares it. A mixed document carries no supply_kind ⇒ null ⇒ the booker holds it.
  const partials: CapturePartial[] = invoice.vat_summary.map((row) =>
    partialFromVatRow(row, invoice.currency, sign, invoice.supply_kind),
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
    ...gateEnvelope(ctx),
  }
}

// ── IR Invoice → accounting EVENT (case) with the supplier/customer identity ─────────────────────────
//
// The counterparty lives on the EVENT (accounting_event.counterparty_id), NOT the capture. The derive
// booker opens the saldokonto obligation against it (openObligation) and fails CLOSED when it is null.
// So to make the loop book against the right partner automatically, the event-create write must carry the
// identity extracted from the source. This adapter maps the IR party (supplier for a received invoice,
// customer for an issued one) into the server's find-or-create `counterparty` identity object.
//
// SAFETY: it fabricates NOTHING the server can't re-verify — every identity field is source-verbatim, and
// a MALFORMED value is OMITTED (never coerced, never synthesized), so the write stays re-verifiable and a
// bad extraction can't poison the approve transaction. A well-formed but mis-OCR'd IČO would resolve to a
// wrong-but-real partner; the mitigation is the write gate — createAccountingEvent HOLDS at cold start, so
// a human eyeballs {name, ico, dic} at /approvals before the event is ever applied. No tenancy keys.

/**
 * The EVENT gate-envelope — SMALLER than the capture's: createAccountingEvent carries only
 * `confidence` / `rationale` / `conversationId` / `signals` (NO `templateId` / `extractionMethod`, which
 * are capture-only OCR-screen fields). Single-sourced from the request DTO so it can never drift.
 */
type EventGateEnvelope = Pick<
  CreateAccountingEventRequest,
  "confidence" | "rationale" | "conversationId" | "signals"
>

/**
 * Harness-supplied context for the EVENT write. `eventSeriesId` is the EVENT-type number series —
 * DISTINCT from the capture's DOCUMENT `seriesId`; passing the document series would corrupt event
 * numbering. NOT tenant data: no organization_id / user_id / workspace_id / role.
 */
export interface IrToEventContext extends EventGateEnvelope {
  /** Účetní období uuid (the same period the capture books into). */
  periodId: string
  /** EVENT number-series uuid (from listAccountingNumberSeries) — NOT the capture's DOCUMENT series. */
  eventSeriesId: string
}

/** The server's find-or-create counterparty identity object (dedup IČO → DIČ → name+country). */
type EventCounterparty = NonNullable<
  CreateAccountingEventRequest["counterparty"]
>

function eventGateEnvelope(ctx: IrToEventContext): EventGateEnvelope {
  return {
    confidence: ctx.confidence,
    rationale: ctx.rationale,
    ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
    ...(ctx.signals ? { signals: ctx.signals } : {}),
  }
}

/**
 * Digits-only IČO in the 1–8 range the request regex (`^\d{1,8}$`) accepts, else `undefined` (dropped).
 * The server left-pads to 8 — so we send clean 1–8 digits or nothing, NEVER a malformed value that would
 * crash the approve-tx CHECK. `> 8` digits is not a valid IČO and is dropped (fall through to DIČ / name).
 */
function eventIco(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const digits = raw.replace(/\D/g, "")
  return digits.length >= 1 && digits.length <= 8 ? digits : undefined
}

/**
 * ISO 3166-1 alpha-2 ONLY (the schema requires `.length(2)`). IR `Address.country` is free-form, so a
 * "Czech Republic" / "Česká republika" is DROPPED — never coerced to "CZ".
 */
function eventCountryCode(country: string | undefined): string | undefined {
  if (!country) return undefined
  const trimmed = country.trim()
  return /^[A-Za-z]{2}$/.test(trimmed) ? trimmed.toUpperCase() : undefined
}

/** THEIR side by direction: issued (FV) → customer, received (FP) → supplier. A swapped side books the
 *  wrong partner AND the wrong saldo leg (311 vs 321). */
function invoiceParty(invoice: Invoice): Counterparty | undefined {
  return invoice.direction === "issued" ? invoice.customer : invoice.supplier
}

/**
 * Build the identity object from the IR party, or `undefined` when there is no usable name — in which case
 * the event is emitted WITHOUT a counterparty (reproducing today's bare event; the command boundary decides
 * whether that is allowed). Never synthesizes an IČO/DIČ; a DIČ over the schema's 20-char cap is dropped.
 */
function eventCounterparty(
  party: Counterparty | undefined,
): EventCounterparty | undefined {
  if (!party?.name) return undefined
  const ico = eventIco(party.ico)
  const dic = party.dic && party.dic.length <= 20 ? party.dic : undefined
  const countryCode = eventCountryCode(party.address?.country)
  return {
    name: party.name,
    ...(ico ? { ico } : {}),
    ...(dic ? { dic } : {}),
    ...(countryCode ? { countryCode } : {}),
  }
}

/**
 * IR Invoice → CreateAccountingEventRequest — the accounting EVENT (case) a capture's lines hang off.
 * Emits the supplier/customer identity so the server finds-or-creates the right counterparty and the
 * derived invoice opens its obligation against that partner. `occurredAt` = the plnění / §11/1e
 * (`tax_point_date`, defaulting to `issue_date` — the capture's `issuedAt` = §11/1d vyhotovení is a
 * DIFFERENT legal date). PURE; emits NO tenancy keys; fabricates nothing the server can't re-verify.
 */
export function invoiceToEvent(
  invoice: Invoice,
  ctx: IrToEventContext,
): CreateAccountingEventRequest {
  const party = invoiceParty(invoice)
  const counterparty = eventCounterparty(party)
  // The source document number already carries its own prefix (e.g. "FP-2025-0042"), so we do NOT prepend
  // a synthetic "FP"/"FV" label (that produced an ugly "FP FP-…" double-label). Number + party name is the
  // case description; the direction is implicit in which party (supplier/customer) is present.
  const description = `${invoice.number}${
    party?.name ? ` — ${party.name}` : ""
  }`.slice(0, 2000)
  return {
    periodId: ctx.periodId,
    seriesId: ctx.eventSeriesId,
    description,
    occurredAt: invoice.tax_point_date ?? invoice.issue_date,
    ...(counterparty ? { counterparty } : {}),
    ...eventGateEnvelope(ctx),
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
    ...gateEnvelope(ctx),
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
    ...gateEnvelope(ctx),
  }
}

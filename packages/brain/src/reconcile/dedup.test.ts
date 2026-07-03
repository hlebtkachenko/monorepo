import { describe, expect, it } from "vitest"

import type {
  Attachment,
  BankTransaction,
  CashDocument,
  GLEntry,
  Invoice,
  IrRecord,
} from "../ir/records"
import { clusterEvents, computeContentHash, dedupExact } from "./dedup"

// WP-RECON-1 — the SAME economic event arrives as several shadows (prior GL + invoice + bank line) plus
// exact re-ingests. These tests pin: content hash is stable + order-independent + type-scoped; exact
// re-ingest dedups on source_hash; an event's shadows cluster together via VS+amount+date; unrelated
// invoices do not; and a record with no identity inputs stays a singleton (no false merge).

// ── minimal envelope + record builders ──────────────────────────────────────

let seq = 0
function env(overrides: Partial<IrRecord> = {}) {
  seq += 1
  return {
    ir_id: `ir-${seq}`,
    org_ref: "org-1",
    source: "isdoc" as const,
    source_locator: `loc-${seq}`,
    source_hash: `raw-${seq}`,
    ingested_at: "2026-01-01T00:00:00Z",
    confidence: 1,
    needs_review: false,
    raw: null,
    ...overrides,
  }
}

function invoice(o: Partial<Invoice> = {}): Invoice {
  return {
    ...env(o),
    record_type: "invoice",
    direction: "received",
    doc_type: "invoice",
    number: "2026-001",
    issue_date: "2026-01-10",
    tax_point_date: "2026-01-10",
    supplier: { name: "Dodavatel s.r.o.", ico: "12345678" },
    currency: "CZK",
    lines: [],
    vat_summary: [],
    total_minor: 121_000n,
    variable_symbol: "2026001",
    ...o,
  } as Invoice
}

function bank(o: Partial<BankTransaction> = {}): BankTransaction {
  return {
    ...env(o),
    record_type: "bank_transaction",
    account: { account: "123456789", bank_code: "0800" },
    booking_date: "2026-01-15",
    amount_minor: -121_000n,
    currency: "CZK",
    direction: "debit",
    variable_symbol: "2026001",
    ...o,
  } as BankTransaction
}

function cash(o: Partial<CashDocument> = {}): CashDocument {
  return {
    ...env(o),
    record_type: "cash_document",
    direction: "expense",
    number: "PD-1",
    date: "2026-01-12",
    amount_minor: 5_000n,
    currency: "CZK",
    variable_symbol: "770077",
    counterparty: { name: "Kavárna", ico: "99887766" },
    ...o,
  } as CashDocument
}

function gl(o: Partial<GLEntry> = {}): GLEntry {
  return {
    ...env(o),
    record_type: "gl_entry",
    date: "2026-01-10",
    debit_account: "518000",
    credit_account: "321000",
    amount_minor: 121_000n,
    description: "prior booking",
    ...o,
  } as GLEntry
}

function attachment(o: Partial<Attachment> = {}): Attachment {
  return {
    ...env(o),
    record_type: "attachment",
    kind: "invoice_pdf",
    mime: "application/pdf",
    stored_blob_ref: "blob-1",
    link_confidence: 0.9,
    ...o,
  } as Attachment
}

// ── computeContentHash ──────────────────────────────────────────────────────

describe("computeContentHash", () => {
  it("is stable + order-independent (same inputs → same hash regardless of field order)", () => {
    const a = invoice()
    const b = invoice({
      // Same economic identity, different insertion order + noise-only differences.
      currency: "CZK",
      supplier: { ico: "12345678", name: "Dodavatel s.r.o." },
      total_minor: 121_000n,
      tax_point_date: "2026-01-10",
      number: "2026-001",
    })
    const h = computeContentHash(a)
    expect(h).toBeDefined()
    expect(computeContentHash(b)).toBe(h)
    // Idempotent across repeated calls.
    expect(computeContentHash(a)).toBe(h)
  })

  it("normalizes IČO to digits, number to trim+lowercase, and ignores amount sign", () => {
    const base = invoice({ supplier: { name: "X", ico: "123 456 78" } })
    const messy = invoice({
      supplier: { name: "X", ico: "CZ12345678" },
      number: "  2026-001  ",
      total_minor: -121_000n,
    })
    expect(computeContentHash(messy)).toBe(computeContentHash(base))
  })

  it("falls back to issue_date when tax_point_date is absent", () => {
    const withTaxPoint = invoice({ tax_point_date: "2026-01-10" })
    const withoutTaxPoint = invoice({
      tax_point_date: undefined,
      issue_date: "2026-01-10",
    })
    expect(computeContentHash(withoutTaxPoint)).toBe(
      computeContentHash(withTaxPoint),
    )
  })

  it("distinguishes different economic events", () => {
    expect(computeContentHash(invoice({ number: "2026-001" }))).not.toBe(
      computeContentHash(invoice({ number: "2026-002" })),
    )
    expect(computeContentHash(invoice({ total_minor: 121_000n }))).not.toBe(
      computeContentHash(invoice({ total_minor: 242_000n })),
    )
  })

  it("does not alias across record types on the same numeric inputs", () => {
    expect(computeContentHash(invoice())).not.toBe(computeContentHash(bank()))
  })

  it("returns undefined for a bare GLEntry and an Attachment (no document identity)", () => {
    expect(computeContentHash(gl())).toBeUndefined()
    expect(computeContentHash(attachment())).toBeUndefined()
  })

  it("returns undefined when identity inputs are missing", () => {
    // Invoice without a number → no discriminator.
    expect(computeContentHash(invoice({ number: "" }))).toBeUndefined()
    // Bank line without a VS → no reliable link key.
    expect(
      computeContentHash(bank({ variable_symbol: undefined })),
    ).toBeUndefined()
  })
})

// ── dedupExact ──────────────────────────────────────────────────────────────

describe("dedupExact", () => {
  it("drops exact re-ingests by source_hash, keeping the first occurrence", () => {
    const first = invoice({ source_hash: "same-bytes", ir_id: "first" })
    const reingest = invoice({ source_hash: "same-bytes", ir_id: "second" })
    const other = bank({ source_hash: "other-bytes", ir_id: "third" })
    const out = dedupExact([first, reingest, other])
    expect(out.map((r) => r.ir_id)).toEqual(["first", "third"])
  })

  it("keeps records with distinct source_hash untouched + in order", () => {
    const records = [invoice(), bank(), cash()]
    expect(dedupExact(records)).toEqual(records)
  })
})

// ── clusterEvents ───────────────────────────────────────────────────────────

describe("clusterEvents", () => {
  it("clusters an invoice + its bank payment + a prior GLEntry for the same event", () => {
    // Invoice and bank share VS + amount + date via the fallback link key; the GL is force-joined by
    // sharing that same link tuple only if it exposes one — here it does not, so we assert the primary
    // pair clusters and add the GL as a shadow that carries the shared content_hash from the envelope.
    const inv = invoice({
      variable_symbol: "555000",
      total_minor: 100_000n,
      tax_point_date: "2026-02-01",
    })
    const pay = bank({
      variable_symbol: "555000",
      amount_minor: -100_000n,
      booking_date: "2026-02-01",
    })
    // A prior GLEntry shadow of the same event: it carries the invoice's content hash on its envelope
    // (as the intake layer would stamp it), so it clusters even though a bare GL has no computable one.
    const priorGl = gl({
      content_hash: computeContentHash(inv),
      amount_minor: 100_000n,
      date: "2026-02-01",
    })
    const clusters = clusterEvents([inv, priorGl, pay])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.records.map((r) => r.record_type)).toEqual([
      "invoice",
      "gl_entry",
      "bank_transaction",
    ])
  })

  it("bridges an invoice and its bank line whose full content hashes differ (bank date ≠ tax-point)", () => {
    const inv = invoice({
      variable_symbol: "808080",
      total_minor: 50_000n,
      tax_point_date: "2026-03-01",
    })
    const pay = bank({
      variable_symbol: "808080",
      amount_minor: -50_000n,
      booking_date: "2026-03-05", // later than tax-point → content hashes differ
    })
    expect(computeContentHash(inv)).not.toBe(computeContentHash(pay))
    const clusters = clusterEvents([inv, pay])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.records).toHaveLength(2)
  })

  it("does NOT merge two same-VS same-amount bank transactions in different months (recurring payment)", () => {
    // SIPO / standing order / rent reuses ONE variable_symbol across months. Same VS + same amount but
    // different booking dates → the content hash differs (date is in it), and the fallback link fires
    // CROSS-TYPE only, so two bank lines must stay TWO clusters, never collapse into one.
    const jan = bank({
      variable_symbol: "1234567",
      amount_minor: -1_500_000n,
      booking_date: "2026-01-05",
    })
    const feb = bank({
      variable_symbol: "1234567",
      amount_minor: -1_500_000n,
      booking_date: "2026-02-05",
    })
    const clusters = clusterEvents([jan, feb])
    expect(clusters).toHaveLength(2)
    expect(clusters.map((c) => c.records.length)).toEqual([1, 1])
  })

  it("still bridges an invoice and its same-VS same-amount bank payment into ONE cluster (cross-type)", () => {
    const inv = invoice({
      variable_symbol: "1234567",
      total_minor: 1_500_000n,
      tax_point_date: "2026-01-01",
    })
    const pay = bank({
      variable_symbol: "1234567",
      amount_minor: -1_500_000n,
      booking_date: "2026-01-05",
    })
    const clusters = clusterEvents([inv, pay])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.records.map((r) => r.record_type)).toEqual([
      "invoice",
      "bank_transaction",
    ])
  })

  it("does NOT merge two unrelated invoices", () => {
    const a = invoice({
      number: "A-1",
      variable_symbol: "111",
      total_minor: 1n,
    })
    const b = invoice({
      number: "B-2",
      variable_symbol: "222",
      total_minor: 2n,
    })
    const clusters = clusterEvents([a, b])
    expect(clusters).toHaveLength(2)
    expect(clusters.map((c) => c.records.length)).toEqual([1, 1])
  })

  it("collapses two invoices of the same event parsed from different formats", () => {
    const pdf = invoice({ source: "pdf", source_hash: "pdf-bytes" })
    const money = invoice({ source: "money_s3", source_hash: "money-bytes" })
    const clusters = clusterEvents([pdf, money])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.records).toHaveLength(2)
    expect(clusters[0]!.key).toBe(computeContentHash(pdf))
  })

  it("keeps a record with no identity inputs as its own singleton (no false merge)", () => {
    const a = gl() // no content hash, no link key
    const b = gl() // another bare prior row — must NOT collide with a
    const clusters = clusterEvents([a, b])
    expect(clusters).toHaveLength(2)
    expect(clusters[0]!).toEqual({ key: a.ir_id, records: [a] })
    expect(clusters[1]!).toEqual({ key: b.ir_id, records: [b] })
  })

  it("mixes: an event cluster of 3 shadows next to two singletons, deterministic order", () => {
    const inv = invoice({ variable_symbol: "900", total_minor: 9n })
    const pay = bank({ variable_symbol: "900", amount_minor: -9n })
    const loose = attachment() // singleton
    const unrelated = invoice({
      number: "Z-9",
      variable_symbol: "999",
      total_minor: 42n,
    })
    const clusters = clusterEvents([inv, loose, pay, unrelated])
    expect(clusters).toHaveLength(3)
    // First cluster (inv appears first) holds inv + pay in input order.
    expect(clusters[0]!.records.map((r) => r.record_type)).toEqual([
      "invoice",
      "bank_transaction",
    ])
    expect(clusters[1]!.records).toEqual([loose])
    expect(clusters[2]!.records).toEqual([unrelated])
  })

  it("is order-independent in membership (same clusters regardless of input order)", () => {
    const inv = invoice({ variable_symbol: "700", total_minor: 7n })
    const pay = bank({ variable_symbol: "700", amount_minor: -7n })
    const forward = clusterEvents([inv, pay])
    const reversed = clusterEvents([pay, inv])
    expect(forward).toHaveLength(1)
    expect(reversed).toHaveLength(1)
    expect(new Set(forward[0]!.records)).toEqual(new Set(reversed[0]!.records))
  })
})

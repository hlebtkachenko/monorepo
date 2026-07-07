import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { Invoice, LoginContextSections } from "@workspace/brain"
import type { IrToCaptureContext } from "@workspace/intake"
import {
  assembleBookPlan,
  assembleOcrCapturePlan,
  renderBookPlan,
  renderOcrCapturePlan,
  type BookContext,
} from "./book"

// The operator-supplied context — the SAME shape `brain run` consumes, minus the invoice (which `book`
// parses from the folder). `sections` is the login-pack safety spine; `captureContext` carries the
// operator-supplied uuids + gate envelope. Neither is derivable from the folder.
const sections: LoginContextSections = {
  constitution: "I1..In (locked)",
  kb: { id: "kb-book-1", version: "2026-07-05" },
  lawSummary: "law digest",
  confidenceProtocol: "server scores; the model never self-scores",
  escalationPolicy: "route hard cases to a human",
}

const captureContext: IrToCaptureContext = {
  periodId: "00000000-0000-4000-8000-000000000001",
  seriesId: "00000000-0000-4000-8000-000000000002",
  eventId: "00000000-0000-4000-8000-000000000003",
  confidence: 0.9,
  rationale: "Structured export booked from a folder.",
}

const bookContext: BookContext = { sections, captureContext }

// A Pohoda dataPack export → one inv:invoice (a BOOKABLE invoice) + one inv:accounting (a GLEntry, which is
// import/reconcile-only and must be SKIPPED, never booked — control 2).
const pohodaXml = `<?xml version="1.0" encoding="UTF-8"?>
<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd"
              xmlns:inv="http://www.stormware.cz/schema/version_2/invoice.xsd"
              xmlns:typ="http://www.stormware.cz/schema/version_2/type.xsd">
  <dat:dataPackItem>
    <inv:invoice>
      <inv:invoiceHeader>
        <inv:invoiceType>receivedInvoice</inv:invoiceType>
        <inv:number><typ:numberRequested>FP-2025-0042</typ:numberRequested></inv:number>
        <inv:date>2025-03-14</inv:date>
        <inv:accounting><typ:ids>5Fp</typ:ids></inv:accounting>
      </inv:invoiceHeader>
      <inv:invoiceSummary>
        <inv:homeCurrency>
          <typ:priceHigh>10000.00</typ:priceHigh>
          <typ:priceVATHigh>2100.00</typ:priceVATHigh>
          <typ:priceHighSum>12100.00</typ:priceHighSum>
        </inv:homeCurrency>
      </inv:invoiceSummary>
    </inv:invoice>
  </dat:dataPackItem>
</dat:dataPack>`

// A CSV bank export → one clean BankTransaction (bookable → BANK_STATEMENT) + one unparseable-amount row
// (surfaced as a parser warning, not silently dropped).
const bankCsv = [
  "datum;castka;mena;zprava",
  "14.03.2025;1234,56;CZK;Payment received",
  "15.03.2025;not-a-number;CZK;Broken row",
].join("\n")

describe("assembleBookPlan (creds-free folder → capture plan)", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "afframe-book-"))
    writeFileSync(join(dir, "export.xml"), pohodaXml)
    writeFileSync(join(dir, "bank.csv"), bankCsv)
    // An unwired format (no structured parser) — must be REPORTED as an unbooked file, never a silent drop.
    writeFileSync(join(dir, "scan.pdf"), "%PDF-1.4 not really a pdf")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("produces the ordered bookable capture requests (invoice + bank), skips the GLEntry, reports the pdf, surfaces the warning", () => {
    const book = assembleBookPlan(dir, bookContext, "2026-07-05T00:00:00.000Z")

    // The bookable records: the Pohoda invoice (RECEIVED_INVOICE) and the clean bank line (BANK_STATEMENT).
    // Ordered by file walk (bank.csv, then export.xml — sorted).
    expect(book.entries.map((e) => e.recordType)).toEqual([
      "bank_transaction",
      "invoice",
    ])

    const bank = book.entries[0]!
    expect(bank.plan.captureRequest.type).toBe("BANK_STATEMENT")
    // The capture request carries the OPERATOR-SUPPLIED ids verbatim, never MCP-resolved.
    expect(bank.plan.captureRequest.periodId).toBe(captureContext.periodId)
    expect(bank.plan.captureRequest.seriesId).toBe(captureContext.seriesId)
    // A bank line has no VAT breakdown → the whole (signed) amount is one rate-less OUTSIDE_VAT partial.
    expect(bank.plan.captureRequest.lines[0]!.partials[0]!.vatMode).toBe(
      "OUTSIDE_VAT",
    )

    const invoice = book.entries[1]!
    expect(invoice.plan.captureRequest.type).toBe("RECEIVED_INVOICE")
    expect(invoice.plan.captureRequest.lines[0]!.eventId).toBe(
      captureContext.eventId,
    )
    // A structured export is stamped extractionMethod:"structured" — the honest source marker, so these
    // captures are NOT mislabeled as OCR by omission (which would fail-close them to HELD via the #554 leg).
    expect(invoice.plan.captureRequest.extractionMethod).toBe("structured")
    expect(bank.plan.captureRequest.extractionMethod).toBe("structured")
    // The plan still drives the fixed read → propose tool sequence (shared skeleton across record kinds).
    expect(invoice.plan.toolPlan.map((c) => c.toolName)).toEqual([
      "mcp__afframe__get_structure",
      "mcp__afframe__list_accounting_number_series",
      "mcp__afframe__capture_accounting_document",
    ])
    // The bank plan's write call carries the bank capture request, not an invoice body.
    const bankWrite = bank.plan.toolPlan.at(-1)!
    expect(bankWrite.input).toBe(bank.plan.captureRequest)

    // FIX 1: every record kind shares ONE skeleton (login pack + policy + read tool sequence) assembled by
    // `planForCapture` — only the write body differs. No PLACEHOLDER_INVOICE, no string-match toolPlan swap.
    expect(bank.plan.loginPack.system).toBe(invoice.plan.loginPack.system)
    expect(bank.plan.policy).toBe(invoice.plan.policy)
    expect(bank.plan.toolPlan.map((c) => c.toolName)).toEqual(
      invoice.plan.toolPlan.map((c) => c.toolName),
    )
    // The bank write body is the bankToCapture adapter's output (a BANK_STATEMENT), never an invoice skeleton.
    expect(bank.plan.captureRequest.type).toBe("BANK_STATEMENT")
    expect(bankWrite.toolName).toBe("mcp__afframe__capture_accounting_document")

    // The GLEntry the Pohoda export also produced is SKIPPED (never a booking source).
    expect(book.skips.map((s) => s.recordType)).toEqual(["gl_entry"])
    expect(book.skips[0]!.reason).toContain("never a booking source")

    // The pdf is reported as an unbooked file (unwired format), not silently dropped.
    expect(book.files.map((f) => f.path)).toContain("scan.pdf")

    // The broken CSV row surfaces a parser warning verbatim.
    expect(
      book.warnings.some((w) => /unparseable amount/.test(w.message)),
    ).toBe(true)
  })

  it("renders the operator-supplied ids and each capture request for inspection", () => {
    const book = assembleBookPlan(dir, bookContext, "2026-07-05T00:00:00.000Z")
    const rendered = renderBookPlan(book, bookContext)

    // Nothing auto-resolved is silent: the operator-supplied ids are printed and labelled as such.
    expect(rendered).toContain("NOT MCP-resolved")
    expect(rendered).toContain(captureContext.periodId)
    expect(rendered).toContain(captureContext.seriesId)
    expect(rendered).toContain(captureContext.eventId)
    // The verbatim capture bodies the live session would embed are printed.
    expect(rendered).toContain("BANK_STATEMENT")
    expect(rendered).toContain("RECEIVED_INVOICE")
    // The skip + the unbooked file are reported to the operator too.
    expect(rendered).toContain("gl_entry")
    expect(rendered).toContain("scan.pdf")
  })

  it("is empty (no entries) for a folder with no structured exports", () => {
    const empty = mkdtempSync(join(tmpdir(), "afframe-book-empty-"))
    writeFileSync(join(empty, "readme.txt"), "just some notes")
    try {
      const book = assembleBookPlan(
        empty,
        bookContext,
        "2026-07-05T00:00:00.000Z",
      )
      expect(book.entries).toHaveLength(0)
      expect(book.files.map((f) => f.path)).toContain("readme.txt")
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

// [W1.4] The OCR extract→book bridge — the seam that lets a REAL PDF invoice flow into the HELD write loop.
// A `brain extract` vision-OCR pre-pass produces this IR Invoice; the bridge maps it to an "ocr" capture.
const provenance = {
  ir_id: "ir-ocr-1",
  org_ref: "book:org-unresolved",
  source: "pdf" as const,
  source_locator: "faktura-2025-0042.pdf",
  source_hash: "hash-pdf-1",
  ingested_at: "2026-07-06T00:00:00.000Z",
  confidence: 0.82,
  needs_review: true,
  raw: {},
}

const extractedInvoice = (over: Partial<Invoice> = {}): Invoice => ({
  ...provenance,
  record_type: "invoice",
  direction: "received",
  doc_type: "invoice",
  number: "FP-2025-0042",
  issue_date: "2025-03-14",
  currency: "CZK",
  lines: [],
  vat_summary: [{ rate: 21, base_minor: 100000n, tax_minor: 21000n }],
  total_minor: 121000n,
  ...over,
})

describe("assembleOcrCapturePlan (extract→book bridge — PDF → ocr capture) [W1.4]", () => {
  // The operator BookContext (same shape a folder book uses) — the OCR bridge takes the extracted invoice as
  // a separate first arg and forces extractionMethod:"ocr" itself, so the context carries only the uuids +
  // gate envelope (conversationId always present, templateId/signals per test).
  const bookCtx = (
    captureOver: Partial<IrToCaptureContext> = {},
  ): BookContext => ({
    sections,
    captureContext: {
      ...captureContext,
      conversationId: "0196f1de-0000-7000-8000-0000000000c0",
      ...captureOver,
    },
  })

  it("builds a capture with extractionMethod:'ocr' + conversationId + the matched templateId + signals", () => {
    const plan = assembleOcrCapturePlan(
      extractedInvoice(),
      bookCtx({
        templateId: "0196f1de-0000-7000-8000-0000000000e1",
        signals: { extractionQuality: 0.82, capSignals: ["novel_ico"] },
      }),
    )
    const request = plan.captureRequest
    // The W1.4 acceptance: a PDF path yields extractionMethod:"ocr" (the honest source marker) + a
    // conversationId (agent captures require it) + the matched templateId + the extract's evidence signals.
    expect(request.extractionMethod).toBe("ocr")
    expect(request.conversationId).toBe("0196f1de-0000-7000-8000-0000000000c0")
    expect(request.templateId).toBe("0196f1de-0000-7000-8000-0000000000e1")
    expect(request.signals).toEqual({
      extractionQuality: 0.82,
      capSignals: ["novel_ico"],
    })
    expect(request.type).toBe("RECEIVED_INVOICE")
    // The bridge still drives the SAME fixed read → propose tool sequence (nothing bypasses the server gate).
    expect(plan.toolPlan.map((c) => c.toolName)).toEqual([
      "mcp__afframe__get_structure",
      "mcp__afframe__list_accounting_number_series",
      "mcp__afframe__capture_accounting_document",
    ])
  })

  it("FORCES extractionMethod:'ocr' even if the operator context tried to soften it to 'structured'", () => {
    // A PDF was read by vision-OCR — the source-honesty marker cannot be downgraded from the file's true path.
    const plan = assembleOcrCapturePlan(
      extractedInvoice(),
      bookCtx({ extractionMethod: "structured" }),
    )
    expect(plan.captureRequest.extractionMethod).toBe("ocr")
  })

  it("omits templateId when NO workspace template matched (server then fail-closes the OCR capture to HELD)", () => {
    const plan = assembleOcrCapturePlan(extractedInvoice(), bookCtx())
    // No templateId → the server's unverified_template leg holds the write for human review. Absent, not null.
    expect("templateId" in plan.captureRequest).toBe(false)
    expect(plan.captureRequest.extractionMethod).toBe("ocr")
  })

  it("renders the OCR-basis facts (extractionMethod=ocr + template state) for operator inspection", () => {
    const withTemplate = renderOcrCapturePlan(
      assembleOcrCapturePlan(
        extractedInvoice(),
        bookCtx({ templateId: "0196f1de-0000-7000-8000-0000000000e1" }),
      ),
      extractedInvoice(),
    )
    expect(withTemplate).toContain("extractionMethod = ocr")
    expect(withTemplate).toContain("faktura-2025-0042.pdf")
    expect(withTemplate).toContain("0196f1de-0000-7000-8000-0000000000e1")

    const noTemplate = renderOcrCapturePlan(
      assembleOcrCapturePlan(extractedInvoice(), bookCtx()),
      extractedInvoice(),
    )
    // With no template the operator sees the fail-closed-to-HELD note plainly.
    expect(noTemplate).toContain("none matched")
    expect(noTemplate).toContain("HELD")
  })
})

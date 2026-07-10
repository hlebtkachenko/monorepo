import { describe, expect, it } from "vitest"
import type { LoginContextSections } from "@workspace/brain"
import {
  assembleExtractPlan,
  renderExtractPlan,
  toDocumentBlock,
  type ExtractContext,
} from "./extract"

const sections: LoginContextSections = {
  constitution: "I1..In (locked)",
  kb: { id: "kb-extract-1", version: "2026-07-05" },
  lawSummary: "law digest",
  confidenceProtocol: "server scores; the model never self-scores",
  escalationPolicy: "route hard cases to a human",
}
const ctx: ExtractContext = { sections }

describe("toDocumentBlock (file → content-block descriptor, NOT a Read)", () => {
  it("maps a PDF to a base64 document block", () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // "%PDF"
    const block = toDocumentBlock("/tmp/faktura.pdf", bytes)
    expect(block.kind).toBe("document")
    expect(block.mediaType).toBe("application/pdf")
    expect(block.sourceLabel).toBe("faktura.pdf")
    // The bytes are carried IN the block as base64 — they never route through a Read tool.
    expect(block.base64).toBe(Buffer.from(bytes).toString("base64"))
  })

  it("maps raster images to the right image media type", () => {
    const png = toDocumentBlock("/tmp/scan.PNG", new Uint8Array([1, 2, 3]))
    expect(png.kind).toBe("image")
    expect(png.mediaType).toBe("image/png")
    expect(toDocumentBlock("/tmp/a.jpg", new Uint8Array([1])).mediaType).toBe(
      "image/jpeg",
    )
    expect(toDocumentBlock("/tmp/a.jpeg", new Uint8Array([1])).mediaType).toBe(
      "image/jpeg",
    )
    expect(toDocumentBlock("/tmp/a.webp", new Uint8Array([1])).mediaType).toBe(
      "image/webp",
    )
  })

  it("throws loud on an unsupported (non-vision) type — steering to `brain book`", () => {
    expect(() =>
      toDocumentBlock("/tmp/export.xlsx", new Uint8Array([1])),
    ).toThrow(/unsupported file type/)
    expect(() => toDocumentBlock("/tmp/data.csv", new Uint8Array([1]))).toThrow(
      /brain book/,
    )
  })
})

describe("assembleExtractPlan (creds-free — no network, no clock)", () => {
  const block = toDocumentBlock(
    "/tmp/faktura.pdf",
    new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  )

  it("assembles the default-deny session config: ocr-template read/propose ONLY, Read absent", () => {
    const plan = assembleExtractPlan(block, ctx, "27082440")
    // Allow list is exactly the ocr-template read + propose pair.
    expect(plan.allowedTools).toEqual([
      "mcp__afframe__list_ocr_templates",
      "mcp__afframe__create_ocr_template",
    ])
    // Read is NOT allowed; it IS on the deny list. No accounting write tool is allowed.
    expect(plan.allowedTools).not.toContain("Read")
    expect(plan.disallowedTools).toContain("Read")
    expect(plan.allowedTools).not.toContain(
      "mcp__afframe__capture_accounting_document",
    )
    expect(plan.allowedTools).not.toContain(
      "mcp__afframe__confirm_ocr_template",
    )
  })

  it("represents the file as a content block (kind + media type + byte count), bytes elided", () => {
    const plan = assembleExtractPlan(block, ctx)
    expect(plan.document).toEqual({
      kind: "document",
      mediaType: "application/pdf",
      sourceLabel: "faktura.pdf",
      byteCount: 4,
    })
    // The raw base64 bytes are NOT surfaced in the inspectable plan — only the count.
    expect(JSON.stringify(plan.document)).not.toContain(block.base64)
  })

  it("carries the supplier hint into the kickoff, and demands provenance + a fingerprint", () => {
    const plan = assembleExtractPlan(block, ctx, "27082440")
    expect(plan.supplierHint).toBe("27082440")
    expect(plan.kickoff).toContain("27082440")
    expect(plan.kickoff.toLowerCase()).toContain("provenance")
    expect(plan.kickoff.toLowerCase()).toContain("fingerprint")
  })
})

describe("assembleExtractPlan — [M1.5 / #565] fail-closed extraction-engine classification", () => {
  const block = toDocumentBlock(
    "/tmp/faktura.pdf",
    new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  )

  it("classifies vision-only + stamps 'ocr' when NO text layer was resolved (scanned/unavailable)", () => {
    const plan = assembleExtractPlan(block, ctx, undefined, null)
    expect(plan.extractionEngine).toBe("vision-only")
    expect(plan.extractionMethodStamp).toBe("ocr")
  })

  it("classifies vision-only + stamps 'ocr' when assembled with NO textLayer argument at all (default)", () => {
    const plan = assembleExtractPlan(block, ctx)
    expect(plan.extractionEngine).toBe("vision-only")
    expect(plan.extractionMethodStamp).toBe("ocr")
  })

  it("classifies digital-text-layer for a substantial, unambiguous text signal — but STILL stamps 'ocr'", () => {
    const digitalText = `
      Faktura - danovy doklad c. 2026-00123
      Dodavatel: Afframe s.r.o., ICO 12345678
      Celkem k uhrade: 12 100,00 Kc
    `
    const plan = assembleExtractPlan(block, ctx, undefined, {
      text: digitalText,
    })
    expect(plan.extractionEngine).toBe("digital-text-layer")
    // The whole point of #565: a stronger-LOOKING engine can NEVER lift the wire stamp above "ocr".
    expect(plan.extractionMethodStamp).toBe("ocr")
  })

  it("fails closed to vision-only + 'ocr' on a locale-ambiguous CZ amount, even with plenty of text", () => {
    const ambiguousText = `
      Faktura - danovy doklad c. 2026-00123
      Dodavatel: Afframe s.r.o., ICO 12345678
      Doplatek: 1.234
    `
    const plan = assembleExtractPlan(block, ctx, undefined, {
      text: ambiguousText,
    })
    expect(plan.extractionEngine).toBe("vision-only")
    expect(plan.extractionMethodStamp).toBe("ocr")
  })

  it("threads the text layer into the kickoff as untrusted supplementary data (digital-text-layer)", () => {
    const plan = assembleExtractPlan(block, ctx, undefined, {
      text: "Celkem k uhrade 12 100,00 Kc — Faktura c. 2026-00123, ICO 12345678",
    })
    expect(plan.extractionEngine).toBe("digital-text-layer")
    expect(plan.kickoff).toContain("12 100,00 Kc")
    expect(plan.kickoff).toContain("UNTRUSTED")
  })

  it("[M1.5 / #565] WITHHOLDS the text-layer block from the kickoff when it classifies vision-only (ambiguous CZ amount)", () => {
    // The ambiguous-CZ-amount read still carries substantial text, but fails closed to vision-only — so its
    // text must NOT ride into the session prompt (it is not just the engine TAG that changes; the assist is
    // actually withheld). This is the I8-honesty property: the vision-only downgrade does a real thing.
    const ambiguousText = `
      Faktura - danovy doklad c. 2026-00123
      Dodavatel: Afframe s.r.o., ICO 12345678
      Doplatek: 1.234 rozpis dane a polozek faktury
    `
    const plan = assembleExtractPlan(block, ctx, undefined, {
      text: ambiguousText,
    })
    expect(plan.extractionEngine).toBe("vision-only")
    // The text-layer block markers + the actual document text are absent from the kickoff.
    expect(plan.kickoff).not.toContain("local text-layer extract")
    expect(plan.kickoff).not.toContain("SUPPLEMENTARY DATA ONLY")
    expect(plan.kickoff).not.toContain("Doplatek")
  })

  it("[M1.5 / #565] WITHHOLDS the text-layer block when the read was null (scanned/unavailable)", () => {
    const plan = assembleExtractPlan(block, ctx, undefined, null)
    expect(plan.extractionEngine).toBe("vision-only")
    expect(plan.kickoff).not.toContain("local text-layer extract")
  })
})

describe("renderExtractPlan (--dry-run inspection — no creds)", () => {
  it("states the file is a content block (NOT a Read) and shows the deny surface", () => {
    // No env, no creds, no network — pure text assembly (the --dry-run half).
    const plan = assembleExtractPlan(
      toDocumentBlock(
        "/tmp/faktura.pdf",
        new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      ),
      ctx,
      "27082440",
    )
    const rendered = renderExtractPlan(plan)
    expect(rendered).toContain("CONTENT BLOCK")
    expect(rendered).toContain("NOT via a Read tool")
    expect(rendered).toContain("NEVER books")
    // The allowed pair + the denied Read + the denied write tools are all shown to the operator.
    expect(rendered).toContain("mcp__afframe__list_ocr_templates")
    expect(rendered).toContain("mcp__afframe__create_ocr_template")
    expect(rendered).toContain("- Read")
    expect(rendered).toContain("capture_accounting_document")
    expect(rendered).toContain("confirm_ocr_template are DENIED")
    // Provenance/fingerprint intent is visible in the kickoff echo.
    expect(rendered.toLowerCase()).toContain("layout fingerprint")
  })

  it("[M1.5 / #565] states the classified engine + that the extractionMethod stamp is ALWAYS 'ocr'", () => {
    const plan = assembleExtractPlan(
      toDocumentBlock(
        "/tmp/faktura.pdf",
        new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      ),
      ctx,
      undefined,
      null,
    )
    const rendered = renderExtractPlan(plan)
    expect(rendered).toContain("vision-only")
    expect(rendered).toContain('extractionMethod stamp = "ocr"')
  })
})

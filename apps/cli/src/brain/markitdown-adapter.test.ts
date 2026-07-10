import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runMarkitdownCli, tryExtractTextLayer } from "./markitdown-adapter"

describe("tryExtractTextLayer — fail-closed on ANY runner failure (never throws)", () => {
  it("resolves the signal with the runner's text on success", async () => {
    const signal = await tryExtractTextLayer(
      "/tmp/whatever.pdf",
      async () => "Faktura 123",
    )
    expect(signal).toEqual({ text: "Faktura 123" })
  })

  it("degrades to null when the runner throws (missing binary / conversion failure)", async () => {
    const signal = await tryExtractTextLayer("/tmp/whatever.pdf", async () => {
      throw new Error("markitdown: command not found")
    })
    expect(signal).toBeNull()
  })

  it("degrades to null on a runner timeout/rejection, never propagating the error", async () => {
    const signal = await tryExtractTextLayer("/tmp/whatever.pdf", () =>
      Promise.reject(new Error("ETIMEDOUT")),
    )
    expect(signal).toBeNull()
  })
})

/**
 * Build a MINIMAL, valid, un-compressed single-page PDF (no external deps) whose content stream shows
 * `text` via a base-14 Helvetica `Tj` operator — real enough for both `pdftotext` and `markitdown`
 * (pdfminer) to extract the text back out, without needing an embedded font or a real invoice generator.
 */
function buildMinimalTextPdf(text: string): Buffer {
  const escaped = text.replace(/([()\\])/g, "\\$1")
  const content = Buffer.from(
    `BT /F1 12 Tf 10 100 Td (${escaped}) Tj ET`,
    "latin1",
  )
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 300 150] /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    null, // built below (needs the binary content length)
  ]

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")]
  const offsets: number[] = []
  let cursor = chunks[0]!.length

  for (let i = 0; i < objects.length; i++) {
    offsets.push(cursor)
    const header = Buffer.from(`${i + 1} 0 obj\n`, "latin1")
    const body =
      i === 4
        ? Buffer.concat([
            Buffer.from(`<< /Length ${content.length} >>\nstream\n`, "latin1"),
            content,
            Buffer.from("\nendstream", "latin1"),
          ])
        : Buffer.from(objects[i]!, "latin1")
    const footer = Buffer.from("\nendobj\n", "latin1")
    const obj = Buffer.concat([header, body, footer])
    chunks.push(obj)
    cursor += obj.length
  }

  const xrefOffset = cursor
  const n = objects.length + 1
  let xref = `xref\n0 ${n}\n0000000000 65535 f \n`
  for (const off of offsets)
    xref += `${String(off).padStart(10, "0")} 00000 n \n`
  xref += `trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  chunks.push(Buffer.from(xref, "latin1"))

  return Buffer.concat(chunks)
}

/** True when the real `markitdown` CLI resolves on PATH (or `BRAIN_MARKITDOWN_BIN`) in THIS environment. */
function hasRealMarkitdown(): boolean {
  try {
    execFileSync(process.env.BRAIN_MARKITDOWN_BIN || "markitdown", ["--help"], {
      stdio: "ignore",
    })
    return true
  } catch {
    return false
  }
}

describe.skipIf(!hasRealMarkitdown())(
  "runMarkitdownCli — REAL binary integration (skipped when markitdown is not on PATH, e.g. CI today)",
  () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "brain-extract-markitdown-"))
    })

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    it("extracts the embedded text layer of a minimal digital PDF", async () => {
      const path = join(dir, "digital.pdf")
      writeFileSync(path, buildMinimalTextPdf("Faktura cislo 2026-00123"))
      const text = await runMarkitdownCli(path)
      expect(text).toContain("Faktura cislo 2026-00123")
    })

    it("via tryExtractTextLayer: a real digital PDF classifies as usable evidence (non-null, non-empty)", async () => {
      const path = join(dir, "digital2.pdf")
      writeFileSync(path, buildMinimalTextPdf("Celkem k uhrade: 12 100,00 Kc"))
      const signal = await tryExtractTextLayer(path)
      expect(signal).not.toBeNull()
      expect(signal?.text).toContain("12 100,00 Kc")
    })

    it("degrades to null (never throws) on a path that does not exist", async () => {
      const signal = await tryExtractTextLayer(join(dir, "does-not-exist.pdf"))
      expect(signal).toBeNull()
    })
  },
)

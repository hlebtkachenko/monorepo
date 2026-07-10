// [M1.5] The ONLY file in the extract layer that shells out to a subprocess. It attempts a LOCAL,
// deterministic digital-text-layer read of a PDF via the `markitdown` CLI (an OPTIONAL, pip-installed tool —
// see apps/cli/requirements-extract.txt) and NEVER throws: a missing binary, a timeout, a non-PDF, or any
// conversion failure degrades to `null`. The caller (`extraction-engine.ts`'s `classifyExtractionEngine`)
// treats `null` as NO text-layer evidence and fails closed to the "vision-only" bucket — exactly like a
// genuinely scanned document. Missing markitdown is therefore a graceful accuracy no-op, never a crash and
// never a reason to claim more than the fail-closed default.
//
// SCOPE (M1.5 slice — see the PR body for the full follow-up list): this wires the DIGITAL-PDF path only.
// tesseract-ocr (scanned-image rasterize→OCR) is DEFERRED — a scanned image/PDF already falls back to the
// existing, already-shipped vision extraction session unchanged, and a tesseract-derived read would resolve
// to the exact same "ocr" wire stamp as vision (see extraction-engine.ts), so deferring it changes no safety
// property, only a future accuracy improvement.

import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { TextLayerSignal } from "./extraction-engine"

const execFileAsync = promisify(execFile)

/** 30s is generous for a single-invoice PDF; markitdown/pdfminer never legitimately runs longer than that on
 * a document this small, so a hang degrades to `null` rather than blocking the CLI indefinitely. */
const MARKITDOWN_TIMEOUT_MS = 30_000

/** 10MiB caps stdout — an invoice's text layer is a few KB; anything larger signals something is wrong
 * (e.g. a malformed PDF that decompresses to garbage), and we fail closed rather than buffer it all. */
const MARKITDOWN_MAX_BUFFER = 10 * 1024 * 1024

/** A function that converts the file at `path` to markdown/plain text, or throws. Injected so
 * `tryExtractTextLayer`'s fail-closed-on-any-failure contract is unit-testable without the real binary. */
export type MarkitdownRunner = (path: string) => Promise<string>

/**
 * The real runner: shells out to the `markitdown` CLI (resolved from PATH, or `BRAIN_MARKITDOWN_BIN` for a
 * non-PATH install — e.g. a pyenv shim or a venv). Throws on any failure (missing binary, timeout,
 * non-zero exit, oversized output) — `tryExtractTextLayer` is the ONLY caller and always catches.
 */
export async function runMarkitdownCli(path: string): Promise<string> {
  const bin = process.env.BRAIN_MARKITDOWN_BIN || "markitdown"
  // `--` ends option parsing: a filename that begins with `-` (e.g. an operator's oddly-named `-invoice.pdf`)
  // can never be misread by markitdown's argparse as a flag. `execFile` (no shell) already blocks injection;
  // this closes the residual arg-confusion vector too. (`execFile` also passes `path` as a single argv token,
  // so there is no word-splitting even without `--`; the separator is defense-in-depth.)
  const { stdout } = await execFileAsync(bin, ["--", path], {
    timeout: MARKITDOWN_TIMEOUT_MS,
    maxBuffer: MARKITDOWN_MAX_BUFFER,
  })
  return stdout
}

/**
 * Best-effort digital-text-layer extraction for the PDF at `path`. NEVER throws: any failure of `runner`
 * (missing `markitdown` binary, a corrupt/encrypted PDF, a timeout) degrades to `null`, which
 * `classifyExtractionEngine` treats as no evidence at all — the SAME fail-closed bucket as a genuinely
 * scanned document. `runner` defaults to the real CLI; tests inject a fake to exercise the success/failure
 * branches deterministically without the binary present.
 */
export async function tryExtractTextLayer(
  path: string,
  runner: MarkitdownRunner = runMarkitdownCli,
): Promise<TextLayerSignal | null> {
  try {
    const text = await runner(path)
    return { text }
  } catch {
    return null
  }
}

// [M1.5 / #565] The fail-closed `extraction_method` discriminator for `brain extract`'s extraction layer.
//
// ⚠ SPINE-ADJACENT — read the whole file before touching it. `extractionMethod` is the CLIENT-DECLARED
// discriminator the server's OCR-template screen (`screenTemplateBasis`, apps/api/src/v1/accounting/
// accounting-veto.ts) and the evidence gate key off. This module does NOT touch that server code — it only
// PRODUCES the value that flows into it (via the extract→book bridge's forced stamp, `assembleOcrCapturePlan`
// in ./book.ts). A wrong value here is a floor route-around (#565); a defect MUST fail SAFE (stamp weaker →
// more HELD), never fail open (stamp stronger → floor lifted).
//
// THE CORE ARGUMENT (why this can only ever fail closed): the wire `ExtractionMethod` enum has exactly three
// values — "structured" (a genuinely typed-schema parse: Pohoda XML / xlsx / csv, ZERO field-level
// interpretation), "manual" (hand-entered by a human), and "ocr" (anything that required READING a document —
// vision or text — and interpreting which text means what). NEITHER a markitdown digital-text-layer read NOR
// a vision/tesseract read is a typed-schema parse: both still require interpreting which run of text is the
// base amount vs the VAT amount vs the invoice number, exactly the same risk surface as classic OCR. So every
// engine `brain extract` can ever run honestly maps to "ocr" — there is no legitimate stronger value available
// to an automated document-reading pipeline in this taxonomy. `EXTRACTION_METHOD_BY_ENGINE` below encodes this
// as a TYPE, not a runtime branch: its value type is the literal `"ocr"`, so a future engine added to
// `ExtractionEngine` cannot compile a mapping to anything else without changing this one declaration — the
// fail-closed guarantee is checkable by reading one line, not by trusting every call site.

/**
 * Which internal reader actually grounded an extraction attempt. Both buckets stamp the SAME
 * `extractionMethod` (see `resolveExtractionMethod`) — this taxonomy exists for TELEMETRY/audit and to decide
 * what auxiliary context (`textLayer`) the extract session's kickoff includes, never to change the wire stamp.
 *
 *  - "digital-text-layer": a markitdown-produced text layer passed the digital heuristic
 *    (`classifyExtractionEngine`) — the PDF carries substantial, unambiguous embedded text.
 *  - "vision-only": the fail-closed default. Covers a raster image (no text-layer concept applies), a
 *    genuinely scanned PDF (no usable embedded text), an unavailable/failed markitdown run, AND a digital PDF
 *    whose text layer contains a locale-AMBIGUOUS Czech amount (see `hasAmbiguousCzAmount`) — CZ-OCR amounts
 *    fail closed exactly like vision, never treated as more trustworthy just because SOME text was present.
 */
export type ExtractionEngine = "digital-text-layer" | "vision-only"

/** A local digital-text-layer read (markitdown or an equivalent deterministic PDF-text extraction). */
export interface TextLayerSignal {
  /** The extracted text, verbatim (untruncated — callers bound it before embedding in a prompt). */
  readonly text: string
}

/** Below this many non-whitespace characters, a "text layer" is not positive proof of a digital PDF — an
 * image-only page can still carry a handful of stray characters (a watermark, a page-number stamp) without
 * being a genuine digital document. */
const MIN_CHARS_FOR_DIGITAL = 40

/**
 * True when `text` contains a numeric token shaped like a Czech/European dot-grouped triplet with NO decimal
 * suffix to disambiguate it (e.g. bare "1.234") — a token that reads EITHER as a CZ thousands-dot integer
 * (one thousand two hundred thirty-four) OR as a plain 3-decimal number (one and 234 thousandths), and cannot
 * be told apart from text alone without knowing the document's locale for certain.
 *
 * Deliberately CONSERVATIVE (a trip-wire, not a real number parser): it also fires on some tokens that a
 * human could disambiguate from surrounding context (e.g. "12.345,67" — the trailing ",67" confirms the dot
 * is a thousands separator) — that is fine and intended. This function only ever downgrades the internal
 * `ExtractionEngine` classification to the weaker "vision-only" bucket; it can NEVER lift the wire
 * `extractionMethod` stamp (that is fixed to "ocr" for both buckets — see `resolveExtractionMethod`), so an
 * over-cautious false positive here costs nothing but a missed accuracy assist, never a safety hole.
 */
export function hasAmbiguousCzAmount(text: string): boolean {
  return /\b\d{1,3}\.\d{3}\b(?!\d)/.test(text)
}

/**
 * Classify which extraction engine actually produced usable evidence for a document — PURE, deterministic,
 * fail-closed. `null` (markitdown unavailable, the file is not a PDF, the run errored, or it was never
 * attempted) carries NO text-layer evidence and fails closed to `"vision-only"` — the exact same bucket a
 * raster image or a genuinely scanned PDF lands in. Sparse text (below `MIN_CHARS_FOR_DIGITAL`) is likewise
 * NOT positive proof of a real text layer, so it also fails closed. A locale-ambiguous CZ amount
 * (`hasAmbiguousCzAmount`) downgrades an otherwise-substantial text layer to `"vision-only"` too — see that
 * function's doc comment. There is no input shape this function accepts that can produce anything other than
 * these two engine tags, and both resolve to the SAME wire stamp (`resolveExtractionMethod`).
 */
export function classifyExtractionEngine(
  signal: TextLayerSignal | null,
): ExtractionEngine {
  if (signal === null) return "vision-only"
  const nonWhitespaceCount = signal.text.replace(/\s+/g, "").length
  if (nonWhitespaceCount < MIN_CHARS_FOR_DIGITAL) return "vision-only"
  if (hasAmbiguousCzAmount(signal.text)) return "vision-only"
  return "digital-text-layer"
}

/**
 * The ONLY map from an `ExtractionEngine` to the wire `extractionMethod` value a capture built from this
 * extraction will carry. Every value is the LITERAL `"ocr"` — enforced by the `Record<ExtractionEngine,
 * "ocr">` type itself, not by a runtime check: adding an engine that should map to anything else is a
 * TYPE ERROR at this declaration, which is exactly the point (see the file-header argument for why no engine
 * in this taxonomy can honestly claim `"structured"` or `"manual"`).
 *
 * This is belt-and-suspenders, not the primary defense: `./book.ts`'s `assembleOcrCapturePlan` independently
 * FORCES `extractionMethod: "ocr"` on every extract→book capture regardless of what the operator context
 * declares (spread order pins it last — see `book.test.ts`'s "FORCES extractionMethod:'ocr' even if the
 * operator context tried to soften it" test). Two independent fail-closed mechanisms, neither able to
 * override the other toward a stronger stamp.
 */
const EXTRACTION_METHOD_BY_ENGINE: Readonly<Record<ExtractionEngine, "ocr">> = {
  "digital-text-layer": "ocr",
  "vision-only": "ocr",
}

/**
 * Resolve the wire `extractionMethod` stamp for a classified engine. ALWAYS `"ocr"` — see
 * `EXTRACTION_METHOD_BY_ENGINE`. Exported (rather than inlined) so call sites document INTENT ("resolve the
 * stamp"), not just read a constant, and so a test can assert the invariant holds for every member of the
 * `ExtractionEngine` union without needing to know the map's internals.
 */
export function resolveExtractionMethod(engine: ExtractionEngine): "ocr" {
  return EXTRACTION_METHOD_BY_ENGINE[engine]
}

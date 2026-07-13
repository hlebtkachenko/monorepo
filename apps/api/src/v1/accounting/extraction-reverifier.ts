import { eq, type OrganizationBoundDb } from "@workspace/db"
import { ocr_extraction_template } from "@workspace/db/schema"
import { decimalToMinor, minorToDecimal } from "@workspace/brain/confidence"
import type { VatSummaryRow } from "@workspace/brain"
import type {
  CaptureAccountingDocumentRequest,
  ExtractionMethod,
} from "@workspace/shared/api"

import { deriveServerVerify } from "./shadow-score"

/**
 * [M3.1] Server-side extraction RE-VERIFIER — a STANDALONE component, NOT wired
 * into the evidence gate.
 *
 * ⚠ This module builds the LEVER, it does not pull it. `evidence-gate.ts`'s
 * unconditional `extraction_failed` injection (which forces every write's
 * `cRaw = 0` at cold start) is UNTOUCHED, and `runGatedWrite`
 * (`accounting-writes.gate.ts`) never calls anything in this file. Its output is
 * not read by any decision path today — the ACTIVATION (letting a `verified`
 * field lift the floor, field-by-field) is data-gated on M2.3's reviewed-run
 * corpus and on closing #565's route-arounds (see
 * `.context/afframe-brain/BRAIN-MILESTONE-PLAN.md` M3.1). Wiring this module's
 * verdict into `evaluateEvidence`/`buildScoreInputs`/`runGatedWrite` is exactly
 * the follow-up this PR must NOT do.
 *
 * WHAT IT DOES: given a captured document (the same domain fields
 * `CaptureAccountingDocumentRequest` carries), independently re-checks
 * EXTRACTION FIDELITY — not merely internal arithmetic self-consistency (that
 * already exists, see `shadow-score.ts`'s `deriveServerVerify`, reused here as
 * LEG A), but whether the captured facts actually match the SOURCE document, via
 * two genuinely new checks (LEG B):
 *
 *   1. `template.confirmedBasisOrNA` — an OCR capture must resolve to a
 *      HUMAN-CONFIRMED `ocr_extraction_template` row (read-only positive
 *      confirmation of the same trust gate `accounting-veto.ts`'s
 *      `screenTemplateBasis` enforces as a hold; this module performs no write
 *      and injects no signal). A `structured`/`manual` capture carries no OCR
 *      extraction, so the check is Not Applicable (passes) for it.
 *   2. `document.vatSummary[...]` / `document.total` — the captured lines are
 *      summed per VAT rate and overall, then cross-checked against an
 *      INDEPENDENTLY re-extracted source (a fresh re-OCR/re-parse of the SAME
 *      document, shaped like the canonical IR `Invoice.vat_summary` /
 *      `total_minor`). A tampered/hallucinated amount that is internally
 *      self-consistent (so LEG A would pass it) but does not match the source
 *      fails HERE.
 *
 * FAIL-CLOSED BY CONSTRUCTION: every check that cannot actually be recomputed
 * (no re-extraction source supplied, no template basis, a missing/malformed
 * field) reports `verified: false` with an explanatory `reason` — it NEVER
 * silently reports `true` for a fact it could not independently confirm. The
 * top-level `verified` is the STRICT AND over every check, so an
 * un-recomputable case never verifies. See `extraction-reverifier.test.ts` for
 * the fail-closed cases this pins.
 *
 * WHY ENGINE-AGNOSTIC: this repo has no wired OCR re-extraction engine or
 * document-storage layer yet (tracked separately — the "Source-document
 * viewer" cross-cutting item and the extraction-layer milestone). Rather than
 * fabricate one, `reverifyCapture` accepts an already-produced re-extraction
 * result (`ReExtractedTotals`) shaped like the canonical IR so whichever engine
 * lands later (vision fallback / markitdown / tesseract) can feed this module
 * with zero translation.
 */

/** ±1 Kč (100 haléř) — same screening tolerance `accounting-veto.ts` / `shadow-score.ts` use. */
const REVERIFY_TOLERANCE_MINOR = 100n

const absBig = (v: bigint): bigint => (v < 0n ? -v : v)
const absDiff = (a: bigint, b: bigint): bigint => absBig(a - b)

/** One independently-recomputed, field-scoped re-verification outcome. */
export interface ReVerificationCheck {
  readonly field: string
  readonly verified: boolean
  readonly reason: string
}

/**
 * The structured verdict `reverifyCapture` returns. NOT consumed by any gate —
 * see the module doc above.
 */
export interface ReVerificationVerdict {
  /**
   * STRICT AND over every check in `checks`. `true` only when every recomputed
   * field genuinely verified AND at least one check ran (an empty `checks`
   * array — which should not occur given the fixed leg set below — is treated
   * as unverified, never a vacuous pass). A future consumer wanting
   * field-by-field partial credit (the eventual M3.1 activation) reads
   * `checks` directly; wiring that read into the evidence-gate floor is OUT OF
   * SCOPE here.
   */
  readonly verified: boolean
  readonly checks: readonly ReVerificationCheck[]
}

/**
 * The re-extraction basis this module cross-checks a capture against — the
 * shape a genuine independent re-OCR / re-parse run over the SAME source
 * document would produce. Deliberately mirrors the canonical IR
 * `Invoice.vat_summary` / `Invoice.total_minor`
 * (`packages/brain/src/ir/records.ts`) so wiring a real extraction engine later
 * is a straight pass-through (`{ vatSummary: invoice.vat_summary, totalMinor:
 * invoice.total_minor }`), never a translation layer. Producing this value is
 * NOT this module's job — that is the extraction engine's (tracked
 * separately); this module only consumes it.
 */
export interface ReExtractedTotals {
  readonly vatSummary: ReadonlyArray<
    Pick<VatSummaryRow, "rate" | "base_minor" | "tax_minor">
  >
  readonly totalMinor: bigint
}

/** The capture-request domain fields this module reads. */
type CaptureFacts = Pick<
  CaptureAccountingDocumentRequest,
  "lines" | "roundingAmount" | "issuedAt"
>

/** Scale-2 rate key so a captured `"21.00"` string and a re-extracted `21` number compare exactly. */
function rateKeyFromDecimalString(rate: string): string {
  return decimalToMinor(rate).toString()
}
function rateKeyFromNumber(rate: number): string {
  return BigInt(Math.round(rate * 100)).toString()
}

/**
 * LEG A — internal arithmetic self-consistency, REUSED from the shadow-score's
 * `deriveServerVerify` (the same server-derivable VAT-arithmetic recomputation
 * `accounting-veto.ts`'s `deriveCaptureVeto` runs) rather than re-implemented a
 * third time in this file. This only proves the declared numbers are
 * SELF-consistent (`base * rate == vat`, dates well-formed); it does NOT prove
 * they match the source document — a consistently-fabricated pair still passes
 * this leg. That gap is exactly why LEG B (below) exists.
 */
function internalArithmeticChecks(
  captured: CaptureFacts,
): ReVerificationCheck[] {
  const derived = deriveServerVerify(captured)
  return [
    derived.vatBaseMatchesNet === undefined
      ? {
          field: "arithmetic.vatBaseMatchesNet",
          verified: false,
          reason:
            "no checkable STANDARD partial (rate + vatAmount) in the capture",
        }
      : {
          field: "arithmetic.vatBaseMatchesNet",
          verified: derived.vatBaseMatchesNet,
          reason: derived.vatBaseMatchesNet
            ? "every checkable partial's declared vatAmount matches recomputed base*rate"
            : "a checkable partial's declared vatAmount diverges from recomputed base*rate",
        },
    derived.periodConsistent === undefined
      ? {
          field: "arithmetic.periodConsistent",
          verified: false,
          reason: "no date basis present in the capture",
        }
      : {
          field: "arithmetic.periodConsistent",
          verified: derived.periodConsistent,
          reason: derived.periodConsistent
            ? "every date basis in the capture is present and well-formed"
            : "a date basis in the capture is missing or malformed",
        },
  ]
}

/**
 * LEG B (1/2) — the OCR template-basis confirmation. READ-ONLY: unlike
 * `accounting-veto.ts`'s `screenTemplateBasis` (which bumps `held_count`
 * telemetry because it injects a live hold signal), this module writes nothing
 * — it is a pure re-verification report, never in the write path.
 *
 * Fails CLOSED for an OCR capture with no templateId, an unresolvable
 * templateId, or an unconfirmed template — mirrors the trust gate the live
 * veto enforces, but as a positive confirmation check. `structured`/`manual`
 * captures carry no OCR extraction, so the check is Not Applicable (passes) —
 * same "OrNA" pattern as `VerifyChecks.rcChecklistPassesOrNA`.
 */
export async function reverifyTemplateBasis(
  db: OrganizationBoundDb,
  extractionMethod: ExtractionMethod | null | undefined,
  templateId: string | null | undefined,
): Promise<ReVerificationCheck> {
  const field = "template.confirmedBasisOrNA"
  const isOcr = extractionMethod == null || extractionMethod === "ocr"
  if (!isOcr) {
    return {
      field,
      verified: true,
      reason: `extractionMethod "${String(extractionMethod)}" carries no OCR extraction — not applicable`,
    }
  }
  if (templateId == null) {
    return {
      field,
      verified: false,
      reason:
        "OCR capture with no templateId — no basis to re-verify extraction against",
    }
  }
  const rows = await db
    .select({
      id: ocr_extraction_template.id,
      humanConfirmedAt: ocr_extraction_template.human_confirmed_at,
    })
    .from(ocr_extraction_template)
    .where(eq(ocr_extraction_template.id, templateId))
    .limit(1)
  const row = rows[0]
  if (!row) {
    return {
      field,
      verified: false,
      reason:
        "templateId does not resolve to a template row visible in this workspace",
    }
  }
  if (row.humanConfirmedAt === null) {
    return {
      field,
      verified: false,
      reason:
        "template is not yet human-confirmed — its locators are untrusted",
    }
  }
  return { field, verified: true, reason: "template is human-confirmed" }
}

/**
 * LEG B (2/2) — extraction-fidelity cross-check. Sums the captured lines per
 * VAT rate and overall, then compares against an INDEPENDENTLY re-extracted
 * source. Fails CLOSED (every field `verified: false`) when no re-extraction
 * source is supplied — extraction fidelity is structurally unrecomputable
 * without a second, independent pass over the same document; that absence is
 * reported honestly, never treated as a silent pass.
 */
export function reverifySumsAgainstReExtraction(
  captured: Pick<CaptureFacts, "lines" | "roundingAmount">,
  reExtracted: ReExtractedTotals | null,
): ReVerificationCheck[] {
  if (reExtracted == null) {
    return [
      {
        field: "document.total",
        verified: false,
        reason:
          "no independent re-extraction source supplied — extraction fidelity is unrecomputable, not a silent pass",
      },
    ]
  }

  const capturedByRate = new Map<string, { base: bigint; vat: bigint }>()
  let capturedTotal = 0n
  for (const line of captured.lines) {
    for (const p of line.partials) {
      const base = decimalToMinor(p.baseAmount)
      const vat = p.vatAmount != null ? decimalToMinor(p.vatAmount) : 0n
      capturedTotal += base + vat
      if (p.vatMode === "STANDARD" && p.vatRate != null) {
        const key = rateKeyFromDecimalString(p.vatRate)
        const acc = capturedByRate.get(key) ?? { base: 0n, vat: 0n }
        acc.base += base
        acc.vat += vat
        capturedByRate.set(key, acc)
      }
    }
  }
  if (captured.roundingAmount != null) {
    capturedTotal += decimalToMinor(captured.roundingAmount)
  }

  const reRateMap = new Map<string, { base: bigint; vat: bigint }>()
  for (const row of reExtracted.vatSummary) {
    reRateMap.set(rateKeyFromNumber(row.rate), {
      base: row.base_minor,
      vat: row.tax_minor,
    })
  }

  const checks: ReVerificationCheck[] = []
  const allRateKeys = new Set([...capturedByRate.keys(), ...reRateMap.keys()])
  for (const key of allRateKeys) {
    const field = `document.vatSummary[rate=${key}]`
    const c = capturedByRate.get(key)
    const r = reRateMap.get(key)
    if (!c || !r) {
      checks.push({
        field,
        verified: false,
        reason:
          "rate present in only one of the captured/re-extracted VAT summaries",
      })
      continue
    }
    const baseDiff = absDiff(c.base, r.base)
    const vatDiff = absDiff(c.vat, r.vat)
    checks.push(
      baseDiff > REVERIFY_TOLERANCE_MINOR || vatDiff > REVERIFY_TOLERANCE_MINOR
        ? {
            field,
            verified: false,
            reason: `captured base/vat (${minorToDecimal(c.base)}/${minorToDecimal(c.vat)}) diverges from the independently re-extracted source (${minorToDecimal(r.base)}/${minorToDecimal(r.vat)})`,
          }
        : {
            field,
            verified: true,
            reason:
              "captured base/vat matches the independently re-extracted source within tolerance",
          },
    )
  }

  const totalDiff = absDiff(capturedTotal, reExtracted.totalMinor)
  checks.push(
    totalDiff > REVERIFY_TOLERANCE_MINOR
      ? {
          field: "document.total",
          verified: false,
          reason: `captured total ${minorToDecimal(capturedTotal)} diverges from the independently re-extracted source total ${minorToDecimal(reExtracted.totalMinor)}`,
        }
      : {
          field: "document.total",
          verified: true,
          reason:
            "captured total matches the independently re-extracted source total within tolerance",
        },
  )
  return checks
}

/** Input for the combined re-verification pass. */
export interface ReverifyCaptureParams {
  readonly captured: CaptureFacts
  readonly extractionMethod: ExtractionMethod | null | undefined
  readonly templateId: string | null | undefined
  /** `null` when no independent re-extraction has been run for this capture yet. */
  readonly reExtracted: ReExtractedTotals | null
}

/**
 * The combined M3.1 re-verification pass: LEG A (reused internal-arithmetic
 * consistency) AND LEG B (template-basis confirmation + extraction-fidelity
 * cross-check against an independent re-extraction). PURE aside from the
 * read-only template lookup — never writes, never throws on a malformed
 * field (each leg degrades to a `verified: false` check instead).
 *
 * NOT CALLED FROM ANY WRITE PATH. See the module doc for the activation
 * boundary this deliberately stops short of.
 */
export async function reverifyCapture(
  db: OrganizationBoundDb,
  params: ReverifyCaptureParams,
): Promise<ReVerificationVerdict> {
  const checks: ReVerificationCheck[] = [
    ...internalArithmeticChecks(params.captured),
    ...reverifySumsAgainstReExtraction(params.captured, params.reExtracted),
    await reverifyTemplateBasis(db, params.extractionMethod, params.templateId),
  ]
  const verified = checks.length > 0 && checks.every((c) => c.verified)
  return { verified, checks }
}

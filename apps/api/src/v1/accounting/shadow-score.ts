import {
  computeCRaw,
  decimalToMinor,
  type ScoreInputs,
  TIER2_CAP_VALUES,
} from "@workspace/brain/confidence"

import type { EvidenceEnvelope } from "./evidence-gate"

/**
 * [W1.5] SHADOW-SCORE instrumentation for M3 calibration.
 *
 * A SECOND, PURE scoring pass that is persisted alongside the enforced verdict at
 * `tool_call_log.output_json.serverGate.shadow`. It is AUDIT-ONLY telemetry —
 * NEVER read for any enforcement decision. The enforced `score` (with the
 * `extraction_failed` cold-start floor) and the `autoApply` three-way AND stay
 * BYTE-IDENTICAL; this module only ADDS a diagnostic record.
 *
 * Its purpose is to give M3 a HONEST server-derivable x-axis before the cold-start
 * floor is lifted:
 *
 *   - `serverLane` uses the SAME epistemics W3.3b will eventually enforce — B2
 *     server-derivable ONLY. Base-score fields stay FLOORED (kbRule/extraction/
 *     reconciliation are not server-verifiable in v1); the verify booleans are
 *     RECOMPUTED server-side from the request payload (never trusted from the
 *     client claim); honored caps + server-derived signals fire, but the
 *     `extraction_failed` block is DROPPED so `serverLane.cRaw` is a real,
 *     non-zero number the future refit can consume.
 *   - `claimLane` scores the CLIENT's claims as-submitted (also without the
 *     `extraction_failed` block). DIAGNOSTIC ONLY — a client-belief number that
 *     must NEVER become a training x; it exists purely to compare against the
 *     server-honest lane.
 *   - `claimAudit` records, per server-derivable fact, what the client CLAIMED vs
 *     what the server DERIVED — per-write honesty telemetry.
 *
 * Neither lane carries a verdict: `serverLane.cRaw` / `claimLane.cRaw` are BARE
 * numbers. No `isGreen` / `needsReview` / `blocked`-as-verdict, and `GateDecision`
 * is deliberately NOT reused — the shadow can never be mistaken for an enforceable
 * decision.
 */

/** The formula-version anchor for post-hoc re-scoring of persisted shadow rows. */
const SHADOW_FORMULA_VERSION = 1 as const

/** ±1 Kč (100 haléř) — mirrors `VAT_TOLERANCE_MINOR` in accounting-veto.ts. */
const VAT_TOLERANCE_MINOR = 100n

/** Absolute value of a bigint. */
const abs = (v: bigint): bigint => (v < 0n ? -v : v)

/** The Tier-2 CAP signal kinds a client may self-report (honored fail-safe). */
const TIER2_CAP_KINDS: ReadonlySet<string> = new Set(
  Object.keys(TIER2_CAP_VALUES),
)

/** Defensive `decimalToMinor` — instrumentation must NEVER throw on a bad field. */
function tryDecimalToMinor(value: unknown): bigint | null {
  if (typeof value !== "string") return null
  try {
    return decimalToMinor(value)
  } catch {
    return null
  }
}

/** An ISO date/datetime string the write schemas accept (a present, parseable basis). */
function isWellFormedDate(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false
  return !Number.isNaN(Date.parse(value))
}

/** The server-derivable verify subset the shadow recomputes from the payload. */
export interface DerivedVerify {
  /**
   * `true` when the payload carries at least one CHECKABLE STANDARD partial (rate
   * + vatAmount present + parseable) AND every such partial's declared vatAmount
   * matches `base * rate` within tolerance. This is the exact arithmetic
   * `deriveCaptureVeto` runs — a payload it would fire `vat_mismatch` on derives
   * `false` here. Absent (no checkable partial) → not asserted.
   */
  vatBaseMatchesNet: boolean | undefined
  /**
   * `true` when every date basis the payload carries (top-level `issuedAt` /
   * `occurredAt` / `postingDate`) is present and well-formed. This is the STRONGEST
   * period-related fact derivable from the PAYLOAD ALONE — the true period-boundary
   * check needs the period's date range from the DB, which the shadow (a pure,
   * side-effect-free pass) deliberately does NOT read. Absent (no date basis) →
   * not asserted.
   */
  periodConsistent: boolean | undefined
}

/**
 * Recompute the server-derivable verify facts from the request body — the SAME
 * arithmetic `deriveCaptureVeto` uses, run UNCONDITIONALLY (never via the
 * confidenceOk-gated veto path) and NEVER trusting the client's verify claims.
 *
 * Only a capture body carries `lines[].partials[]` (VAT) and an `issuedAt`; events
 * / postings carry no partials, so `vatBaseMatchesNet` stays `undefined` there.
 * Non-throwing: a malformed field makes a fact `undefined`/`false`, never an error.
 */
export function deriveServerVerify(body: unknown): DerivedVerify {
  const b = (body ?? {}) as Record<string, unknown>

  // ── vatBaseMatchesNet — the deriveCaptureVeto VAT arithmetic, inverted. ──────
  let checkedAnyPartial = false
  let anyVatMismatch = false
  const lines = Array.isArray(b["lines"])
    ? (b["lines"] as ReadonlyArray<Record<string, unknown>>)
    : []
  for (const line of lines) {
    const partials = Array.isArray(line?.["partials"])
      ? (line["partials"] as ReadonlyArray<Record<string, unknown>>)
      : []
    for (const p of partials) {
      // Only STANDARD partials with a checkable rate + vatAmount are verifiable.
      if (p["vatMode"] !== "STANDARD") continue
      const rateScaled = tryDecimalToMinor(p["vatRate"])
      if (rateScaled === null) continue
      const baseMinor = tryDecimalToMinor(p["baseAmount"])
      if (baseMinor === null) continue
      const actual = tryDecimalToMinor(p["vatAmount"])
      // A nonzero rate with no checkable vatAmount is UNVERIFIABLE (deriveCaptureVeto
      // fires vat_amount_missing) — do not count it as a passing check.
      if (actual === null) {
        if (rateScaled > 0n) anyVatMismatch = true
        continue
      }
      checkedAnyPartial = true
      const expected = (abs(baseMinor) * rateScaled + 5000n) / 10000n
      const a = abs(actual)
      const diff = a > expected ? a - expected : expected - a
      if (diff > VAT_TOLERANCE_MINOR) anyVatMismatch = true
    }
  }
  const vatBaseMatchesNet =
    !checkedAnyPartial && !anyVatMismatch
      ? undefined // nothing checkable → not asserted
      : checkedAnyPartial && !anyVatMismatch

  // ── periodConsistent — payload-only date-basis presence/well-formedness. ─────
  const dateBases: unknown[] = []
  if ("issuedAt" in b) dateBases.push(b["issuedAt"])
  if ("occurredAt" in b) dateBases.push(b["occurredAt"])
  const entry = (b["entry"] ?? {}) as Record<string, unknown>
  if ("postingDate" in entry) dateBases.push(entry["postingDate"])
  const periodConsistent =
    dateBases.length === 0
      ? undefined
      : dateBases.every((d) => isWellFormedDate(d))

  return { vatBaseMatchesNet, periodConsistent }
}

/** The persisted shadow shape (jsonb — no migration). Bare numbers, no verdict. */
export interface ShadowScore {
  /** Formula-version anchor for post-hoc re-scoring. */
  v: typeof SHADOW_FORMULA_VERSION
  /** B2 server-derivable-only lane — the future-enforced epistemics. */
  serverLane: {
    inputs: {
      kbRule: "none"
      extractionQuality: 0
      verify: {
        vatBaseMatchesNet?: boolean
        periodConsistent?: boolean
      }
      reconciliation: "none"
      firedSignals: readonly string[]
    }
    /** `computeCRaw` of `inputs` — a NUMBER ONLY (no cFinal / isGreen / verdict). */
    cRaw: number
  }
  /** DIAGNOSTIC-only lane scoring the client's claims as-submitted. */
  claimLane: {
    /** `computeCRaw` of the client's claims — a NUMBER ONLY. NEVER a training x. */
    cRaw: number
  }
  /** Per-write client-honesty telemetry on the server-derivable verify subset. */
  claimAudit: {
    vatBaseMatchesNet: { claimed: boolean; derived: boolean }
    periodConsistent: { claimed: boolean; derived: boolean }
  }
}

/**
 * Build the shadow-score inputs + score, PURE. Takes the request body (for the
 * server-side verify re-derivation), the (optional) client evidence envelope, and
 * the SAME `serverDerivedSignals` the enforced score received. Returns the
 * persisted `ShadowScore`. NO side effects, no DB reads, never throws.
 *
 * `serverDerivedSignals` (e.g. `novel_template`) are honored on BOTH lanes: they
 * are server-derived add-only holds that lower `cRaw`. The `extraction_failed`
 * cold-start block is DELIBERATELY DROPPED from both lanes — that is the whole
 * point of the shadow (a real non-zero server x for the future refit).
 */
export function buildShadowScore(
  body: unknown,
  envelope: EvidenceEnvelope | null | undefined,
  serverDerivedSignals: readonly string[] = [],
): ShadowScore {
  const derived = deriveServerVerify(body)

  // Honored caps — the SAME fail-safe filter the enforced `buildScoreInputs` uses.
  const assertedCaps = (envelope?.capSignals ?? []).filter((k) =>
    TIER2_CAP_KINDS.has(k),
  )
  // NO `extraction_failed` on either lane (the deliberate difference vs enforced).
  const firedSignals = [...assertedCaps, ...serverDerivedSignals]

  // ── serverLane: B2 server-derivable ONLY. Base fields FLOORED; verify RECOMPUTED. ──
  const serverVerify: {
    vatBaseMatchesNet?: boolean
    periodConsistent?: boolean
  } = {}
  if (derived.vatBaseMatchesNet !== undefined) {
    serverVerify.vatBaseMatchesNet = derived.vatBaseMatchesNet
  }
  if (derived.periodConsistent !== undefined) {
    serverVerify.periodConsistent = derived.periodConsistent
  }
  const serverInputs: ScoreInputs = {
    firedSignals,
    kbRule: "none", // stays floored (NOT server-verifiable in v1)
    verify: serverVerify, // recomputed server-side (only payload-derivable facts)
    extractionQuality: 0, // stays floored
    reconciliation: "none", // stays floored (no bank feed in v1)
  }
  const serverCRaw = computeCRaw(serverInputs).cRaw

  // ── claimLane: the client's kbRule/extractionQuality/verify/reconciliation AS-CLAIMED. ──
  const claimInputs: ScoreInputs = {
    firedSignals,
    kbRule: envelope?.kbRule ?? "none",
    verify: {
      vatBaseMatchesNet: envelope?.vatBaseMatchesNet,
      rcChecklistPassesOrNA: envelope?.rcChecklistPassesOrNA,
      decree500Confirmed: envelope?.decree500Confirmed,
      periodConsistent: envelope?.periodConsistent,
      bankVsKsSsMatch: envelope?.bankVsKsSsMatch,
    },
    extractionQuality: envelope?.extractionQuality ?? 0,
    reconciliation: envelope?.reconciliation ?? "none",
  }
  const claimCRaw = computeCRaw(claimInputs).cRaw

  return {
    v: SHADOW_FORMULA_VERSION,
    serverLane: {
      inputs: {
        kbRule: "none",
        extractionQuality: 0,
        verify: serverVerify,
        reconciliation: "none",
        firedSignals,
      },
      cRaw: serverCRaw,
    },
    claimLane: { cRaw: claimCRaw },
    claimAudit: {
      vatBaseMatchesNet: {
        claimed: envelope?.vatBaseMatchesNet ?? false,
        derived: derived.vatBaseMatchesNet ?? false,
      },
      periodConsistent: {
        claimed: envelope?.periodConsistent ?? false,
        derived: derived.periodConsistent ?? false,
      },
    },
  }
}

import {
  decimalToMinor,
  firedHardClassSignals,
  NOVEL_TEMPLATE_KIND,
  UNVERIFIED_TEMPLATE_KIND,
} from "@workspace/brain/confidence"
import type { ExtractionMethod } from "@workspace/shared/api"
import {
  and,
  eq,
  inArray,
  isNull,
  type OrganizationBoundDb,
  sql,
} from "@workspace/db"
import { account, ocr_extraction_template } from "@workspace/db/schema"

/**
 * The SERVER-side confidence veto (closes the confident-wrong hole in #462's
 * gate, which trusted the CLIENT's `confidence` scalar at face value).
 *
 * A client can claim `confidence: 1.0` on a wrong booking; these checks derive
 * the dangerous hard-class / VAT signals from the payload the SERVER can verify
 * and force a HOLD when one fires, regardless of the claimed confidence. The
 * claimed confidence stays NECESSARY (>= threshold) but is no longer SUFFICIENT.
 *
 * Deliberately SCOPED (advisor-gated): only signals the payload actually betrays
 * and that the domain does NOT already reject. `balance_mismatch` is OUT — the
 * DB enforces double-entry balance. The full evidence-contract (client submits
 * structured signals, server re-verifies bank/KB/extraction) is the documented
 * follow-up; this veto covers the two payload-derivable vectors.
 */
export interface VetoResult {
  /** True => force HOLD even if the client claimed an auto-apply confidence. */
  readonly held: boolean
  /** The infra signals that fired (persisted to the audit trail). */
  readonly signals: readonly string[]
}

const NO_VETO: VetoResult = { held: false, signals: [] }

/**
 * Tier-3 register-card veto — an UNCONDITIONAL hold for the master-data creators
 * (`createAsset` / `createDepreciationPlan` / `createInventoryCount`). These write
 * org-level master data (an asset card / odpisový plán / inventurní soupis) that
 * SEEDS every future depreciation or inventory posting for years, yet carries no
 * VAT/posting arithmetic the payload vetoes can screen and no amount large enough
 * to reliably trip the always-hold ceiling (an inventory count has no amount at
 * all). Resting their always-hold posture on the cold-start score floor alone
 * would make them silently auto-applyable the moment the calibration map is
 * fitted post-launch. This veto makes the "a human always reviews agent-authored
 * master data" decision EXPLICIT and durable: it only fires when the write would
 * otherwise auto-apply (the gate computes the veto for auto-apply candidates
 * only), so it costs nothing pre-launch and closes the post-launch auto-apply
 * path deliberately rather than by accident.
 */
export function deriveRegisterCardVeto(): VetoResult {
  return { held: true, signals: ["master_data_always_review"] }
}

/** Absolute value of a bigint (a storno/negative amount still counts toward the DHM threshold). */
const abs = (v: bigint): bigint => (v < 0n ? -v : v)

/**
 * Capitalization-plausible expense accounts — the classic prior error is a fixed
 * asset (042 -> 022) expensed to consumption/services. Explicitly EXCLUDES 52x
 * payroll, 54x/55x, 56x financial (never capitalization candidates) so the veto
 * does not flood the queue with legitimate salary/rent/service postings.
 */
const CAPITALIZATION_EXPENSE_SYNTHETICS: ReadonlySet<string> = new Set([
  "501", // spotřeba materiálu
  "502", // spotřeba energie
  "503", // spotřeba ostatních neskladovatelných dodávek
  "504", // prodané zboží
  "505", // aktivace (rare, but a large debit here can hide an asset)
  "511", // opravy a udržování (can be a capitalizable technical improvement)
  "512", // cestovné
  "513", // náklady na reprezentaci
  "518", // ostatní služby
  "548", // ostatní provozní náklady
])

/** ±1 Kč (100 haléř): absorbs legitimate per-invoice VAT rounding, catches gross errors. */
const VAT_TOLERANCE_MINOR = 100n

/**
 * Posting veto — fires `asset_vs_expense` when a DEBIT to a capitalization-
 * plausible expense account (aggregated per account within the posting) reaches
 * the DHM 40 000 Kč threshold. ONLY double-entry postings carry accounts/sides;
 * monetary (cash-book) postings pass through untouched.
 */
export async function derivePostingVeto(
  db: OrganizationBoundDb,
  organizationId: string,
  kind: unknown,
  entry: unknown,
): Promise<VetoResult> {
  if (kind !== "double") return NO_VETO
  const lines =
    (entry as { lines?: ReadonlyArray<Record<string, unknown>> }).lines ?? []

  // Aggregate DEBIT amounts (haléř) per accountId — a single asset split across
  // several lines to the same account still crosses the threshold as one sum.
  const debitByAccount = new Map<string, bigint>()
  for (const line of lines) {
    if (line["side"] !== "DEBIT") continue
    const accountId = line["accountId"]
    const amount = line["amount"]
    if (typeof accountId !== "string" || typeof amount !== "string") continue
    debitByAccount.set(
      accountId,
      (debitByAccount.get(accountId) ?? 0n) + abs(decimalToMinor(amount)),
    )
  }
  if (debitByAccount.size === 0) return NO_VETO

  // Resolve accountId -> account.number inside the RLS-scoped tx (the payload
  // carries UUIDs, not codes). Only the caller's org is visible (FORCE RLS).
  const rows = await db
    .select({ id: account.id, number: account.number })
    .from(account)
    .where(
      and(
        eq(account.organization_id, organizationId),
        inArray(account.id, [...debitByAccount.keys()]),
      ),
    )

  // Aggregate per SYNTHETIC (3-digit) account, not per analytic accountId — a
  // 50k asset split across analytics 518.001 + 518.002 must still cross the DHM
  // threshold as one 518 sum (advisor-flagged split-evasion).
  const debitBySynthetic = new Map<string, bigint>()
  for (const row of rows) {
    const synthetic = row.number.replace(".", "").slice(0, 3)
    if (!CAPITALIZATION_EXPENSE_SYNTHETICS.has(synthetic)) continue
    debitBySynthetic.set(
      synthetic,
      (debitBySynthetic.get(synthetic) ?? 0n) +
        (debitByAccount.get(row.id) ?? 0n),
    )
  }

  const signals = new Set<string>()
  for (const agg of debitBySynthetic.values()) {
    const fired = firedHardClassSignals(["asset_vs_expense"], {
      amountMinor: agg,
    })
    for (const s of fired) signals.add(s)
  }
  return signals.size > 0 ? { held: true, signals: [...signals] } : NO_VETO
}

/**
 * Capture veto — the M-E positive-safety screen. HOLDS a partial the server
 * cannot positively verify as safe (safe-direction: auto-apply only what it can
 * screen). Fires:
 *   - `unverified_vat_regime` — ANY non-STANDARD `vatMode` (REVERSE_CHARGE /
 *     EXEMPT / OUTSIDE_VAT / IMPORT). The server cannot verify special-regime VAT
 *     from the payload (a domestic supply mislabeled REVERSE_CHARGE looks
 *     internally consistent), so it routes to human review instead of trusting
 *     the claimed mode — closing the "claim a non-STANDARD mode to dodge the VAT
 *     check" vector. (#464's evidence contract restores auto-apply for a
 *     PROVEN-safe reverse-charge via a re-verifiable checklist.) ALSO fires for a
 *     STANDARD partial with a null/absent `vatRate` ([G3-B1]): with no rate the
 *     VAT-arithmetic screen below cannot run, so a claimed STANDARD regime the
 *     server cannot verify is held rather than auto-applied.
 *   - `vat_amount_missing` — STANDARD + a nonzero rate but NO declared
 *     `vatAmount` (unverifiable → hold).
 *   - `vat_mismatch` — STANDARD + declared `vatAmount` off from `base * rate` by
 *     > the tolerance. The domain stores `vatAmount` as given (never re-derives
 *     it), so this is the only server check of VAT arithmetic.
 * NOTE the irreducible residual (not closable here): a STANDARD supply with the
 * WRONG rate but self-consistent arithmetic, or a sub-40k misclassification —
 * caught downstream (VAT-return reconciliation) + by human review of held writes.
 */
export function deriveCaptureVeto(
  lines: ReadonlyArray<Record<string, unknown>>,
): VetoResult {
  const signals = new Set<string>()
  for (const line of lines ?? []) {
    const partials =
      (line["partials"] as ReadonlyArray<Record<string, unknown>>) ?? []
    for (const p of partials) {
      if (p["vatMode"] !== "STANDARD") {
        signals.add("unverified_vat_regime")
        continue
      }
      const vatRate = p["vatRate"]
      const baseAmount = p["baseAmount"]
      // [G3-B1] STANDARD with a null/absent rate is UNVERIFIABLE: with no rate the
      // whole VAT-arithmetic screen (vat_amount_missing / vat_mismatch below) goes
      // dark, so a STANDARD + vatRate=null + no vatAmount payload would otherwise
      // slip the veto entirely and auto-apply on the client scalar. The domain
      // accepts a null rate, so we cannot lean on it — HOLD as unverified regime.
      if (typeof vatRate !== "string") {
        signals.add("unverified_vat_regime")
        continue
      }
      if (typeof baseAmount !== "string") continue
      const rateScaled = decimalToMinor(vatRate)
      const vatAmount = p["vatAmount"]
      if (typeof vatAmount !== "string") {
        // A nonzero STANDARD rate MUST carry a checkable vatAmount; missing one
        // cannot be verified, so hold. (Rate 0 with no vatAmount is fine.)
        if (rateScaled > 0n) signals.add("vat_amount_missing")
        continue
      }
      const baseMinor = abs(decimalToMinor(baseAmount))
      // rate "21.00" -> 2100 hundredths-of-a-percent; expected = base * rate/100.
      const expected = (baseMinor * rateScaled + 5000n) / 10000n
      const actual = abs(decimalToMinor(vatAmount))
      const diff = actual > expected ? actual - expected : expected - actual
      if (diff > VAT_TOLERANCE_MINOR) signals.add("vat_mismatch")
    }
  }
  return signals.size > 0 ? { held: true, signals: [...signals] } : NO_VETO
}

/**
 * The Tier-3 DEFER signal an unconfirmed OCR template injects into the score.
 * Re-exported from the brain taxonomy's `NOVEL_TEMPLATE_KIND` (the single source
 * of truth in `packages/brain/src/confidence/signals.ts`), NOT a decoupled
 * literal: removing/renaming the taxonomy entry breaks this — and the veto — at
 * compile time instead of silently going inert.
 */
export const NOVEL_TEMPLATE_SIGNAL = NOVEL_TEMPLATE_KIND

/**
 * The Tier-3 DEFER signal an OCR capture injects when the server cannot tie it to
 * a CONFIRMED template (see {@link screenTemplateBasis}). Re-exported from the
 * brain taxonomy's `UNVERIFIED_TEMPLATE_KIND` (single source of truth), NOT a
 * decoupled literal.
 */
export const UNVERIFIED_TEMPLATE_SIGNAL = UNVERIFIED_TEMPLATE_KIND

/** What the OCR-template basis screen decided — the two add-only hold signals. */
export interface TemplateBasisResult {
  /**
   * `true` when the capture references a template ROW that a human has NOT yet
   * confirmed (`human_confirmed_at IS NULL`) → injects `novel_template`.
   */
  readonly templateNovel: boolean
  /**
   * `true` when an OCR capture cannot be positively tied to ANY confirmed
   * template basis (templateId absent, or resolving to no row under RLS) →
   * injects `unverified_template`.
   */
  readonly ocrUnverified: boolean
}

/**
 * [WS-2 / B1.5 / #554] The server-DERIVED OCR-template basis screen — the
 * OCR-template leg of the confident-wrong defense, in ONE row fetch.
 *
 * An OCR extraction template whose field-locators a human has NOT yet confirmed
 * (`ocr_extraction_template.human_confirmed_at IS NULL`) is UNTRUSTED, and an OCR
 * capture the server cannot tie to a CONFIRMED template basis at all is equally
 * untrusted. Both force the SCORE sub-green (`cRaw = 0` → HELD regardless of any
 * fitted calibration map) via a Tier-3 DEFER signal the gate injects into the
 * score's `firedSignals`. The two outcomes are DISJOINT — a given capture fires at
 * most one — and are computed from a SINGLE `{id, human_confirmed_at}` fetch:
 *
 *   - templateId present + row found + `human_confirmed_at IS NULL` →
 *     `templateNovel` (bumps `held_count` in-tx for telemetry).
 *   - templateId present + row found + confirmed → neither (auto-apply-eligible).
 *   - (templateId ABSENT, or resolving to NO row under RLS) → `ocrUnverified`,
 *     UNCONDITIONALLY — [#565] the declared `extractionMethod` (missing OR any
 *     declared value) can no longer skip this leg; see the closure note below.
 *
 * SERVER-DERIVED, never a client signal: the row is read inside the write's own
 * transaction, never from the client envelope. A client CANNOT forge either signal
 * (a Tier-3 kind is not a Tier-2 cap, so `buildScoreInputs` drops it if asserted)
 * nor OMIT — nor, since [#565], DECLARE — its way past `ocrUnverified` (a missing
 * templateId, a foreign templateId, and any `extractionMethod` value all fail
 * CLOSED). Both are add-only: they compose into the three-way AND as an added
 * hold and can never release a write.
 *
 * The lookup is WORKSPACE-scoped: `ocr_extraction_template` is shared across the
 * office's orgs (ADR-0029). It resolves under RLS here because the enclosing
 * `withOrganization` tx ALSO sets `app.workspace_id` (derived from the org row),
 * and the table's workspace RLS policies key on that GUC — so a workspace-scoped
 * read of the template inside the org tx sees exactly this workspace's rows.
 *
 * NAME is honest about the WRITE: this is not a pure read like its
 * `deriveCaptureVeto`/`derivePostingVeto` siblings — it bumps `held_count` in-tx
 * for telemetry on each `templateNovel` hold it forces.
 *
 * [#565] CLOSED route-around: the DECLARED `extractionMethod` is client-supplied
 * and NOT server-verifiable in v1 — a client that labels an actually-OCR capture
 * `"structured"`/`"manual"` could dodge the `ocrUnverified` leg undetectably if a
 * declared non-`"ocr"` value were trusted to SKIP it (only the field's ABSENCE
 * used to be checkable). Until server-side extraction re-verification exists
 * (M3.1/W3.3a), the declared method is now ADVISORY ONLY for this leg: it can
 * never lower the hold. Every capture with NO confirmed template basis (omitted
 * OR foreign templateId) is treated as potentially OCR-sourced, unconditionally —
 * `extractionMethod` stays a parameter (kept for future audit/telemetry use) but
 * is intentionally not read for this decision anymore. TIGHTENING-only: the
 * prior "structured"/"manual" skip is gone, so `ocrUnverified` can now fire in
 * strictly more cases than before, never fewer.
 *
 * `/v1/invoices` now wires this SAME seam (route-around (b) — it used to run
 * `captureDocument` through `runGatedWrite` with neither template leg wired at
 * all); both capture paths are covered.
 */
export async function screenTemplateBasis(
  db: OrganizationBoundDb,
  extractionMethod: ExtractionMethod | null | undefined,
  templateId: string | null | undefined,
): Promise<TemplateBasisResult> {
  // [#565] No templateId at all → nothing to fetch. Every capture with no
  // confirmed template basis is `ocrUnverified` — the declared extractionMethod
  // no longer gets a say (see the closure note above).
  if (templateId == null) {
    return { templateNovel: false, ocrUnverified: true }
  }

  // ONE workspace-scoped fetch of {id, human_confirmed_at}; RLS narrows to this
  // workspace's templates (see the doc comment on app.workspace_id).
  const rows = await db
    .select({
      id: ocr_extraction_template.id,
      humanConfirmedAt: ocr_extraction_template.human_confirmed_at,
    })
    .from(ocr_extraction_template)
    .where(eq(ocr_extraction_template.id, templateId))
    .limit(1)

  const row = rows[0]
  // Resolves to no row under this workspace's RLS (forged/foreign/nonexistent) →
  // the same `ocrUnverified` fail-closed case as an absent templateId.
  if (!row) {
    return { templateNovel: false, ocrUnverified: true }
  }
  // Row found + already human-confirmed → trusted, no hold on either leg.
  if (row.humanConfirmedAt !== null) {
    return { templateNovel: false, ocrUnverified: false }
  }

  // Row found + unconfirmed → `novel_template`. Telemetry: bump held_count on the
  // hold. Same predicate (unconfirmed) so we never inflate it for a confirmed one.
  await db
    .update(ocr_extraction_template)
    .set({ held_count: sql`${ocr_extraction_template.held_count} + 1` })
    .where(
      and(
        eq(ocr_extraction_template.id, templateId),
        isNull(ocr_extraction_template.human_confirmed_at),
      ),
    )

  return { templateNovel: true, ocrUnverified: false }
}

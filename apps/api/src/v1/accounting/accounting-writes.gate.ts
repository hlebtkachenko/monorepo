import { createHash } from "node:crypto"

import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"
import {
  type AdmissionController,
  AdmissionRejected,
  type AdmissionSlot,
  lockPeriodInTx,
  updateToolCallLogOutput,
  withOrganization,
  writeToolCallLog,
} from "@workspace/db"
import {
  ConflictError,
  ForbiddenError,
  IdempotencyConflictError,
  RateLimitedError,
  ValidationError,
} from "@workspace/shared/errors"

import type { GateDecision } from "@workspace/brain/gate"

import { accountingAdmission } from "./admission.singleton"
import {
  NOVEL_TEMPLATE_SIGNAL,
  UNVERIFIED_TEMPLATE_SIGNAL,
  type VetoResult,
} from "./accounting-veto"
import { evaluateEvidence, type EvidenceEnvelope } from "./evidence-gate"
import { buildShadowScore } from "./shadow-score"
import { translateAccountingError } from "./accounting-error"

// A non-finite override (e.g. "100 000" / "100,000" → NaN) would silently
// disable the amount hold fleet-wide, so fall back to the documented default.
const rawThreshold = Number(
  process.env["ACCOUNTING_AUTO_APPLY_THRESHOLD"] ?? "0.9",
)
const AUTO_APPLY_THRESHOLD = Number.isFinite(rawThreshold) ? rawThreshold : 0.9
/** Any single amount above this (CZK) is HELD regardless of claimed confidence. */
const rawHold = Number(process.env["ACCOUNTING_ALWAYS_HOLD_AMOUNT"] ?? "100000")
const ALWAYS_HOLD_AMOUNT = Number.isFinite(rawHold) ? rawHold : 100000

/** The organization-bound tx handle `withOrganization` hands its callback. */
type OrgTx = Parameters<Parameters<typeof withOrganization>[2]>[0]

/** Sorted-key canonical JSON → stable idempotency payload hash. */
export function canonicalHash(value: unknown): string {
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys)
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
      )
    }
    return v
  }
  return createHash("sha256")
    .update(JSON.stringify(sortKeys(value)), "utf8")
    .digest("hex")
}

export interface GatedWriteResult {
  httpStatus: number
  body: Record<string, unknown>
  replayed: boolean
}

export interface GatedWriteOptions<T> {
  principal: ApiKeyPrincipal
  idempotencyKey: string | undefined
  operationId: string
  /** Full request body — hashed for idempotency + persisted to the audit log. */
  body: unknown
  /**
   * The accounting period this write targets (top-level `periodId` for
   * events/documents, `entry.periodId` for postings). The per-(org, period)
   * advisory lock is keyed on it so concurrent writes to one period serialize.
   */
  periodId: string
  confidence: number
  rationale: string
  conversationId?: string
  /**
   * The client's self-reported evidence envelope ([WP-D] #464). Scored SERVER-side
   * via the fail-closed `evaluateEvidence` — the client claim is never consumed
   * directly. Optional: a write with no envelope still runs the (degraded) score,
   * so green stays unreachable at cold start regardless.
   */
  signals?: EvidenceEnvelope | null
  /**
   * [WS-2] OCR extraction template this capture was derived from (`null`/absent
   * for structured-export captures). NOT domain data — it never reaches the
   * domain mutation; it is persisted with the gated write (audit `serverGate`)
   * and passed to `deriveVeto` so a future server veto leg can key off the
   * template's confirmation state. Optional: ops with no template omit it.
   */
  templateId?: string | null
  /** Decimal-string amounts tested against the always-hold ceiling. */
  holdAmounts: string[]
  /**
   * Server-side confidence veto (M-B). Computed IN-TX for auto-apply candidates
   * only; if it holds, the write is forced to HELD regardless of the claimed
   * confidence — this is what stops a client forging a green. Optional: ops with
   * no payload-derivable signal (e.g. createEvent) omit it.
   */
  deriveVeto?: (db: OrgTx) => Promise<VetoResult>
  /**
   * [WS-2 / B1.5 / #554] Server-DERIVED OCR-template basis screen. Reads the
   * referenced OCR template IN-TX (workspace-scoped, resolves under the org tx's
   * `app.workspace_id`) in ONE fetch and returns the two add-only hold signals:
   * `templateNovel` (found + unconfirmed → `novel_template`, bumps `held_count`)
   * and `ocrUnverified` (OCR capture with no confirmed template basis → absent or
   * foreign templateId → `unverified_template`). The gate injects the fired signals
   * into the SCORE's `firedSignals`, forcing `cRaw=0` → HELD regardless of any
   * calibration. Neither is a client signal (a client-asserted Tier-3 kind is
   * dropped by `buildScoreInputs`) — they compose into the three-way AND as added
   * holds, never a release. Optional: only the capture path wires it, and it is run
   * ONLY for an AGENT key. NAME is honest about the in-tx `held_count` bump the
   * screen performs on a novel hold (not a pure read).
   */
  screenTemplateBasis?: (db: OrgTx) => Promise<{
    templateNovel: boolean
    ocrUnverified: boolean
  }>
  /** Run the domain mutation. Only called when the write auto-applies. */
  run: (
    db: OrgTx,
    ctx: { organizationId: string; workspaceId: string },
  ) => Promise<T>
  /** Map the domain result to the applied-response body (sans `status`). */
  applied: (result: T) => Record<string, unknown>
}

/**
 * The write gate for the Afframe Brain: idempotency (via `tool_call_log`) +
 * confidence/amount hold, in ONE `withOrganization` transaction so the audit
 * log row and the domain write commit or roll back together (a failed write
 * never burns the idempotency key). The tenant + responsible user come only
 * from the principal.
 */
export async function runGatedWrite<T>(
  opts: GatedWriteOptions<T>,
): Promise<GatedWriteResult> {
  // Production entry: EXACTLY one parameter, so no caller can override the
  // fail-closed admission / scoring seams. The invariant is enforced by the
  // TYPE SYSTEM — a production caller trying to pass a permissive scorer is a
  // TS2554 compile error, strictly stronger than a source scan ([#519]).
  return runGatedWriteWithSeams(opts, accountingAdmission, evaluateEvidence)
}

/**
 * TEST-ONLY seam form. The injectable `admission` + `scoreEvidence` let a test
 * exercise the admission / auto-apply legs without a fabricated cFinal. NEVER
 * call this from production code — call {@link runGatedWrite}. The #519 boundary
 * test asserts no non-test file references this symbol, so the server-score leg
 * of the three-way AND can never be vacated by a real caller.
 */
export async function runGatedWriteWithSeams<T>(
  opts: GatedWriteOptions<T>,
  admission: AdmissionController,
  scoreEvidence: (
    signals: EvidenceEnvelope | null | undefined,
    serverDerivedSignals?: readonly string[],
  ) => GateDecision,
): Promise<GatedWriteResult> {
  const { principal, idempotencyKey, operationId, body } = opts

  if (!idempotencyKey || idempotencyKey.length > 255) {
    throw new ValidationError(
      "An Idempotency-Key header (1–255 chars) is required for accounting writes",
    )
  }
  if (principal.userId === null) {
    throw new ForbiddenError(
      "Accounting writes require a user-bound API key (responsible person)",
    )
  }
  const userId = principal.userId

  // EPIC-R marshrutizátor front door: admit the run (kill-switch + concurrency
  // caps) BEFORE opening a transaction. All v1 accounting writes are agent
  // traffic (the review UI uses Server Actions, not this API), so every write is
  // gated; held-write RESOLVE is exempt. A rejection maps to 429 (already a
  // documented response for these ops — no contract change).
  let slot: AdmissionSlot
  try {
    slot = admission.acquire(principal.organizationId)
  } catch (e) {
    if (e instanceof AdmissionRejected) {
      throw new RateLimitedError(
        e.reason === "kill_switch_inactive"
          ? "The accounting write runtime is disabled (BRAIN_RUNTIME_ACTIVE off)"
          : "Too many concurrent accounting runs; retry shortly",
      )
    }
    throw e
  }

  try {
    const payloadHash = canonicalHash(body)
    // Float `Number()` is intentional here: this is a coarse SCREENING check
    // against the always-hold ceiling (~1e-10 relative error at 100k is
    // immaterial to a hold decision), NEVER a booked amount. Any amount that is
    // actually posted MUST go through the string-math `decimalToMinor` helper.
    const amountHold = opts.holdAmounts.some(
      (a) => Math.abs(Number(a)) > ALWAYS_HOLD_AMOUNT,
    )
    // [#517] The actor is AI if EITHER the tamper-proof key capability says so
    // (an `agent` key, authoritative + unspoofable) OR the client-supplied
    // conversationId heuristic does (a human driving an AI assistant). Only a
    // bare human key with no conversation stamps `human`.
    const actorKind =
      principal.actorKind === "agent" || opts.conversationId
        ? "ai_on_behalf"
        : "human"

    // [W1.2] An `ai_on_behalf` audit row REQUIRES both userId and
    // conversationId (packages/db `validateActorKind`). userId is guaranteed
    // non-null above; conversationId is the client's responsibility. A
    // user-bound AGENT key (`actorKind === "agent"`) that OMITS conversationId
    // would stamp `ai_on_behalf` with a null conversationId, and
    // `writeToolCallLog` would throw a plain Error deep in the write path — a
    // 500 for a client mistake. Surface it as a 4xx at the request boundary,
    // BEFORE the transaction opens. The invariant is unchanged; only its
    // transport is (500 → 422). A human key that supplies a conversationId
    // always has one here by construction, so this only guards the agent case.
    if (actorKind === "ai_on_behalf" && !opts.conversationId) {
      throw new ValidationError(
        "conversationId is required for a user-bound agent key",
      )
    }

    type TxOutcome =
      | { kind: "replay"; prior: Record<string, unknown> }
      | { kind: "applied"; body: Record<string, unknown> }
      | { kind: "held"; body: Record<string, unknown> }

    let outcome: TxOutcome
    try {
      outcome = await withOrganization(
        principal.organizationId,
        userId,
        async (db): Promise<TxOutcome> => {
          const log = await writeToolCallLog(db, {
            organizationId: principal.organizationId,
            toolName: operationId,
            idempotencyKey,
            actorKind,
            userId,
            conversationId: opts.conversationId ?? null,
            input: body,
            confidence: opts.confidence,
          })

          if (log.replayed) {
            const prior = log.existingOutput as
              | (Record<string, unknown> & { payloadHash?: string })
              | null
            if (!prior) {
              throw new ConflictError(
                "A previous request with this idempotency key is still in progress or failed; use a new key",
              )
            }
            if (prior.payloadHash !== payloadHash) {
              throw new IdempotencyConflictError(
                "This idempotency key was used with a different request body",
              )
            }
            return { kind: "replay", prior }
          }

          // [WP-D] Live auto-apply requires a THREE-WAY AND, each leg independent:
          //   (1) client confidence >= threshold AND not an amount hold
          //       (NECESSARY, never sufficient — the client scalar alone can never
          //       green a write);
          //   (2) the server VETO does not hold (`deriveCaptureVeto` /
          //       `derivePostingVeto` — derives dangerous hard-class / VAT signals
          //       from the payload; stays INDEPENDENT and is NEVER routed through
          //       the score engine or calibration [G2-B1]);
          //   (3) the server SCORE is green — `evaluateEvidence` degrades every
          //       unverifiable client claim fail-closed and scores it server-side,
          //       so a client cannot forge a green via the `signals` envelope. At
          //       cold start green is structurally unreachable → everything HELD
          //       ([G3-R1], the intended pre-launch posture).
          // The veto + score are computed only when the write would otherwise
          // auto-apply (a confidence/amount hold needs neither lookup).
          const confidenceOk =
            opts.confidence >= AUTO_APPLY_THRESHOLD && !amountHold
          const veto: VetoResult =
            confidenceOk && opts.deriveVeto
              ? await opts.deriveVeto(db)
              : { held: false, signals: [] }
          // [WS-2 / B1.5 / #554] Server-DERIVED OCR-template basis screen. Run ONLY
          // for an AGENT key (tamper-proof capability, NOT the conversationId-
          // broadened actorKind). ONE in-tx fetch yields both add-only hold signals:
          // `templateNovel` (found + unconfirmed → `novel_template`) and
          // `ocrUnverified` (OCR capture with no confirmed template basis — the
          // omitted/foreign-templateId bypass #554 closes → `unverified_template`).
          // The two are DISJOINT (a capture fires at most one). Each fired signal is
          // injected into the SCORE's firedSignals → forces cRaw=0 → HELD regardless
          // of calibration. Server-side + fail-closed (a client can neither forge
          // nor omit past them), so they compose into the AND as ADDED holds, never
          // a release. Read in-tx even for non-auto-apply candidates so the score is
          // honest; skipped for a human key (nothing to hold).
          const { templateNovel, ocrUnverified } =
            principal.actorKind === "agent" && opts.screenTemplateBasis
              ? await opts.screenTemplateBasis(db)
              : { templateNovel: false, ocrUnverified: false }
          const serverDerivedSignals: string[] = [
            ...(templateNovel ? [NOVEL_TEMPLATE_SIGNAL] : []),
            ...(ocrUnverified ? [UNVERIFIED_TEMPLATE_SIGNAL] : []),
          ]
          // The server verdict is ALWAYS computed for the audit trail (persisted
          // to output_json.serverGate); its `isGreen` gates auto-apply. Never a
          // fabricated cFinal — this is the honest scoreProposal output. The
          // server-derived signals (e.g. novel_template) are injected here, so an
          // unconfirmed template blocks the score itself, not just the AND result.
          const score = scoreEvidence(opts.signals, serverDerivedSignals)
          const autoApply = confidenceOk && !veto.held && score.isGreen
          // [W1.5] SHADOW score — a SECOND, PURE scoring pass for M3 calibration,
          // persisted at `serverGate.shadow` (jsonb, no migration). It is
          // AUDIT-ONLY telemetry, NEVER referenced by `autoApply` (the enforced
          // three-way AND above is unchanged) — the enforced `score` keeps its
          // `extraction_failed` cold-start floor; the shadow drops it to yield a
          // real non-zero server-derivable x for the future refit. See
          // shadow-score.ts. Computed from the SAME serverDerivedSignals so the
          // honored caps + server holds are reflected on both lanes.
          const shadow = buildShadowScore(
            opts.body,
            opts.signals,
            serverDerivedSignals,
          )
          // The combined server-gate audit record: the independent veto + the
          // honest score verdict (cRaw/cFinal/isGreen/reasons/firedSignals). This
          // is the `output_json.serverGate` payload — audit-only, stripped from
          // the replay body.
          const serverGate = {
            veto,
            score: {
              cRaw: score.cRaw,
              cFinal: score.cFinal,
              isGreen: score.isGreen,
              blocked: score.blocked,
              firedSignals: score.firedSignals,
              reasons: score.reasons,
            },
            // [W1.5] Pure instrumentation for M3 — NEVER read for a decision.
            shadow,
            // [WS-2] The OCR template the capture was derived from, persisted with
            // the gated write so the template-novelty leg (template not
            // human-confirmed → hold) can be audited. Audit-only, stripped from
            // the replay body like the rest of `serverGate`. `templateNovel`
            // records whether the server-derived screen fired `novel_template`.
            templateId: opts.templateId ?? null,
            templateNovel,
            // [#554] Records whether the OCR fail-closed leg fired
            // `unverified_template` (OCR capture with no confirmed template basis).
            ocrUnverified,
          }

          if (autoApply) {
            // Serialize concurrent writes to this (org, period) on the SAME
            // bound tx that holds the RLS GUCs (ADR-0028) — protects the
            // allocateNumber read-modify-write and orders same-period posts. The
            // closePeriod takes this SAME lock (packages/accounting period.ts),
            // so the close-vs-post race is closed on both sides. Held writes take
            // no lock (they touch only the audit log, not the period).
            await lockPeriodInTx(db, principal.organizationId, opts.periodId)
            const result = await opts.run(db, {
              organizationId: principal.organizationId,
              workspaceId: principal.workspaceId,
            })
            const appliedBody = { status: "applied", ...opts.applied(result) }
            await updateToolCallLogOutput(db, {
              toolCallLogId: log.toolCallLogId,
              // `serverGate` is audit-only — stripped from the replay body.
              output: { payloadHash, serverGate, ...appliedBody },
              autoApplied: true,
              rationale: opts.rationale,
            })
            return { kind: "applied", body: appliedBody }
          }

          const heldBody = { status: "held", reviewId: log.toolCallLogId }
          await updateToolCallLogOutput(db, {
            toolCallLogId: log.toolCallLogId,
            // Persist the FULL held body (incl. reviewId) so a same-key replay
            // returns the review handle, not a bare {status:"held"}. `serverGate`
            // records WHY the server held (veto signals + score verdict) for the
            // audit trail.
            output: { payloadHash, serverGate, ...heldBody },
            autoApplied: false,
            rationale: opts.rationale,
          })
          return { kind: "held", body: heldBody }
        },
      )
    } catch (e) {
      translateAccountingError(e)
    }

    if (outcome.kind === "replay") {
      // Strip the internal audit keys (payloadHash + serverGate) so the replayed
      // response body matches the original (client never saw them).
      const {
        payloadHash: _omit,
        serverGate: _serverGate,
        ...replayBody
      } = outcome.prior
      // A held write replays as 202 (still awaiting review), applied as 200.
      const httpStatus = replayBody["status"] === "held" ? 202 : 200
      return { httpStatus, body: replayBody, replayed: true }
    }
    if (outcome.kind === "applied") {
      return { httpStatus: 201, body: outcome.body, replayed: false }
    }
    return { httpStatus: 202, body: outcome.body, replayed: false }
  } finally {
    // Free the admission slot on EVERY exit path (applied / held / replay /
    // throw) so a run never leaks a concurrency slot. Release is idempotent.
    slot.release()
  }
}

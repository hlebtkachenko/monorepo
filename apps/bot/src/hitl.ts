import type { ApprovalRecord } from "./state/store.js"

export interface AnswerView {
  id: string
  kind: "choice" | "text"
  /** Chosen option, applied onTimeout value, "cancelled", or null. */
  decision: string | null
  /** Free-text reply, or null. */
  text: string | null
  /** True once resolved — by a tap, a text reply, OR an applied timeout policy. */
  answered: boolean
  pending: boolean
  /** Past TTL with NO answer and NO timeout policy. */
  expired: boolean
  /** Resolved by the onTimeout policy (answered is also true; decision carries the value). */
  timedOut: boolean
  options: string[]
}

/**
 * Validate an /ask callbackUrl: must parse and be https:. The worker POSTs the
 * answer + a Bearer token there — without the scheme pin a caller holding the
 * ingest secret could point the relay at any plaintext endpoint.
 */
export function isHttpsUrl(raw: string): boolean {
  try {
    return new URL(raw).protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Should the onTimeout policy be applied now? Only once, while still unanswered and past TTL.
 * The caller persists it via setDecision (first-answer-wins), so a late tap can't overwrite it.
 */
export function shouldApplyTimeout(ap: ApprovalRecord, now: number): boolean {
  return (
    ap.decision === null &&
    ap.answerText === null &&
    ap.onTimeout !== null &&
    now > ap.exp
  )
}

/**
 * Pure projection of an approval row into the /answer response. Human answers only land at
 * answered_at < exp (tap/reply are rejected past exp), so a persisted decision with
 * answered_at >= exp is unambiguously the timeout policy. `answered` is true whenever a
 * decision or text exists — no "decision set but answered=false" contradiction.
 */
export function answerView(ap: ApprovalRecord, now: number): AnswerView {
  const answered = ap.decision !== null || ap.answerText !== null
  const expired = !answered && now > ap.exp
  const timedOut = answered && ap.answeredAt !== null && ap.answeredAt >= ap.exp
  return {
    id: ap.id,
    kind: ap.kind,
    decision: ap.decision,
    text: ap.answerText,
    answered,
    pending: !answered && !expired,
    expired,
    timedOut,
    options: ap.options,
  }
}

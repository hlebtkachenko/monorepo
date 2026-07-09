/**
 * Gate-integrity breach alert (M0.8 / 11.11).
 *
 * At the v1 cold-start posture (`evidence-gate.ts`) the server-side score can
 * NEVER go green: `evaluateEvidence` unconditionally injects
 * `extraction_failed`, which forces `cRaw = 0` in `scoreProposal`
 * (`packages/brain/src/gate/gate.ts`) regardless of any fitted calibration
 * map. That means every write's three-way AND in
 * `runGatedWriteWithSeams` (confidence AND !veto AND score.isGreen) can only
 * resolve to HELD in production — a FRESH auto-applied result (HTTP 201,
 * `body.status === "applied"`) is therefore structurally IMPOSSIBLE. If one
 * is ever observed, the gate itself broke (bad deploy, misconfigured
 * threshold, a regression in the score/veto chain), and that is a CRITICAL,
 * durable-record-worthy event.
 *
 * This module is READ-ONLY observation: it inspects the `GatedWriteResult`
 * AFTER `runGatedWriteWithSeams` has already decided it (see the single call
 * site in `runGatedWrite`, `accounting-writes.gate.ts`). It never feeds back
 * into the decision, imports nothing from the score/veto chain, and is not
 * itself referenced by `runGatedWriteWithSeams` — the [#519] boundary test
 * (`gated-write-seams.boundary.test.ts`) already proves no production file
 * routes through the test-only seam form, and this file does not touch it.
 */
import { notifierFromEnv } from "@workspace/notify"
import type { GatedWriteResult } from "./accounting-writes.gate"

const notifier = notifierFromEnv()

/**
 * Disarm switch for a future milestone that legitimately lifts the cold-start
 * floor (server-verified extraction — see the [WP-A-gate] note in
 * evidence-gate.ts). At that point a fresh 201 is no longer, by itself,
 * evidence of a broken gate, and this alert would need to be retired or
 * re-scoped rather than paging on every real green write. Defaults to armed
 * (`true`): v1 ships with no such milestone, so cold start is the whole
 * current posture.
 */
function coldStartPostureArmed(): boolean {
  return (
    (process.env["ACCOUNTING_GATE_COLD_START_POSTURE"] ?? "true") !== "false"
  )
}

export interface GateIntegrityContext {
  operationId: string
  organizationId: string
}

/**
 * Fire a CRITICAL, durable alert (a deduped GitHub issue + the bot's
 * Telegram echo, via `@workspace/notify`) when a gated write comes back
 * auto-applied while the cold-start posture is armed. A FRESH auto-apply is
 * exactly `httpStatus === 201` — a replayed prior "applied" result reuses
 * the ORIGINAL decision and returns 200 (see `runGatedWriteWithSeams`), so it
 * is not a new breach and is intentionally not re-alerted here.
 *
 * Fire-and-forget: never throws, never awaited by the caller, and any
 * `@workspace/notify` failure (network, misconfigured secret, ...) is
 * swallowed so the write's actual HTTP response is never affected.
 */
export function observeGateIntegrity(
  result: GatedWriteResult,
  context: GateIntegrityContext,
): void {
  if (!coldStartPostureArmed()) return
  if (result.httpStatus !== 201) return

  void notifier
    ?.reportIssue({
      source: "agent",
      area: "agents",
      risk: "blocking",
      type: "security",
      title:
        "Gate-integrity breach: accounting write auto-applied at cold start",
      body:
        "A live accounting write returned AUTO-APPLIED (HTTP 201) while the Brain " +
        "write gate is still at the v1 cold-start posture, where green is " +
        "structurally unreachable (evidence-gate.ts `extraction_failed` floor). " +
        "This should be IMPOSSIBLE — the gate broke and needs immediate triage.\n\n" +
        `operation: \`${context.operationId}\`\n` +
        `organization: \`${context.organizationId}\``,
      fingerprintParts: ["gate-integrity-breach", context.operationId],
    })
    .catch(() => {})
}

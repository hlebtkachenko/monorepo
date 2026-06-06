// Inline-button router. Every button the bot sends encodes a short, structured callback;
// this module parses it (pure, unit-tested) and runs the effect against the store + GitHub
// client (no grammY dependency, so it tests with fakes). bot.ts adapts the outcome to ctx.

import type { Store } from "./state/store.js"
import type { GitHubClient } from "./github.js"
import type { DispatchPlan } from "./dispatch.js"

export type CallbackAction =
  | { t: "confirm"; token: string }
  | { t: "cancel"; token: string }
  | { t: "ask"; id: string; idx: number }
  | { t: "snooze"; scope: string; mins: number }
  | { t: "ack"; scope: string }
  | { t: "rerun"; runId: number }
  | { t: "echo"; data: string }

/** Parse callback_data into a structured action. Unknown shapes fall back to a plain echo. */
export function parseCallback(data: string): CallbackAction {
  const [prefix, a, b] = data.split(":")
  switch (prefix) {
    case "cfm":
      return a ? { t: "confirm", token: a } : { t: "echo", data }
    case "cxl":
      return a ? { t: "cancel", token: a } : { t: "echo", data }
    case "ask":
      return a && b !== undefined && Number.isInteger(Number(b))
        ? { t: "ask", id: a, idx: Number(b) }
        : { t: "echo", data }
    case "snz":
      return a && b && Number.isFinite(Number(b))
        ? { t: "snooze", scope: a, mins: Number(b) }
        : { t: "echo", data }
    case "ack":
      return a ? { t: "ack", scope: a } : { t: "echo", data }
    case "rrn":
      return a && Number.isFinite(Number(a))
        ? { t: "rerun", runId: Number(a) }
        : { t: "echo", data }
    default:
      return { t: "echo", data }
  }
}

export interface CallbackDeps {
  store: Store
  github: GitHubClient | null
  now: () => number
}

export interface CallbackOutcome {
  /** Toast text for answerCallbackQuery. */
  answer: string
  /** When set, replace the message text (this also removes the inline keyboard). */
  editText?: string
  /** When set (and editText absent), strip the inline keyboard but keep the text. */
  stripButtons?: boolean
  /** Optional follow-up message. */
  reply?: string
}

export async function runCallback(
  action: CallbackAction,
  deps: CallbackDeps,
): Promise<CallbackOutcome> {
  const now = deps.now()

  switch (action.t) {
    case "confirm": {
      if (!deps.github) return { answer: "GitHub control not configured." }
      const claimed = await deps.store.claimDispatch(action.token)
      if (!claimed) {
        const existing = await deps.store.getDispatch(action.token)
        return {
          answer: existing
            ? `Already ${existing.status}.`
            : "Unknown or expired action.",
        }
      }
      const plan = JSON.parse(claimed.payload) as DispatchPlan
      if (now > claimed.exp) {
        // Never dispatched -> record the true terminal state, not a misleading "fired".
        await deps.store.setDispatchStatus(action.token, "expired")
        return {
          answer: "Confirmation expired.",
          editText: `⌛ Expired: ${plan.label}`,
        }
      }
      const ok = await deps.github.dispatch(
        plan.workflow,
        plan.ref,
        plan.inputs,
      )
      if (ok) {
        return {
          answer: "Dispatched.",
          editText: `🚀 Dispatched: ${plan.label}`,
        }
      }
      // Send failed -> revert to pending so a retry tap can re-claim. Keep the buttons
      // (no editText) so the existing Confirm button stays tappable.
      await deps.store.setDispatchStatus(action.token, "pending")
      return { answer: "Dispatch failed — tap Confirm to retry." }
    }

    case "cancel": {
      const row = await deps.store.cancelDispatch(action.token)
      if (!row) return { answer: "Already handled." }
      const plan = JSON.parse(row.payload) as DispatchPlan
      return { answer: "Cancelled.", editText: `✖️ Cancelled: ${plan.label}` }
    }

    case "ask": {
      const approval = await deps.store.getApproval(action.id)
      if (!approval) return { answer: "Unknown or expired request." }
      if (approval.decision)
        return { answer: `Already answered: ${approval.decision}` }
      if (now > approval.exp)
        return { answer: "Request expired.", stripButtons: true }
      const option = approval.options[action.idx]
      if (option === undefined) return { answer: "Invalid option." }
      const updated = await deps.store.setDecision(action.id, option)
      return updated
        ? { answer: `Recorded: ${option}`, editText: `✅ Answered: ${option}` }
        : { answer: "Already answered." }
    }

    case "snooze": {
      const until = now + action.mins * 60_000
      await deps.store.setSnooze(action.scope, until, false)
      return {
        answer: `Snoozed ${action.scope} for ${action.mins}m.`,
        stripButtons: true,
      }
    }

    case "ack": {
      await deps.store.setSnooze(action.scope, now, true)
      return { answer: `Acked ${action.scope}.`, stripButtons: true }
    }

    case "rerun": {
      if (!deps.github) return { answer: "GitHub control not configured." }
      const ok = await deps.github.rerunFailedJobs(action.runId)
      return {
        answer: ok ? "Rerun triggered." : "Rerun failed (token scope?).",
      }
    }

    case "echo":
      return {
        answer: "",
        reply: `✅ You chose: ${action.data}`,
        stripButtons: true,
      }
  }
}

// Inline-button router. Every button the bot sends encodes a short, structured callback;
// this module parses it (pure, unit-tested) and runs the effect against the store + GitHub
// client (no grammY dependency, so it tests with fakes). bot.ts adapts the outcome to ctx.

import type { Store } from "./state/store.js"
import type { GitHubClient } from "./github.js"
import { parseCommand, randomToken, type DispatchPlan } from "./dispatch.js"
import type { Btn } from "./format.js"

export type CallbackAction =
  | { t: "confirm"; token: string }
  | { t: "cancel"; token: string }
  | { t: "ask"; id: string; idx: number }
  | { t: "snooze"; scope: string; mins: number }
  | { t: "ack"; scope: string }
  | { t: "rerun"; runId: number }
  // Interactive pickers (choose from UI instead of typing args).
  | { t: "deploy"; env: string } // env chosen for /deploy -> confirm
  | { t: "rbenv"; env: string } // env chosen for /rollback -> show tag picker
  | { t: "rbtag"; env: string; tag: string } // tag chosen -> confirm
  | { t: "showlog"; runId: number } // run chosen -> failed-job summary
  | { t: "cancelask"; id: string } // cancel a pending approval (from /pending)
  | { t: "custom"; id: string } // "✍️ Other" on a choice ask -> open a free-text reply
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
    case "dep":
      return a ? { t: "deploy", env: a } : { t: "echo", data }
    case "rb":
      return a ? { t: "rbenv", env: a } : { t: "echo", data }
    case "rbt":
      return a && b ? { t: "rbtag", env: a, tag: b } : { t: "echo", data }
    case "log":
      return a && Number.isFinite(Number(a))
        ? { t: "showlog", runId: Number(a) }
        : { t: "echo", data }
    case "xpr":
      return a ? { t: "cancelask", id: a } : { t: "echo", data }
    case "txt":
      return a ? { t: "custom", id: a } : { t: "echo", data }
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
  /** Inline keyboard for the follow-up message (picker / confirm). */
  replyMarkup?: Btn[][]
  /** Open a force_reply prompt (✍️ Custom): the handler sends it + retargets reply-matching. */
  forceReply?: { approvalId: string; prompt: string }
  /** An approval was just resolved by this tap — the handler fires its answer trigger. */
  resolvedId?: string
}

/** Persist a pending dispatch and produce a Confirm/Cancel follow-up (shared by typed cmds + pickers). */
async function makeConfirm(
  plan: DispatchPlan,
  deps: CallbackDeps,
): Promise<CallbackOutcome> {
  const now = deps.now()
  const token = randomToken()
  await deps.store.createDispatch({
    token,
    kind: plan.kind,
    payload: JSON.stringify(plan),
    status: "pending",
    exp: now + 5 * 60_000,
    created: now,
  })
  return {
    answer: "",
    stripButtons: true,
    reply: `⚠️ Confirm: ${plan.label}\nDispatches ${plan.workflow} on ${plan.ref}. Expires in 5 min.`,
    replyMarkup: [
      [
        { text: "✅ Confirm", data: `cfm:${token}` },
        { text: "✖️ Cancel", data: `cxl:${token}` },
      ],
    ],
  }
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
      if (approval.decision || approval.answerText)
        return {
          answer: `Already answered: ${approval.decision ?? approval.answerText}`,
        }
      if (now > approval.exp)
        return { answer: "Request expired.", stripButtons: true }
      const option = approval.options[action.idx]
      if (option === undefined) return { answer: "Invalid option." }
      const updated = await deps.store.setDecision(action.id, option, now)
      return updated
        ? {
            answer: `Recorded: ${option}`,
            editText: `✅ Answered: ${option}`,
            resolvedId: action.id,
          }
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

    case "deploy": {
      const { plan, error } = parseCommand("deploy", action.env)
      if (!plan) return { answer: error ?? "Invalid environment." }
      return makeConfirm(plan, deps)
    }

    case "rbenv": {
      if (!deps.github) return { answer: "GitHub control not configured." }
      const commits = await deps.github.listCommits("main", 5)
      if (commits.length === 0)
        return { answer: "No recent commits to roll back to." }
      return {
        answer: "",
        stripButtons: true,
        reply: `Pick a rollback target for ${action.env}:`,
        replyMarkup: commits.map((c) => [
          {
            text: `sha-${c.short} · ${c.subject}`,
            data: `rbt:${action.env}:sha-${c.short}`,
          },
        ]),
      }
    }

    case "rbtag": {
      const { plan, error } = parseCommand(
        "rollback",
        `${action.env} ${action.tag}`,
      )
      if (!plan) return { answer: error ?? "Invalid rollback." }
      return makeConfirm(plan, deps)
    }

    case "showlog": {
      if (!deps.github) return { answer: "GitHub control not configured." }
      const jobs = await deps.github.runJobs(action.runId)
      const failed = jobs.filter((j) => j.conclusion === "failure")
      if (failed.length === 0)
        return {
          answer: "",
          reply:
            jobs.length === 0
              ? `Run ${action.runId}: not found or no jobs.`
              : `Run ${action.runId}: no failed jobs.`,
        }
      return {
        answer: "",
        reply:
          `Failed jobs in run ${action.runId}:\n` +
          failed
            .map(
              (j) =>
                `🔴 ${j.name}${j.failedSteps.length ? `\n   ↳ ${j.failedSteps.join(", ")}` : ""}`,
            )
            .join("\n"),
      }
    }

    case "cancelask": {
      const updated = await deps.store.setDecision(action.id, "cancelled", now)
      return updated
        ? {
            answer: "Cancelled.",
            editText: `🚫 Cancelled: ${updated.summary ?? action.id}`,
            resolvedId: action.id,
          }
        : { answer: "Already answered." }
    }

    case "custom": {
      const approval = await deps.store.getApproval(action.id)
      if (!approval) return { answer: "Unknown or expired request." }
      if (approval.decision || approval.answerText)
        return {
          answer: `Already answered: ${approval.decision ?? approval.answerText}`,
        }
      if (now > approval.exp) return { answer: "Request expired." }
      return {
        answer: "Reply with your text below.",
        // Drop the option buttons so only the free-text reply remains — no stray option tap
        // can win the first-answer race after the owner chose "type my own".
        stripButtons: true,
        forceReply: {
          approvalId: action.id,
          prompt: `✍️ Reply to this message with your answer${approval.summary ? ` for: ${approval.summary}` : ""}.`,
        },
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

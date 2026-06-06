import type { ApprovalRecord, Store } from "./state/store.js"
import type { Env } from "./env.js"
import { createGitHubClient, repoOf } from "./github.js"

export interface DeliverDeps {
  fetchImpl?: typeof fetch
  /** Fire a GitHub workflow_dispatch (the bot's own token). Returns ok. */
  dispatch?: (
    workflow: string,
    ref: string,
    inputs: Record<string, string>,
  ) => Promise<boolean>
}

export interface DeliverResult {
  fired: boolean
  webhook: boolean
  workflow: boolean
}

/** The answer payload pushed to a callbackUrl / passed as workflow inputs. */
export function answerPayload(ap: ApprovalRecord): {
  id: string
  kind: string
  decision: string | null
  text: string | null
  asker: string | null
} {
  return {
    id: ap.id,
    kind: ap.kind,
    decision: ap.decision,
    text: ap.answerText,
    asker: ap.asker,
  }
}

/**
 * Fire the answer trigger for a RESOLVED approval — the owner's answer waking the consumer,
 * not an agent poll. Sends a webhook POST (callbackUrl) and/or a GitHub workflow_dispatch
 * (resumeWorkflow). Best-effort + never throws; the caller marks `delivered` if anything
 * fired so it isn't re-sent. Returns what fired.
 */
export async function deliverAnswer(
  ap: ApprovalRecord,
  deps: DeliverDeps,
): Promise<DeliverResult> {
  const none: DeliverResult = { fired: false, webhook: false, workflow: false }
  if (ap.delivered) return none
  const resolved = ap.decision !== null || ap.answerText !== null
  if (!resolved) return none

  const payload = answerPayload(ap)
  let webhook = false
  let workflow = false

  if (ap.callbackUrl) {
    const doFetch = deps.fetchImpl ?? fetch
    try {
      const res = await doFetch(ap.callbackUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(ap.callbackToken
            ? { authorization: `Bearer ${ap.callbackToken}` }
            : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      })
      webhook = res.ok
    } catch {
      webhook = false
    }
  }

  if (ap.resumeWorkflow && deps.dispatch) {
    try {
      workflow = await deps.dispatch(ap.resumeWorkflow, "main", {
        ask_id: payload.id,
        decision: payload.decision ?? "",
        text: payload.text ?? "",
      })
    } catch {
      workflow = false
    }
  }

  return { fired: webhook || workflow, webhook, workflow }
}

/**
 * Fire-on-resolve from the Worker: builds the GitHub dispatch from env, delivers, and marks
 * the approval delivered if anything fired. Idempotent + never throws. Call right after a
 * resolution (tap / text / timeout). /answer polling stays the durable floor if a fire fails.
 */
export async function deliverFromEnv(
  ap: ApprovalRecord,
  env: Env,
  store: Store,
): Promise<void> {
  if (ap.delivered) return
  if (ap.decision === null && ap.answerText === null) return
  if (!ap.callbackUrl && !ap.resumeWorkflow) return
  const gh = env.GITHUB_DISPATCH_TOKEN
    ? createGitHubClient(env.GITHUB_DISPATCH_TOKEN, repoOf(env))
    : null
  const res = await deliverAnswer(ap, {
    dispatch: gh ? (w, r, i) => gh.dispatch(w, r, i) : undefined,
  })
  if (res.fired) await store.markDelivered(ap.id)
}

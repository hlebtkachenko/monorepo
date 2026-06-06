// Shared contract for the Afframe Telegram bot. This package holds NO token and
// talks to no chat directly — it only POSTs a typed payload to the bot's /ingest.
// Every outbound sender (api, web, workers, CI glue) imports this so the message
// shape is agreed in one place.

export type AlertLevel = "info" | "success" | "warn" | "error"

/** The body of a POST /ingest call. `buttons` are one-tap labels (label == callback data). */
export interface IngestPayload {
  text: string
  level?: AlertLevel
  /** Free-form origin tag shown in the message, e.g. "ci", "api", "agent". */
  source?: string
  buttons?: string[]
}

export interface NotifierConfig {
  /** Bot ingest URL, e.g. https://bot.afframe.com/ingest (or http://localhost:8787/ingest in dev). */
  url: string
  /** Shared secret; sent as `Authorization: Bearer <secret>`. */
  secret: string
  /** Override for tests / non-Node runtimes. */
  fetchImpl?: typeof fetch
}

export interface NotifyRequest {
  url: string
  init: RequestInit
}

/** Pure builder: turn a payload + config into the exact fetch request. Unit-tested, no I/O. */
export function buildIngestRequest(
  payload: IngestPayload,
  config: NotifierConfig,
): NotifyRequest {
  return {
    url: config.url,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.secret}`,
      },
      body: JSON.stringify(payload),
    },
  }
}

/** Human-in-the-loop approval request (DEV-55). The agent asks; the owner answers from the phone. */
export interface ApprovalRequest {
  /** The decision prompt, e.g. "Merge PR #42 to main?". */
  question: string
  /** "choice" = owner taps an option (default); "text" = owner replies with free text. */
  kind?: "choice" | "text"
  /** Tappable options (choice kind). Defaults to ["Approve","Reject"] server-side. Max 6. */
  options?: string[]
  /** Add a "✍️ Other" free-text button beside the options. Default true for choice asks. */
  allowCustom?: boolean
  /** Executive summary shown under the question. */
  summary?: string
  /** Which agent/source is asking — shown in the message + /pending. */
  asker?: string
  /** How long the request stays open. Default 3600. */
  ttlSeconds?: number
  /** Decision auto-applied once the TTL passes (e.g. "Reject"). */
  onTimeout?: string
  /**
   * Answer-as-trigger (recommended over polling): the bot POSTs the resolved answer here
   * the instant the owner answers, so a non-resident agent is WOKEN by the answer rather
   * than polling for it. Payload: { id, kind, decision, text, asker }.
   */
  callbackUrl?: string
  /** Bearer token the bot sends to callbackUrl (so you can trust the push). */
  callbackToken?: string
  /** GitHub workflow file the bot dispatches on resolve (inputs: ask_id, decision, text). */
  resumeWorkflow?: string
  /** Caller-supplied id for idempotency; generated if omitted. */
  id?: string
}

export interface ApprovalState {
  id: string
  kind: "choice" | "text"
  /** The chosen option (choice), the applied onTimeout value, or null. */
  decision: string | null
  /** The free-text reply (text kind), or null. */
  text: string | null
  /** True once RESOLVED — by a tap, a text reply, OR an applied onTimeout policy. */
  answered: boolean
  pending: boolean
  /** Past TTL with NO answer and NO onTimeout policy (decision + text are null). */
  expired: boolean
  /** Resolved by the onTimeout policy. `answered` is ALSO true and `decision` carries the value. */
  timedOut: boolean
  options: string[]
}

export interface WaitOptions {
  /** Poll interval ms (default 2500). */
  intervalMs?: number
  /** Give up after this many ms (default = the request's own TTL window, ~1h). */
  timeoutMs?: number
}

export interface Notifier {
  notify(text: string, opts?: Omit<IngestPayload, "text">): Promise<void>
  alert(
    text: string,
    opts?: Omit<IngestPayload, "text" | "level">,
  ): Promise<void>
  send(payload: IngestPayload): Promise<void>
  /** Post a HITL question; returns the approval id to poll. */
  ask(req: ApprovalRequest): Promise<{ id: string; exp: number }>
  /** Convenience: ask for a free-text answer. */
  askText(
    question: string,
    opts?: Omit<ApprovalRequest, "question" | "kind" | "options">,
  ): Promise<{ id: string; exp: number }>
  /** Convenience: Accept / Decline + a "✍️ Other" free-text button (clarification pattern). */
  askConfirm(
    question: string,
    opts?: Omit<ApprovalRequest, "question" | "kind" | "options"> & {
      accept?: string
      reject?: string
    },
  ): Promise<{ id: string; exp: number }>
  /** Poll a single approval's current state. */
  answer(id: string): Promise<ApprovalState>
  /** Poll until the owner answers or it expires; returns the final state. */
  waitForAnswer(id: string, opts?: WaitOptions): Promise<ApprovalState>
}

export function createNotifier(config: NotifierConfig): Notifier {
  const doFetch = config.fetchImpl ?? fetch
  const base = config.url.replace(/\/ingest$/, "")
  const authHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${config.secret}`,
  }
  async function send(payload: IngestPayload): Promise<void> {
    const { url, init } = buildIngestRequest(payload, config)
    const res = await doFetch(url, init)
    if (!res.ok) {
      throw new Error(`notify: ingest returned ${res.status}`)
    }
  }
  async function ask(
    req: ApprovalRequest,
  ): Promise<{ id: string; exp: number }> {
    const res = await doFetch(`${base}/ask`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(req),
    })
    if (!res.ok) throw new Error(`notify: ask returned ${res.status}`)
    return (await res.json()) as { id: string; exp: number }
  }
  async function answer(id: string): Promise<ApprovalState> {
    const res = await doFetch(`${base}/answer/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${config.secret}` },
    })
    if (!res.ok) throw new Error(`notify: answer returned ${res.status}`)
    return (await res.json()) as ApprovalState
  }
  return {
    send,
    notify: (text, opts) => send({ text, ...opts }),
    alert: (text, opts) => send({ text, level: "error", ...opts }),
    ask,
    askText: (question, opts) => ask({ ...opts, question, kind: "text" }),
    askConfirm: (question, opts) => {
      const { accept = "Approve", reject = "Reject", ...rest } = opts ?? {}
      return ask({
        ...rest,
        question,
        kind: "choice",
        options: [accept, reject],
        allowCustom: rest.allowCustom ?? true,
      })
    },
    answer,
    async waitForAnswer(id, opts) {
      const intervalMs = opts?.intervalMs ?? 2500
      // The SERVER's TTL (+ onTimeout) is the real terminator: it resolves
      // answered/expired/timedOut. This client deadline is only a safety cap for an
      // unreachable server, so it defaults WAY past any request TTL (24h) — otherwise a
      // client deadline shorter than the server TTL could return a still-pending state.
      const deadline = Date.now() + (opts?.timeoutMs ?? 86_400_000)
      for (;;) {
        const state = await answer(id)
        if (state.answered || state.expired) return state
        if (Date.now() >= deadline) return state
        await new Promise((r) => setTimeout(r, intervalMs))
      }
    },
  }
}

/**
 * Build a notifier from env vars (`BOT_INGEST_URL`, `NOTIFY_SHARED_SECRET`).
 * Returns null when unconfigured so callers can no-op instead of crashing.
 */
export function notifierFromEnv(
  env: Record<string, string | undefined> = readProcessEnv(),
): Notifier | null {
  const url = env.BOT_INGEST_URL
  const secret = env.NOTIFY_SHARED_SECRET
  if (!url || !secret) return null
  return createNotifier({ url, secret })
}

/**
 * Reduce an error to a safe one-liner for the bot. NEVER includes stack, payload, or PII —
 * just `message` (trimmed, ≤300 chars) + a stable correlation `id` (requestId / jobId / generated).
 * The full stack belongs in Sentry, not in a Telegram message or a Linear issue body.
 */
export function sanitizeError(
  err: unknown,
  id: string,
): { message: string; id: string } {
  const raw = err instanceof Error ? err.message : String(err)
  const message = raw.replace(/\s+/g, " ").trim().slice(0, 300)
  return { message, id }
}

function readProcessEnv(): Record<string, string | undefined> {
  // Read process.env without depending on @types/node — this package is also
  // imported (for its types) by the Cloudflare Worker, which has no node globals.
  const proc = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process
  return proc?.env ?? {}
}

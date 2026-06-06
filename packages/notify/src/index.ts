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

/** Human-in-the-loop approval request (DEV-55). The agent asks; the owner taps an option on the phone. */
export interface ApprovalRequest {
  /** The decision prompt, e.g. "Merge PR #42 to main?". */
  question: string
  /** Tappable options. Defaults to ["Approve","Reject"] server-side. Max 6. */
  options?: string[]
  /** Executive summary shown under the question. */
  summary?: string
  /** How long the request stays open. Default 3600. */
  ttlSeconds?: number
  /** Caller-supplied id for idempotency; generated if omitted. */
  id?: string
}

export interface ApprovalState {
  id: string
  /** The chosen option, or null while still pending. */
  decision: string | null
  pending: boolean
  expired: boolean
  options: string[]
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
  /** Poll a single approval's current state. */
  answer(id: string): Promise<ApprovalState>
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
  return {
    send,
    notify: (text, opts) => send({ text, ...opts }),
    alert: (text, opts) => send({ text, level: "error", ...opts }),
    async ask(req) {
      const res = await doFetch(`${base}/ask`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(req),
      })
      if (!res.ok) throw new Error(`notify: ask returned ${res.status}`)
      return (await res.json()) as { id: string; exp: number }
    },
    async answer(id) {
      const res = await doFetch(`${base}/answer/${encodeURIComponent(id)}`, {
        headers: { authorization: `Bearer ${config.secret}` },
      })
      if (!res.ok) throw new Error(`notify: answer returned ${res.status}`)
      return (await res.json()) as ApprovalState
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

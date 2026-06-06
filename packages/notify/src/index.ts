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

export interface Notifier {
  notify(text: string, opts?: Omit<IngestPayload, "text">): Promise<void>
  alert(
    text: string,
    opts?: Omit<IngestPayload, "text" | "level">,
  ): Promise<void>
  send(payload: IngestPayload): Promise<void>
}

export function createNotifier(config: NotifierConfig): Notifier {
  const doFetch = config.fetchImpl ?? fetch
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

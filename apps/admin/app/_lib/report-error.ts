import { isIgnorableError } from "@workspace/notify"

// Client-side error reporter (OBS-03 — port of the web pattern). Sends a sanitized
// one-liner to the same-origin route handler (which holds the bot secret) — the browser
// never sees NOTIFY_SHARED_SECRET. Framework control-flow signals (NEXT_REDIRECT /
// notFound / etc.) are dropped here so a normal redirect never pages.
export function reportClientError(error: unknown, digest?: string): void {
  const message = error instanceof Error ? error.message : String(error)
  if (isIgnorableError(message, digest)) return
  void fetch("/api/client-error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: message.slice(0, 300),
      id: `admin_${Math.random().toString(36).slice(2, 10)}`,
      source: "admin",
      digest,
    }),
    keepalive: true,
  }).catch(() => {})
}

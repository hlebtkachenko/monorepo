// Client-side error reporter. Sends a sanitized one-liner to the same-origin route
// handler (which holds the bot secret) — the browser never sees INGEST_SECRET.
export function reportClientError(error: unknown, id?: string): void {
  const message = error instanceof Error ? error.message : String(error)
  const eid = id ?? `web_${Math.random().toString(36).slice(2, 10)}`
  void fetch("/api/client-error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: message.slice(0, 300),
      id: eid,
      source: "web",
    }),
    keepalive: true,
  }).catch(() => {})
}

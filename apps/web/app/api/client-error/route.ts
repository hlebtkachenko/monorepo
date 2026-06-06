import { NextResponse } from "next/server"
import { notifierFromEnv, sanitizeError } from "@workspace/notify"

interface ClientErrorBody {
  message?: string
  id?: string
  source?: string
}

// Same-origin sink for browser errors. Holds the bot secret server-side and forwards a
// sanitized line to the bot's /ingest. Fire-and-forget; never blocks or leaks the secret.
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as ClientErrorBody | null
  if (!body?.message) {
    return NextResponse.json({ error: "message required" }, { status: 400 })
  }
  const safe = sanitizeError(body.message, body.id ?? "web")
  const notifier = notifierFromEnv()
  if (notifier) {
    void notifier
      .alert(`Web error [${safe.id}]: ${safe.message}`, {
        source: body.source ?? "web",
      })
      .catch(() => {})
  }
  return NextResponse.json({ ok: true })
}

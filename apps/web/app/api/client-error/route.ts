import { NextResponse } from "next/server"
import {
  isIgnorableError,
  notifierFromEnv,
  sanitizeError,
} from "@workspace/notify"

interface ClientErrorBody {
  message?: string
  id?: string
  source?: string
  /** Next.js error digest (e.g. "NEXT_REDIRECT;..."), when from an error boundary. */
  digest?: string
}

// Same-origin sink for browser errors. Holds the bot secret server-side and opens a deduped
// Linear issue (with an Open button) via the bot's /issue. Fire-and-forget; never blocks or
// leaks the secret. Framework control-flow signals (NEXT_REDIRECT, etc.) are dropped — a
// normal login redirect is not an error.
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as ClientErrorBody | null
  if (!body?.message) {
    return NextResponse.json({ error: "message required" }, { status: 400 })
  }
  if (isIgnorableError(body.message, body.digest)) {
    return NextResponse.json({ ok: true, ignored: true })
  }
  const safe = sanitizeError(body.message, body.id ?? "web")
  const notifier = notifierFromEnv()
  if (notifier) {
    void notifier
      .reportIssue({
        source: "error",
        area: "web",
        risk: "high",
        title: `Web error: ${safe.message}`,
        body: `Browser error \`${safe.id}\`\n\n${safe.message}`,
        // Stable over the message only — the per-occurrence id must NOT be in the fingerprint.
        fingerprintParts: ["web-client", safe.message],
      })
      .catch(() => {})
  }
  return NextResponse.json({ ok: true })
}

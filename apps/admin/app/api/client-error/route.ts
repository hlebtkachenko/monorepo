import { NextResponse } from "next/server"
import {
  clientIp,
  createRateLimiter,
  isIgnorableError,
  isSameOrigin,
  notifierFromEnv,
  sanitizeError,
} from "@workspace/notify"

interface ClientErrorBody {
  message?: string
  id?: string
  source?: string
  /** Next.js error digest, when from an error boundary. */
  digest?: string
}

// Same-origin sink for admin browser errors (OBS-03 — mirror of the web route,
// including the OBS-14 hardening). Holds the bot secret server-side; opens a
// deduped Linear issue via the bot's /issue. The admin container gets
// BOT_INGEST_URL + NOTIFY_SHARED_SECRET from CDK (infra/cdk/lib/app-stack.ts);
// notifierFromEnv() no-ops when they are unset (local dev).
//
// Hardening: same-origin check + per-IP token bucket. The bucket is in-memory
// and therefore PER-INSTANCE (limits multiply by task count, reset on restart;
// desiredCount=1 today) — accepted, same posture as the web route.

// Per-IP token bucket (OBS-14): 5 reports, refilling 5/min. The same-origin +
// rate-limit helpers are shared with the web sink via @workspace/notify
// (DEV-81). The bucket stays per-app/per-instance.
const allowByRate = createRateLimiter({
  capacity: 5,
  refillPerMs: 5 / 60_000,
  maxTrackedIps: 10_000,
})

// Next.js redacts server-component error messages in production; when the
// generic message arrives, the digest is the only distinguishing datum.
const NEXT_REDACTED_RE = /Server Components render/

export async function POST(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  if (!allowByRate(clientIp(req))) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 })
  }
  const body = (await req.json().catch(() => null)) as ClientErrorBody | null
  if (!body?.message) {
    return NextResponse.json({ error: "message required" }, { status: 400 })
  }
  if (isIgnorableError(body.message, body.digest)) {
    return NextResponse.json({ ok: true, ignored: true })
  }
  const safe = sanitizeError(body.message, body.id ?? "admin")
  const fingerprintParts = ["admin-client", safe.message]
  if (body.digest && NEXT_REDACTED_RE.test(safe.message)) {
    fingerprintParts.push(body.digest.slice(0, 64))
  }
  const notifier = notifierFromEnv()
  if (notifier) {
    void notifier
      .reportIssue({
        source: "error",
        area: "web",
        risk: "high",
        title: `Admin error: ${safe.message}`,
        body: `Admin browser error \`${safe.id}\`${body.digest ? ` (digest \`${body.digest.slice(0, 64)}\`)` : ""}\n\n${safe.message}`,
        fingerprintParts,
      })
      .catch(() => {})
  }
  return NextResponse.json({ ok: true })
}

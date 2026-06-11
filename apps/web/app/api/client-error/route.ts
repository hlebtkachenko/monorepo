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
  /** Next.js error digest (e.g. "NEXT_REDIRECT;..."), when from an error boundary. */
  digest?: string
}

// Same-origin sink for browser errors. Holds the bot secret server-side and opens a deduped
// Linear issue (with an Open button) via the bot's /issue. Fire-and-forget; never blocks or
// leaks the secret. Framework control-flow signals (NEXT_REDIRECT, etc.) are dropped — a
// normal login redirect is not an error.
//
// Abuse hardening (OBS-14) — this is an unauthenticated public POST that fans out to
// Linear + Telegram, so two cheap gates run before any work:
//   1. Same-origin check: legit calls come only from our own pages via
//      `reportClientError` (fetch sends `Sec-Fetch-Site: same-origin` and, for POSTs,
//      an Origin header). Cross-site browser calls are rejected outright.
//   2. Per-IP token bucket: 5 reports, refilling 5/min. CAVEAT: in-memory and therefore
//      PER-INSTANCE — limits multiply by task count and reset on restart (desiredCount=1
//      today; same accepted posture as Better Auth's memory rate limiter). The bot-side
//      fingerprint dedup remains the second line of defense.

// Per-IP token bucket (OBS-14): 5 reports, refilling 5/min. The same-origin +
// rate-limit helpers are shared with the admin sink via @workspace/notify
// (DEV-81). The bucket stays per-app/per-instance.
const allowByRate = createRateLimiter({
  capacity: 5,
  refillPerMs: 5 / 60_000,
  maxTrackedIps: 10_000,
})

// Next.js redacts server-component error messages in production builds, so
// ALL distinct RSC errors arrive with this one generic message. When it
// matches, the digest is the only distinguishing datum and must join the
// fingerprint or every server error dedups into a single Linear issue (OBS-05).
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
  const safe = sanitizeError(body.message, body.id ?? "web")
  const fingerprintParts = ["web-client", safe.message]
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
        title: `Web error: ${safe.message}`,
        body: `Browser error \`${safe.id}\`${body.digest ? ` (digest \`${body.digest.slice(0, 64)}\`)` : ""}\n\n${safe.message}`,
        // Stable over message (+ digest for Next-redacted RSC errors) — the
        // per-occurrence id must NOT be in the fingerprint.
        fingerprintParts,
      })
      .catch(() => {})
  }
  return NextResponse.json({ ok: true })
}

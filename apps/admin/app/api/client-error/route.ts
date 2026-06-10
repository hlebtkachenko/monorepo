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

const BUCKET_CAPACITY = 5
const REFILL_PER_MS = 5 / 60_000 // 5 tokens per minute
const MAX_TRACKED_IPS = 10_000
const buckets = new Map<string, { tokens: number; last: number }>()

function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")
  if (cf) return cf
  const xff = req.headers.get("x-forwarded-for")
  if (xff) {
    const last = xff.split(",").at(-1)?.trim()
    if (last) return last
  }
  return "unknown"
}

function allowByRate(ip: string): boolean {
  const now = Date.now()
  if (buckets.size > MAX_TRACKED_IPS) buckets.clear()
  const bucket = buckets.get(ip) ?? { tokens: BUCKET_CAPACITY, last: now }
  bucket.tokens = Math.min(
    BUCKET_CAPACITY,
    bucket.tokens + (now - bucket.last) * REFILL_PER_MS,
  )
  bucket.last = now
  if (bucket.tokens < 1) {
    buckets.set(ip, bucket)
    return false
  }
  bucket.tokens -= 1
  buckets.set(ip, bucket)
  return true
}

function isSameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site")
  if (site) return site === "same-origin"
  // Behind the Cloudflare Tunnel the process-visible Host is the container
  // listener (ADR-0008); the public host arrives in x-forwarded-host.
  const origin = req.headers.get("origin")
  if (!origin) return false
  try {
    return (
      new URL(origin).host ===
      (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))
    )
  } catch {
    return false
  }
}

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

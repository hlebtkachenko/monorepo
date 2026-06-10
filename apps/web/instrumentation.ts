import type { Instrumentation } from "next"
import {
  isIgnorableError,
  notifierFromEnv,
  sanitizeError,
} from "@workspace/notify"

/**
 * Server-side error reporting (OBS-02). `onRequestError` is Next's hook for
 * every server-side failure — route-handler 500s, server-action failures hit
 * by non-browser clients, RSC render crashes with no browser attached. None
 * of these reach the browser error boundaries (`instrumentation-client.ts` +
 * `error.tsx` only cover errors a browser renders), so without this hook
 * they died silently in CloudWatch text logs.
 *
 * Two sinks, same as the rest of the web error path:
 *   1. A stable `[web-server-error]` console line — the CloudWatch metric
 *      filter behind the `monorepo-<env>-web-server-errors-high` alarm
 *      (infra/cdk/lib/observability-stack.ts) matches this token.
 *   2. `notifierFromEnv().reportIssue` → bot `/issue` → deduped Linear issue
 *      + Telegram ping (no-op when BOT_INGEST_URL / NOTIFY_SHARED_SECRET are
 *      unset, e.g. local dev).
 *
 * PII posture mirrors `/api/client-error`: sanitized one-line message only,
 * never the stack or request payload.
 */
export const onRequestError: Instrumentation.onRequestError = (
  err,
  request,
  context,
) => {
  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest?: unknown }).digest ?? "")
      : ""
  const message = err instanceof Error ? err.message : String(err)
  if (isIgnorableError(message, digest)) return

  const safe = sanitizeError(err, digest || `web_${Date.now().toString(36)}`)
  console.error(
    `[web-server-error] ${context.routerKind} ${context.routeType} ${request.method} ${context.routePath}: ${safe.message}`,
  )

  const notifier = notifierFromEnv()
  if (!notifier) return
  void notifier
    .reportIssue({
      source: "error",
      area: "web",
      risk: "high",
      title: `Web server error: ${safe.message}`,
      body:
        `Server-side error \`${safe.id}\` on \`${request.method} ${context.routePath}\` ` +
        `(${context.routerKind} ${context.routeType}).\n\n${safe.message}`,
      // Stable identity: route + message. Unlike the browser path,
      // onRequestError sees the un-redacted server error, so the message
      // itself distinguishes errors — no digest needed in the fingerprint.
      fingerprintParts: ["web-server", context.routePath, safe.message],
    })
    .catch(() => {})
}

/**
 * Alert metadata redactor.
 *
 * The pino redactor mutates log lines before pino's transport sees them.
 * Alert webhook payloads (`AlertPayload`) come directly from the caller, NOT
 * from a redacted pino line, so secrets carried in `payload.meta` would
 * otherwise land in plaintext on webhook targets.
 *
 * `applyAlertMetaRedactions` walks the meta object recursively and:
 *   1. Replaces any property whose key matches the baseline key set
 *      (Tier 1 + Tier 2; Tier 3 session_id is INTENTIONALLY excluded
 *      because alert lines need cross-request correlation).
 *   2. For every string-typed value, scrubs Telegram bot-token URL patterns.
 *
 * Cycle-safe via WeakSet. Lives in @workspace/observability so the alerts
 * module has zero @workspace/db back-edge.
 */
import { BASELINE_REDACT_PATHS } from "./redact-baseline"

const REDACTION_CENSOR = "[REDACTED]"
const TELEGRAM_TOKEN_RE = /\/bot[A-Za-z0-9_:-]+\//g

/**
 * Bare key names from baseline `*.<key>` paths. Mirror of
 * `TOOL_CALL_LOG_BASELINE_KEYS` from `@workspace/db/audit/redact` minus the
 * `session_id` Tier 3 split (alerts can keep session id for engineer correlation).
 */
const ALERT_META_REDACT_KEYS: ReadonlySet<string> = new Set(
  BASELINE_REDACT_PATHS.filter((p) => p.startsWith("*.")).map((p) =>
    p.slice(2),
  ),
)

/**
 * Walk `meta` and return a new object with redacted values. Caller's input is
 * not mutated. Returns the same value for null/undefined input.
 */
export function applyAlertMetaRedactions<T>(meta: T): T {
  if (meta === null || meta === undefined) return meta
  if (typeof meta !== "object") return scrubString(meta) as T
  const clone = structuredClone(meta) as unknown
  walkMeta(clone, new WeakSet())
  return clone as T
}

function walkMeta(node: unknown, seen: WeakSet<object>): void {
  if (node === null || node === undefined) return
  if (typeof node === "string") return
  if (Array.isArray(node)) {
    if (seen.has(node)) return
    seen.add(node)
    for (let i = 0; i < node.length; i++) {
      const v = node[i]
      if (typeof v === "string") {
        node[i] = scrubString(v)
      } else {
        walkMeta(v, seen)
      }
    }
    return
  }
  if (typeof node !== "object") return
  const obj = node as Record<string, unknown>
  if (seen.has(obj)) return
  seen.add(obj)
  for (const key of Object.keys(obj)) {
    if (ALERT_META_REDACT_KEYS.has(key)) {
      obj[key] = REDACTION_CENSOR
      continue
    }
    const v = obj[key]
    if (typeof v === "string") {
      obj[key] = scrubString(v)
    } else {
      walkMeta(v, seen)
    }
  }
}

function scrubString<T>(value: T): T {
  if (typeof value !== "string") return value
  const scrubbed = value.replace(TELEGRAM_TOKEN_RE, "/bot[REDACTED]/")
  return scrubbed as unknown as T
}

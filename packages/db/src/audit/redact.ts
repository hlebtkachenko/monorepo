/**
 * Redaction primitives for tool_call_log.input_json / output_json.
 *
 * `applyRedactions` strips declared paths from JSON payloads before
 * persistence. `toPinoRedactPaths` converts per-tool redaction paths into
 * pino's glob-style redact config so the same rules apply to structured logs.
 *
 * Path syntax:
 *   'a.b.c'    -> top-down object walk
 *   'a.*.b'    -> wildcard for every array element at that level
 *   'a.*.*.c'  -> nested wildcards supported
 *
 * Redaction is non-destructive: the input value is structurally cloned so
 * the caller's object is not mutated.
 *
 * Baseline source-of-truth: `@workspace/observability/redact-baseline`.
 * `TOOL_CALL_LOG_EXTRA_PATHS` adds the Tier 3 split (session_id is redacted
 * in `tool_call_log` only, not in pino).
 */

import { BASELINE_REDACT_PATHS } from "@workspace/observability"
import type { RedactionRules } from "./types"

const REDACTION_CENSOR = "[REDACTED]"

/**
 * Apply a set of declared redaction paths to a JSON-serializable value.
 * Returns a new value; the input is not mutated.
 */
export function applyRedactions<T>(value: T, paths: RedactionRules = []): T {
  if (!paths || paths.length === 0) return value
  if (value === null || value === undefined) return value
  const clone = structuredClone(value) as unknown
  for (const path of paths) {
    if (!path) continue
    const segments = path.split(".").filter((s) => s.length > 0)
    if (segments.length === 0) continue
    redactPath(clone, segments, 0)
  }
  return clone as T
}

function redactPath(node: unknown, segments: string[], index: number): void {
  if (node === null || node === undefined) return
  const head = segments[index]
  if (head === undefined) return
  const isLast = index === segments.length - 1

  if (head === "*") {
    // Trailing '*' is rejected at registration; treat any survivor as
    // a no-op here.
    if (isLast) return
    if (Array.isArray(node)) {
      for (const el of node) {
        redactPath(el, segments, index + 1)
      }
      return
    }
    // Walk object values too so a wildcard on a record-style payload
    // (e.g. `lines.*.iban` where `lines` is `{0: {...}, 1: {...}}`)
    // redacts every leaf, not just array elements.
    if (typeof node === "object") {
      for (const value of Object.values(node as Record<string, unknown>)) {
        redactPath(value, segments, index + 1)
      }
    }
    return
  }

  if (typeof node !== "object") return
  const obj = node as Record<string, unknown>

  if (isLast) {
    if (head in obj) {
      obj[head] = REDACTION_CENSOR
    }
    return
  }

  if (head in obj) {
    redactPath(obj[head], segments, index + 1)
  }
}

/**
 * Build a pino `redact.paths` list from a per-tool redaction registry.
 *
 * The registry shape is `{ [toolName]: string[] }` keyed by tool name.
 * The result is a flat list of pino-glob paths that apply across every log
 * entry. Prefixes each tool path with `*.` so a rule declared as `password`
 * matches `someKey.password` anywhere in the log object.
 */
export function toPinoRedactPaths(
  toolRedactions: Record<string, readonly string[]>,
): string[] {
  const paths = new Set<string>(BASELINE_REDACT_PATHS)

  for (const toolName of Object.keys(toolRedactions)) {
    const rules = toolRedactions[toolName]
    if (!rules) continue
    for (const rule of rules) {
      if (!rule) continue
      paths.add(`*.${rule}`)
    }
  }

  return Array.from(paths)
}

/**
 * Tier 3: paths redacted in the `tool_call_log` table-level write but NOT in
 * pino logs. The 30-day pino retention keeps these readable for engineer
 * debugging; the 10-year audit trail does not retain them so a leaked audit
 * dump cannot replay sessions.
 */
export const TOOL_CALL_LOG_EXTRA_PATHS: readonly string[] = Object.freeze([
  "*.session_id",
  "*.sessionId",
])

/**
 * Combined redaction baseline applied by `writeToolCallLog` before persisting
 * `input_json` / `output_json`. Includes everything pino redacts (Tier 1 +
 * Tier 2) plus the Tier 3 session-ID split.
 */
export const TOOL_CALL_LOG_BASELINE_PATHS: readonly string[] = Object.freeze([
  ...BASELINE_REDACT_PATHS,
  ...TOOL_CALL_LOG_EXTRA_PATHS,
])

/**
 * Set of bare key names extracted from baseline `*.<key>` paths. Used by
 * `applyBaselineKeyRedactions` to redact any object property with a matching
 * key anywhere in the JSON tree, without requiring callers to declare per-tool
 * paths for universally sensitive fields.
 */
export const TOOL_CALL_LOG_BASELINE_KEYS: ReadonlySet<string> = new Set(
  TOOL_CALL_LOG_BASELINE_PATHS.filter((p) => p.startsWith("*.")).map((p) =>
    p.slice(2),
  ),
)

const REDACTION_CENSOR_BASELINE = "[REDACTED]"

/**
 * Recursively walk a JSON-serializable value and redact any object property
 * whose key is in `keys`. Mutates the cloned input. Use for baseline (Tier 1
 * + Tier 2 + Tier 3) redaction in `writeToolCallLog`, BEFORE applying
 * per-tool `redactForAudit` paths.
 *
 * Unlike `applyRedactions` (which uses dot-paths from a known root), this
 * walker matches by key name at any depth — right for universal-PII fields
 * like `password`, `email`, `iban`, `session_id`.
 *
 * Cycle-safe via WeakSet.
 */
export function applyBaselineKeyRedactions<T>(
  value: T,
  keys: ReadonlySet<string> = TOOL_CALL_LOG_BASELINE_KEYS,
): T {
  if (value === null || value === undefined) return value
  if (typeof value !== "object") return value
  const clone = structuredClone(value) as unknown
  walkAndRedact(clone, keys)
  return clone as T
}

function walkAndRedact(
  node: unknown,
  keys: ReadonlySet<string>,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) {
    if (seen.has(node)) return
    seen.add(node)
    for (const el of node) walkAndRedact(el, keys, seen)
    return
  }
  if (typeof node !== "object") return
  const obj = node as Record<string, unknown>
  if (seen.has(obj)) return
  seen.add(obj)
  for (const key of Object.keys(obj)) {
    if (keys.has(key)) {
      obj[key] = REDACTION_CENSOR_BASELINE
      continue
    }
    walkAndRedact(obj[key], keys, seen)
  }
}

export { BASELINE_REDACT_PATHS }
export const BASELINE_PINO_REDACT_PATHS = BASELINE_REDACT_PATHS

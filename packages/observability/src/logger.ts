import pino, { type LoggerOptions } from "pino"
import { BASELINE_REDACT_PATHS } from "./redact-baseline"

/**
 * Default application logger. JSON in production, pino-pretty in dev.
 *
 * Redaction baseline: single source-of-truth at
 * `@workspace/observability/redact-baseline`. The same constant is re-exported
 * to `@workspace/db/audit/redact` so the pino path list and the
 * `tool_call_log` redactor walk identical paths.
 *
 * Call `configureToolRedactions()` at boot with the aggregated per-tool
 * redaction paths from the tool registry. That rebuilds the logger with the
 * merged path list so structured logs carry the same redaction contract as
 * `tool_call_log.input_json` / `output_json`.
 */

export { BASELINE_REDACT_PATHS } from "./redact-baseline"

const isProduction = process.env["NODE_ENV"] === "production"
// Skip pino-pretty in test env — it is not a dependency and tests don't need
// formatted output. JSON is sufficient for assertion and CI logs.
const isTest = process.env["NODE_ENV"] === "test"

// pino-pretty is opt-in. The transport tries to dynamically require
// "pino-pretty" at module evaluation, which Turbopack / esbuild / etc.
// cannot resolve unless the package is bundled as a direct dependency.
// Rather than ship pino-pretty into every Next.js bundle, we only enable
// it when the developer asks for it explicitly (`PINO_PRETTY=1 pnpm dev`)
// and the package is present. Without the flag, dev logs are plain JSON,
// which is still readable and avoids the "unable to determine transport
// target" runtime error in Next + Turbopack.
const wantsPretty = process.env["PINO_PRETTY"] === "1"

function buildOptions(extraPaths: readonly string[] = []): LoggerOptions {
  const paths = Array.from(new Set([...BASELINE_REDACT_PATHS, ...extraPaths]))
  const base: LoggerOptions = {
    level: process.env["LOG_LEVEL"] ?? (isProduction ? "info" : "debug"),
    redact: {
      paths,
      censor: "[REDACTED]",
    },
  }
  if (isProduction || isTest || !wantsPretty) return base
  return { ...base, transport: { target: "pino-pretty" } }
}

/**
 * Default logger instance. Call `configureToolRedactions` at boot to extend
 * the redact path list with tool-declared paths before the first log line.
 */
export let logger = pino(buildOptions())

/**
 * Extend the logger's redact path list with tool-declared redactions.
 * The tool registry calls this at boot with the aggregated `redactForAudit`
 * paths so pino logs carry the same contract as `tool_call_log.input_json` /
 * `output_json`.
 *
 * Paths should be in pino glob form (e.g. `*.card_number`, `*.lines.*.pin`).
 * `@workspace/db/audit/redact#toPinoRedactPaths` produces this shape.
 *
 * Call ONCE at process boot, before the first log line. Late reconfiguration
 * is safe but does not re-route already-emitted lines.
 */
export function configureToolRedactions(paths: readonly string[]): void {
  logger = pino(buildOptions(paths))
}

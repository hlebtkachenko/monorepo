import pino, { type LoggerOptions } from "pino"
import { BASELINE_REDACT_PATHS } from "./redact-baseline.js"

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

export {
  BASELINE_REDACT_PATHS,
  BASELINE_PINO_REDACT_PATHS,
} from "./redact-baseline.js"

const isProduction = process.env["NODE_ENV"] === "production"

function buildOptions(extraPaths: readonly string[] = []): LoggerOptions {
  const paths = Array.from(new Set([...BASELINE_REDACT_PATHS, ...extraPaths]))
  const base: LoggerOptions = {
    level: process.env["LOG_LEVEL"] ?? (isProduction ? "info" : "debug"),
    redact: {
      paths,
      censor: "[REDACTED]",
    },
  }
  return isProduction ? base : { ...base, transport: { target: "pino-pretty" } }
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

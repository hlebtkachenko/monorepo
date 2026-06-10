import { sanitizeError } from "@workspace/notify"

/**
 * PII-safe one-line error logging for apps/web server code (server actions,
 * route handlers, server components). Mirrors apps/api, which routes errors
 * through Nest Logger + `sanitizeError`: message only (whitespace-collapsed,
 * ≤300 chars), never the stack, never the raw error object. Callers must not
 * put user emails or other PII in `tag`.
 */
export function logServerError(tag: string, err: unknown): void {
  const { message } = sanitizeError(err, tag)
  console.error(`[${tag}] ${message}`)
}

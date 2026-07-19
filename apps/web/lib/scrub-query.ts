/**
 * Sensitive query-string keys stripped before a URL is preserved through the
 * login redirect or handed to a logger. Matched case-insensitively.
 *
 * A denylist (not an allowlist) is deliberate: benign deep-link params are
 * open-ended and per-page (`?inspect=<uuid>`, `?tab=...`, `?q=...`), so an
 * allowlist is impractical. Off-origin targets are already blocked by
 * `safeNext`; this list only has to catch credential-bearing VALUES so they
 * never round-trip as `?next=` or land in Sentry/telemetry. Keys are the ones
 * this app actually puts in URLs plus the standard OAuth/OIDC signing set.
 */
const SENSITIVE_QUERY_KEYS: ReadonlySet<string> = new Set([
  "token",
  "code",
  "secret",
  "sig",
  "state",
  "access_token",
  "id_token",
  "refresh_token",
  "password",
  "otp",
  "ticket",
  "key",
])

export function isSensitiveQueryKey(key: string): boolean {
  return SENSITIVE_QUERY_KEYS.has(key.toLowerCase())
}

/**
 * Return a copy of `params` with every sensitive key removed. The input is left
 * untouched, so route handlers still read the original searchParams.
 */
export function scrubSensitiveParams(params: URLSearchParams): URLSearchParams {
  const clean = new URLSearchParams()
  for (const [key, value] of params) {
    if (!isSensitiveQueryKey(key)) clean.append(key, value)
  }
  return clean
}

/**
 * Compose `pathname` with its scrubbed query string, dropping the `?` entirely
 * when nothing survives. Used to preserve a benign deep-link query through the
 * login redirect and the `x-pathname` bounce header.
 */
export function pathWithScrubbedQuery(
  pathname: string,
  params: URLSearchParams,
): string {
  const clean = scrubSensitiveParams(params).toString()
  return clean ? `${pathname}?${clean}` : pathname
}

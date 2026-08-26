/**
 * The response vocabulary of `/api/agent/v1/*`.
 *
 * ONE SHAPE FOR EVERY ANSWER: `{ "error": "<code>" }` on refusal, a payload on
 * success, `application/json` and `no-store` on both. The codes are a closed set
 * an integration can branch on; nothing here ever carries a message built from
 * an exception, because a stack trace or a Postgres constraint name in a
 * response body is an internals leak the caller did not need to ask for.
 *
 * THE 401 IS DELIBERATELY UNIFORM. Unknown key, revoked key, malformed header,
 * missing header, a key whose office account was deactivated — all of them are
 * byte-identical. Distinguishing them would answer "is this key real?" for
 * anyone holding a stale one.
 */
export type AgentErrorCode =
  | "unauthorized"
  | "rate_limited"
  | "not_found"
  | "invalid_json"
  | "invalid_body"
  | "tenancy_key_in_payload"
  | "payload_too_large"
  | "unsupported_media_type"
  | "conflict"
  | "identity_changed"

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const

export function agentJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS })
}

export function agentError(
  status: number,
  error: AgentErrorCode,
  extra?: Record<string, unknown>,
): Response {
  return agentJson(status, { error, ...extra })
}

/**
 * `WWW-Authenticate: Bearer` and nothing more — no `error="invalid_token"`
 * parameter, which RFC 6750 would allow and which would reintroduce exactly the
 * distinction the uniform body avoids.
 */
export function agentUnauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { ...HEADERS, "www-authenticate": "Bearer" },
  })
}

export function agentRateLimited(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: { ...HEADERS, "retry-after": String(retryAfterSeconds) },
  })
}

/**
 * The largest body this API reads.
 *
 * A 5000-account předvaha is well under a megabyte; 4 MiB is the ceiling on what
 * a single request may make this one-task service buffer. Enforced on
 * `content-length` AND on the bytes actually read, because a chunked request
 * declares no length.
 */
export const AGENT_MAX_BODY_BYTES = 4 * 1024 * 1024

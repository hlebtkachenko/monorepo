import createClient, { type Client } from "openapi-fetch"
import { errorFromResponse, parseRetryAfterMs } from "./errors"
import type { paths } from "./generated/openapi"

/**
 * `openapi-fetch` client wired to the Afframe public API surface.
 *
 * `createAfframeClient(...)` returns an `openapi-fetch` Client pinned to the
 * generated `paths` type from `src/generated/openapi.ts` (built from the
 * committed `apps/api/openapi/v1.json` — the shared registry is the single
 * source of truth).
 *
 * Behaviour layered onto the plain client:
 *
 *   1. **Default headers** — bearer auth, `accept: application/json`, and a
 *      client-identification header are set at construction time via
 *      `createClient({ headers })`, not via middleware mutation. Mutating
 *      `request.headers` in a middleware silently fails for `user-agent`
 *      in browsers (forbidden header per the Fetch spec); routing through
 *      default headers sidesteps that whole class of bug.
 *   2. **Per-request timeout + retry** — implemented at the fetch-wrapper
 *      layer (`wrapFetch`), not as a middleware. A retried request still
 *      flows through every middleware (deprecation warn, error mapping),
 *      and the timeout `AbortSignal` composes cleanly with the caller's
 *      own signal.
 *   3. **Deprecation warn** — middleware surfaces `Deprecation` / `Sunset`
 *      response headers via a configurable callback (default
 *      `console.warn`); pass `onDeprecation: null` to suppress.
 *   4. **Plaid-envelope error mapping** — non-2xx responses are translated
 *      into the typed `AfframeApiError` subclasses from `./errors`. Call
 *      sites use `try { … } catch (e) { … }` against those classes.
 *
 * Per-request idempotency: callers pass the `Idempotency-Key` directly as
 * a header on the openapi-fetch call, e.g.
 * `client.POST("/v1/invoices", { headers: { "idempotency-key": k }, body })`.
 * The retry layer respects it: mutations retry only when the header is
 * present.
 */

export interface AfframeClientOptions {
  /** API key — `affk_live_…` (production) or `affk_test_…` (sandbox). */
  apiKey: string
  /** Base URL. Default `https://api.afframe.com`. Override for staging or
   *  a local container. */
  baseUrl?: string
  /** Bring-your-own fetch (e.g. undici, edge runtime). Default
   *  `globalThis.fetch`. The provided fetch is wrapped with the SDK's
   *  timeout + retry policy. */
  fetch?: typeof fetch
  /** Total request timeout in ms. Default 30 000. Set on every outbound
   *  request; aborts via a composed `AbortController`. */
  timeoutMs?: number
  /** Client identification suffix appended to `x-afframe-client`. The SDK
   *  avoids `user-agent` because it's a forbidden header in browsers. */
  userAgent?: string
  /** Hook for `Deprecation:` / `Sunset:` header notifications. Default
   *  `console.warn`. Pass `null` to suppress. */
  onDeprecation?: ((info: DeprecationInfo) => void) | null
  /** Retry policy. Default: at most one retry on 429 / 5xx for idempotent
   *  verbs (or any verb carrying `Idempotency-Key`), capped at 5 s. Pass
   *  `false` to disable retries entirely. */
  retry?: { maxAttempts?: number; maxDelayMs?: number } | false
}

export interface DeprecationInfo {
  path: string
  method: string
  deprecation: string | null
  sunset: string | null
  link: string | null
}

const DEFAULT_BASE_URL = "https://api.afframe.com"
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_RETRY_MAX_ATTEMPTS = 1
const DEFAULT_RETRY_MAX_DELAY_MS = 5_000
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

export type AfframeClient = Client<paths>

export function createAfframeClient(
  options: AfframeClientOptions,
): AfframeClient {
  if (!options.apiKey) throw new TypeError("Afframe: apiKey is required")

  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "")
  const clientId = `@afframe/sdk${options.userAgent ? ` ${options.userAgent}` : ""}`
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const onDeprecation =
    options.onDeprecation === undefined
      ? defaultDeprecationWarn
      : options.onDeprecation
  const retry =
    options.retry === false
      ? null
      : {
          maxAttempts: options.retry?.maxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS,
          maxDelayMs: options.retry?.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS,
        }

  const baseFetch = options.fetch ?? globalThis.fetch
  const wrappedFetch = wrapFetch(baseFetch, { timeoutMs, retry })

  const client = createClient<paths>({
    baseUrl,
    fetch: wrappedFetch,
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      accept: "application/json",
      "x-afframe-client": clientId,
    },
  })

  if (onDeprecation) {
    client.use({
      onResponse: ({ response, request }) => {
        const deprecation = response.headers.get("deprecation")
        const sunset = response.headers.get("sunset")
        if (deprecation || sunset) {
          onDeprecation({
            path: new URL(request.url).pathname,
            method: request.method,
            deprecation,
            sunset,
            link: response.headers.get("link"),
          })
        }
        return response
      },
    })
  }

  client.use({
    onResponse: async ({ response }) => {
      if (response.ok) return response
      const cloned = response.clone()
      let body: unknown
      try {
        body = await cloned.json()
      } catch {
        body = undefined
      }
      const envelope =
        body && typeof body === "object" && "error" in body
          ? (body as { error: Parameters<typeof errorFromResponse>[0] }).error
          : {
              code: "internal_error",
              message: response.statusText || "Internal error",
              requestId: response.headers.get("x-request-id") ?? "unknown",
            }
      throw errorFromResponse(envelope, response.status, response.headers)
    },
  })

  return client
}

interface WrapFetchConfig {
  timeoutMs: number
  retry: { maxAttempts: number; maxDelayMs: number } | null
}

/**
 * Wraps the underlying fetch with per-request timeout + retry. Lives
 * outside the middleware pipeline so retried requests still flow through
 * every middleware (auth headers, deprecation warn, error mapping), and so
 * the timeout signal composes cleanly with the caller's own `AbortSignal`.
 *
 * Retry policy:
 *   - Idempotent verbs (`GET`, `HEAD`, `OPTIONS`) retry on 429 / 5xx.
 *   - Mutations (`POST`, `PUT`, `PATCH`, `DELETE`) retry only when the
 *     caller passed an `Idempotency-Key` header.
 *   - Delay honours `Retry-After`; capped at `maxDelayMs`.
 */
function wrapFetch(
  base: typeof fetch,
  config: WrapFetchConfig,
): (req: Request) => Promise<Response> {
  return async (req) => {
    let attempt = 0
    for (;;) {
      const response = await sendWithTimeout(base, req, config.timeoutMs)
      if (!config.retry || attempt >= config.retry.maxAttempts) return response
      if (!RETRYABLE_STATUSES.has(response.status)) return response
      const method = req.method.toUpperCase()
      const hasIdempotencyKey = req.headers.has("idempotency-key")
      if (!SAFE_METHODS.has(method) && !hasIdempotencyKey) return response

      // Drain the previous response body before the retry — under
      // HTTP keep-alive the underlying connection stays open until the
      // body is consumed or cancelled. Without this, retry storms
      // starve the connection pool. Errors here mean the connection is
      // already torn down; nothing to recover.
      response.body?.cancel().catch(() => undefined)

      const delay =
        parseRetryAfterMs(response.headers.get("retry-after")) ?? 1_000
      await sleep(Math.min(delay, config.retry.maxDelayMs))
      attempt++
    }
  }
}

async function sendWithTimeout(
  base: typeof fetch,
  req: Request,
  timeoutMs: number,
): Promise<Response> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  const onAbort = () => ac.abort()
  req.signal.addEventListener("abort", onAbort, { once: true })
  try {
    return await base(new Request(req, { signal: ac.signal }))
  } finally {
    clearTimeout(timer)
    req.signal.removeEventListener("abort", onAbort)
  }
}

function defaultDeprecationWarn(info: DeprecationInfo): void {
  const bits = [`${info.method} ${info.path} is deprecated`]
  if (info.sunset) bits.push(`sunset ${info.sunset}`)
  if (info.link) bits.push(`see ${info.link}`)
  console.warn(`[afframe-sdk] ${bits.join("; ")}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

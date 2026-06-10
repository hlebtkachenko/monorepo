import {
  ApiErrorSchema,
  GetOrganizationResponseSchema,
  PingResponseSchema,
  type GetOrganizationResponse,
  type PingResponse,
} from "@workspace/shared/api"
import { errorFromResponse } from "./errors"

export * from "./errors"
export * from "./brands"
export { createAfframeClient } from "./client"
export type {
  AfframeClient,
  AfframeClientOptions,
  DeprecationInfo,
} from "./client"
export { verifyWebhook, WebhookVerificationError } from "./webhooks"
export type { VerifyWebhookInput } from "./webhooks"
export type { paths, components, operations } from "./generated/openapi"

/** SDK client configuration. */
export interface AfframeOptions {
  /** API key — `affk_live_…` (sandbox `affk_test_…` keys: not issued yet). */
  apiKey: string
  /** Base URL. Default `https://api.afframe.com`. Override for staging or a local container. */
  baseUrl?: string
  /** Total request timeout in ms. Default 30 000. */
  timeoutMs?: number
  /** Bring-your-own fetch (e.g., undici, edge runtime). Default global `fetch`. */
  fetch?: typeof fetch
  /** User-Agent suffix added to every request. */
  userAgent?: string
}

const DEFAULT_BASE_URL = "https://api.afframe.com"
const DEFAULT_TIMEOUT_MS = 30_000

interface RequestOptions {
  signal?: AbortSignal
}

/**
 * Thin TypeScript client for the Afframe public API.
 *
 * @deprecated Use `createAfframeClient(...)` from `@afframe/sdk` instead.
 * That client is generated from the committed OpenAPI spec, surfaces every
 * registered operation with full path + body typing, and shares one error
 * envelope path with the rest of the SDK. The class below is kept for one
 * release cycle to preserve the previous public shape (`meta.ping()`,
 * `organization.get()`); new code should not import it.
 *
 * Errors throw typed {@link AfframeApiError} subclasses
 * (`UnauthorizedError`, `RateLimitError`, …) — every subclass carries
 * `requestId` + `documentationUrl` from the Plaid-shape envelope.
 */
export class Afframe {
  readonly meta: MetaResource
  readonly organization: OrganizationResource

  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly userAgent: string

  constructor(options: AfframeOptions) {
    if (!options.apiKey) throw new TypeError("Afframe: apiKey is required")
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "")
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.fetchImpl = options.fetch ?? fetch
    this.userAgent = `@afframe/sdk${options.userAgent ? ` ${options.userAgent}` : ""}`

    this.meta = new MetaResource(this)
    this.organization = new OrganizationResource(this)
  }

  /** Internal: typed JSON GET with envelope-aware error handling. */
  async request<T>(
    path: string,
    parse: (body: unknown) => T,
    opts: RequestOptions = {},
  ): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const onAbort = () => controller.abort()
    // `{ once: true }` self-cleans only on abort. A caller reusing a
    // long-lived signal across many requests accumulates the listeners
    // attached here until GC — explicit removal in the finally block.
    opts.signal?.addEventListener("abort", onAbort, { once: true })

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          accept: "application/json",
          "user-agent": this.userAgent,
        },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
      opts.signal?.removeEventListener("abort", onAbort)
    }

    const bodyText = await response.text()
    let body: unknown = undefined
    if (bodyText) {
      try {
        body = JSON.parse(bodyText)
      } catch {
        throw new Error(
          `Afframe: non-JSON response from ${path} (HTTP ${response.status})`,
        )
      }
    }

    if (!response.ok) {
      const parsed = ApiErrorSchema.safeParse(body)
      if (!parsed.success) {
        throw new Error(
          `Afframe: ${response.status} ${response.statusText} from ${path} ` +
            `(unrecognised error envelope)`,
        )
      }
      throw errorFromResponse(
        parsed.data.error,
        response.status,
        response.headers,
      )
    }

    return parse(body)
  }
}

class MetaResource {
  constructor(private readonly client: Afframe) {}

  /** `GET /v1/ping` — confirm the API key authenticated. */
  async ping(opts?: RequestOptions): Promise<PingResponse> {
    return this.client.request(
      "/v1/ping",
      (body) => PingResponseSchema.parse(body),
      opts,
    )
  }
}

class OrganizationResource {
  constructor(private readonly client: Afframe) {}

  /** `GET /v1/organization` — return the API key's own organization. */
  async get(opts?: RequestOptions): Promise<GetOrganizationResponse> {
    return this.client.request(
      "/v1/organization",
      (body) => GetOrganizationResponseSchema.parse(body),
      opts,
    )
  }
}

import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi"
import type { RouteConfig } from "@asteasolutions/zod-to-openapi"

import "./zod-openapi"
import {
  ApiErrorSchema,
  ApiPrincipalSchema,
  PingResponseSchema,
} from "./common"
import {
  CreateFeedbackRequestSchema,
  CreateFeedbackResponseSchema,
  FeedbackTypeSchema,
} from "./feedback"
import {
  GetOrganizationResponseSchema,
  OrganizationSummarySchema,
} from "./organizations"
import {
  ComponentStatusSchema,
  ServiceStatusSchema,
  StatusResponseSchema,
} from "./status"

type OpenAPIDocument = ReturnType<OpenApiGeneratorV31["generateDocument"]>

/**
 * Single source of truth for the public `/v1/*` OpenAPI surface.
 *
 * Every Zod schema in `packages/shared/src/api/*.ts` carries `.openapi({...})`
 * metadata via the extension applied below; this file pulls them into one
 * `OpenAPIRegistry`, registers each operation against the resource schemas,
 * and exposes `buildOpenApiDocument()` so the api process and the codegen
 * scripts share a single emit path.
 *
 * Authoring rules — see `docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md`:
 *
 *   1. Author Zod schemas in `packages/shared/src/api/<resource>.ts`. Chain
 *      `.openapi({ description, example })` on every public field.
 *   2. `registry.register("Name", Schema)` for components, or
 *      `registry.registerPath({ ... })` for operations. Do this in *this*
 *      file so the surface is reviewable in one diff per PR.
 *   3. Run `pnpm gen:all` from the repo root. Spec, SDK types, MCP tools,
 *      and docs reference stubs regenerate together.
 *
 * The plain Zod schemas remain framework-agnostic; the `.openapi()` calls
 * are a no-op until `extendZodWithOpenApi(z)` runs, which `./zod-openapi`
 * does on import.
 */

export const registry = new OpenAPIRegistry()

const PingResponse = registry.register("PingResponse", PingResponseSchema)
const GetOrganizationResponse = registry.register(
  "GetOrganizationResponse",
  GetOrganizationResponseSchema,
)
// Schemas not directly referenced by a registerPath call but used either by
// the registered error response component (`ApiError`) or by sub-properties
// of the response schemas (`ApiPrincipal`, `OrganizationSummary`). Each is
// surfaced as a top-level component schema rather than inlined, so codegen
// emits stand-alone SDK / MCP types.
registry.register("ApiError", ApiErrorSchema)
registry.register("ApiPrincipal", ApiPrincipalSchema)
registry.register("OrganizationSummary", OrganizationSummarySchema)
const StatusResponse = registry.register("StatusResponse", StatusResponseSchema)
registry.register("ServiceStatus", ServiceStatusSchema)
registry.register("ComponentStatus", ComponentStatusSchema)
const CreateFeedbackRequest = registry.register(
  "CreateFeedbackRequest",
  CreateFeedbackRequestSchema,
)
const CreateFeedbackResponse = registry.register(
  "CreateFeedbackResponse",
  CreateFeedbackResponseSchema,
)
registry.register("FeedbackType", FeedbackTypeSchema)

/**
 * Bearer security scheme. Registered once and referenced by every operation
 * — every public endpoint requires an API key.
 */
const bearerAuth = registry.registerComponent("securitySchemes", "bearer", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "API key",
  description:
    "API key in the form `affk_live_…`. Send as " +
    "`Authorization: Bearer <key>`. Sandbox keys (`affk_test_…`) are not " +
    "issued yet — see the sandbox roadmap in the docs.",
})

/**
 * The six common error responses every `/v1/*` operation can emit. Single
 * source of truth — adding a new platform-wide error means one entry, not a
 * triple edit across name/description/example tables.
 */
const REQUEST_ID = "req_1f5a8c6e91d240bdbe18d4e07a3f9c14"

interface ErrorResponseDef {
  status: string
  name: string
  description: string
  example: Record<string, unknown>
}

const ERROR_RESPONSES: ErrorResponseDef[] = [
  {
    status: "401",
    name: "Unauthorized",
    description:
      "API key missing, malformed, revoked, or pointing at a different " +
      "environment than the host.",
    example: {
      code: "unauthorized",
      error_type: "UNAUTHORIZED",
      message: "Missing or invalid API key.",
      requestId: REQUEST_ID,
    },
  },
  {
    status: "403",
    name: "Forbidden",
    description:
      "API key authenticated but lacks the scope required for this operation, " +
      "or the target resource belongs to a different tenant.",
    example: {
      code: "forbidden",
      error_type: "FORBIDDEN",
      message: "The API key is not allowed to perform this action.",
      requestId: REQUEST_ID,
    },
  },
  {
    status: "404",
    name: "NotFound",
    description:
      "The resource referenced by the request URL does not exist (or does not " +
      "exist within the authenticated tenant — Afframe never leaks " +
      "cross-tenant existence).",
    example: {
      code: "not_found",
      error_type: "NOT_FOUND",
      message: "Resource not found.",
      requestId: REQUEST_ID,
    },
  },
  {
    status: "409",
    name: "Conflict",
    description:
      "Idempotency conflict, optimistic-concurrency mismatch, or business-rule " +
      "conflict.",
    example: {
      code: "conflict",
      error_type: "CONFLICT",
      message: "Resource is in a state that conflicts with the request.",
      requestId: REQUEST_ID,
    },
  },
  {
    status: "422",
    name: "ValidationError",
    description:
      "Request body parsed but failed schema validation. The `details` array " +
      "carries one entry per offending field.",
    example: {
      code: "validation_error",
      error_type: "VALIDATION",
      message: "Request body failed validation.",
      requestId: REQUEST_ID,
      details: [
        {
          path: "$.legalName",
          code: "required",
          message: "legalName is required.",
        },
      ],
    },
  },
  {
    status: "429",
    name: "RateLimited",
    description:
      "Caller exceeded the API-key rate limit. The response carries IETF " +
      "`RateLimit-*` headers indicating the reset window.",
    example: {
      code: "rate_limited",
      error_type: "RATE_LIMITED",
      message:
        "Too many requests. See the RateLimit-* headers for the reset window.",
      requestId: REQUEST_ID,
    },
  },
]

/**
 * Registers each common error response as a reusable component, then returns
 * a `{ status: $ref }` map ready to spread into every `registerPath` call.
 * Per-op responses become `$ref` pointers — the path table stays compact
 * and avoids 6× duplication on every endpoint.
 */
function buildErrorResponses(): NonNullable<RouteConfig["responses"]> {
  const refs: NonNullable<RouteConfig["responses"]> = {}
  for (const { status, name, description, example } of ERROR_RESPONSES) {
    registry.registerComponent("responses", name, {
      description,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiError" },
          example: { error: example },
        },
      },
    })
    refs[status] = { $ref: `#/components/responses/${name}` }
  }
  return refs
}

const ERROR_RESPONSE_REFS = buildErrorResponses()

registry.registerPath({
  method: "get",
  path: "/v1/ping",
  operationId: "ping",
  summary: "Ping",
  description:
    "Zero-DB smoke test. Returns the resolved principal — confirms the API " +
    "key authenticated.",
  tags: ["Meta"],
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    "200": {
      description: "API key authenticated and the principal resolved.",
      content: { "application/json": { schema: PingResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/organization",
  operationId: "getOrganization",
  summary: "Get organization",
  description: "Returns the organization the authenticated API key belongs to.",
  tags: ["Organization"],
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    "200": {
      description: "The authenticated principal's organization.",
      content: { "application/json": { schema: GetOrganizationResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/status",
  operationId: "getStatus",
  summary: "Service status",
  description:
    "Returns the service health summary. Proxies `status.afframe.com` " +
    "(OpenStatus) when reachable; otherwise synthesizes an operational " +
    "fallback. Public — no API key required.",
  tags: ["Status"],
  responses: {
    "200": {
      description: "Service status snapshot.",
      content: { "application/json": { schema: StatusResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "post",
  path: "/v1/feedback",
  operationId: "createFeedback",
  summary: "Send feedback",
  description:
    "Submit a bug report, feature request, process issue, or question. " +
    "The api forwards every submission to `support+feedback@afframe.com` " +
    "and creates a Linear issue tagged with the feedback type. Public — " +
    "no API key required.",
  tags: ["Feedback"],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateFeedbackRequest } },
    },
  },
  responses: {
    "201": {
      description: "Feedback accepted for downstream dispatch.",
      content: { "application/json": { schema: CreateFeedbackResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

/**
 * Emit the full OpenAPI 3.1 document. The api process and the codegen
 * scripts both go through this single call — drop adapters here, not in
 * downstream consumers.
 *
 * The Scalar API Reference mounted at `api.afframe.com/` is the single
 * developer-facing surface. There is no separate docs site today; the
 * earlier `apps/docs/` developer hub is archived to
 * `.context/archive/apps-docs-2026-05-21/`. `info.contact` / `license` /
 * `termsOfService` therefore omit `url` fields (no public hub to deep-link
 * to) and `externalDocs` is omitted entirely.
 */
/**
 * API contract version. NOT tied to the monorepo's release tag or
 * deployment artifact version — `info.version` in OpenAPI is the
 * **contract** version. Stripe, GitHub, Twilio, Plaid all decouple
 * the same way.
 *
 * Bump rules:
 *   - PATCH (1.0.1) — backward-compat schema or wording fixes
 *   - MINOR (1.1.0) — backward-compat additions (new endpoint, new
 *                     optional field, new error code)
 *   - MAJOR (2.0.0) — breaking change. Also bumps the URL prefix to
 *                     `/v2/` and triggers an ADR + sunset window for `/v1/`.
 *
 * Edit this constant in the SAME commit that introduces the contract
 * change. CI (`openapi-lint` Spectral rule) does not gate this today;
 * code review is the enforcement.
 *
 * Documented in `docs/api/VERSIONING.md` and
 * `docs/conventions/ENDPOINT-ADDITION.md`.
 */
export const API_VERSION = "1.0.0" as const

/**
 * Returns the list of `servers` for the OpenAPI spec. The staging entry
 * is environment-gated — staging contributors opening
 * `api-staging.afframe.com/` see staging as a server option, but the
 * production spec at `api.afframe.com/` only advertises production.
 * Keeps the public-facing surface focused; staging is dev-only.
 */
function resolveServers(): { url: string; description: string }[] {
  const servers = [
    { url: "https://api.afframe.com", description: "Production" },
  ]
  // `process` typed via globalThis cast — @workspace/shared is consumed by
  // both Node (api, codegen) and browser-targeted bundles (sdk); avoiding
  // @types/node here keeps the runtime contract neutral. APP_ENV is set on
  // the api container; everywhere else it's `undefined` and we ship the
  // production-only servers array.
  const env = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> }
    }
  ).process?.env?.APP_ENV?.toLowerCase()
  if (env === "staging" || env === "development" || env === "test") {
    servers.push({
      url: "https://api-staging.afframe.com",
      description: "Staging",
    })
  }
  return servers
}

export function buildOpenApiDocument(): OpenAPIDocument {
  const generator = new OpenApiGeneratorV31(registry.definitions)
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Afframe Public API",
      version: API_VERSION,
      description:
        "Public API for the Afframe accounting platform. Authenticate with " +
        "an API key as a bearer token in the form `affk_live_…`. Sandbox " +
        "keys (`affk_test_…`) are not issued yet. Errors are returned in a " +
        "Plaid-shape envelope; rate limits are surfaced via IETF " +
        "`RateLimit-*` headers." +
        "\n\n" +
        "Service status: [status.afframe.com](https://status.afframe.com) " +
        "(programmatic at `GET /v1/status`).",
      // Native Scalar OSS header badges only — `support` (info.contact)
      // and `terms` (info.license). `info.termsOfService` is omitted on
      // purpose: setting BOTH `license.url` and `termsOfService` renders
      // two Terms badges in the header. The license.url is the clickable
      // landing page; one badge is enough.
      contact: {
        name: "Afframe support",
        email: "support@afframe.com",
        url: "mailto:support@afframe.com",
      },
      license: {
        name: "Proprietary — see Terms of Service",
        url: "https://afframe.com/terms",
      },
    },
    servers: resolveServers(),
    tags: [
      { name: "Meta", description: "Service metadata and auth smoke tests" },
      { name: "Organization", description: "The API key's own organization" },
      { name: "Status", description: "Service status and component health" },
      {
        name: "Feedback",
        description: "Send bug reports, requests, and questions",
      },
    ],
  })
}

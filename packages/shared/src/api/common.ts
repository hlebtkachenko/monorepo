import { z } from "zod"

import "./zod-openapi"

/**
 * Standard error envelope for every `api.afframe.com/v1/*` response.
 * Emitted by the api's DomainExceptionFilter. Plaid-shape per ADR-0023.
 *
 * `error_type` + `documentation_url` are present on every response from
 * 2026-05-20 onwards. Marked optional so older SDK builds still validate
 * the prior envelope without an error.
 */
export const ApiErrorSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({
        description:
          "Stable machine-readable error code. SDKs map this to typed " +
          "error classes; do not switch on `message`.",
      }),
      error_type: z
        .string()
        .optional()
        .openapi({
          description:
            "Plaid-shape family (INVALID_REQUEST, UNAUTHORIZED, FORBIDDEN, " +
            "NOT_FOUND, CONFLICT, VALIDATION, RATE_LIMITED, INTERNAL, …).",
        }),
      message: z
        .string()
        .openapi({ description: "Developer-facing message. Safe to log." }),
      display_message: z
        .string()
        .optional()
        .openapi({
          description:
            "Optional end-user-facing message. Present when the cause is " +
            "safe to surface in a UI; absent for 5xx / unknown errors.",
        }),
      documentation_url: z
        .url()
        .optional()
        .openapi({
          description:
            "Optional deep-link into a hosted error registry. Reserved " +
            "for future use; the api does not emit this field today.",
        }),
      requestId: z.string().openapi({
        description: "Echoes the `X-Request-Id` header for support tickets.",
      }),
      details: z
        .array(
          z.object({
            path: z.string(),
            code: z.string(),
            message: z.string(),
          }),
        )
        .optional()
        .openapi({
          description:
            "Field-level error breakdown. Present on `422 validation_error`; " +
            "absent on most other codes.",
        }),
    }),
  })
  .openapi({
    description:
      "Plaid-shape error envelope. Every non-2xx response from `/v1/*` is " +
      "wrapped in this object.",
  })
export type ApiError = z.infer<typeof ApiErrorSchema>

/** Caller identity resolved from an API key. */
export const ApiPrincipalSchema = z
  .object({
    organizationId: z.uuid().openapi({
      description: "The organization the API key is scoped to.",
    }),
    workspaceId: z.uuid().openapi({
      description: "The workspace (accountant's office) hosting the org.",
    }),
  })
  .openapi({
    description:
      "Identity resolved from the bearer API key. Mirrors the server-side " +
      "tenancy GUCs (`app.organization_id`, `app.workspace_id`).",
  })
export type ApiPrincipal = z.infer<typeof ApiPrincipalSchema>

/** `GET /v1/ping` — zero-DB auth smoke test. */
export const PingResponseSchema = z
  .object({
    ok: z.literal(true).openapi({
      description: "Always `true` on a 2xx response.",
    }),
    principal: ApiPrincipalSchema,
  })
  .openapi({
    description:
      "Confirms the API key authenticated and reveals the resolved tenancy.",
  })
export type PingResponse = z.infer<typeof PingResponseSchema>

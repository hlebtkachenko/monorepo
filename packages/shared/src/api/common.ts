import { z } from "zod"

/**
 * Standard error envelope for every `api.afframe.com/v1/*` response.
 * Emitted by the api's DomainExceptionFilter. Plaid-shape per ADR-0023.
 *
 * `error_type` + `documentation_url` are present on every response from
 * 2026-05-20 onwards. Marked optional so older SDK builds still validate
 * the prior envelope without an error.
 */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    error_type: z.string().optional(),
    message: z.string(),
    display_message: z.string().optional(),
    documentation_url: z.url().optional(),
    requestId: z.string(),
    details: z
      .array(
        z.object({
          path: z.string(),
          code: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  }),
})
export type ApiError = z.infer<typeof ApiErrorSchema>

/** Caller identity resolved from an API key. */
export const ApiPrincipalSchema = z.object({
  organizationId: z.uuid(),
  workspaceId: z.uuid(),
})
export type ApiPrincipal = z.infer<typeof ApiPrincipalSchema>

/** `GET /v1/ping` — zero-DB auth smoke test. */
export const PingResponseSchema = z.object({
  ok: z.literal(true),
  principal: ApiPrincipalSchema,
})
export type PingResponse = z.infer<typeof PingResponseSchema>

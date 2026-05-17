import { z } from "zod"

/**
 * Standard error envelope for every `api.afframe.com/v1/*` response.
 * Emitted by the api's DomainExceptionFilter.
 */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
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

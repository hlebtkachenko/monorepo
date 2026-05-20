/**
 * Re-export the Zod schemas + inferred types from `@workspace/shared/api`.
 *
 * Consumers who want runtime validation without the full client (e.g., to
 * validate a webhook payload server-side) import from `@afframe/sdk/schemas`
 * and skip the network shim.
 */
export {
  ApiErrorSchema,
  ApiPrincipalSchema,
  PingResponseSchema,
  OrganizationSummarySchema,
  GetOrganizationResponseSchema,
} from "@workspace/shared/api"
export type {
  ApiError,
  ApiPrincipal,
  PingResponse,
  OrganizationSummary,
  GetOrganizationResponse,
} from "@workspace/shared/api"

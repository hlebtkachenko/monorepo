import { z } from "zod"

/** Public-API view of an organization. camelCase JSON; the api maps from the snake_case row. */
export const OrganizationSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  legalName: z.string(),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
})
export type OrganizationSummary = z.infer<typeof OrganizationSummarySchema>

/** `GET /v1/organization` response — the API key's own organization. */
export const GetOrganizationResponseSchema = z.object({
  organization: OrganizationSummarySchema,
})
export type GetOrganizationResponse = z.infer<
  typeof GetOrganizationResponseSchema
>

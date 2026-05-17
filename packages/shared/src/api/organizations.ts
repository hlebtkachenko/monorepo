import { z } from "zod"

/** Public-API view of an organization. camelCase JSON; the domain layer maps from the snake_case row. */
export const OrganizationSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  legalName: z.string(),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
})
export type OrganizationSummary = z.infer<typeof OrganizationSummarySchema>

/** `GET /v1/organizations` response. */
export const ListOrganizationsResponseSchema = z.object({
  organizations: z.array(OrganizationSummarySchema),
})
export type ListOrganizationsResponse = z.infer<
  typeof ListOrganizationsResponseSchema
>

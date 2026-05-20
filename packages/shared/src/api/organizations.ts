import { z } from "zod"

import { OrganizationIdSchema } from "./primitives"
import "./zod-openapi"

/** Public-API view of an organization. camelCase JSON; the api maps from the snake_case row. */
export const OrganizationSummarySchema = z
  .object({
    id: OrganizationIdSchema,
    slug: z.string().openapi({
      description: "URL-safe organization handle, e.g. `acme-cz`.",
      example: "acme-cz",
    }),
    legalName: z.string().openapi({
      description: "Registered legal name, e.g. `Acme Czechia s.r.o.`",
      example: "Acme Czechia s.r.o.",
    }),
    fiscalYearStartMonth: z
      .number()
      .int()
      .min(1)
      .max(12)
      .openapi({
        description:
          "Month (1–12) on which the org's fiscal year starts. Most CZ " +
          "entities use `1` (calendar year).",
        example: 1,
      }),
  })
  .openapi({
    description: "Public-API summary of an organization (tenant).",
  })
export type OrganizationSummary = z.infer<typeof OrganizationSummarySchema>

/** `GET /v1/organization` response — the API key's own organization. */
export const GetOrganizationResponseSchema = z
  .object({
    organization: OrganizationSummarySchema,
  })
  .openapi({
    description:
      "The organization the API key belongs to. Single-tenant view; " +
      "future multi-org-per-key tokens will return a list endpoint instead.",
  })
export type GetOrganizationResponse = z.infer<
  typeof GetOrganizationResponseSchema
>

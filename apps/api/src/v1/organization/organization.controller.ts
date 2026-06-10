import { Controller, Get, UseGuards } from "@nestjs/common"
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger"
import type { GetOrganizationResponse } from "@workspace/shared/api"
import { NotFoundError } from "@workspace/shared/errors"
import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"
import { eq, withOrganization } from "@workspace/db"
import { organization } from "@workspace/db/schema"
import { ApiKeyGuard } from "../../auth/api-key.guard"
import { CurrentPrincipal } from "../../auth/principal.decorator"
import { GetOrganizationResponseDto } from "../dto"

/**
 * `GET /v1/organization` — the worked example. Returns the API key's own
 * organization. Exercises the whole foundation: API-key auth -> RLS tenancy
 * (`withOrganization`) -> typed response that appears in the generated
 * OpenAPI spec.
 */
@ApiTags("Organization")
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller({ path: "organization", version: "1" })
export class OrganizationController {
  @Get()
  @ApiOperation({
    summary: "Get organization",
    description:
      "Returns the organization the authenticated API key belongs to.",
  })
  @ApiOkResponse({ type: GetOrganizationResponseDto })
  async get(
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<GetOrganizationResponse> {
    const org = await withOrganization(
      principal.organizationId,
      principal.userId,
      async (db) => {
        const rows = await db
          .select({
            id: organization.id,
            slug: organization.slug,
            legalName: organization.legal_name,
            fiscalYearStartMonth: organization.fiscal_year_start_month,
          })
          .from(organization)
          .where(eq(organization.id, principal.organizationId))
          .limit(1)
        return rows[0] ?? null
      },
    )
    if (!org) {
      throw new NotFoundError("Organization not found")
    }
    return { organization: org }
  }
}

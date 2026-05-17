import { Controller, Get, UseFilters, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger"
import type { ListOrganizationsResponse } from "@workspace/shared/api"
import { listOrganizationsForUser, type OrgPrincipal } from "@workspace/domain"
import { ApiKeyGuard } from "../../auth/api-key.guard.js"
import { CurrentPrincipal } from "../../auth/principal.decorator.js"
import { DomainExceptionFilter } from "../domain-exception.filter.js"
import { ListOrganizationsResponseDto } from "../dto.js"

/**
 * `GET /v1/organizations` — the worked example. Exercises the whole foundation:
 * API-key auth -> shared domain function -> tenancy -> typed response that
 * appears in the generated OpenAPI spec.
 */
@ApiTags("Organizations")
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@UseFilters(DomainExceptionFilter)
@Controller({ path: "organizations", version: "1" })
export class OrganizationsController {
  @Get()
  @ApiOkResponse({ type: ListOrganizationsResponseDto })
  async list(
    @CurrentPrincipal() principal: OrgPrincipal,
  ): Promise<ListOrganizationsResponse> {
    const organizations = await listOrganizationsForUser(principal)
    return { organizations }
  }
}

import { Controller, Get, UseFilters, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger"
import type { PingResponse } from "@workspace/shared/api"
import type { OrgPrincipal } from "@workspace/domain"
import { ApiKeyGuard } from "../../auth/api-key.guard.js"
import { CurrentPrincipal } from "../../auth/principal.decorator.js"
import { DomainExceptionFilter } from "../domain-exception.filter.js"
import { PingResponseDto } from "../dto.js"

/** `GET /v1/ping` — zero-DB smoke test that the API-key auth path works. */
@ApiTags("Meta")
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@UseFilters(DomainExceptionFilter)
@Controller({ path: "ping", version: "1" })
export class PingController {
  @Get()
  @ApiOkResponse({ type: PingResponseDto })
  ping(@CurrentPrincipal() principal: OrgPrincipal): PingResponse {
    return {
      ok: true,
      principal: {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
      },
    }
  }
}

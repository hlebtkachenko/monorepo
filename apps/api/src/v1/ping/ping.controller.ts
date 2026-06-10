import { Controller, Get, UseGuards } from "@nestjs/common"
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger"
import type { PingResponse } from "@workspace/shared/api"
import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"
import { ApiKeyGuard } from "../../auth/api-key.guard"
import { CurrentPrincipal } from "../../auth/principal.decorator"
import { PingResponseDto } from "../dto"

/** `GET /v1/ping` — zero-DB smoke test that the API-key auth path works. */
@ApiTags("Meta")
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller({ path: "ping", version: "1" })
export class PingController {
  @Get()
  @ApiOperation({
    summary: "Ping",
    description:
      "Zero-DB smoke test. Returns the resolved principal — confirms the " +
      "API key authenticated.",
  })
  @ApiOkResponse({ type: PingResponseDto })
  ping(@CurrentPrincipal() principal: ApiKeyPrincipal): PingResponse {
    return {
      ok: true,
      principal: {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
      },
    }
  }
}

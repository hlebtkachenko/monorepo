import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common"
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger"
import type { JournalResponse } from "@workspace/shared/api"
import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"
import { withOrganization } from "@workspace/db"
import { journal } from "@workspace/accounting"
import { ApiKeyGuard } from "../../auth/api-key.guard"
import { CurrentPrincipal } from "../../auth/principal.decorator"
import { JournalResponseDto } from "../dto"

/**
 * `GET /v1/accounting/*` — read-model surface over the `@workspace/accounting`
 * domain. Controllers are a thin seam: they read the principal from the API-key
 * guard, run the domain query inside `withOrganization` (FORCE RLS), and map the
 * snake_case domain rows to the camelCase public schema. NO accounting logic
 * lives here — the domain is the single source of truth.
 *
 * The tenant (`organizationId` / `userId`) comes ONLY from the authenticated
 * principal; it is never accepted as request input.
 */
@ApiTags("Accounting")
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller({ path: "accounting", version: "1" })
export class AccountingController {
  @Get("periods/:periodId/journal")
  @ApiOperation({
    summary: "Get journal (deník)",
    description:
      "Returns the period's double-entry postings in chronological book " +
      "order (§13), including 701 opening postings.",
  })
  @ApiParam({ name: "periodId", format: "uuid" })
  @ApiOkResponse({ type: JournalResponseDto })
  async getJournal(
    @Param("periodId", new ParseUUIDPipe()) periodId: string,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<JournalResponse> {
    const rows = await withOrganization(
      principal.organizationId,
      principal.userId,
      (db) => journal(db, periodId),
    )
    return {
      organizationId: principal.organizationId,
      periodId,
      rows: rows.map((r) => ({
        postingId: r.posting_id,
        postingDate: r.posting_date,
        isOpening: r.is_opening,
        summaryDesignation: r.summary_designation,
        summaryType: r.summary_type,
        accountingEventId: r.accounting_event_id,
        lineId: r.line_id,
        accountId: r.account_id,
        accountNumber: r.account_number,
        side: r.side,
        amount: r.amount,
      })),
    }
  }
}

import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from "@nestjs/common"
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger"
import type {
  JournalResponse,
  LedgerResponse,
  OpenItemsResponse,
  SaldokontoResponse,
} from "@workspace/shared/api"
import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"
import { withOrganization } from "@workspace/db"
import {
  generalLedger,
  journal,
  saldoPerPartner,
  unsettledOpenItems,
} from "@workspace/accounting"
import { ApiKeyGuard } from "../../auth/api-key.guard"
import { CurrentPrincipal } from "../../auth/principal.decorator"
import {
  JournalResponseDto,
  LedgerResponseDto,
  OpenItemsResponseDto,
  SaldokontoResponseDto,
} from "../dto"

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

  @Get("periods/:periodId/ledger")
  @ApiOperation({
    summary: "Get general ledger / trial balance (hlavní kniha)",
    description:
      "Per-account opening | turnover MD/Dal | closing for the period, from " +
      "the read-model.",
  })
  @ApiParam({ name: "periodId", format: "uuid" })
  @ApiOkResponse({ type: LedgerResponseDto })
  async getLedger(
    @Param("periodId", new ParseUUIDPipe()) periodId: string,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<LedgerResponse> {
    const rows = await withOrganization(
      principal.organizationId,
      principal.userId,
      (db) => generalLedger(db, periodId),
    )
    return {
      organizationId: principal.organizationId,
      periodId,
      accounts: rows.map((r) => ({
        accountId: r.account_id,
        accountNumber: r.account_number,
        accountName: r.account_name,
        nature: r.nature,
        normalBalance: r.normal_balance,
        openingBalance: r.opening_balance,
        turnoverDebit: r.turnover_debit,
        turnoverCredit: r.turnover_credit,
        closingBalance: r.closing_balance,
      })),
    }
  }

  @Get("open-items")
  @ApiOperation({
    summary: "List open items (saldokonto)",
    description:
      "Unsettled receivables/payables, optionally filtered by due date and " +
      "direction.",
  })
  @ApiQuery({ name: "dueBefore", required: false })
  @ApiQuery({
    name: "direction",
    required: false,
    enum: ["RECEIVABLE", "PAYABLE"],
  })
  @ApiOkResponse({ type: OpenItemsResponseDto })
  async getOpenItems(
    @CurrentPrincipal() principal: ApiKeyPrincipal,
    @Query("dueBefore") dueBefore?: string,
    @Query("direction") direction?: "RECEIVABLE" | "PAYABLE",
  ): Promise<OpenItemsResponse> {
    const rows = await withOrganization(
      principal.organizationId,
      principal.userId,
      (db) => unsettledOpenItems(db, { dueBefore, direction }),
    )
    return {
      organizationId: principal.organizationId,
      items: rows.map((r) => ({
        id: r.id,
        counterpartyId: r.counterparty_id,
        accountNumber: r.account_number,
        direction: r.direction,
        variableSymbol: r.variable_symbol,
        originalAmount: r.original_amount,
        settledAmount: r.settled_amount,
        remainingAmount: r.remaining_amount,
        isSettled: r.is_settled,
        currencyCode: r.currency_code,
        issueDate: r.issue_date,
        dueDate: r.due_date,
      })),
    }
  }

  @Get("saldokonto")
  @ApiOperation({
    summary: "Get per-partner saldo",
    description: "Per-partner open receivable/payable balances.",
  })
  @ApiOkResponse({ type: SaldokontoResponseDto })
  async getSaldokonto(
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<SaldokontoResponse> {
    const rows = await withOrganization(
      principal.organizationId,
      principal.userId,
      (db) => saldoPerPartner(db),
    )
    return {
      organizationId: principal.organizationId,
      partners: rows.map((r) => ({
        counterpartyId: r.counterparty_id,
        accountNumber: r.account_number,
        direction: r.direction,
        openTotal: r.open_total,
      })),
    }
  }
}

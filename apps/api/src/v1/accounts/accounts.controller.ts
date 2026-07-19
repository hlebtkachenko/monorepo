import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
  Account,
  GetAccountResponse,
  ListAccountsResponse,
} from "@workspace/shared/api"
import { NotFoundError, ValidationError } from "@workspace/shared/errors"
import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"
import { eq, sql, withOrganization } from "@workspace/db"
import { account } from "@workspace/db/schema"
import { listAccounts } from "@workspace/accounting"
import type { ChartAccountRow } from "@workspace/accounting"
import { ApiKeyGuard } from "../../auth/api-key.guard"
import { CurrentPrincipal } from "../../auth/principal.decorator"
import { RequireScopes } from "../../auth/require-scopes.decorator"
import {
  GetAccountResponseDto,
  ListAccountsQueryDto,
  ListAccountsResponseDto,
  UpdateAccountRequestDto,
} from "../dto"

/**
 * `GET|PATCH /v1/accounts` — the chart-of-accounts surface over the `account`
 * table. A thin seam: read the principal from the API-key guard, run a direct
 * Drizzle query inside `withOrganization` (FORCE RLS), and map the snake_case
 * row to the camelCase public schema. No accounting logic lives here.
 *
 * The tenant (`organizationId` / `userId`) comes ONLY from the authenticated
 * principal; it is never accepted as request input. RLS makes a cross-tenant
 * row invisible, so a missing/foreign account surfaces as 404 (never 403) —
 * Afframe never leaks cross-tenant existence.
 */
@ApiTags("Accounts")
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller({ path: "accounts", version: "1" })
export class AccountsController {
  /** Maps a projected `account` row to the public `Account` shape. */
  private toAccount(r: {
    id: string
    chartId: string
    periodId: string
    parentId: string | null
    number: string
    name: string
    nature: string
    normalBalance: "DEBIT" | "CREDIT" | null
    tracksOpenItems: boolean
    class: number | null
    groupCode: string | null
    syntheticCode: string | null
    isSynthetic: boolean | null
    specializesDirectiveCode: string | null
  }): Account {
    return {
      id: r.id,
      chartId: r.chartId,
      periodId: r.periodId,
      parentId: r.parentId,
      number: r.number,
      name: r.name,
      nature: r.nature,
      normalBalance: r.normalBalance,
      tracksOpenItems: r.tracksOpenItems,
      class: r.class,
      groupCode: r.groupCode,
      syntheticCode: r.syntheticCode ?? "",
      isSynthetic: r.isSynthetic ?? false,
      specializesDirectiveCode: r.specializesDirectiveCode,
    }
  }

  private readonly projection = {
    id: account.id,
    chartId: account.chart_id,
    periodId: account.period_id,
    parentId: account.parent_id,
    number: account.number,
    name: account.name,
    nature: account.nature,
    normalBalance: account.normal_balance,
    tracksOpenItems: account.tracks_open_items,
    class: account.class,
    groupCode: account.group_code,
    syntheticCode: account.synthetic_code,
    isSynthetic: account.is_synthetic,
    specializesDirectiveCode: account.specializes_directive_code,
  } as const

  @Get()
  @ApiOperation({
    summary: "List chart of accounts",
    description:
      "Returns the organization's chart-of-accounts entries. Empty for " +
      "non-DOUBLE_ENTRY orgs (they keep no chart).",
  })
  @ApiQuery({ name: "periodId", required: false, format: "uuid" })
  @ApiQuery({ name: "isSynthetic", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "number", required: false })
  @ApiOkResponse({ type: ListAccountsResponseDto })
  async list(
    @Query() query: ListAccountsQueryDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<ListAccountsResponse> {
    const { periodId, isSynthetic, number } = query
    // Single source: the same @workspace/accounting read the web chart-of-accounts page uses.
    const rows = await withOrganization(
      principal.organizationId,
      principal.userId,
      (db) =>
        listAccounts(db, {
          periodId,
          isSynthetic:
            isSynthetic === undefined ? undefined : isSynthetic === "true",
          number,
        }),
    )
    return { accounts: rows.map((r) => this.fromRow(r)) }
  }

  /** Maps a snake_case domain `ChartAccountRow` to the public `Account` shape. */
  private fromRow(r: ChartAccountRow): Account {
    return this.toAccount({
      id: r.id,
      chartId: r.chart_id,
      periodId: r.period_id,
      parentId: r.parent_id,
      number: r.number,
      name: r.name,
      nature: r.nature,
      normalBalance: r.normal_balance,
      tracksOpenItems: r.tracks_open_items,
      class: r.class,
      groupCode: r.group_code,
      syntheticCode: r.synthetic_code,
      isSynthetic: r.is_synthetic,
      specializesDirectiveCode: r.specializes_directive_code,
    })
  }

  @Get(":accountId")
  @ApiOperation({
    summary: "Get an account",
    description: "Returns a single chart-of-accounts entry by id.",
  })
  @ApiParam({ name: "accountId", format: "uuid" })
  @ApiOkResponse({ type: GetAccountResponseDto })
  async get(
    @Param("accountId", new ParseUUIDPipe()) accountId: string,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<GetAccountResponse> {
    const row = await withOrganization(
      principal.organizationId,
      principal.userId,
      async (db) => {
        const rows = await db
          .select(this.projection)
          .from(account)
          .where(eq(account.id, accountId))
          .limit(1)
        return rows[0] ?? null
      },
    )
    if (!row) throw new NotFoundError("Account not found")
    return { account: this.toAccount(row) }
  }

  @Patch(":accountId")
  @RequireScopes("accounting:write")
  @ApiOperation({
    summary: "Edit an account",
    description:
      "Partially edits an account — only `name` and `tracksOpenItems` are " +
      "editable. Requires the `accounting:write` scope.",
  })
  @ApiParam({ name: "accountId", format: "uuid" })
  @ApiOkResponse({ type: GetAccountResponseDto })
  async update(
    @Param("accountId", new ParseUUIDPipe()) accountId: string,
    @Body() body: UpdateAccountRequestDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<GetAccountResponse> {
    if (body.name === undefined && body.tracksOpenItems === undefined) {
      throw new ValidationError(
        "Provide at least one of name or tracksOpenItems.",
      )
    }
    // `account` has no updated_at trigger (migration 0029 sets a DEFAULT only),
    // so the timestamp is bumped explicitly on every edit.
    const patch: {
      name?: string
      tracks_open_items?: boolean
      updated_at: ReturnType<typeof sql>
    } = { updated_at: sql`now()` }
    if (body.name !== undefined) patch.name = body.name
    if (body.tracksOpenItems !== undefined)
      patch.tracks_open_items = body.tracksOpenItems

    const row = await withOrganization(
      principal.organizationId,
      principal.userId,
      async (db) => {
        const rows = await db
          .update(account)
          .set(patch)
          .where(eq(account.id, accountId))
          .returning(this.projection)
        return rows[0] ?? null
      },
    )
    if (!row) throw new NotFoundError("Account not found")
    return { account: this.toAccount(row) }
  }
}

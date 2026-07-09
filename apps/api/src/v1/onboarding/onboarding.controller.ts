import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common"
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger"
import type {
  CreateAccountingPeriodResponse,
  CreateNumberSeriesResponse,
  ListAccountingPeriodsResponse,
} from "@workspace/shared/api"
import { ConflictError, ValidationError } from "@workspace/shared/errors"
import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"
import { withOrganization } from "@workspace/db"
import { accounting_period } from "@workspace/db/schema"
import { createNumberSeries } from "@workspace/accounting"
import {
  derivePeriodBounds,
  resolveOrgAccountingProfile,
  scaffoldAccountingPeriod,
  ScaffoldValidationError,
} from "@workspace/org-provisioning"
import { ApiKeyGuard } from "../../auth/api-key.guard"
import { CurrentPrincipal } from "../../auth/principal.decorator"
import { RequireScopes } from "../../auth/require-scopes.decorator"
import { translateAccountingError } from "../accounting/accounting-error"
import {
  CreateAccountingPeriodRequestDto,
  CreateAccountingPeriodResponseDto,
  CreateNumberSeriesRequestDto,
  CreateNumberSeriesResponseDto,
  ListAccountingPeriodsResponseDto,
} from "../dto"

/**
 * `/v1/accounting/{number-series,periods}` — the org-onboarding write/read
 * surface. Afframe Brain onboards an org by discovering/creating its accounting
 * period, chart of accounts, and number series; these tools let it do so.
 *
 * A thin seam: read the principal from the API-key guard, run the domain
 * primitive inside `withOrganization` (FORCE RLS), map to the public schema. NO
 * accounting logic lives here. `POST /periods` reuses the COUPLED scaffold
 * (`scaffoldAccountingPeriod`) so a period is never minted without its chart +
 * number series (#579).
 *
 * The tenant (`organizationId` / `userId` / `workspaceId`) comes ONLY from the
 * authenticated principal; it is never accepted as request input.
 */
@ApiTags("Accounting")
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller({ path: "accounting", version: "1" })
export class OnboardingController {
  @Post("number-series")
  @RequireScopes("accounting:write")
  @ApiOperation({
    summary: "Create a number series",
    description:
      "Creates a gapless číselná řada for the organization. Requires the " +
      "`accounting:write` scope.",
  })
  @ApiCreatedResponse({ type: CreateNumberSeriesResponseDto })
  async createNumberSeries(
    @Body() body: CreateNumberSeriesRequestDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<CreateNumberSeriesResponse> {
    try {
      const id = await withOrganization(
        principal.organizationId,
        principal.userId,
        (db) =>
          createNumberSeries(
            db,
            {
              organizationId: principal.organizationId,
              workspaceId: principal.workspaceId,
            },
            {
              entityType: body.entityType,
              code: body.code,
              pattern: body.pattern,
              nextNumber: body.nextNumber,
            },
          ),
      )
      return {
        series: {
          id,
          entityType: body.entityType,
          code: body.code,
          pattern: body.pattern,
          nextNumber: body.nextNumber ?? 1,
        },
      }
    } catch (e) {
      translateAccountingError(e)
    }
  }

  @Post("periods")
  @RequireScopes("accounting:write")
  @ApiOperation({
    summary: "Open an accounting period",
    description:
      "Opens an účetní období with its coupled chart of accounts (double-" +
      "entry) + default number series. Requires the `accounting:write` scope.",
  })
  @ApiCreatedResponse({ type: CreateAccountingPeriodResponseDto })
  async createPeriod(
    @Body() body: CreateAccountingPeriodRequestDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<CreateAccountingPeriodResponse> {
    try {
      return await withOrganization(
        principal.organizationId,
        principal.userId,
        async (db): Promise<CreateAccountingPeriodResponse> => {
          const profile = await resolveOrgAccountingProfile(
            db,
            principal.organizationId,
            body.regimeCode,
          )
          const bounds = derivePeriodBounds({
            entityKind: "NEW_ENTITY",
            regime: profile.regime,
            fiscalYearStartMonth: profile.fiscalYearStartMonth,
            periodStart: body.periodStart,
            periodEnd: body.periodEnd ?? null,
          })
          const scaffold = await scaffoldAccountingPeriod(
            db,
            {
              organizationId: principal.organizationId,
              workspaceId: principal.workspaceId,
              regime: profile.regime,
              requiresChart: profile.requiresChart,
            },
            {
              periodStart: bounds.periodStart,
              periodEnd: bounds.periodEnd,
              accountingCurrency: body.accountingCurrency,
              accountingSizeCode: body.accountingSizeCode ?? null,
              fxRatePolicy: body.fxRatePolicy ?? null,
            },
          )
          return {
            periodId: scaffold.periodId,
            regimeCode: profile.regime,
            periodStart: bounds.periodStart,
            periodEnd: bounds.periodEnd,
            chartId: scaffold.chartId,
            accountsSeeded: scaffold.accountsSeeded,
            seriesCreated: scaffold.seriesCreated,
          }
        },
      )
    } catch (e) {
      // A statutory/derivation failure (e.g. an ambiguous regime) is a 4xx, not
      // a 500 — the driver/domain errors route through the accounting seam.
      if (e instanceof ScaffoldValidationError) {
        // A period-overlap rejection is a duplicate/double-book conflict with
        // existing state (409), not a malformed-input validation error (422).
        if (e.code === "PERIOD_OVERLAP") {
          throw new ConflictError(e.message)
        }
        throw new ValidationError(e.message)
      }
      translateAccountingError(e)
    }
  }

  @Get("periods")
  @ApiOperation({
    summary: "List accounting periods",
    description:
      "Returns the organization's účetní období — how an agent discovers the " +
      "periodId that write bodies reference.",
  })
  @ApiOkResponse({ type: ListAccountingPeriodsResponseDto })
  async listPeriods(
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<ListAccountingPeriodsResponse> {
    const periods = await withOrganization(
      principal.organizationId,
      principal.userId,
      (db) =>
        db
          .select({
            id: accounting_period.id,
            periodStart: accounting_period.period_start,
            periodEnd: accounting_period.period_end,
            status: accounting_period.status,
            regimeCode: accounting_period.regime_code,
            accountingSizeCode: accounting_period.accounting_size_code,
            accountingCurrency: accounting_period.accounting_currency,
            fxRatePolicy: accounting_period.fx_rate_policy,
          })
          .from(accounting_period)
          .orderBy(accounting_period.period_start),
    )
    return {
      periods: periods.map((p) => ({
        id: p.id,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        status: p.status,
        // regime_code / accounting_size_code are FK-constrained (accounting_period
        // → regime.code / accounting_size.code), so a stored value is always a
        // valid enum member — the narrowing casts can't widen past the DB.
        regimeCode: p.regimeCode as
          "DOUBLE_ENTRY" | "SINGLE_ENTRY" | "TAX_RECORDS",
        accountingSizeCode: p.accountingSizeCode as
          "MICRO" | "SMALL" | "MEDIUM" | "LARGE" | null,
        accountingCurrency: p.accountingCurrency,
        fxRatePolicy: p.fxRatePolicy,
      })),
    }
  }
}

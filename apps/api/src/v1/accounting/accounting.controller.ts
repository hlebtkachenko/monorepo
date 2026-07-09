import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  type PipeTransform,
  Post,
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
  ClassifyEventResponse,
  ControlStatementResponse,
  DphResponse,
  DppoResponse,
  EcSalesListResponse,
  FinancialStatementsResponse,
  JournalResponse,
  LedgerResponse,
  NumberSeriesListResponse,
  OpenItemsResponse,
  SaldokontoResponse,
  StatementLayoutResponse,
} from "@workspace/shared/api"
import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"
import { eq, withOrganization } from "@workspace/db"
import { number_series } from "@workspace/db/schema"
import {
  buildDph,
  buildDppo,
  buildKontrolniHlaseni,
  buildSouhrnneHlaseni,
  buildStatementLayout,
  buildZaverka,
  classifyEvent,
  type EconomicEvent,
  generalLedger,
  journal,
  saldoPerPartner,
  unsettledOpenItems,
} from "@workspace/accounting"
import { ApiKeyGuard } from "../../auth/api-key.guard"
import { CurrentPrincipal } from "../../auth/principal.decorator"
import { translateAccountingError } from "./accounting-error"
import {
  ClassifyEventRequestDto,
  ClassifyEventResponseDto,
  ControlStatementResponseDto,
  DphResponseDto,
  DppoResponseDto,
  EcSalesListResponseDto,
  FinancialStatementsResponseDto,
  JournalResponseDto,
  LedgerResponseDto,
  NumberSeriesListResponseDto,
  OpenItemsResponseDto,
  SaldokontoResponseDto,
  StatementLayoutResponseDto,
} from "../dto"

/**
 * Rejects a `dueBefore` query value that is not an ISO date string. There is no
 * built-in Nest date pipe, so this thin transform validates the shape at the
 * boundary before the value flows into the domain query.
 */
class ParseIsoDateQueryPipe implements PipeTransform<
  string | undefined,
  string | undefined
> {
  transform(value: string | undefined): string | undefined {
    if (value == null) return undefined
    if (
      !/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(
        value,
      )
    ) {
      throw new BadRequestException(
        "dueBefore must be an ISO date (YYYY-MM-DD)",
      )
    }
    return value
  }
}

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
        eventDescription: r.event_description,
        counterpartyName: r.counterparty_name,
        lineId: r.line_id,
        accountId: r.account_id,
        accountNumber: r.account_number,
        accountName: r.account_name,
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
    @Query("dueBefore", ParseIsoDateQueryPipe) dueBefore?: string,
    @Query(
      "direction",
      new ParseEnumPipe(
        { RECEIVABLE: "RECEIVABLE", PAYABLE: "PAYABLE" },
        { optional: true },
      ),
    )
    direction?: "RECEIVABLE" | "PAYABLE",
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

  @Get("periods/:periodId/outputs/vat-return")
  @ApiOperation({
    summary: "Get VAT return (DPH přiznání)",
    description:
      "DPH přiznání line values + kontrolní hlášení section totals for the " +
      "period, computed from the posted facts.",
  })
  @ApiParam({ name: "periodId", format: "uuid" })
  @ApiOkResponse({ type: DphResponseDto })
  async getVatReturn(
    @Param("periodId", new ParseUUIDPipe()) periodId: string,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<DphResponse> {
    const dph = await withOrganization(
      principal.organizationId,
      principal.userId,
      (db) => buildDph(db, { kind: "ACCOUNTING_PERIOD", periodId }),
    )
    return {
      organizationId: principal.organizationId,
      periodId,
      rows: dph.rows,
      kh: dph.kh,
      completeness: dph.completeness,
    }
  }

  @Get("periods/:periodId/outputs/corporate-income-tax")
  @ApiOperation({
    summary: "Get DPPO calculation worksheet",
    description:
      "Returns book-derived profit and only computes tax when the taxpayer " +
      "category and every advisor adjustment include provenance.",
  })
  @ApiParam({ name: "periodId", format: "uuid" })
  @ApiOkResponse({ type: DppoResponseDto })
  async getCorporateIncomeTax(
    @Param("periodId", new ParseUUIDPipe()) periodId: string,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<DppoResponse> {
    const d = await withOrganization(
      principal.organizationId,
      principal.userId,
      (db) => buildDppo(db, periodId),
    )
    return {
      organizationId: principal.organizationId,
      periodId,
      artifactKind: d.artifactKind,
      periodStart: d.periodStart,
      periodEnd: d.periodEnd,
      bookValues: d.bookValues,
      adjustments: d.adjustments,
      rateResolution: d.rateResolution,
      completeness: d.completeness,
      ucetniVysledek: d.ucetni_vysledek,
      nedanoveNaklady: d.nedanove_naklady,
      osvobozeneVynosy: d.osvobozene_vynosy,
      zakladDane: d.zaklad_dane,
      odpocetZtraty: d.odpocet_ztraty,
      zakladZaokrouhleny: d.zaklad_zaokrouhleny,
      sazba: d.sazba,
      dan: d.dan,
      slevy: d.slevy,
      danPoSlevach: d.dan_po_slevach,
      zalohy: d.zalohy,
      doplatek: d.doplatek,
    }
  }

  @Get("periods/:periodId/outputs/ec-sales-list")
  @ApiOperation({ summary: "Get EC sales list (souhrnné hlášení)" })
  @ApiParam({ name: "periodId", format: "uuid" })
  @ApiOkResponse({ type: EcSalesListResponseDto })
  async getEcSalesList(
    @Param("periodId", new ParseUUIDPipe()) periodId: string,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<EcSalesListResponse> {
    const s = await withOrganization(
      principal.organizationId,
      principal.userId,
      (db) =>
        buildSouhrnneHlaseni(db, {
          kind: "ACCOUNTING_PERIOD",
          periodId,
        }),
    )
    return {
      organizationId: principal.organizationId,
      periodId,
      rows: s.rows.map((r) => ({
        countryCode: r.country_code,
        taxId: r.tax_id,
        kodPlneni: r.kod_plneni,
        count: r.count,
        value: r.value,
      })),
      completeness: s.completeness,
    }
  }

  @Get("periods/:periodId/outputs/control-statement")
  @ApiOperation({ summary: "Get control statement (kontrolní hlášení)" })
  @ApiParam({ name: "periodId", format: "uuid" })
  @ApiOkResponse({ type: ControlStatementResponseDto })
  async getControlStatement(
    @Param("periodId", new ParseUUIDPipe()) periodId: string,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<ControlStatementResponse> {
    const k = await withOrganization(
      principal.organizationId,
      principal.userId,
      (db) =>
        buildKontrolniHlaseni(db, {
          kind: "ACCOUNTING_PERIOD",
          periodId,
        }),
    )
    const row = (r: {
      tax_id: string | null
      doklad: string
      dppd: string
      kod: string | null
      base21: string
      dan21: string
      base12: string
      dan12: string
    }) => ({
      taxId: r.tax_id,
      doklad: r.doklad,
      dppd: r.dppd,
      kod: r.kod,
      base21: r.base21,
      dan21: r.dan21,
      base12: r.base12,
      dan12: r.dan12,
    })
    const agg = (a: { base: string; dan: string; count: number }) => ({
      base: a.base,
      dan: a.dan,
      count: a.count,
    })
    return {
      organizationId: principal.organizationId,
      periodId,
      a1: k.a1.map(row),
      a2: k.a2.map(row),
      a4: k.a4.map(row),
      a5: agg(k.a5),
      b1: k.b1.map(row),
      b2: k.b2.map(row),
      b3: agg(k.b3),
      completeness: k.completeness,
    }
  }

  @Get("periods/:periodId/outputs/financial-statements")
  @ApiOperation({ summary: "Get draft closing worksheet" })
  @ApiParam({ name: "periodId", format: "uuid" })
  @ApiOkResponse({ type: FinancialStatementsResponseDto })
  async getFinancialStatements(
    @Param("periodId", new ParseUUIDPipe()) periodId: string,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<FinancialStatementsResponse> {
    const z = await withOrganization(
      principal.organizationId,
      principal.userId,
      (db) => buildZaverka(db, periodId),
    )
    return {
      organizationId: principal.organizationId,
      periodId,
      artifactKind: z.artifactKind,
      completeness: z.completeness,
      aktiva: z.aktiva,
      pasiva: z.pasiva,
      naklady: z.naklady,
      vynosy: z.vynosy,
      vysledek: z.vysledek,
      lines: z.lines.map((l) => ({
        accountNumber: l.account_number,
        nature: l.nature,
        closingBalance: l.closing_balance,
        balanceSheetLine: l.balance_sheet_line,
        incomeStatementLine: l.income_statement_line,
      })),
    }
  }

  @Get("periods/:periodId/outputs/statement-layout")
  @ApiOperation({ summary: "Get draft statement layout (rozvaha / VZZ)" })
  @ApiParam({ name: "periodId", format: "uuid" })
  @ApiQuery({ name: "rozsah", required: false, enum: ["FULL", "ABBREVIATED"] })
  @ApiQuery({ name: "unit", required: false, enum: ["CZK", "THOUSANDS"] })
  @ApiOkResponse({ type: StatementLayoutResponseDto })
  async getStatementLayout(
    @Param("periodId", new ParseUUIDPipe()) periodId: string,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
    @Query(
      "rozsah",
      new ParseEnumPipe(
        { FULL: "FULL", ABBREVIATED: "ABBREVIATED" },
        { optional: true },
      ),
    )
    rozsah?: "FULL" | "ABBREVIATED",
    @Query(
      "unit",
      new ParseEnumPipe(
        { CZK: "CZK", THOUSANDS: "THOUSANDS" },
        { optional: true },
      ),
    )
    unit?: "CZK" | "THOUSANDS",
  ): Promise<StatementLayoutResponse> {
    const s = await withOrganization(
      principal.organizationId,
      principal.userId,
      (db) => buildStatementLayout(db, periodId, { rozsah, unit }),
    )
    const line = (l: {
      code: string
      depth: number
      amount: string
      comparativeAmount: string | null
    }) => ({
      code: l.code,
      depth: l.depth,
      amount: l.amount,
      comparativeAmount: l.comparativeAmount,
    })
    return {
      organizationId: principal.organizationId,
      periodId,
      rozsah: s.rozsah,
      unit: s.unit,
      artifactKind: s.artifactKind,
      completeness: s.completeness,
      comparativePeriod: s.comparativePeriod,
      aktiva: s.aktiva.map(line),
      aktivaTotal: s.aktiva_total,
      aktivaTotalComparative: s.aktiva_total_comparative,
      pasiva: s.pasiva.map(line),
      pasivaTotal: s.pasiva_total,
      pasivaTotalComparative: s.pasiva_total_comparative,
      vzz: s.vzz.map(line),
      naklady: s.naklady,
      nakladyComparative: s.naklady_comparative,
      vynosy: s.vynosy,
      vynosyComparative: s.vynosy_comparative,
      vysledek: s.vysledek,
      vysledekComparative: s.vysledek_comparative,
    }
  }

  @Post("classify")
  @HttpCode(200)
  @ApiOperation({
    summary: "Classify an economic event",
    description:
      "Pure decision — returns the accounting treatment (VAT mode, scenario, " +
      "capitalisation/deferral, open-item account) with a law-cited reasoning " +
      "trail. No mutation, no tenant read.",
  })
  @ApiOkResponse({ type: ClassifyEventResponseDto })
  classify(@Body() body: ClassifyEventRequestDto): ClassifyEventResponse {
    try {
      return classifyEvent(body as unknown as EconomicEvent)
    } catch (e) {
      // classifyEvent throws `accounting: …` on a boundary-invalid fact (e.g. an
      // implausible vat_rate); route it through the same 4xx seam as the writes.
      translateAccountingError(e)
    }
  }

  @Get("number-series")
  @ApiOperation({
    summary: "List number series",
    description:
      "The organization's gapless number series — write bodies reference a " +
      "series by seriesId; this is how an agent discovers those ids.",
  })
  @ApiQuery({
    name: "entityType",
    required: false,
    enum: ["EVENT", "DOCUMENT", "ASSET", "INVENTORY_COUNT"],
  })
  @ApiOkResponse({ type: NumberSeriesListResponseDto })
  async listNumberSeries(
    @CurrentPrincipal() principal: ApiKeyPrincipal,
    @Query(
      "entityType",
      new ParseEnumPipe(
        {
          EVENT: "EVENT",
          DOCUMENT: "DOCUMENT",
          ASSET: "ASSET",
          INVENTORY_COUNT: "INVENTORY_COUNT",
        },
        { optional: true },
      ),
    )
    entityType?: "EVENT" | "DOCUMENT" | "ASSET" | "INVENTORY_COUNT",
  ): Promise<NumberSeriesListResponse> {
    const series = await withOrganization(
      principal.organizationId,
      principal.userId,
      (db) =>
        db
          .select({
            id: number_series.id,
            entityType: number_series.entity_type,
            code: number_series.code,
            pattern: number_series.pattern,
            nextNumber: number_series.next_number,
          })
          .from(number_series)
          .where(
            entityType ? eq(number_series.entity_type, entityType) : undefined,
          )
          .orderBy(number_series.entity_type, number_series.code),
    )
    return { series }
  }
}

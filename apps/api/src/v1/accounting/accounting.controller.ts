import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
      (db) => buildDph(db, periodId),
    )
    return {
      organizationId: principal.organizationId,
      periodId,
      rows: dph.rows,
      kh: dph.kh,
    }
  }

  @Get("periods/:periodId/outputs/corporate-income-tax")
  @ApiOperation({ summary: "Get corporate income tax (DPPO)" })
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
      (db) => buildSouhrnneHlaseni(db, periodId),
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
      (db) => buildKontrolniHlaseni(db, periodId),
    )
    const row = (r: {
      tax_id: string | null
      doklad: string
      dppd: string
      base21: string
      dan21: string
      base12: string
      dan12: string
    }) => ({
      taxId: r.tax_id,
      doklad: r.doklad,
      dppd: r.dppd,
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
    }
  }

  @Get("periods/:periodId/outputs/financial-statements")
  @ApiOperation({ summary: "Get financial statements (účetní závěrka)" })
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
  @ApiOperation({ summary: "Get formatted statement layout (rozvaha / VZZ)" })
  @ApiParam({ name: "periodId", format: "uuid" })
  @ApiQuery({ name: "rozsah", required: false, enum: ["FULL", "ABBREVIATED"] })
  @ApiQuery({ name: "unit", required: false, enum: ["CZK", "THOUSANDS"] })
  @ApiOkResponse({ type: StatementLayoutResponseDto })
  async getStatementLayout(
    @Param("periodId", new ParseUUIDPipe()) periodId: string,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
    @Query("rozsah") rozsah?: "FULL" | "ABBREVIATED",
    @Query("unit") unit?: "CZK" | "THOUSANDS",
  ): Promise<StatementLayoutResponse> {
    const s = await withOrganization(
      principal.organizationId,
      principal.userId,
      (db) => buildStatementLayout(db, periodId, { rozsah, unit }),
    )
    const line = (l: { code: string; depth: number; amount: string }) => ({
      code: l.code,
      depth: l.depth,
      amount: l.amount,
    })
    return {
      organizationId: principal.organizationId,
      periodId,
      rozsah: s.rozsah,
      unit: s.unit,
      aktiva: s.aktiva.map(line),
      aktivaTotal: s.aktiva_total,
      pasiva: s.pasiva.map(line),
      pasivaTotal: s.pasiva_total,
      vzz: s.vzz.map(line),
      naklady: s.naklady,
      vynosy: s.vynosy,
      vysledek: s.vysledek,
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
    return classifyEvent(body as unknown as EconomicEvent)
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
    @Query("entityType")
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

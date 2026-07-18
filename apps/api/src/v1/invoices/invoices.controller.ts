import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common"
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger"
import type { Response } from "express"
import type {
  ExtractionMethod,
  GetInvoiceResponse,
  Invoice,
  InvoiceCounterparty,
  InvoiceCurrencyTotal,
  InvoiceDirection,
  InvoiceLine,
  InvoicePartial,
  ListInvoicesResponse,
} from "@workspace/shared/api"
import { NotFoundError } from "@workspace/shared/errors"
import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"
import {
  and,
  eq,
  inArray,
  sql,
  withOrganization,
  type OrganizationBoundDb,
} from "@workspace/db"
import {
  accounting_event,
  counterparty,
  individual_record,
  partial_record,
  summary_record,
} from "@workspace/db/schema"
import {
  captureDocument,
  type CapturedDocument,
  type DocumentInput,
} from "@workspace/accounting"
import { ApiKeyGuard } from "../../auth/api-key.guard"
import { CurrentPrincipal } from "../../auth/principal.decorator"
import { RequireScopes } from "../../auth/require-scopes.decorator"
import {
  deriveCaptureVeto,
  screenTemplateBasis,
} from "../accounting/accounting-veto"
import type { EvidenceEnvelope } from "../accounting/evidence-gate"
import {
  runGatedWrite,
  type GatedWriteResult,
} from "../accounting/accounting-writes.gate"
import {
  CreateInvoiceRequestDto,
  CreateInvoiceResponseDto,
  GetInvoiceResponseDto,
  ListInvoicesQueryDto,
  ListInvoicesResponseDto,
  UpdateInvoiceLegalDatesRequestDto,
} from "../dto"

const INVOICE_TYPES = ["RECEIVED_INVOICE", "ISSUED_INVOICE"] as const
type InvoiceType = (typeof INVOICE_TYPES)[number]

const IDEMPOTENCY_HEADER = {
  name: "Idempotency-Key",
  required: true,
  description:
    "Client-generated key (1–255 chars); one per write intent, reused on retry.",
}

function directionOf(type: InvoiceType): InvoiceDirection {
  return type === "RECEIVED_INVOICE" ? "received" : "issued"
}
function typeOf(direction: InvoiceDirection): InvoiceType {
  return direction === "received" ? "RECEIVED_INVOICE" : "ISSUED_INVOICE"
}

/**
 * Keyset cursor for the invoice list. The list is ordered
 * `(issued_at desc, id desc)`; the cursor carries the last row's `(issuedAt,
 * id)` so the next page selects rows strictly ordered after it. Opaque
 * (base64url JSON) per the public `CursorSchema` contract — clients never parse it.
 */
interface InvoiceCursor {
  issuedAt: string
  id: string
}
function encodeInvoiceCursor(cursor: InvoiceCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url")
}
function decodeInvoiceCursor(raw: string): InvoiceCursor {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))
  } catch {
    throw new BadRequestException("Invalid cursor")
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    typeof (parsed as InvoiceCursor).issuedAt === "string" &&
    typeof (parsed as InvoiceCursor).id === "string"
  ) {
    return parsed as InvoiceCursor
  }
  throw new BadRequestException("Invalid cursor")
}

/** Per-invoice rolled-up totals, computed in SQL (no JS money arithmetic — R13). */
interface InvoiceTotals {
  totalBase: string
  totalVat: string
  lineCount: number
}

/**
 * `/v1/invoices` — the invoice resource over the posting model. An invoice is a
 * `summary_record` whose `type` is RECEIVED_INVOICE / ISSUED_INVOICE, with its
 * `individual_record` lines + `partial_record` money. Reads are a thin seam:
 * principal from the API-key guard, direct Drizzle inside `withOrganization`
 * (FORCE RLS), snake_case rows mapped to the camelCase public schema, amounts
 * as decimal strings. A cross-tenant invoice is invisible under RLS → 404.
 *
 * Distinct from `POST /v1/accounting/documents` (captures any doklad type):
 * `POST /v1/invoices` is invoice-only and pins the type from `direction`, but
 * runs through the SAME server safety gate (`runGatedWrite`) so it never
 * bypasses the Brain safety spine — [#565] including the SAME OCR-template
 * basis screen (`screenTemplateBasis`) `POST /v1/accounting/documents` wires;
 * this endpoint used to run `captureDocument` through the gate with neither
 * template leg wired at all, a route-around now closed.
 */
@ApiTags("Invoices")
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller({ path: "invoices", version: "1" })
export class InvoicesController {
  /** Aggregates base/VAT totals + line count per invoice, keyed by id. */
  private async totalsFor(
    db: OrganizationBoundDb,
    invoiceIds: string[],
  ): Promise<Map<string, InvoiceTotals>> {
    const map = new Map<string, InvoiceTotals>()
    if (invoiceIds.length === 0) return map
    const rows = await db
      .select({
        invoiceId: individual_record.summary_record_id,
        totalBase: sql<string>`coalesce(sum(${partial_record.base_in_accounting_currency}), 0)::text`,
        totalVat: sql<string>`coalesce(sum(${partial_record.vat_in_accounting_currency}), 0)::text`,
        lineCount: sql<number>`count(distinct ${individual_record.id})::int`,
      })
      .from(individual_record)
      // LEFT join so a line with no partials still counts toward lineCount and
      // contributes zero money (coalesced), keeping lineCount consistent with
      // the detail `lines` array.
      .leftJoin(
        partial_record,
        eq(partial_record.individual_record_id, individual_record.id),
      )
      .where(inArray(individual_record.summary_record_id, invoiceIds))
      .groupBy(individual_record.summary_record_id)
    for (const r of rows) {
      map.set(r.invoiceId, {
        totalBase: r.totalBase,
        totalVat: r.totalVat,
        lineCount: r.lineCount,
      })
    }
    return map
  }

  /**
   * Resolves each invoice's counterparty, keyed by id. The counterparty lives on
   * `accounting_event` (workspace-shared `counterparty`); readable here because
   * `withOrganization` sets `app.workspace_id` (derived from the org row), so the
   * workspace-scoped `counterparty_select` RLS policy resolves. Surfaced only when
   * an invoice's lines resolve to EXACTLY ONE non-null counterparty — zero or
   * multiple distinct counterparties map to `null` (ambiguous).
   */
  private async counterpartyFor(
    db: OrganizationBoundDb,
    invoiceIds: string[],
  ): Promise<Map<string, InvoiceCounterparty | null>> {
    const map = new Map<string, InvoiceCounterparty | null>()
    if (invoiceIds.length === 0) return map
    const rows = await db
      .select({
        invoiceId: individual_record.summary_record_id,
        counterpartyId: sql<string | null>`min(${counterparty.id}::text)`,
        counterpartyName: sql<string | null>`min(${counterparty.name})`,
        distinctCount: sql<number>`count(distinct ${accounting_event.counterparty_id})::int`,
      })
      .from(individual_record)
      .innerJoin(
        accounting_event,
        eq(accounting_event.id, individual_record.accounting_event_id),
      )
      .leftJoin(
        counterparty,
        eq(counterparty.id, accounting_event.counterparty_id),
      )
      .where(inArray(individual_record.summary_record_id, invoiceIds))
      .groupBy(individual_record.summary_record_id)
    for (const r of rows) {
      map.set(
        r.invoiceId,
        r.distinctCount === 1 && r.counterpartyId
          ? { id: r.counterpartyId, name: r.counterpartyName }
          : null,
      )
    }
    return map
  }

  /**
   * Rolls up each invoice's partials by transaction currency (one row per
   * distinct `currency_code`), keyed by invoice id. Sums the transaction-currency
   * `base_amount`/`vat_amount` (NOT the frozen accounting-currency columns) in SQL
   * — no JS money arithmetic (R13). Ordered by currency code for a stable page.
   */
  private async currencyTotalsFor(
    db: OrganizationBoundDb,
    invoiceIds: string[],
  ): Promise<Map<string, InvoiceCurrencyTotal[]>> {
    const map = new Map<string, InvoiceCurrencyTotal[]>()
    if (invoiceIds.length === 0) return map
    const rows = await db
      .select({
        invoiceId: individual_record.summary_record_id,
        currencyCode: partial_record.currency_code,
        totalBase: sql<string>`coalesce(sum(${partial_record.base_amount}), 0)::text`,
        totalVat: sql<string>`coalesce(sum(${partial_record.vat_amount}), 0)::text`,
      })
      .from(individual_record)
      .innerJoin(
        partial_record,
        eq(partial_record.individual_record_id, individual_record.id),
      )
      .where(inArray(individual_record.summary_record_id, invoiceIds))
      .groupBy(
        individual_record.summary_record_id,
        partial_record.currency_code,
      )
      .orderBy(partial_record.currency_code)
    for (const r of rows) {
      const list = map.get(r.invoiceId) ?? []
      list.push({
        currencyCode: r.currencyCode,
        totalBase: r.totalBase,
        totalVat: r.totalVat,
      })
      map.set(r.invoiceId, list)
    }
    return map
  }

  private toInvoice(
    r: {
      id: string
      type: string
      period_id: string
      designation: string
      sequence_number: number
      issued_at: Date
      tax_point_date: string | null
      received_date: string | null
      rounding_amount: string
      created_at: Date
    },
    totals: InvoiceTotals | undefined,
    counterpartyValue: InvoiceCounterparty | null,
    currencyTotals: InvoiceCurrencyTotal[],
  ): Invoice {
    const type = r.type as InvoiceType
    return {
      id: r.id,
      direction: directionOf(type),
      type,
      periodId: r.period_id,
      designation: r.designation,
      sequenceNumber: r.sequence_number,
      issuedAt: r.issued_at.toISOString(),
      taxPointDate: r.tax_point_date,
      receivedDate: r.received_date,
      roundingAmount: r.rounding_amount,
      totalBase: totals?.totalBase ?? "0",
      totalVat: totals?.totalVat ?? "0",
      lineCount: totals?.lineCount ?? 0,
      counterparty: counterpartyValue,
      currencyTotals,
      createdAt: r.created_at.toISOString(),
    }
  }

  private readonly headerProjection = {
    id: summary_record.id,
    type: summary_record.type,
    period_id: summary_record.period_id,
    designation: summary_record.designation,
    sequence_number: summary_record.sequence_number,
    issued_at: summary_record.issued_at,
    tax_point_date: summary_record.tax_point_date,
    received_date: summary_record.received_date,
    rounding_amount: summary_record.rounding_amount,
    created_at: summary_record.created_at,
  } as const

  @Get()
  @ApiOperation({
    summary: "List invoices",
    description:
      "Returns a cursor-paginated page of invoice-typed summary records " +
      "(newest first) with rolled-up totals, resolved counterparty, and " +
      "transaction-currency roll-ups. Filter by direction / periodId; page " +
      "with limit / cursor.",
  })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  @ApiQuery({
    name: "direction",
    required: false,
    enum: ["received", "issued"],
  })
  @ApiQuery({ name: "periodId", required: false, format: "uuid" })
  @ApiOkResponse({ type: ListInvoicesResponseDto })
  async list(
    @Query() query: ListInvoicesQueryDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<ListInvoicesResponse> {
    const { direction, periodId, limit, cursor } = query
    const typeFilter: readonly InvoiceType[] = direction
      ? [typeOf(direction)]
      : INVOICE_TYPES
    const decoded = cursor ? decodeInvoiceCursor(cursor) : null
    const filters = [
      inArray(summary_record.type, [...typeFilter]),
      periodId ? eq(summary_record.period_id, periodId) : undefined,
      // Keyset predicate: rows strictly after the cursor in (issued_at desc,
      // id desc) order — a row-value comparison that matches the ORDER BY.
      decoded
        ? sql`(${summary_record.issued_at}, ${summary_record.id}) < (${decoded.issuedAt}::timestamptz, ${decoded.id}::uuid)`
        : undefined,
    ].filter((f): f is NonNullable<typeof f> => f !== undefined)

    return withOrganization(
      principal.organizationId,
      principal.userId,
      async (db): Promise<ListInvoicesResponse> => {
        // Over-fetch one row to detect a further page without a second query.
        const rows = await db
          .select(this.headerProjection)
          .from(summary_record)
          .where(and(...filters))
          .orderBy(
            sql`${summary_record.issued_at} desc`,
            sql`${summary_record.id} desc`,
          )
          .limit(limit + 1)
        const hasMore = rows.length > limit
        const page = hasMore ? rows.slice(0, limit) : rows
        const ids = page.map((h) => h.id)
        const totals = await this.totalsFor(db, ids)
        const counterparties = await this.counterpartyFor(db, ids)
        const currencyTotals = await this.currencyTotalsFor(db, ids)
        const last = page.at(-1)
        return {
          data: page.map((h) =>
            this.toInvoice(
              h,
              totals.get(h.id),
              counterparties.get(h.id) ?? null,
              currencyTotals.get(h.id) ?? [],
            ),
          ),
          next_cursor:
            hasMore && last
              ? encodeInvoiceCursor({
                  issuedAt: last.issued_at.toISOString(),
                  id: last.id,
                })
              : null,
          has_more: hasMore,
        }
      },
    )
  }

  @Get(":invoiceId")
  @ApiOperation({
    summary: "Get an invoice",
    description: "Returns a single invoice with its lines and partials.",
  })
  @ApiParam({ name: "invoiceId", format: "uuid" })
  @ApiOkResponse({ type: GetInvoiceResponseDto })
  async get(
    @Param("invoiceId", new ParseUUIDPipe()) invoiceId: string,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<GetInvoiceResponse> {
    return withOrganization(
      principal.organizationId,
      principal.userId,
      async (db): Promise<GetInvoiceResponse> => {
        const headers = await db
          .select(this.headerProjection)
          .from(summary_record)
          .where(
            and(
              eq(summary_record.id, invoiceId),
              inArray(summary_record.type, [...INVOICE_TYPES]),
            ),
          )
          .limit(1)
        const header = headers[0]
        if (!header) throw new NotFoundError("Invoice not found")

        const lines = await db
          .select({
            id: individual_record.id,
            accountingEventId: individual_record.accounting_event_id,
            description: individual_record.description,
          })
          .from(individual_record)
          .where(eq(individual_record.summary_record_id, invoiceId))
          .orderBy(individual_record.created_at)

        const lineIds = lines.map((l) => l.id)
        const partials =
          lineIds.length > 0
            ? await db
                .select({
                  id: partial_record.id,
                  individualRecordId: partial_record.individual_record_id,
                  baseAmount: partial_record.base_amount,
                  vatRate: partial_record.vat_rate,
                  vatAmount: partial_record.vat_amount,
                  vatMode: partial_record.vat_mode,
                  vatJurisdiction: partial_record.vat_jurisdiction,
                  vatDeductible: partial_record.vat_deductible,
                  currencyCode: partial_record.currency_code,
                  baseInAccountingCurrency:
                    partial_record.base_in_accounting_currency,
                  vatInAccountingCurrency:
                    partial_record.vat_in_accounting_currency,
                  quantity: partial_record.quantity,
                  measureUnit: partial_record.measure_unit,
                  unitPrice: partial_record.unit_price,
                })
                .from(partial_record)
                .where(inArray(partial_record.individual_record_id, lineIds))
                .orderBy(partial_record.created_at)
            : []

        const totals = await this.totalsFor(db, [invoiceId])
        const counterparties = await this.counterpartyFor(db, [invoiceId])
        const currencyTotals = await this.currencyTotalsFor(db, [invoiceId])

        const partialsByLine = new Map<string, InvoicePartial[]>()
        for (const p of partials) {
          const list = partialsByLine.get(p.individualRecordId) ?? []
          list.push({
            id: p.id,
            baseAmount: p.baseAmount,
            vatRate: p.vatRate,
            vatAmount: p.vatAmount,
            vatMode: p.vatMode as InvoicePartial["vatMode"],
            vatJurisdiction: p.vatJurisdiction,
            vatDeductible: p.vatDeductible,
            currencyCode: p.currencyCode,
            baseInAccountingCurrency: p.baseInAccountingCurrency,
            vatInAccountingCurrency: p.vatInAccountingCurrency,
            quantity: p.quantity,
            measureUnit: p.measureUnit,
            unitPrice: p.unitPrice,
          })
          partialsByLine.set(p.individualRecordId, list)
        }

        const invoiceLines: InvoiceLine[] = lines.map((l) => ({
          id: l.id,
          accountingEventId: l.accountingEventId,
          description: l.description,
          partials: partialsByLine.get(l.id) ?? [],
        }))

        return {
          invoice: {
            ...this.toInvoice(
              header,
              totals.get(invoiceId),
              counterparties.get(invoiceId) ?? null,
              currencyTotals.get(invoiceId) ?? [],
            ),
            lines: invoiceLines,
          },
        }
      },
    )
  }

  @Patch(":invoiceId/legal-dates")
  @RequireScopes("accounting:write")
  @ApiOperation({
    summary: "Correct invoice legal dates",
    description:
      "Corrects DUZP/DPPD and, for received invoices, receipt evidence. " +
      "Requires the accounting:write scope and preserves unresolved dates as null.",
  })
  @ApiParam({ name: "invoiceId", format: "uuid" })
  @ApiOkResponse({ type: GetInvoiceResponseDto })
  async updateLegalDates(
    @Param("invoiceId", new ParseUUIDPipe()) invoiceId: string,
    @Body() body: UpdateInvoiceLegalDatesRequestDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
  ): Promise<GetInvoiceResponse> {
    const updated = await withOrganization(
      principal.organizationId,
      principal.userId,
      async (db) => {
        const current = await db
          .select({ type: summary_record.type })
          .from(summary_record)
          .where(
            and(
              eq(summary_record.id, invoiceId),
              inArray(summary_record.type, INVOICE_TYPES),
            ),
          )
          .limit(1)
        const invoice = current[0]
        if (!invoice) return false
        if (
          body.receivedDate !== undefined &&
          invoice.type !== "RECEIVED_INVOICE"
        ) {
          throw new BadRequestException(
            "receivedDate is only valid for a received invoice",
          )
        }
        const values: {
          tax_point_date?: string | null
          received_date?: string | null
        } = {}
        if (body.taxPointDate !== undefined) {
          values.tax_point_date = body.taxPointDate
        }
        if (body.receivedDate !== undefined) {
          values.received_date = body.receivedDate
        }
        await db
          .update(summary_record)
          .set(values)
          .where(eq(summary_record.id, invoiceId))
        return true
      },
    )
    if (!updated) throw new NotFoundError("Invoice not found")
    return this.get(invoiceId, principal)
  }

  private send(res: Response, r: GatedWriteResult): Record<string, unknown> {
    res.status(r.httpStatus)
    if (r.replayed) res.setHeader("Idempotent-Replayed", "true")
    return r.body
  }

  @Post()
  @RequireScopes("accounting:write")
  @ApiOperation({
    summary: "Create an invoice",
    description:
      "Captures an invoice-typed doklad. Server pins the type from " +
      "`direction`; tenant + user injected from the principal. Applies (201) " +
      "or holds for review (202). Distinct from POST /v1/accounting/documents.",
  })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiResponse({ status: 201, type: CreateInvoiceResponseDto })
  @ApiResponse({ status: 202, type: CreateInvoiceResponseDto })
  async create(
    @Body() body: CreateInvoiceRequestDto,
    @CurrentPrincipal() principal: ApiKeyPrincipal,
    @Res({ passthrough: true }) res: Response,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    // Split `direction` off ONCE: it derives the invoice `type` and is the only
    // field that must NOT reach the persisted capture body.
    const { direction, ...bodyWithoutDirection } =
      body as unknown as CreateInvoiceRequestDto & {
        confidence: number
        rationale: string
        conversationId?: string
        signals?: EvidenceEnvelope | null
        direction: InvoiceDirection
        templateId?: string | null
        extractionMethod?: ExtractionMethod | null
      }
    const type = typeOf(direction)
    // Peel the gate envelope off the direction-less body → the domain `fields`
    // the capture `run` + always-hold screen consume.
    const {
      confidence,
      rationale,
      conversationId,
      signals,
      templateId,
      extractionMethod,
      ...fields
    } = bodyWithoutDirection

    // Mirror the documents endpoint's always-hold screening: convert each
    // partial's transaction-currency amount to accounting currency via its own
    // fx rate before testing it against the CZK ceiling, so a large FX invoice
    // cannot slip under the hold. Float math here feeds the coarse screen only,
    // never a booked amount (booked amounts use string math in the domain).
    const toAccountingCurrency = (p: {
      baseAmount: string
      fxRate?: string | null
      vatAmount?: string | null
      vatFxRate?: string | null
    }): string[] => {
      const baseCzk =
        p.fxRate != null
          ? String(Number(p.baseAmount) * Number(p.fxRate))
          : p.baseAmount
      if (p.vatAmount == null) return [baseCzk]
      const vatRate = p.vatFxRate ?? p.fxRate
      const vatCzk =
        vatRate != null
          ? String(Number(p.vatAmount) * Number(vatRate))
          : p.vatAmount
      return [baseCzk, vatCzk]
    }
    const holdAmounts = [
      ...(fields.lines ?? []).flatMap((l) =>
        (l.partials ?? []).flatMap(toAccountingCurrency),
      ),
      ...(fields.roundingAmount != null ? [fields.roundingAmount] : []),
    ]

    // The persisted body under the SHARED capture `tool_name`: the whole request
    // minus `direction`, plus the derived `type` — shape-identical to a
    // `POST /v1/accounting/documents` capture, so a held `/v1/invoices` write is
    // indistinguishable at EVERY downstream `tool_name`-keyed surface (the replay
    // switch, the approvals view-model, the edit model, the preview query) and the
    // held-write replay re-validates it against `CaptureAccountingDocumentRequestSchema`.
    // Minting a novel "createInvoice" tool_name is what left a held invoice
    // permanently unapprovable (no replay case knew it); collapsing it here fixes
    // that dead-end at the root, in one place. Dropping `direction` is audit-body
    // hygiene — the non-strict capture schema would strip a stray `direction` on
    // replay anyway.
    const normalizedBody = { ...bodyWithoutDirection, type }

    const result = await runGatedWrite<CapturedDocument>({
      principal,
      idempotencyKey,
      // `operationId` is persisted VERBATIM as tool_call_log.tool_name and is the
      // held-write replay-dispatch key — NOT the OpenAPI operationId (which stays
      // `createInvoice`). Deliberately the shared capture tool_name so a held
      // invoice replays through the existing captureAccountingDocument case.
      operationId: "captureAccountingDocument",
      body: normalizedBody,
      periodId: fields.periodId,
      confidence,
      rationale,
      conversationId,
      signals,
      holdAmounts,
      // [#565] The OCR template this capture was derived from (null for a
      // structured-export capture). NOT domain data — destructured out of
      // `fields` above so it never reaches `captureDocument`; persisted only
      // with the gated write's audit `serverGate` (mirrors the documents
      // endpoint).
      templateId: templateId ?? null,
      deriveVeto: () =>
        Promise.resolve(
          deriveCaptureVeto(
            (fields.lines ?? []) as ReadonlyArray<Record<string, unknown>>,
          ),
        ),
      // [#565] Server-derived OCR-template basis screen — the SAME seam
      // `POST /v1/accounting/documents` wires. Closes the route-around where
      // this endpoint ran `captureDocument` through the gate with neither the
      // novelty nor the OCR fail-closed leg wired at all.
      screenTemplateBasis: (db) =>
        screenTemplateBasis(db, extractionMethod, templateId ?? null),
      run: (db, ctx) =>
        captureDocument(db, ctx, {
          ...fields,
          type,
        } as unknown as DocumentInput),
      applied: (doc) => ({
        invoiceId: doc.summaryRecordId,
        designation: doc.designation,
        sequenceNumber: doc.sequenceNumber,
        lines: doc.lines,
      }),
    })
    return this.send(res, result)
  }
}

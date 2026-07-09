import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi"
import type { RouteConfig } from "@asteasolutions/zod-to-openapi"
import { z } from "zod"

import "./zod-openapi"
import {
  ApiErrorSchema,
  ApiPrincipalSchema,
  PingResponseSchema,
} from "./common"
import {
  CreateFeedbackRequestSchema,
  CreateFeedbackResponseSchema,
  FeedbackTypeSchema,
} from "./feedback"
import {
  GetOrganizationResponseSchema,
  OrganizationSummarySchema,
} from "./organizations"
import {
  ComponentStatusSchema,
  ServiceStatusSchema,
  StatusResponseSchema,
} from "./status"
import {
  ArchetypeSchema,
  GetStructureResponseSchema,
  ListArchetypesResponseSchema,
  ModuleStructureSchema,
  NavPageSchema,
  NavSubpageSchema,
} from "./structure"
import {
  CaptureAccountingDocumentRequestSchema,
  CaptureAccountingDocumentResponseSchema,
  ClassifyEventRequestSchema,
  ClassifyEventResponseSchema,
  CreateAccountingEventRequestSchema,
  CreateAccountingEventResponseSchema,
  CreateAccountingPostingRequestSchema,
  CreateAccountingPostingResponseSchema,
  HeldWriteIdParamSchema,
  HeldWriteRowSchema,
  ListHeldWritesResponseSchema,
  NumberSeriesListResponseSchema,
  NumberSeriesQuerySchema,
  NumberSeriesRowSchema,
  ResolveHeldWriteRequestSchema,
  ResolveHeldWriteResponseSchema,
} from "./accounting-writes"
import {
  ControlStatementResponseSchema,
  DphResponseSchema,
  DphRowsSchema,
  DppoResponseSchema,
  EcSalesListResponseSchema,
  EcSalesRowSchema,
  FinancialStatementsResponseSchema,
  JournalResponseSchema,
  JournalRowSchema,
  KhAggregateSchema,
  KhRowSchema,
  KontrolniHlaseniTotalsSchema,
  LayoutLineSchema,
  LedgerAccountRowSchema,
  LedgerResponseSchema,
  OpenItemRowSchema,
  OpenItemsQuerySchema,
  OpenItemsResponseSchema,
  PeriodIdParamSchema,
  VatFilingPeriodQuerySchema,
  SaldoPerPartnerRowSchema,
  SaldokontoResponseSchema,
  StatementLayoutQuerySchema,
  StatementLayoutResponseSchema,
  StatementLineRowSchema,
} from "./accounting"
import {
  CreateInvoiceRequestSchema,
  CreateInvoiceResponseSchema,
  GetInvoiceResponseSchema,
  InvoiceSchema,
  InvoiceDetailSchema,
  InvoiceIdParamSchema,
  InvoiceLineSchema,
  InvoicePartialSchema,
  ListInvoicesQuerySchema,
  ListInvoicesResponseSchema,
  UpdateInvoiceLegalDatesRequestSchema,
} from "./invoices"
import {
  AccountSchema,
  GetAccountResponseSchema,
  ListAccountsQuerySchema,
  ListAccountsResponseSchema,
  AccountIdParamSchema,
  UpdateAccountRequestSchema,
} from "./accounts"
import {
  CreateOcrTemplateRequestSchema,
  ListOcrTemplatesQuerySchema,
  ListOcrTemplatesResponseSchema,
  OcrTemplateIdParamSchema,
  OcrTemplateResponseSchema,
  OcrTemplateSchema,
  UpdateOcrTemplateRequestSchema,
} from "./ocr-templates"

type OpenAPIDocument = ReturnType<OpenApiGeneratorV31["generateDocument"]>

/**
 * Single source of truth for the public `/v1/*` OpenAPI surface.
 *
 * Every Zod schema in `packages/shared/src/api/*.ts` carries `.openapi({...})`
 * metadata via the extension applied below; this file pulls them into one
 * `OpenAPIRegistry`, registers each operation against the resource schemas,
 * and exposes `buildOpenApiDocument()` so the api process and the codegen
 * scripts share a single emit path.
 *
 * Authoring rules — see `docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md`:
 *
 *   1. Author Zod schemas in `packages/shared/src/api/<resource>.ts`. Chain
 *      `.openapi({ description, example })` on every public field.
 *   2. `registry.register("Name", Schema)` for components, or
 *      `registry.registerPath({ ... })` for operations. Do this in *this*
 *      file so the surface is reviewable in one diff per PR.
 *   3. Run `pnpm gen:all` from the repo root. Spec, SDK types, MCP tools,
 *      and docs reference stubs regenerate together.
 *
 * The plain Zod schemas remain framework-agnostic; the `.openapi()` calls
 * are a no-op until `extendZodWithOpenApi(z)` runs, which `./zod-openapi`
 * does on import.
 */

export const registry = new OpenAPIRegistry()

const PingResponse = registry.register("PingResponse", PingResponseSchema)
const GetOrganizationResponse = registry.register(
  "GetOrganizationResponse",
  GetOrganizationResponseSchema,
)
// Schemas not directly referenced by a registerPath call but used either by
// the registered error response component (`ApiError`) or by sub-properties
// of the response schemas (`ApiPrincipal`, `OrganizationSummary`). Each is
// surfaced as a top-level component schema rather than inlined, so codegen
// emits stand-alone SDK / MCP types.
registry.register("ApiError", ApiErrorSchema)
registry.register("ApiPrincipal", ApiPrincipalSchema)
registry.register("OrganizationSummary", OrganizationSummarySchema)
const StatusResponse = registry.register("StatusResponse", StatusResponseSchema)
registry.register("ServiceStatus", ServiceStatusSchema)
registry.register("ComponentStatus", ComponentStatusSchema)
const CreateFeedbackRequest = registry.register(
  "CreateFeedbackRequest",
  CreateFeedbackRequestSchema,
)
const CreateFeedbackResponse = registry.register(
  "CreateFeedbackResponse",
  CreateFeedbackResponseSchema,
)
registry.register("FeedbackType", FeedbackTypeSchema)
const GetStructureResponse = registry.register(
  "GetStructureResponse",
  GetStructureResponseSchema,
)
registry.register("ModuleStructure", ModuleStructureSchema)
registry.register("NavPage", NavPageSchema)
registry.register("NavSubpage", NavSubpageSchema)
const ListArchetypesResponse = registry.register(
  "ListArchetypesResponse",
  ListArchetypesResponseSchema,
)
registry.register("Archetype", ArchetypeSchema)
const JournalResponse = registry.register(
  "JournalResponse",
  JournalResponseSchema,
)
registry.register("JournalRow", JournalRowSchema)
const LedgerResponse = registry.register("LedgerResponse", LedgerResponseSchema)
registry.register("LedgerAccountRow", LedgerAccountRowSchema)
const OpenItemsResponse = registry.register(
  "OpenItemsResponse",
  OpenItemsResponseSchema,
)
registry.register("OpenItemRow", OpenItemRowSchema)
const SaldokontoResponse = registry.register(
  "SaldokontoResponse",
  SaldokontoResponseSchema,
)
registry.register("SaldoPerPartnerRow", SaldoPerPartnerRowSchema)
const DphResponse = registry.register("DphResponse", DphResponseSchema)
registry.register("DphRows", DphRowsSchema)
registry.register("KontrolniHlaseniTotals", KontrolniHlaseniTotalsSchema)
const DppoResponse = registry.register("DppoResponse", DppoResponseSchema)
const EcSalesListResponse = registry.register(
  "EcSalesListResponse",
  EcSalesListResponseSchema,
)
registry.register("EcSalesRow", EcSalesRowSchema)
const ControlStatementResponse = registry.register(
  "ControlStatementResponse",
  ControlStatementResponseSchema,
)
registry.register("KhRow", KhRowSchema)
registry.register("KhAggregate", KhAggregateSchema)
const FinancialStatementsResponse = registry.register(
  "FinancialStatementsResponse",
  FinancialStatementsResponseSchema,
)
registry.register("StatementLineRow", StatementLineRowSchema)
const StatementLayoutResponse = registry.register(
  "StatementLayoutResponse",
  StatementLayoutResponseSchema,
)
registry.register("LayoutLine", LayoutLineSchema)
const ClassifyEventRequest = registry.register(
  "ClassifyEventRequest",
  ClassifyEventRequestSchema,
)
const ClassifyEventResponse = registry.register(
  "ClassifyEventResponse",
  ClassifyEventResponseSchema,
)
const NumberSeriesListResponse = registry.register(
  "NumberSeriesListResponse",
  NumberSeriesListResponseSchema,
)
registry.register("NumberSeriesRow", NumberSeriesRowSchema)
const CreateAccountingEventRequest = registry.register(
  "CreateAccountingEventRequest",
  CreateAccountingEventRequestSchema,
)
const CreateAccountingEventResponse = registry.register(
  "CreateAccountingEventResponse",
  CreateAccountingEventResponseSchema,
)
const CaptureAccountingDocumentRequest = registry.register(
  "CaptureAccountingDocumentRequest",
  CaptureAccountingDocumentRequestSchema,
)
const CaptureAccountingDocumentResponse = registry.register(
  "CaptureAccountingDocumentResponse",
  CaptureAccountingDocumentResponseSchema,
)
const CreateAccountingPostingRequest = registry.register(
  "CreateAccountingPostingRequest",
  CreateAccountingPostingRequestSchema,
)
const CreateAccountingPostingResponse = registry.register(
  "CreateAccountingPostingResponse",
  CreateAccountingPostingResponseSchema,
)
const ListHeldWritesResponse = registry.register(
  "ListHeldWritesResponse",
  ListHeldWritesResponseSchema,
)
registry.register("HeldWriteRow", HeldWriteRowSchema)
const ResolveHeldWriteRequest = registry.register(
  "ResolveHeldWriteRequest",
  ResolveHeldWriteRequestSchema,
)
const ResolveHeldWriteResponse = registry.register(
  "ResolveHeldWriteResponse",
  ResolveHeldWriteResponseSchema,
)
registry.register("InvoicePartial", InvoicePartialSchema)
registry.register("InvoiceLine", InvoiceLineSchema)
registry.register("Invoice", InvoiceSchema)
registry.register("InvoiceDetail", InvoiceDetailSchema)
const ListInvoicesResponse = registry.register(
  "ListInvoicesResponse",
  ListInvoicesResponseSchema,
)
const GetInvoiceResponse = registry.register(
  "GetInvoiceResponse",
  GetInvoiceResponseSchema,
)
const CreateInvoiceRequest = registry.register(
  "CreateInvoiceRequest",
  CreateInvoiceRequestSchema,
)
const CreateInvoiceResponse = registry.register(
  "CreateInvoiceResponse",
  CreateInvoiceResponseSchema,
)
registry.register("Account", AccountSchema)
const ListAccountsResponse = registry.register(
  "ListAccountsResponse",
  ListAccountsResponseSchema,
)
const GetAccountResponse = registry.register(
  "GetAccountResponse",
  GetAccountResponseSchema,
)
const UpdateAccountRequest = registry.register(
  "UpdateAccountRequest",
  UpdateAccountRequestSchema,
)
registry.register("OcrTemplate", OcrTemplateSchema)
const ListOcrTemplatesResponse = registry.register(
  "ListOcrTemplatesResponse",
  ListOcrTemplatesResponseSchema,
)
const OcrTemplateResponse = registry.register(
  "OcrTemplateResponse",
  OcrTemplateResponseSchema,
)
const CreateOcrTemplateRequest = registry.register(
  "CreateOcrTemplateRequest",
  CreateOcrTemplateRequestSchema,
)
const UpdateOcrTemplateRequest = registry.register(
  "UpdateOcrTemplateRequest",
  UpdateOcrTemplateRequestSchema,
)

/**
 * Bearer security scheme. Registered once and referenced by every operation
 * — every public endpoint requires an API key.
 */
const bearerAuth = registry.registerComponent("securitySchemes", "bearer", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "API key",
  description:
    "API key in the form `affk_live_…`. Send as " +
    "`Authorization: Bearer <key>`. Sandbox keys (`affk_test_…`) are not " +
    "issued yet — see the sandbox roadmap in the docs.",
})

/**
 * The six common error responses every `/v1/*` operation can emit. Single
 * source of truth — adding a new platform-wide error means one entry, not a
 * triple edit across name/description/example tables.
 */
const REQUEST_ID = "req_1f5a8c6e91d240bdbe18d4e07a3f9c14"

interface ErrorResponseDef {
  status: string
  name: string
  description: string
  example: Record<string, unknown>
}

const ERROR_RESPONSES: ErrorResponseDef[] = [
  {
    status: "401",
    name: "Unauthorized",
    description:
      "API key missing, malformed, revoked, or pointing at a different " +
      "environment than the host.",
    example: {
      code: "unauthorized",
      error_type: "UNAUTHORIZED",
      message: "Missing or invalid API key.",
      requestId: REQUEST_ID,
    },
  },
  {
    status: "403",
    name: "Forbidden",
    description:
      "API key authenticated but lacks the scope required for this operation, " +
      "or the target resource belongs to a different tenant.",
    example: {
      code: "forbidden",
      error_type: "FORBIDDEN",
      message: "The API key is not allowed to perform this action.",
      requestId: REQUEST_ID,
    },
  },
  {
    status: "404",
    name: "NotFound",
    description:
      "The resource referenced by the request URL does not exist (or does not " +
      "exist within the authenticated tenant — Afframe never leaks " +
      "cross-tenant existence).",
    example: {
      code: "not_found",
      error_type: "NOT_FOUND",
      message: "Resource not found.",
      requestId: REQUEST_ID,
    },
  },
  {
    status: "409",
    name: "Conflict",
    description:
      "Idempotency conflict, optimistic-concurrency mismatch, or business-rule " +
      "conflict.",
    example: {
      code: "conflict",
      error_type: "CONFLICT",
      message: "Resource is in a state that conflicts with the request.",
      requestId: REQUEST_ID,
    },
  },
  {
    status: "422",
    name: "ValidationError",
    description:
      "Request body parsed but failed schema validation. The `details` array " +
      "carries one entry per offending field.",
    example: {
      code: "validation_error",
      error_type: "VALIDATION",
      message: "Request body failed validation.",
      requestId: REQUEST_ID,
      details: [
        {
          path: "$.legalName",
          code: "required",
          message: "legalName is required.",
        },
      ],
    },
  },
  {
    status: "429",
    name: "RateLimited",
    description:
      "Caller exceeded the API-key rate limit. The response carries IETF " +
      "`RateLimit-*` headers indicating the reset window.",
    example: {
      code: "rate_limited",
      error_type: "RATE_LIMITED",
      message:
        "Too many requests. See the RateLimit-* headers for the reset window.",
      requestId: REQUEST_ID,
    },
  },
]

/**
 * Registers each common error response as a reusable component, then returns
 * a `{ status: $ref }` map ready to spread into every `registerPath` call.
 * Per-op responses become `$ref` pointers — the path table stays compact
 * and avoids 6× duplication on every endpoint.
 */
function buildErrorResponses(): NonNullable<RouteConfig["responses"]> {
  const refs: NonNullable<RouteConfig["responses"]> = {}
  for (const { status, name, description, example } of ERROR_RESPONSES) {
    registry.registerComponent("responses", name, {
      description,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiError" },
          example: { error: example },
        },
      },
    })
    refs[status] = { $ref: `#/components/responses/${name}` }
  }
  return refs
}

const ERROR_RESPONSE_REFS = buildErrorResponses()

registry.registerPath({
  method: "get",
  path: "/v1/ping",
  operationId: "ping",
  summary: "Ping",
  description:
    "Zero-DB smoke test. Returns the resolved principal — confirms the API " +
    "key authenticated.",
  tags: ["Meta"],
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    "200": {
      description: "API key authenticated and the principal resolved.",
      content: { "application/json": { schema: PingResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/organization",
  operationId: "getOrganization",
  summary: "Get organization",
  description: "Returns the organization the authenticated API key belongs to.",
  tags: ["Organization"],
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    "200": {
      description: "The authenticated principal's organization.",
      content: { "application/json": { schema: GetOrganizationResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/status",
  operationId: "getStatus",
  summary: "Service status",
  description:
    "Returns the service health summary. Proxies `status.afframe.com` " +
    "(OpenStatus) when reachable; otherwise synthesizes an operational " +
    "fallback. Public — no API key required.",
  tags: ["Status"],
  responses: {
    "200": {
      description: "Service status snapshot.",
      content: { "application/json": { schema: StatusResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "post",
  path: "/v1/feedback",
  operationId: "createFeedback",
  summary: "Send feedback",
  description:
    "Submit a bug report, feature request, process issue, or question. " +
    "The api forwards every submission to `support+feedback@afframe.com` " +
    "and asks the bot to create or dedup a GitHub issue when issue reporting " +
    "is configured. Public — no API key required.",
  tags: ["Feedback"],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateFeedbackRequest } },
    },
  },
  responses: {
    "201": {
      description: "Feedback accepted for downstream dispatch.",
      content: { "application/json": { schema: CreateFeedbackResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/structure",
  operationId: "getStructure",
  summary: "Get application structure",
  description:
    "Returns the org application's information architecture — the ten rail " +
    "modules, each with its full page tree (pages → subpages), build-status, " +
    "and layout archetype. Start here to discover what the app exposes " +
    "without driving a browser. Public — no API key required; the structure " +
    "is tenant-agnostic.",
  tags: ["Structure"],
  responses: {
    "200": {
      description: "The full application structure.",
      content: { "application/json": { schema: GetStructureResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/structure/archetypes",
  operationId: "listArchetypes",
  summary: "List layout archetypes",
  description:
    "Returns the five content-panel layout archetypes (Table, Blank, " +
    "Launchpad, Dashboard, Single) with their slot contract — how any page " +
    "is laid out. Public — no API key required.",
  tags: ["Structure"],
  responses: {
    "200": {
      description: "The layout-archetype catalog.",
      content: { "application/json": { schema: ListArchetypesResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/accounting/periods/{periodId}/journal",
  operationId: "getAccountingJournal",
  summary: "Get journal (deník)",
  description:
    "Returns the deník — the double-entry postings of the given accounting " +
    "period in chronological book order (§13), including 701 opening " +
    "postings. Read-model view; organization-scoped (FORCE RLS) via the API " +
    "key's own tenant.",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: PeriodIdParamSchema },
  responses: {
    "200": {
      description: "The period's journal lines in book order.",
      content: { "application/json": { schema: JournalResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/accounting/periods/{periodId}/ledger",
  operationId: "getAccountingLedger",
  summary: "Get general ledger / trial balance (hlavní kniha)",
  description:
    "Returns per-account opening balance | debit/credit turnover | closing " +
    "balance for the period, straight from the read-model — the hlavní kniha " +
    "and obratová předvaha. Organization-scoped (FORCE RLS).",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: PeriodIdParamSchema },
  responses: {
    "200": {
      description: "Per-account balances for the period.",
      content: { "application/json": { schema: LedgerResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/accounting/open-items",
  operationId: "getAccountingOpenItems",
  summary: "List open items (saldokonto)",
  description:
    "Returns unsettled receivables/payables (open items), optionally filtered " +
    "by due date and direction. Organization-scoped (FORCE RLS).",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  request: { query: OpenItemsQuerySchema },
  responses: {
    "200": {
      description: "Open items matching the filters.",
      content: { "application/json": { schema: OpenItemsResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/accounting/saldokonto",
  operationId: "getAccountingSaldokonto",
  summary: "Get per-partner saldo",
  description:
    "Returns per-partner open receivable/payable balances (saldokonto). " +
    "Organization-scoped (FORCE RLS).",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    "200": {
      description: "Per-partner open balances.",
      content: { "application/json": { schema: SaldokontoResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/accounting/periods/{periodId}/outputs/vat-return",
  operationId: "getAccountingVatReturn",
  summary: "Get VAT return (DPH přiznání)",
  description:
    "Computes the DPH přiznání line values and kontrolní hlášení section " +
    "totals for the requested statutory calendar month or quarter from the posted facts (§13/§14/§16/§92e/§72-73). " +
    "Organization-scoped (FORCE RLS).",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: PeriodIdParamSchema,
    query: VatFilingPeriodQuerySchema,
  },
  responses: {
    "200": {
      description: "The statutory filing period's VAT worksheet + KH totals.",
      content: { "application/json": { schema: DphResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/accounting/periods/{periodId}/outputs/corporate-income-tax",
  operationId: "getAccountingCorporateIncomeTax",
  summary: "Get corporate income tax (DPPO)",
  description:
    "Computes the DPPO base and tax (§23/1 base, §25 non-deductibles, §34 " +
    "loss carry-forward, rate, zálohy §38a) for the period. Organization-scoped.",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: PeriodIdParamSchema },
  responses: {
    "200": {
      description: "The period's corporate income tax computation.",
      content: { "application/json": { schema: DppoResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/accounting/periods/{periodId}/outputs/ec-sales-list",
  operationId: "getAccountingEcSalesList",
  summary: "Get EC sales list (souhrnné hlášení)",
  description:
    "EU supplies recap (§102) for the requested statutory calendar month or quarter — per partner + kód plnění. " +
    "Organization-scoped.",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: PeriodIdParamSchema,
    query: VatFilingPeriodQuerySchema,
  },
  responses: {
    "200": {
      description: "The statutory filing period's EU supplies recap.",
      content: { "application/json": { schema: EcSalesListResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/accounting/periods/{periodId}/outputs/control-statement",
  operationId: "getAccountingControlStatement",
  summary: "Get control statement (kontrolní hlášení)",
  description:
    "Per-counterparty kontrolní hlášení (§101c-i) for the requested statutory calendar month or quarter — sections A.1/A.2/A.4/A.5 " +
    "and B.1/B.2/B.3 with DIČ + doklad. Organization-scoped.",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: PeriodIdParamSchema,
    query: VatFilingPeriodQuerySchema,
  },
  responses: {
    "200": {
      description: "The statutory filing period's control statement.",
      content: { "application/json": { schema: ControlStatementResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/accounting/periods/{periodId}/outputs/financial-statements",
  operationId: "getAccountingFinancialStatements",
  summary: "Get financial statements (účetní závěrka)",
  description:
    "Účetní závěrka totals (aktiva/pasiva/náklady/výnosy/výsledek) plus " +
    "per-account closing balances mapped to statement lines. Organization-scoped.",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: PeriodIdParamSchema },
  responses: {
    "200": {
      description: "The period's financial statements.",
      content: {
        "application/json": { schema: FinancialStatementsResponse },
      },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/accounting/periods/{periodId}/outputs/statement-layout",
  operationId: "getAccountingStatementLayout",
  summary: "Get formatted statement layout (rozvaha / VZZ)",
  description:
    "Formatted rozvaha + výkaz zisku a ztráty per Decree 500/2002 přílohy " +
    "(plný / zkrácený rozsah; celé Kč / v tisících). Organization-scoped.",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: PeriodIdParamSchema,
    query: StatementLayoutQuerySchema,
  },
  responses: {
    "200": {
      description: "The period's formatted statement layout.",
      content: { "application/json": { schema: StatementLayoutResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "post",
  path: "/v1/accounting/classify",
  operationId: "classifyAccountingEvent",
  summary: "Classify an economic event",
  description:
    "Pure decision: given raw economic-event facts, returns the accounting " +
    "treatment (VAT mode, předkontace scenario, capitalisation/deferral, " +
    "open-item account) with a law-cited reasoning trail. No mutation, no " +
    "tenant read — safe and repeatable.",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ClassifyEventRequest } },
    },
  },
  responses: {
    "200": {
      description: "The decided accounting treatment.",
      content: { "application/json": { schema: ClassifyEventResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/accounting/number-series",
  operationId: "listAccountingNumberSeries",
  summary: "List number series",
  description:
    "Returns the organization's gapless number series (optionally filtered by " +
    "entity type). Write bodies reference a series by `seriesId`; this is how " +
    "an agent discovers those ids. Organization-scoped (FORCE RLS).",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  request: { query: NumberSeriesQuerySchema },
  responses: {
    "200": {
      description: "The organization's number series.",
      content: { "application/json": { schema: NumberSeriesListResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

const IdempotencyKeyHeader = z.object({
  "idempotency-key": z
    .string()
    .openapi({ description: "Idempotency key (1–255 chars); reuse on retry." }),
})

registry.registerPath({
  method: "post",
  path: "/v1/accounting/events",
  operationId: "createAccountingEvent",
  summary: "Create an accounting event",
  description:
    "Create an účetní případ. Gated: auto-applies (201) at/above the confidence " +
    "threshold, otherwise held (202) for human review. Tenant + responsible " +
    "user injected from the API-key principal.",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    headers: IdempotencyKeyHeader,
    body: {
      required: true,
      content: {
        "application/json": { schema: CreateAccountingEventRequest },
      },
    },
  },
  responses: {
    "201": {
      description: "Event applied.",
      content: {
        "application/json": { schema: CreateAccountingEventResponse },
      },
    },
    "202": {
      description: "Held for human review.",
      content: {
        "application/json": { schema: CreateAccountingEventResponse },
      },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "post",
  path: "/v1/accounting/documents",
  operationId: "captureAccountingDocument",
  summary: "Capture a summary document (doklad)",
  description:
    "Capture a doklad with its lines/partials. Gated (201 applied / 202 held). " +
    "Tenant injected from the principal.",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    headers: IdempotencyKeyHeader,
    body: {
      required: true,
      content: {
        "application/json": { schema: CaptureAccountingDocumentRequest },
      },
    },
  },
  responses: {
    "201": {
      description: "Document applied.",
      content: {
        "application/json": { schema: CaptureAccountingDocumentResponse },
      },
    },
    "202": {
      description: "Held for human review.",
      content: {
        "application/json": { schema: CaptureAccountingDocumentResponse },
      },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "post",
  path: "/v1/accounting/postings",
  operationId: "createAccountingPosting",
  summary: "Post a posting (zaúčtování)",
  description:
    "Post a double-entry or monetary posting. Gated (201 applied / 202 held). " +
    "Tenant + responsible user injected; opening/correction/generated linkage " +
    "is not client-settable.",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    headers: IdempotencyKeyHeader,
    body: {
      required: true,
      content: {
        "application/json": { schema: CreateAccountingPostingRequest },
      },
    },
  },
  responses: {
    "201": {
      description: "Posting applied.",
      content: {
        "application/json": { schema: CreateAccountingPostingResponse },
      },
    },
    "202": {
      description: "Held for human review.",
      content: {
        "application/json": { schema: CreateAccountingPostingResponse },
      },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/accounting/held-writes",
  operationId: "listAccountingHeldWrites",
  summary: "List held writes",
  description:
    "Returns the organization's review queue — gated writes that were HELD " +
    "(below the confidence threshold or above the always-hold amount) and " +
    "await a human decision, oldest first. Organization-scoped (FORCE RLS).",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  responses: {
    "200": {
      description: "The organization's held writes.",
      content: { "application/json": { schema: ListHeldWritesResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "post",
  path: "/v1/accounting/held-writes/{id}/resolve",
  operationId: "resolveAccountingHeldWrite",
  summary: "Resolve a held write",
  description:
    "Approve or reject a held write. Approve executes the stored payload " +
    "through the same domain path the original endpoint would have used, " +
    "with the approver as the responsible user; reject closes the review " +
    "with no domain write. The row id is the idempotency anchor — no " +
    "Idempotency-Key header; a second resolve returns 409.",
  tags: ["Accounting"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: HeldWriteIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: ResolveHeldWriteRequest } },
    },
  },
  responses: {
    "200": {
      description: "The held write was resolved.",
      content: { "application/json": { schema: ResolveHeldWriteResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/invoices",
  operationId: "listInvoices",
  summary: "List invoices",
  description:
    "Returns the organization's invoices — `summary_record` rows of type " +
    "RECEIVED_INVOICE (faktura přijatá) or ISSUED_INVOICE (faktura vydaná) — " +
    "with rolled-up accounting-currency totals. Organization-scoped (FORCE " +
    "RLS). Optionally filter by `direction` and `periodId`. An invoice is a " +
    "voucher header, not a posting; use `GET /v1/accounting/periods/{id}/" +
    "journal` for the journal bookings.",
  tags: ["Invoices"],
  security: [{ [bearerAuth.name]: [] }],
  request: { query: ListInvoicesQuerySchema },
  responses: {
    "200": {
      description: "Invoice headers matching the filters.",
      content: { "application/json": { schema: ListInvoicesResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/invoices/{invoiceId}",
  operationId: "getInvoice",
  summary: "Get an invoice",
  description:
    "Returns a single invoice with its individual-record lines and " +
    "partial-record money decomposition, organization-scoped (FORCE RLS). " +
    "Returns 404 when the invoice is not visible to the authenticated tenant.",
  tags: ["Invoices"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: InvoiceIdParamSchema },
  responses: {
    "200": {
      description: "The requested invoice with its lines.",
      content: { "application/json": { schema: GetInvoiceResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "patch",
  path: "/v1/invoices/{invoiceId}/legal-dates",
  operationId: "updateInvoiceLegalDates",
  summary: "Correct invoice legal dates",
  description:
    "Corrects DUZP/DPPD and receipt evidence without fabricating unknown dates. " +
    "Organization-scoped and requires the accounting:write scope.",
  tags: ["Invoices"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: InvoiceIdParamSchema,
    body: {
      required: true,
      content: {
        "application/json": { schema: UpdateInvoiceLegalDatesRequestSchema },
      },
    },
  },
  responses: {
    "200": {
      description: "The invoice with corrected legal dates.",
      content: { "application/json": { schema: GetInvoiceResponseSchema } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "post",
  path: "/v1/invoices",
  operationId: "createInvoice",
  summary: "Create an invoice",
  description:
    "Captures an invoice (invoice-typed doklad) with its lines/partials. The " +
    "server pins summary_record_type from `direction` (received → " +
    "RECEIVED_INVOICE, issued → ISSUED_INVOICE); tenant + responsible user are " +
    "injected from the API-key principal — never the body. Each line " +
    "references a pre-existing accounting event (`eventId`) — create those via " +
    "`POST /v1/accounting/events` first; `seriesId` is a DOCUMENT number series " +
    "(discover via `GET /v1/accounting/number-series`).\n\n" +
    "Distinct from `POST /v1/accounting/documents`, which captures a doklad of " +
    "ANY summary_record_type; this operation is invoice-only. Runs through the " +
    "same server safety gate: applies (201) or holds for human review (202) " +
    "below the confidence threshold or above the always-hold amount. Requires " +
    "the `accounting:write` scope and an `Idempotency-Key` header.",
  tags: ["Invoices"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    headers: IdempotencyKeyHeader,
    body: {
      required: true,
      content: { "application/json": { schema: CreateInvoiceRequest } },
    },
  },
  responses: {
    "201": {
      description: "The invoice was captured and booked.",
      content: { "application/json": { schema: CreateInvoiceResponse } },
    },
    "202": {
      description: "The invoice was held for human review.",
      content: { "application/json": { schema: CreateInvoiceResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/accounts",
  operationId: "listAccounts",
  summary: "List chart of accounts",
  description:
    "Returns the organization's chart-of-accounts entries (účtový rozvrh), " +
    "organization-scoped (FORCE RLS). Optionally filter by účetní období " +
    "(`periodId`) and synthetic/analytical shape (`isSynthetic`). The chart " +
    "exists only for DOUBLE_ENTRY periods — SINGLE_ENTRY / TAX_RECORDS orgs " +
    "keep no chart and return an empty list.",
  tags: ["Accounts"],
  security: [{ [bearerAuth.name]: [] }],
  request: { query: ListAccountsQuerySchema },
  responses: {
    "200": {
      description: "The chart-of-accounts entries matching the filters.",
      content: { "application/json": { schema: ListAccountsResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/accounts/{accountId}",
  operationId: "getAccount",
  summary: "Get an account",
  description:
    "Returns a single chart-of-accounts entry by id, organization-scoped " +
    "(FORCE RLS). Returns 404 when the account does not exist within the " +
    "authenticated tenant — cross-tenant existence is never leaked.",
  tags: ["Accounts"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: AccountIdParamSchema },
  responses: {
    "200": {
      description: "The requested account.",
      content: { "application/json": { schema: GetAccountResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "patch",
  path: "/v1/accounts/{accountId}",
  operationId: "updateAccount",
  summary: "Edit an account",
  description:
    "Partially edits an account. Only the two operator-editable columns are " +
    "accepted — `name` and `tracksOpenItems` (saldokonto). Structural and " +
    "generated columns (number, nature, normalBalance, parent, the generated " +
    "class/group/synthetic levels) are immutable through this surface: " +
    "changing them retroactively reclassifies posted history. Requires the " +
    "`accounting:write` scope. Returns 404 when the account is not visible to " +
    "the authenticated tenant.",
  tags: ["Accounts"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: AccountIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: UpdateAccountRequest } },
    },
  },
  responses: {
    "200": {
      description: "The updated account.",
      content: { "application/json": { schema: GetAccountResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "get",
  path: "/v1/ocr-templates",
  operationId: "listOcrTemplates",
  summary: "List OCR extraction templates",
  description:
    "Returns the workspace's OCR extraction templates — the Brain's learned " +
    "supplier invoice layouts, WORKSPACE-scoped (FORCE RLS) and shared across " +
    "every organization in the accountant's office. Optionally filter by " +
    "`supplierKey` and `docKind`. Both human and agent keys may read.",
  tags: ["OCR Templates"],
  security: [{ [bearerAuth.name]: [] }],
  request: { query: ListOcrTemplatesQuerySchema },
  responses: {
    "200": {
      description: "The workspace's OCR templates matching the filters.",
      content: { "application/json": { schema: ListOcrTemplatesResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "post",
  path: "/v1/ocr-templates",
  operationId: "createOcrTemplate",
  summary: "Create an OCR extraction template",
  description:
    "Creates a NEW, UNCONFIRMED template in the caller's workspace. The " +
    "server pins `humanConfirmedAt` to null and `heldCount` to 0 — a fresh " +
    "template is never auto-trusted; a human must confirm it via " +
    "`POST /v1/ocr-templates/{id}/confirm`. Agent keys may create. Requires " +
    "the `accounting:write` scope. The workspace comes from the API key.",
  tags: ["OCR Templates"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateOcrTemplateRequest } },
    },
  },
  responses: {
    "201": {
      description: "The created (unconfirmed) template.",
      content: { "application/json": { schema: OcrTemplateResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "put",
  path: "/v1/ocr-templates/{id}",
  operationId: "updateOcrTemplate",
  summary: "Refine an OCR extraction template",
  description:
    "Refines an existing template (replacing its learned fields). A refine " +
    "RE-OPENS the trust gate: the server resets `humanConfirmedAt` to null " +
    "and bumps `version`, so a refined template must be re-confirmed by a " +
    "human. Identity (`supplierKey` / `docKind`) is immutable through this " +
    "surface. Agent keys may refine. Requires the `accounting:write` scope. " +
    "Returns 404 when the template is not visible to the caller's workspace.",
  tags: ["OCR Templates"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: OcrTemplateIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: UpdateOcrTemplateRequest } },
    },
  },
  responses: {
    "200": {
      description: "The refined (now unconfirmed) template.",
      content: { "application/json": { schema: OcrTemplateResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

registry.registerPath({
  method: "post",
  path: "/v1/ocr-templates/{id}/confirm",
  operationId: "confirmOcrTemplate",
  summary: "Confirm an OCR extraction template",
  description:
    "Marks a template as human-confirmed (sets `humanConfirmedAt` to now). " +
    "HUMAN-ACTOR ONLY: an agent-actor key is rejected with 403 — confirmation " +
    "is the trust boundary that a human, not the Brain, must cross. Returns " +
    "404 when the template is not visible to the caller's workspace.",
  tags: ["OCR Templates"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: OcrTemplateIdParamSchema },
  responses: {
    "200": {
      description: "The confirmed template.",
      content: { "application/json": { schema: OcrTemplateResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})

/**
 * Emit the full OpenAPI 3.1 document. The api process and the codegen
 * scripts both go through this single call — drop adapters here, not in
 * downstream consumers.
 *
 * The Scalar API Reference mounted at `api.afframe.com/` is the single
 * developer-facing surface. There is no separate docs site today; the
 * earlier `apps/docs/` developer hub is archived to
 * `.context/archive/apps-docs-2026-05-21/`. `info.contact` / `license` /
 * `termsOfService` therefore omit `url` fields (no public hub to deep-link
 * to) and `externalDocs` is omitted entirely.
 */
/**
 * API contract version. NOT tied to the monorepo's release tag or
 * deployment artifact version — `info.version` in OpenAPI is the
 * **contract** version. Stripe, GitHub, Twilio, Plaid all decouple
 * the same way.
 *
 * Bump rules:
 *   - PATCH (1.0.1) — backward-compat schema or wording fixes
 *   - MINOR (1.1.0) — backward-compat additions (new endpoint, new
 *                     optional field, new error code)
 *   - MAJOR (2.0.0) — breaking change. Also bumps the URL prefix to
 *                     `/v2/` and triggers an ADR + sunset window for `/v1/`.
 *
 * Edit this constant in the SAME commit that introduces the contract
 * change. CI (`openapi-lint` Spectral rule) does not gate this today;
 * code review is the enforcement.
 *
 * Documented in `docs/api/VERSIONING.md` and
 * `docs/conventions/ENDPOINT-ADDITION.md`.
 */
export const API_VERSION = "1.1.0" as const

/**
 * Returns the list of `servers` for the OpenAPI spec. The staging entry
 * is environment-gated — staging contributors opening
 * `api-staging.afframe.com/` see staging as a server option, but the
 * production spec at `api.afframe.com/` only advertises production.
 * Keeps the public-facing surface focused; staging is dev-only.
 */
function resolveServers(): { url: string; description: string }[] {
  const servers = [
    { url: "https://api.afframe.com", description: "Production" },
  ]
  // `process` typed via globalThis cast — @workspace/shared is consumed by
  // both Node (api, codegen) and browser-targeted bundles (sdk); avoiding
  // @types/node here keeps the runtime contract neutral. APP_ENV is set on
  // the api container; everywhere else it's `undefined` and we ship the
  // production-only servers array.
  const env = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> }
    }
  ).process?.env?.APP_ENV?.toLowerCase()
  if (env === "staging" || env === "development" || env === "test") {
    servers.push({
      url: "https://api-staging.afframe.com",
      description: "Staging",
    })
  }
  return servers
}

export function buildOpenApiDocument(): OpenAPIDocument {
  const generator = new OpenApiGeneratorV31(registry.definitions)
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Afframe Public API",
      version: API_VERSION,
      description:
        "Public API for the Afframe accounting platform. Authenticate with " +
        "an API key as a bearer token in the form `affk_live_…`. Sandbox " +
        "keys (`affk_test_…`) are not issued yet. Errors are returned in a " +
        "Plaid-shape envelope; rate limits are surfaced via IETF " +
        "`RateLimit-*` headers." +
        "\n\n" +
        "Service status: [status.afframe.com](https://status.afframe.com) " +
        "(programmatic at `GET /v1/status`).",
      // Native Scalar OSS header badges only — `support` (info.contact)
      // and `terms` (info.license). `info.termsOfService` is omitted on
      // purpose: setting BOTH `license.url` and `termsOfService` renders
      // two Terms badges in the header. The license.url is the clickable
      // landing page; one badge is enough.
      contact: {
        name: "Afframe support",
        email: "support@afframe.com",
        url: "mailto:support@afframe.com",
      },
      license: {
        name: "Proprietary — see Terms of Service",
        url: "https://afframe.com/terms",
      },
    },
    servers: resolveServers(),
    tags: [
      { name: "Meta", description: "Service metadata and auth smoke tests" },
      { name: "Organization", description: "The API key's own organization" },
      { name: "Status", description: "Service status and component health" },
      {
        name: "Feedback",
        description: "Send bug reports, requests, and questions",
      },
      {
        name: "Structure",
        description:
          "Application information architecture — modules, pages, and layout " +
          "archetypes for agent discovery",
      },
      {
        name: "OCR Templates",
        description:
          "Workspace-shared Brain OCR extraction templates (learned supplier " +
          "invoice layouts)",
      },
    ],
  })
}

import { z } from "zod"

import { EVIDENCE_SIGNALS, IndividualRecordSchema } from "./accounting-writes"
import { InvoiceIdSchema } from "./primitives"
import "./zod-openapi"

/**
 * Public-API invoice resource. An invoice is NOT its own table: it is a
 * `summary_record` (doklad/voucher header, §11) whose `type` is
 * `RECEIVED_INVOICE` (faktura přijatá) or `ISSUED_INVOICE` (faktura vydaná),
 * with its `individual_record` lines + `partial_record` money decomposition.
 * The downstream `posting` (journal booking) references the voucher; it is
 * NOT the invoice.
 *
 * Money is decimal strings over `numeric(19,4)` — the whole accounting surface
 * speaks decimal strings, never minor units (see accounting-writes.ts).
 * Amounts are exposed in the period's accounting currency (frozen at capture).
 *
 * Disambiguation vs `POST /v1/accounting/documents`: that endpoint captures a
 * doklad of ANY `summary_record_type`; `/v1/invoices` is the invoice-shaped
 * read model + a type-constrained capture path (server pins the invoice type
 * from `direction`).
 */

/** received = faktura přijatá (FP); issued = faktura vydaná (FV). */
export const InvoiceDirectionSchema = z.enum(["received", "issued"]).openapi({
  description:
    "Invoice direction: `received` (faktura přijatá / purchase) or `issued` " +
    "(faktura vydaná / sale).",
  example: "received",
})
export type InvoiceDirection = z.infer<typeof InvoiceDirectionSchema>

/** Invoice header — the summary_record fields + rolled-up accounting-currency totals. */
export const InvoiceSchema = z
  .object({
    id: InvoiceIdSchema,
    direction: InvoiceDirectionSchema,
    type: z.enum(["RECEIVED_INVOICE", "ISSUED_INVOICE"]).openapi({
      description: "The underlying summary_record_type.",
      example: "RECEIVED_INVOICE",
    }),
    periodId: z.string().uuid().openapi({
      description: "The účetní období this invoice books into.",
      example: "0196f1de-0000-7000-8000-0000000000d1",
    }),
    designation: z.string().openapi({
      description:
        "Frozen Označení — the gapless government/audit document number.",
      example: "FP2025-00042",
    }),
    sequenceNumber: z.number().int().openapi({
      description: "Gapless position within its number series.",
      example: 42,
    }),
    issuedAt: z.string().openapi({
      description: "Okamžik vyhotovení (§11/1d) — ISO timestamp.",
      example: "2025-03-14T00:00:00.000Z",
    }),
    roundingAmount: z.string().openapi({
      description:
        "§37 document-total rounding (→ 548/648 at posting), decimal string.",
      example: "0.00",
    }),
    totalBase: z.string().openapi({
      description:
        "Sum of line bases in the accounting currency (frozen), decimal string.",
      example: "12100.00",
    }),
    totalVat: z.string().openapi({
      description:
        "Sum of line VAT in the accounting currency (frozen), decimal string.",
      example: "2541.00",
    }),
    lineCount: z.number().int().openapi({
      description: "Number of individual-record lines on the invoice.",
      example: 1,
    }),
    createdAt: z.string().openapi({
      description: "When the voucher row was created — ISO timestamp.",
      example: "2025-03-14T09:12:00.000Z",
    }),
  })
  .openapi({ description: "An invoice (invoice-typed summary record) header." })
export type Invoice = z.infer<typeof InvoiceSchema>

/** One partial record (dílčí záznam) — the taxable-supply money row. */
export const InvoicePartialSchema = z
  .object({
    id: z.string().uuid(),
    baseAmount: z.string().openapi({
      description: "Základ daně in the transaction currency, decimal string.",
      example: "12100.00",
    }),
    vatRate: z.string().nullable().openapi({
      description: "VAT rate (e.g. `21`), or `null` for OUTSIDE_VAT.",
      example: "21",
    }),
    vatAmount: z.string().openapi({
      description: "Daň in the transaction currency, decimal string.",
      example: "2541.00",
    }),
    vatMode: z
      .enum(["STANDARD", "REVERSE_CHARGE", "EXEMPT", "OUTSIDE_VAT", "IMPORT"])
      .openapi({ description: "VAT mode driving the posting." }),
    vatJurisdiction: z
      .string()
      .nullable()
      .openapi({
        description:
          "Place-of-supply regime (DOMESTIC | REVERSE_CHARGE | EU | IMPORT | " +
          "EXEMPT | OUTSIDE_VAT), or `null`.",
        example: "DOMESTIC",
      }),
    vatDeductible: z.boolean().openapi({
      description: "Whether input VAT is deductible (false folds into cost).",
      example: true,
    }),
    currencyCode: z.string().openapi({
      description: "Transaction currency (ISO 4217).",
      example: "CZK",
    }),
    baseInAccountingCurrency: z.string().openapi({
      description: "Frozen base converted to the accounting currency.",
      example: "12100.00",
    }),
    vatInAccountingCurrency: z.string().openapi({
      description: "Frozen VAT converted to the accounting currency.",
      example: "2541.00",
    }),
    quantity: z.string().nullable().openapi({ example: "1" }),
    measureUnit: z.string().nullable().openapi({ example: "ks" }),
    unitPrice: z.string().nullable().openapi({ example: "12100.00" }),
  })
  .openapi({ description: "A partial record (taxable-supply money row)." })
export type InvoicePartial = z.infer<typeof InvoicePartialSchema>

/** One invoice line (individual record) with its partials. */
export const InvoiceLineSchema = z
  .object({
    id: z.string().uuid(),
    accountingEventId: z.string().uuid().openapi({
      description: "The účetní případ (economic event) this line records.",
    }),
    description: z.string().nullable(),
    partials: z.array(InvoicePartialSchema),
  })
  .openapi({ description: "An invoice line (individual record)." })
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>

/** Full invoice — header + its lines. Returned by GET /v1/invoices/{invoiceId}. */
export const InvoiceDetailSchema = InvoiceSchema.extend({
  lines: z.array(InvoiceLineSchema).openapi({
    description: "The invoice's individual-record lines with their partials.",
  }),
}).openapi({ description: "An invoice with its full line/partial detail." })
export type InvoiceDetail = z.infer<typeof InvoiceDetailSchema>

/** `GET /v1/invoices` query — optional direction / period filters. */
export const ListInvoicesQuerySchema = z
  .object({
    direction: InvoiceDirectionSchema.optional().openapi({
      description: "Restrict to received or issued invoices.",
    }),
    periodId: z.string().uuid().optional().openapi({
      description: "Restrict to one účetní období.",
      example: "0196f1de-0000-7000-8000-0000000000d1",
    }),
  })
  .openapi({ description: "Filters for the invoice list." })
export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuerySchema>

/** `GET /v1/invoices` response. */
export const ListInvoicesResponseSchema = z
  .object({
    invoices: z.array(InvoiceSchema).openapi({
      description: "Invoice headers matching the filters, newest first.",
    }),
  })
  .openapi({
    description:
      "The organization's invoices (both directions), organization-scoped " +
      "(FORCE RLS).",
  })
export type ListInvoicesResponse = z.infer<typeof ListInvoicesResponseSchema>

/** `GET /v1/invoices/{invoiceId}` response. */
export const GetInvoiceResponseSchema = z
  .object({ invoice: InvoiceDetailSchema })
  .openapi({ description: "A single invoice with its lines." })
export type GetInvoiceResponse = z.infer<typeof GetInvoiceResponseSchema>

/** Path param for the single-invoice operations. */
export const InvoiceIdParamSchema = z.object({
  invoiceId: InvoiceIdSchema.openapi({
    param: { name: "invoiceId", in: "path" },
  }),
})
export type InvoiceIdParam = z.infer<typeof InvoiceIdParamSchema>

// --- POST /v1/invoices ------------------------------------------------------
// Envelope fields (confidence/rationale/conversationId) mirror the accounting
// write surface — they are server-gate metadata, NOT tenant data, and are
// stripped before the domain call. They drive the auto-apply/hold decision.
const CONFIDENCE = z
  .number()
  .min(0)
  .max(1)
  .openapi({
    description:
      "Agent confidence [0,1]. At/above the server threshold the write " +
      "auto-applies; below it is HELD for human review. Required.",
    example: 0.95,
  })
const RATIONALE = z.string().min(1).max(2000).openapi({
  description: "Why this invoice — persisted to the audit trail. Required.",
  example: "Domestic service invoice, VAT 21% deductible.",
})
const CONVERSATION_ID = z.string().uuid().optional().openapi({
  description: "Audit-correlation id of the driving agent conversation.",
})

/**
 * `POST /v1/invoices` body. The server pins the invoice `type` from
 * `direction`; tenant + responsible user come from the API-key principal, never
 * the body. `lines` reuse the canonical doklad line/partial shape the capture
 * pipeline consumes.
 *
 * Each line references a pre-existing accounting event by `eventId` — create
 * those first via `POST /v1/accounting/events`. `seriesId` is a DOCUMENT number
 * series (discover via `GET /v1/accounting/number-series`). This mirrors
 * `POST /v1/accounting/documents`; it does not auto-create events.
 */
export const CreateInvoiceRequestSchema = z
  .object({
    direction: InvoiceDirectionSchema,
    periodId: z.string().uuid().openapi({
      description: "The účetní období to book into.",
    }),
    seriesId: z
      .string()
      .uuid()
      .openapi({ description: "DOCUMENT number series id." }),
    issuedAt: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
      )
      .openapi({
        description: "Okamžik vyhotovení (§11/1d) — ISO.",
        example: "2025-03-14",
      }),
    roundingAmount: z
      .string()
      .regex(/^-?\d{1,15}(\.\d{1,4})?$/)
      .optional()
      .openapi({ description: "§37 doc-total rounding → 548/648." }),
    lines: z.array(IndividualRecordSchema).min(1).max(200),
    confidence: CONFIDENCE,
    rationale: RATIONALE,
    conversationId: CONVERSATION_ID,
    signals: EVIDENCE_SIGNALS.nullish().openapi({
      description:
        "Optional evidence envelope the server scores through its own " +
        "confidence engine (fail-closed). Stripped before the domain write.",
    }),
  })
  .openapi({
    description:
      "Capture an invoice (invoice-typed doklad) with its lines/partials. The " +
      "server derives summary_record_type from `direction`; tenant + user are " +
      "injected from the principal. Applies (201) or holds for review (202).",
  })
export type CreateInvoiceRequest = z.infer<typeof CreateInvoiceRequestSchema>

/** `POST /v1/invoices` result (applied or held). */
export const CreateInvoiceResponseSchema = z
  .object({
    status: z.enum(["applied", "held"]).openapi({
      description: "applied = booked; held = queued for human review.",
    }),
    reviewId: z
      .string()
      .uuid()
      .nullish()
      .openapi({ description: "tool_call_log id when held." }),
    invoiceId: z
      .string()
      .uuid()
      .nullish()
      .openapi({ description: "The created invoice id (summary_record id)." }),
    designation: z.string().nullish(),
    sequenceNumber: z.number().int().nullish(),
    lines: z
      .array(
        z.object({
          individualRecordId: z.string().uuid(),
          partialRecordIds: z.array(z.string().uuid()),
        }),
      )
      .nullish(),
  })
  .openapi({ description: "Create-invoice result (applied or held)." })
export type CreateInvoiceResponse = z.infer<typeof CreateInvoiceResponseSchema>

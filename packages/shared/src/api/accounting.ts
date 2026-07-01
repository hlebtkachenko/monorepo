import { z } from "zod"

import { OrganizationIdSchema } from "./primitives"
import "./zod-openapi"

/**
 * Accounting book endpoints — read-model surface over the `@workspace/accounting`
 * domain (deník / hlavní kniha / obratová předvaha). Money crosses the wire as a
 * decimal STRING (e.g. `"12100.00"`), never a JS number — the domain's `Decimal`
 * transport. The api maps snake_case domain rows to camelCase JSON here.
 */

/** UUID path param shared by the period-scoped book endpoints. */
export const PeriodIdParamSchema = z.object({
  periodId: z
    .string()
    .uuid()
    .openapi({
      description:
        "Accounting period id to read. Resolved within the API key's own " +
        "organization (FORCE RLS); a period from another tenant returns 404.",
      example: "3f5b2c14-8d9a-4e2b-b1f0-2a6d7c9e4a10",
    }),
})

/** A single deník (journal) line — one side of one posting, in book order (§13). */
export const JournalRowSchema = z
  .object({
    postingId: z.string().uuid().openapi({
      description: "Posting the line belongs to.",
      example: "9c1e7a02-4b6d-4f18-9a3e-7d2c5b8f1e40",
    }),
    postingDate: z.string().openapi({
      description: "Posting date (ISO `YYYY-MM-DD`).",
      example: "2025-03-14",
    }),
    isOpening: z.boolean().openapi({
      description:
        "True for 701 opening-balance postings carried into the period.",
      example: false,
    }),
    summaryDesignation: z.string().openapi({
      description: "Human designation of the summary record (doklad label).",
      example: "FP2025/0042",
    }),
    summaryType: z.string().openapi({
      description: "Summary-record type (document class).",
      example: "INVOICE_RECEIVED",
    }),
    accountingEventId: z.string().uuid().openapi({
      description: "Originating accounting event.",
      example: "1b2a3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    }),
    lineId: z.string().uuid().openapi({
      description: "Double-entry line id.",
      example: "aa11bb22-cc33-4d44-9e55-ff6677889900",
    }),
    accountId: z.string().uuid().openapi({
      description: "Account the line posts to.",
      example: "bb22cc33-dd44-4e55-9f66-001122334455",
    }),
    accountNumber: z.string().openapi({
      description: "Syntetický/analytický account number (účtový rozvrh).",
      example: "311000",
    }),
    side: z.enum(["DEBIT", "CREDIT"]).openapi({
      description: "Side of the double entry — MD (DEBIT) or Dal (CREDIT).",
      example: "DEBIT",
    }),
    amount: z.string().openapi({
      description:
        "Signed line amount as a decimal string in the accounting currency " +
        "(CZK by default). Never a JS number.",
      example: "12100.00",
    }),
  })
  .openapi({
    description: "One deník line — a single side of a double-entry posting.",
  })
export type JournalRow = z.infer<typeof JournalRowSchema>

/** `GET /v1/accounting/periods/{periodId}/journal` response. */
export const JournalResponseSchema = z
  .object({
    organizationId: OrganizationIdSchema,
    periodId: z.string().uuid().openapi({
      description: "The period these lines belong to.",
      example: "3f5b2c14-8d9a-4e2b-b1f0-2a6d7c9e4a10",
    }),
    rows: z.array(JournalRowSchema).openapi({
      description: "Journal lines in chronological book order (§13).",
    }),
  })
  .openapi({
    description:
      "Deník (chronological journal) for a period — the double-entry lines " +
      "including 701 opening postings, in book order.",
  })
export type JournalResponse = z.infer<typeof JournalResponseSchema>

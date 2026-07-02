import { z } from "zod"

import "./zod-openapi"

/**
 * Accounting WRITE + decision surface — the seam the Afframe Brain drives.
 * `classify` is a pure decision (no mutation, no tenant read). The mutating
 * endpoints (events / documents / postings) live here too; each carries a
 * server-gate envelope (confidence + rationale) and injects the tenant +
 * responsible user from the API-key principal — NEVER from the body.
 *
 * Money is a decimal STRING (numeric(19,4)); the whole accounting surface
 * speaks decimal strings, not minor units.
 */

/** Unsigned decimal string, matches numeric(19,4). */
const Decimal = z
  .string()
  .regex(/^\d{1,15}(\.\d{1,4})?$/)
  .openapi({
    description: "Unsigned decimal amount as a string.",
    example: "12100.00",
  })

// ── classify (pure decision) ────────────────────────────────────────────────

export const ClassifyEventRequestSchema = z
  .object({
    direction: z.enum(["RECEIVED", "ISSUED"]).openapi({
      description: "FP (RECEIVED / purchase) vs FV (ISSUED / sale).",
      example: "RECEIVED",
    }),
    supplyKind: z
      .enum([
        "GOODS",
        "MATERIAL",
        "SERVICES",
        "UTILITY",
        "RENT",
        "INSURANCE",
        "ASSET",
        "ADVANCE",
        "CREDIT_NOTE",
        "OTHER",
      ])
      .openapi({ description: "Kind of supply.", example: "SERVICES" }),
    jurisdiction: z
      .enum([
        "DOMESTIC",
        "REVERSE_CHARGE",
        "EU",
        "IMPORT",
        "EXEMPT",
        "OUTSIDE_VAT",
      ])
      .openapi({ description: "VAT jurisdiction.", example: "DOMESTIC" }),
    base: Decimal,
    vat: Decimal,
    vatRate: z
      .string()
      .nullish()
      .openapi({ description: "Stated VAT rate.", example: "21" }),
    currency: z
      .string()
      .length(3)
      .openapi({ description: "ISO 4217.", example: "CZK" }),
    fxRate: z
      .string()
      .nullish()
      .openapi({
        description: "FX rate if foreign currency.",
        example: "25.30",
      }),
    serviceWindow: z
      .object({ start: z.string(), end: z.string() })
      .optional()
      .openapi({ description: "Service window (ISO dates) — deferral split." }),
    periodEnd: z
      .string()
      .optional()
      .openapi({
        description: "Accounting period end (ISO).",
        example: "2025-12-31",
      }),
    durable: z
      .boolean()
      .optional()
      .openapi({ description: "Durable long-term asset?", example: false }),
    assetThreshold: Decimal.optional(),
    acquisitionAccount: z
      .string()
      .min(3)
      .max(6)
      .optional()
      .openapi({
        description: "042/041 for a capitalised asset.",
        example: "042",
      }),
    isCreditNote: z
      .boolean()
      .optional()
      .openapi({
        description: "Credit note (§42) — flips sides.",
        example: false,
      }),
  })
  .openapi({
    description:
      "Economic-event facts to classify into an accounting treatment.",
  })
export type ClassifyEventRequest = z.infer<typeof ClassifyEventRequestSchema>

export const ClassifyEventResponseSchema = z
  .object({
    vatMode: z
      .string()
      .openapi({
        description: "VAT mode to stamp on the partial record.",
        example: "STANDARD",
      }),
    vatRate: z
      .string()
      .nullable()
      .openapi({
        description: "Rate to freeze (null for exempt/outside).",
        example: "21",
      }),
    scenario: z
      .string()
      .openapi({
        description: "Předkontace scenario id.",
        example: "PURCHASE_SERVICE_STANDARD",
      }),
    accountOverrides: z
      .record(z.string(), z.string())
      .optional()
      .openapi({ description: "Template→tenant account remap." }),
    saldoAccount: z
      .enum(["311", "321"])
      .nullable()
      .openapi({ description: "Open-item account, or null.", example: "321" }),
    capitalise: z
      .object({ acquisitionAccount: z.string() })
      .optional()
      .openapi({ description: "Route net to an acquisition account." }),
    deferral: z
      .object({ bridge: z.enum(["381", "384"]), reason: z.string() })
      .optional()
      .openapi({ description: "Defer the future part to a bridge account." }),
    reasoning: z
      .array(z.string())
      .openapi({ description: "Law-cited decision trail." }),
  })
  .openapi({
    description:
      "The accounting treatment decided from the facts (with reasoning).",
  })
export type ClassifyEventResponse = z.infer<typeof ClassifyEventResponseSchema>

// ── number series (discovery for write bodies) ──────────────────────────────

export const NumberSeriesQuerySchema = z.object({
  entityType: z
    .enum(["EVENT", "DOCUMENT", "ASSET", "INVENTORY_COUNT"])
    .optional()
    .openapi({ description: "Filter by entity type.", example: "DOCUMENT" }),
})

export const NumberSeriesRowSchema = z
  .object({
    id: z
      .string()
      .uuid()
      .openapi({
        description:
          "Series id — reference by this in write bodies (seriesId).",
        example: "aa11bb22-cc33-4d44-9e55-ff6677889900",
      }),
    entityType: z
      .enum(["EVENT", "DOCUMENT", "ASSET", "INVENTORY_COUNT"])
      .openapi({
        description: "What the series numbers.",
        example: "DOCUMENT",
      }),
    code: z
      .string()
      .openapi({ description: "Company série label.", example: "FP" }),
    pattern: z
      .string()
      .openapi({
        description: "Designation format.",
        example: "FP{YYYY}{NNNN}",
      }),
    nextNumber: z
      .number()
      .int()
      .openapi({ description: "Next sequence number.", example: 43 }),
  })
  .openapi({ description: "A gapless number series." })
export type NumberSeriesRow = z.infer<typeof NumberSeriesRowSchema>

export const NumberSeriesListResponseSchema = z
  .object({
    series: z
      .array(NumberSeriesRowSchema)
      .openapi({ description: "The organization's number series." }),
  })
  .openapi({
    description: "Number series available for write-body seriesId references.",
  })
export type NumberSeriesListResponse = z.infer<
  typeof NumberSeriesListResponseSchema
>

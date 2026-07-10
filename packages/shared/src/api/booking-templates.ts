import { z } from "zod"

import "./zod-openapi"
import { ClassifyEventResponseSchema } from "./accounting-writes"

/**
 * Public-API view of a `booking_template` (M2.1) — the workspace-shared Brain
 * booking-template library that AMENDS constitution §I9 ("no write templates").
 * See `packages/db/migrations/0054_booking_template.sql` and
 * `packages/brain/src/no-write-templates.boundary.test.ts` for the full
 * safety argument.
 *
 * A booking_template is a REVIEWABLE record of a recurring transaction's
 * CONFIRMED accounting treatment — a signature (counterparty + direction +
 * supply kind + VAT jurisdiction) mapped to the `PostingDecision` a human
 * already confirmed for that exact recurring case. It is NOT a write
 * template: matching it supplies input facts to the SAME typed write calls
 * (`create_accounting_event` / `create_accounting_posting`) the Brain already
 * makes after full reasoning; every write, templated or not, still runs
 * through the unchanged `runGatedWrite` and is still HELD at cold start.
 *
 * WORKSPACE-scoped, NOT organization-scoped, mirroring `OcrTemplate`: a
 * recurring counterparty relationship does not change per client book, so one
 * confirmed template is shared across every org in the office. `humanConfirmedAt`
 * is the single trust gate: a template starts UNCONFIRMED (`null`) and is
 * NEVER matchable until a human confirms it via the confirm endpoint.
 */

/** ISO 8601 timestamp string (nullable where the column is nullable). */
const Timestamp = z.string().openapi({
  description: "ISO 8601 timestamp.",
  example: "2026-07-05T10:15:00.000Z",
})

const DIRECTION = z
  .enum(["RECEIVED", "ISSUED"])
  .openapi({ description: "FP (RECEIVED) vs FV (ISSUED)." })

/** Kind of supply — mirrors the accounting SupplyKind union (classify.ts). */
const SUPPLY_KIND = z.enum([
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

const JURISDICTION = z.enum([
  "DOMESTIC",
  "REVERSE_CHARGE",
  "EU",
  "IMPORT",
  "EXEMPT",
  "OUTSIDE_VAT",
])

/** The four signature fields a booking template matches on. */
const SignatureFields = {
  counterpartyKey: z.string().min(1).max(255).openapi({
    description: "Counterparty identity — an IČO or normalized name.",
    example: "27082440",
  }),
  direction: DIRECTION,
  supplyKind: SUPPLY_KIND.openapi({
    description: "Kind of supply.",
    example: "SERVICES",
  }),
  jurisdiction: JURISDICTION.openapi({
    description: "VAT jurisdiction.",
    example: "DOMESTIC",
  }),
}

export const BookingTemplateSchema = z
  .object({
    id: z.string().uuid().openapi({
      description: "Template id.",
      example: "0196f1de-0000-7000-8000-0000000000f1",
    }),
    ...SignatureFields,
    confirmedDecision: ClassifyEventResponseSchema.openapi({
      description:
        "The confirmed accounting treatment to reapply on a match — the same " +
        "shape `POST /v1/accounting/classify` returns.",
    }),
    humanConfirmedAt: Timestamp.nullable().openapi({
      description:
        "When a human confirmed this template. NULL = unconfirmed (the trust " +
        "gate) — an unconfirmed template is NEVER matchable; only a human-actor " +
        "key may set it via the confirm endpoint.",
      example: null,
    }),
    matchCount: z.number().int().openapi({
      description: "How many times this template has been matched/reused.",
      example: 0,
    }),
    heldCount: z
      .number()
      .int()
      .openapi({
        description:
          "How many bookings proposed from this template were HELD for review. " +
          "A learning signal; not client-settable.",
        example: 0,
      }),
    lastRejectAt: Timestamp.nullable().openapi({
      description:
        "When a booking proposed from this template was last rejected, or null.",
      example: null,
    }),
    version: z.number().int().openapi({
      description: "Refinement version.",
      example: 1,
    }),
    learnedAt: Timestamp.openapi({
      description: "When the template was first learned.",
    }),
    provenance: z
      .record(z.string(), z.unknown())
      .nullable()
      .openapi({
        description:
          "Opaque provenance blob (e.g. the tool_call_log id of the approved " +
          "booking this template was learned from).",
      }),
    createdAt: Timestamp.openapi({ description: "Row creation timestamp." }),
    updatedAt: Timestamp.openapi({ description: "Row last-update timestamp." }),
  })
  .openapi({
    description:
      "A workspace-shared, human-confirmed booking template. Workspace-scoped " +
      "(FORCE RLS) — shared across every organization in the office. Never " +
      "matchable until `humanConfirmedAt` is set.",
  })
export type BookingTemplate = z.infer<typeof BookingTemplateSchema>

/** `GET /v1/booking-templates` query — optional signature filters. */
export const ListBookingTemplatesQuerySchema = z
  .object({
    counterpartyKey: z.string().min(1).max(255).optional().openapi({
      description: "Filter to one counterparty.",
      example: "27082440",
    }),
  })
  .openapi({ description: "Filters for the booking-template list." })
export type ListBookingTemplatesQuery = z.infer<
  typeof ListBookingTemplatesQuerySchema
>

export const ListBookingTemplatesResponseSchema = z
  .object({
    templates: z.array(BookingTemplateSchema).openapi({
      description:
        "Booking templates in the caller's workspace matching filters.",
    }),
  })
  .openapi({
    description:
      "The workspace's booking templates (workspace-scoped, FORCE RLS).",
  })
export type ListBookingTemplatesResponse = z.infer<
  typeof ListBookingTemplatesResponseSchema
>

export const BookingTemplateResponseSchema = z
  .object({ template: BookingTemplateSchema })
  .openapi({ description: "A single booking template." })
export type BookingTemplateResponse = z.infer<
  typeof BookingTemplateResponseSchema
>

/**
 * `POST /v1/booking-templates` body — create a NEW, UNCONFIRMED template. The
 * server pins `humanConfirmedAt = null`, `matchCount = 0`, `heldCount = 0`;
 * those trust fields are never client-settable. No tenant identifiers
 * accepted — the workspace comes from the API key.
 */
export const CreateBookingTemplateRequestSchema = z
  .object({
    ...SignatureFields,
    confirmedDecision: ClassifyEventResponseSchema,
    provenance: z
      .record(z.string(), z.unknown())
      .nullish()
      .openapi({ description: "Opaque provenance blob." }),
  })
  .openapi({
    description:
      "Create a new UNCONFIRMED booking template. `humanConfirmedAt` (null), " +
      "`matchCount` (0), and `heldCount` (0) are server-pinned; the workspace " +
      "comes from the API key.",
  })
export type CreateBookingTemplateRequest = z.infer<
  typeof CreateBookingTemplateRequestSchema
>

/** Path param for the single-template operations. */
export const BookingTemplateIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({
      param: { name: "id", in: "path" },
      description:
        "Booking template id, resolved within the API key's workspace.",
      example: "0196f1de-0000-7000-8000-0000000000f1",
    }),
})
export type BookingTemplateIdParam = z.infer<
  typeof BookingTemplateIdParamSchema
>

/**
 * `POST /v1/booking-templates/match` body — the case signature to match
 * against the workspace's CONFIRMED templates. Pure read: no mutation, no
 * write-tool call. Mirrors `POST /v1/accounting/classify`'s shape.
 */
export const MatchBookingTemplateRequestSchema = z
  .object(SignatureFields)
  .openapi({
    description:
      "The recurring case's signature to match against the workspace's " +
      "CONFIRMED booking templates.",
  })
export type MatchBookingTemplateRequest = z.infer<
  typeof MatchBookingTemplateRequestSchema
>

export const MatchBookingTemplateResponseSchema = z
  .object({
    template: BookingTemplateSchema.nullable().openapi({
      description:
        "The matching CONFIRMED template, or null if this is a novel/unmatched " +
        "case. A match never auto-applies anything — the caller still proposes " +
        "the booking through the normal gated write endpoints.",
    }),
  })
  .openapi({
    description:
      "The booking-template match outcome for a case signature (or null).",
  })
export type MatchBookingTemplateResponse = z.infer<
  typeof MatchBookingTemplateResponseSchema
>

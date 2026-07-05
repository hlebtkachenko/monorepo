import { z } from "zod"

import "./zod-openapi"

/**
 * Public-API view of an `ocr_extraction_template` — the workspace-shared Brain
 * OCR template library (ADR-0029 "Brain learned state is workspace-scoped").
 *
 * WORKSPACE-scoped, NOT organization-scoped: a supplier's invoice layout is a
 * workspace fact — it does not change per client book, so one learned template
 * is shared across every org in the accountant's office. The public surface is
 * driven through the API key's parent WORKSPACE (via `withWorkspace`), never an
 * organization; no tenant identifiers are ever accepted in a request body.
 *
 * camelCase JSON mapped from the snake_case row. `human_confirmed_at` is the
 * single trust gate: a template starts UNCONFIRMED (`null`) and only a HUMAN
 * actor may confirm it. `locators` / `provenance` are opaque JSON blobs the
 * Brain owns.
 */

/** ISO 8601 timestamp string (nullable where the column is nullable). */
const Timestamp = z.string().openapi({
  description: "ISO 8601 timestamp.",
  example: "2026-07-05T10:15:00.000Z",
})

export const OcrTemplateSchema = z
  .object({
    id: z.string().uuid().openapi({
      description: "Template id.",
      example: "0196f1de-0000-7000-8000-0000000000e1",
    }),
    supplierKey: z.string().openapi({
      description:
        "Supplier identity the layout belongs to — an IČO or a normalized " +
        "supplier name.",
      example: "27082440",
    }),
    docKind: z.string().openapi({
      description: "Document kind this template extracts (e.g. invoice).",
      example: "RECEIVED_INVOICE",
    }),
    locators: z.record(z.string(), z.unknown()).openapi({
      description:
        "Field → region map the extractor keys off (opaque Brain-owned JSON).",
    }),
    layoutFingerprint: z
      .string()
      .nullable()
      .openapi({
        description:
          "Hash of the field-region geometry, used to re-detect layout drift. " +
          "Null until first learned.",
        example: "sha256:9f2c…",
      }),
    humanConfirmedAt: Timestamp.nullable().openapi({
      description:
        "When a human confirmed this template. NULL = unconfirmed (the trust " +
        "gate); only a human-actor key may set it via the confirm endpoint.",
      example: null,
    }),
    heldCount: z
      .number()
      .int()
      .openapi({
        description:
          "How many captures derived from this template were HELD for review. A " +
          "learning signal; not client-settable.",
        example: 0,
      }),
    lastRejectAt: Timestamp.nullable().openapi({
      description:
        "When a capture derived from this template was last rejected, or null.",
      example: null,
    }),
    version: z.number().int().openapi({
      description:
        "Refinement version — bumped every time the template is refined (PUT).",
      example: 1,
    }),
    learnedAt: Timestamp.openapi({
      description: "When the template was first learned.",
    }),
    provenance: z.record(z.string(), z.unknown()).nullable().openapi({
      description:
        "Opaque Brain-owned provenance blob (how the template was learned).",
    }),
    createdAt: Timestamp.openapi({ description: "Row creation timestamp." }),
    updatedAt: Timestamp.openapi({ description: "Row last-update timestamp." }),
  })
  .openapi({
    description:
      "A workspace-shared OCR extraction template. Workspace-scoped (FORCE " +
      "RLS) — shared across every organization in the office.",
  })
export type OcrTemplate = z.infer<typeof OcrTemplateSchema>

/** `GET /v1/ocr-templates` query — optional supplier / doc-kind filters. */
export const ListOcrTemplatesQuerySchema = z
  .object({
    supplierKey: z.string().min(1).max(255).optional().openapi({
      description: "Filter to one supplier (IČO or normalized name).",
      example: "27082440",
    }),
    docKind: z.string().min(1).max(255).optional().openapi({
      description: "Filter to one document kind.",
      example: "RECEIVED_INVOICE",
    }),
  })
  .openapi({ description: "Filters for the OCR-template list." })
export type ListOcrTemplatesQuery = z.infer<typeof ListOcrTemplatesQuerySchema>

/** `GET /v1/ocr-templates` response — the workspace's templates. */
export const ListOcrTemplatesResponseSchema = z
  .object({
    templates: z.array(OcrTemplateSchema).openapi({
      description: "OCR templates in the caller's workspace matching filters.",
    }),
  })
  .openapi({
    description:
      "The workspace's OCR extraction templates (workspace-scoped, FORCE RLS).",
  })
export type ListOcrTemplatesResponse = z.infer<
  typeof ListOcrTemplatesResponseSchema
>

/** `POST /v1/ocr-templates` / `PUT …/{id}` response — a single template. */
export const OcrTemplateResponseSchema = z
  .object({ template: OcrTemplateSchema })
  .openapi({ description: "A single OCR extraction template." })
export type OcrTemplateResponse = z.infer<typeof OcrTemplateResponseSchema>

/**
 * `POST /v1/ocr-templates` body — create a NEW, UNCONFIRMED template. The
 * server pins `human_confirmed_at = null` and `held_count = 0`; those trust
 * fields are never client-settable. No tenant identifiers accepted — the
 * workspace comes from the API key.
 */
export const CreateOcrTemplateRequestSchema = z
  .object({
    supplierKey: z.string().min(1).max(255).openapi({
      description: "Supplier identity — an IČO or normalized supplier name.",
      example: "27082440",
    }),
    docKind: z.string().min(1).max(255).openapi({
      description: "Document kind this template extracts.",
      example: "RECEIVED_INVOICE",
    }),
    locators: z.record(z.string(), z.unknown()).openapi({
      description: "Field → region map (opaque Brain-owned JSON).",
    }),
    layoutFingerprint: z.string().max(255).nullish().openapi({
      description: "Hash of the field-region geometry (drift detection).",
      example: "sha256:9f2c…",
    }),
    provenance: z
      .record(z.string(), z.unknown())
      .nullish()
      .openapi({ description: "Opaque provenance blob." }),
  })
  .openapi({
    description:
      "Create a new UNCONFIRMED OCR template. `human_confirmed_at` (null) and " +
      "`held_count` (0) are server-pinned; the workspace comes from the API key.",
  })
export type CreateOcrTemplateRequest = z.infer<
  typeof CreateOcrTemplateRequestSchema
>

/**
 * `PUT /v1/ocr-templates/{id}` body — refine an existing template. A refine
 * RE-OPENS the trust gate: the server resets `human_confirmed_at = null` and
 * bumps `version`. Only the learned fields are editable; identity
 * (`supplierKey` / `docKind`) is immutable through this surface.
 */
export const UpdateOcrTemplateRequestSchema = z
  .object({
    locators: z
      .record(z.string(), z.unknown())
      .optional()
      .openapi({ description: "Replacement field → region map." }),
    layoutFingerprint: z.string().max(255).nullish().openapi({
      description: "Replacement layout fingerprint.",
      example: "sha256:aa11…",
    }),
    provenance: z
      .record(z.string(), z.unknown())
      .nullish()
      .openapi({ description: "Replacement provenance blob." }),
  })
  .openapi({
    description:
      "Refine an OCR template. RESETS `human_confirmed_at` to null and bumps " +
      "`version` — a refined template must be re-confirmed by a human.",
  })
export type UpdateOcrTemplateRequest = z.infer<
  typeof UpdateOcrTemplateRequestSchema
>

/** Path param for the single-template operations. */
export const OcrTemplateIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({
      param: { name: "id", in: "path" },
      description: "OCR template id, resolved within the API key's workspace.",
      example: "0196f1de-0000-7000-8000-0000000000e1",
    }),
})
export type OcrTemplateIdParam = z.infer<typeof OcrTemplateIdParamSchema>

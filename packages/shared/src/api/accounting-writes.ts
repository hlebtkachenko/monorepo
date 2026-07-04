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

const VAT_MODE = z.enum([
  "STANDARD",
  "REVERSE_CHARGE",
  "EXEMPT",
  "OUTSIDE_VAT",
  "IMPORT",
])
const VAT_JURISDICTION = z.enum([
  "DOMESTIC",
  "REVERSE_CHARGE",
  "EU",
  "IMPORT",
  "EXEMPT",
  "OUTSIDE_VAT",
])
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
      .regex(/^[A-Z]{3}$/)
      .openapi({ description: "ISO 4217.", example: "CZK" }),
    fxRate: z.string().nullish().openapi({
      description: "FX rate if foreign currency.",
      example: "25.30",
    }),
    serviceWindow: z
      .object({
        start: z
          .string()
          .regex(
            /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
          ),
        end: z
          .string()
          .regex(
            /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
          ),
      })
      .optional()
      .openapi({ description: "Service window (ISO dates) — deferral split." }),
    periodEnd: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
      )
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
    acquisitionAccount: z.string().min(3).max(6).optional().openapi({
      description: "042/041 for a capitalised asset.",
      example: "042",
    }),
    isCreditNote: z.boolean().optional().openapi({
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
    vatMode: VAT_MODE.openapi({
      description: "VAT mode to stamp on the partial record.",
      example: "STANDARD",
    }),
    vatRate: z.string().nullable().openapi({
      description: "Rate to freeze (null for exempt/outside).",
      example: "21",
    }),
    scenario: z.string().openapi({
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
    id: z.string().uuid().openapi({
      description: "Series id — reference by this in write bodies (seriesId).",
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
    pattern: z.string().openapi({
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

// ── mutation surface (gated via tool_call_log) ──────────────────────────────

/** Signed decimal (credit notes / rounding may be negative). */
const SignedDecimal = z
  .string()
  .regex(/^-?\d{1,15}(\.\d{1,4})?$/)
  .openapi({
    description: "Signed decimal amount as a string.",
    example: "-500.00",
  })

/** Positive (nonzero) decimal — fx rates must satisfy the DB `fx_rate > 0` CHECK. */
const PositiveDecimal = z
  .string()
  .regex(/^(?!0+(\.0+)?$)\d{1,15}(\.\d{1,4})?$/)
  .openapi({
    description: "Positive decimal amount as a string (nonzero).",
    example: "25.30",
  })

/**
 * Server-gate envelope, present on every mutation. NOT tenant data — the
 * confidence + rationale drive the auto-apply/hold decision and the audit
 * trail (tool_call_log). conversationId is audit correlation only.
 */
const CONFIDENCE = z
  .number()
  .min(0)
  .max(1)
  .openapi({
    description:
      "Agent's confidence [0,1]. Writes at/above the server threshold auto-apply; " +
      "below it are HELD for human review. Required.",
    example: 0.95,
  })
const RATIONALE = z.string().min(1).max(2000).openapi({
  description: "Why this write — persisted to the audit trail. Required.",
  example: "Standard domestic service invoice, VAT 21% deductible.",
})
const CONVERSATION_ID = z.string().uuid().optional().openapi({
  description: "Audit-correlation id of the driving agent conversation.",
})

/**
 * Structured evidence envelope (#464 evidence contract) — an OPTIONAL, additive
 * TOP-LEVEL field on every write op. It carries the agent's SELF-REPORTED signals
 * the server runs through its OWN confidence engine (`scoreProposal`).
 *
 * FAIL-CLOSED CONTRACT (server-enforced — the client cannot forge a green):
 *   - The server NEVER consumes a client base-score / verify-bonus claim directly.
 *     Every field here that the server cannot RE-VERIFY from data it holds is
 *     degraded to its worst value before scoring: base-score claims → floor,
 *     verify bonuses → false (no uplift). In v1 the server can re-verify almost
 *     none of these, so effectively all are informational + degraded, and a
 *     structural sub-green block is injected — green is UNREACHABLE at cold start
 *     BY DESIGN (the write lane ships OFF; human review is the master gate).
 *   - `capSignals` are Tier-2 CAP kinds that only ever LOWER trust; a client
 *     assertion is honored FAIL-SAFE (accepted, never silently dropped) even
 *     without server re-verification — a self-reported novelty can only hold, not
 *     release, a write.
 *   - This envelope is NOT domain data: it is stripped before the domain mutation
 *     runs (on the live path and on held-write replay). The independent server
 *     VETO (`deriveCaptureVeto`/`derivePostingVeto`) is AND-composed on top of the
 *     score — it is never routed through this envelope.
 */
const EVIDENCE_SIGNALS = z
  .object({
    kbRule: z
      .enum(["constitution_safe", "high_active", "medium", "low_mixed", "none"])
      .optional()
      .openapi({
        description:
          "Agent's claimed KB-rule confidence base. NOT server-verifiable in " +
          "v1 → degraded to `none` before scoring.",
        example: "high_active",
      }),
    extractionQuality: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .openapi({
        description:
          "Agent's claimed source extraction quality [0,1]. NOT server-verifiable " +
          "in v1 → degraded to 0 before scoring.",
        example: 0.85,
      }),
    reconciliation: z
      .enum(["full", "partial", "none"])
      .optional()
      .openapi({
        description:
          "Agent's claimed reconciliation status. NOT server-verifiable in v1 → " +
          "degraded to `none` before scoring.",
        example: "full",
      }),
    vatBaseMatchesNet: z.boolean().optional().openapi({
      description:
        "Verify BONUS claim. NOT server-recomputed → no uplift (false).",
    }),
    rcChecklistPassesOrNA: z.boolean().optional().openapi({
      description:
        "Verify BONUS claim. NOT server-recomputed → no uplift (false).",
    }),
    decree500Confirmed: z.boolean().optional().openapi({
      description:
        "Verify BONUS claim. NOT server-recomputed → no uplift (false).",
    }),
    periodConsistent: z.boolean().optional().openapi({
      description:
        "Verify BONUS claim. NOT server-recomputed → no uplift (false).",
    }),
    bankVsKsSsMatch: z.boolean().optional().openapi({
      description:
        "Verify BONUS claim. NOT server-recomputed → no uplift (false).",
    }),
    capSignals: z
      .array(z.string())
      .optional()
      .openapi({
        description:
          "Self-reported Tier-2 CAP signal kinds (e.g. novel_ico, " +
          "novel_bank_pattern, pdf_low_confidence). These only LOWER trust, so " +
          "they are honored fail-safe: an asserted cap can hold a write, never " +
          "release one.",
        example: ["novel_ico"],
      }),
  })
  .openapi({
    description:
      "Optional evidence envelope the server scores through its own confidence " +
      "engine (fail-closed: unverifiable claims are degraded, cap signals are " +
      "honored). Not domain data — stripped before the domain mutation runs.",
  })
export type EvidenceSignals = z.infer<typeof EVIDENCE_SIGNALS>

// --- POST /v1/accounting/events ---------------------------------------------
export const CreateAccountingEventRequestSchema = z
  .object({
    periodId: z.string().uuid().openapi({ description: "Účetní období." }),
    seriesId: z
      .string()
      .uuid()
      .openapi({ description: "EVENT number series (see GET number-series)." }),
    partyId: z.string().uuid().nullish().openapi({
      description: "OUR side (counterparty row); null for internal.",
    }),
    counterpartyId: z
      .string()
      .uuid()
      .nullish()
      .openapi({ description: "THEIR side (counterparty row)." }),
    description: z.string().min(1).max(2000).openapi({
      description: "Case description.",
      example: "FP — nájem kanceláře",
    }),
    content: z
      .string()
      .max(10000)
      .nullish()
      .openapi({ description: "Optional detail." }),
    occurredAt: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
      )
      .openapi({
        description:
          "Okamžik uskutečnění (§11/1e) — ISO date/datetime in the period.",
        example: "2025-03-14",
      }),
    confidence: CONFIDENCE,
    rationale: RATIONALE,
    conversationId: CONVERSATION_ID,
    signals: EVIDENCE_SIGNALS.nullish(),
  })
  .openapi({
    description:
      "Create an accounting event (účetní případ). Tenant + responsible user " +
      "are injected from the API-key principal — never from the body.",
  })
export type CreateAccountingEventRequest = z.infer<
  typeof CreateAccountingEventRequestSchema
>

export const CreateAccountingEventResponseSchema = z
  .object({
    status: z.enum(["applied", "held"]).openapi({
      description: "applied = booked; held = queued for human review.",
    }),
    reviewId: z
      .string()
      .uuid()
      .nullish()
      .openapi({ description: "tool_call_log id when held." }),
    eventId: z.string().uuid().nullish(),
    designation: z.string().nullish(),
    sequenceNumber: z.number().int().nullish(),
  })
  .openapi({ description: "Create-event result (applied or held)." })
export type CreateAccountingEventResponse = z.infer<
  typeof CreateAccountingEventResponseSchema
>

// --- POST /v1/accounting/documents ------------------------------------------
const PartialRecordSchema = z.object({
  baseAmount: SignedDecimal,
  vatMode: VAT_MODE,
  vatRate: z.string().nullish(),
  vatAmount: SignedDecimal.optional(),
  vatJurisdiction: VAT_JURISDICTION.nullish(),
  supplyKind: SUPPLY_KIND.optional().openapi({
    description:
      "Kind of supply (ZDPH §64/§9). Drives the souhrnné hlášení §102 kód " +
      "plnění (SERVICES -> 3 service; else -> 0 goods). Optional; absent -> " +
      "kód 0 (goods/undistinguished).",
    example: "SERVICES",
  }),
  vatDeductible: z.boolean().optional(),
  advanceSettlement: z.boolean().optional(),
  quantity: SignedDecimal.nullish(),
  measureUnit: z.string().nullish(),
  unitPrice: Decimal.nullish(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  fxRateKind: z.enum(["DAILY", "REAL", "FIXED"]).nullish(),
  fxRate: PositiveDecimal.nullish(),
  vatFxRate: PositiveDecimal.nullish(),
})

const IndividualRecordSchema = z.object({
  eventId: z.string().uuid(),
  description: z.string().nullish(),
  partials: z.array(PartialRecordSchema).min(1).max(50),
})

export const CaptureAccountingDocumentRequestSchema = z
  .object({
    periodId: z.string().uuid(),
    seriesId: z
      .string()
      .uuid()
      .openapi({ description: "DOCUMENT number series." }),
    type: z.enum([
      "RECEIVED_INVOICE",
      "ISSUED_INVOICE",
      "BANK_STATEMENT",
      "INTERNAL",
      "CASH_DOCUMENT",
      "BATCH",
    ]),
    issuedAt: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
      )
      .openapi({
        description: "Okamžik vyhotovení (§11/1d) — ISO.",
        example: "2025-03-14",
      }),
    roundingAmount: SignedDecimal.optional().openapi({
      description: "§37 doc-total rounding → 548/648.",
    }),
    lines: z.array(IndividualRecordSchema).min(1).max(200),
    confidence: CONFIDENCE,
    rationale: RATIONALE,
    conversationId: CONVERSATION_ID,
    signals: EVIDENCE_SIGNALS.nullish(),
  })
  .openapi({
    description:
      "Capture a summary document (doklad) with its lines/partials. Tenant + user injected.",
  })
export type CaptureAccountingDocumentRequest = z.infer<
  typeof CaptureAccountingDocumentRequestSchema
>

export const CaptureAccountingDocumentResponseSchema = z
  .object({
    status: z.enum(["applied", "held"]),
    reviewId: z.string().uuid().nullish(),
    summaryRecordId: z.string().uuid().nullish(),
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
  .openapi({ description: "Capture-document result (applied or held)." })
export type CaptureAccountingDocumentResponse = z.infer<
  typeof CaptureAccountingDocumentResponseSchema
>

// --- POST /v1/accounting/postings -------------------------------------------
const PostingBaseFields = {
  periodId: z.string().uuid(),
  summaryRecordId: z.string().uuid(),
  accountingEventId: z.string().uuid(),
  postingDate: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
    )
    .openapi({
      description: "Datum (§5.2) — ISO date.",
      example: "2025-03-14",
    }),
}

const DoubleEntrySchema = z.object({
  ...PostingBaseFields,
  lines: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        side: z.enum(["DEBIT", "CREDIT"]),
        amount: Decimal,
        partialRecordId: z.string().uuid().nullish(),
      }),
    )
    .min(2)
    .max(100),
})

const MonetaryEntrySchema = z.object({
  ...PostingBaseFields,
  lines: z
    .array(
      z.object({
        location: z.enum(["CASH", "BANK"]),
        direction: z.enum(["INFLOW", "OUTFLOW"]),
        isTaxRelevant: z.boolean(),
        isClearing: z.boolean().optional(),
        categoryId: z.string().uuid().nullish(),
        taxBase: Decimal.nullish(),
        amount: Decimal,
        partialRecordId: z.string().uuid().nullish(),
      }),
    )
    .min(1)
    .max(100),
})

export const CreateAccountingPostingRequestSchema = z
  .object({
    kind: z.enum(["double", "monetary"]),
    entry: z.union([DoubleEntrySchema, MonetaryEntrySchema]),
    confidence: CONFIDENCE,
    rationale: RATIONALE,
    conversationId: CONVERSATION_ID,
    // TOP-LEVEL only — never inside `entry`. held-writes replay pulls only
    // {kind, entry} for postings, so a top-level `signals` is safely dropped.
    signals: EVIDENCE_SIGNALS.nullish(),
  })
  // Enforce the kind↔entry correlation a bare union can't: a `double` kind must
  // carry a double entry (and `monetary` a monetary entry). Without this the
  // loose union accepts a mismatched entry and the domain post() throws a 500.
  // (A top-level z.discriminatedUnion would express this but can't back a
  // nestjs-zod createZodDto class — hence the refine.)
  .refine(
    (data) =>
      (data.kind === "double"
        ? DoubleEntrySchema
        : MonetaryEntrySchema
      ).safeParse(data.entry).success,
    { message: "entry shape does not match kind", path: ["entry"] },
  )
  .openapi({
    description:
      "Post a double-entry (kind=double) or monetary/cash-regime (kind=monetary) " +
      "posting. Tenant + responsible user injected; opening/correction/generated " +
      "linkage is not client-settable.",
  })
export type CreateAccountingPostingRequest = z.infer<
  typeof CreateAccountingPostingRequestSchema
>

export const CreateAccountingPostingResponseSchema = z
  .object({
    status: z.enum(["applied", "held"]),
    reviewId: z.string().uuid().nullish(),
    postingId: z.string().uuid().nullish(),
    lineIds: z.array(z.string().uuid()).nullish(),
  })
  .openapi({ description: "Create-posting result (applied or held)." })
export type CreateAccountingPostingResponse = z.infer<
  typeof CreateAccountingPostingResponseSchema
>

// ── held-writes review queue ────────────────────────────────────────────────

export const HeldWriteRowSchema = z
  .object({
    id: z
      .string()
      .uuid()
      .openapi({
        description:
          "Held-write id (the tool_call_log row / the reviewId a held write " +
          "returned). Pass it to POST /v1/accounting/held-writes/{id}/resolve.",
        example: "0196f1de-0000-7000-8000-000000000001",
      }),
    toolName: z.string().openapi({
      description:
        "Operation the write targeted (createAccountingEvent, " +
        "captureAccountingDocument, createAccountingPosting).",
      example: "captureAccountingDocument",
    }),
    idempotencyKey: z.string().openapi({
      description: "The Idempotency-Key the original write carried.",
      example: "doc-2025-03-14-001",
    }),
    actorKind: z.enum(["human", "ai", "ai_on_behalf", "system"]).openapi({
      description: "Who initiated the original write.",
      example: "ai_on_behalf",
    }),
    confidence: z.string().nullable().openapi({
      description: "Agent's claimed confidence as a decimal string.",
      example: "0.75",
    }),
    rationale: z.string().nullable().openapi({
      description: "Why the agent wanted this write (audit trail).",
      example: "Vendor unclear; amount above the always-hold ceiling.",
    }),
    createdAt: z.string().openapi({
      description: "When the write was held (ISO 8601).",
      example: "2025-03-14T10:15:00.000Z",
    }),
    input: z.record(z.string(), z.unknown()).openapi({
      description:
        "The stored (redacted) request payload the write would apply.",
    }),
  })
  .openapi({ description: "A gated write held for human review." })
export type HeldWriteRow = z.infer<typeof HeldWriteRowSchema>

export const ListHeldWritesResponseSchema = z
  .object({
    heldWrites: z.array(HeldWriteRowSchema).openapi({
      description: "The organization's held writes, oldest first.",
    }),
  })
  .openapi({
    description: "Review queue of gated accounting writes awaiting a human.",
  })
export type ListHeldWritesResponse = z.infer<
  typeof ListHeldWritesResponseSchema
>

export const HeldWriteIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({
      description:
        "Held-write id (the reviewId returned by the held write). Resolved " +
        "within the API key's own organization (FORCE RLS).",
      example: "0196f1de-0000-7000-8000-000000000001",
    }),
})

export const ResolveHeldWriteRequestSchema = z
  .object({
    action: z.enum(["approve", "reject"]).openapi({
      description:
        "approve = execute the stored payload through the original domain " +
        "path; reject = close the review without any domain write.",
      example: "approve",
    }),
    note: z.string().max(1000).optional().openapi({
      description: "Reviewer note, persisted to the audit trail.",
      example: "Checked the invoice PDF — amounts match.",
    }),
  })
  .openapi({
    description:
      "Resolve a held write. The row id is the idempotency anchor — no " +
      "Idempotency-Key header is needed; a second resolve returns 409.",
  })
export type ResolveHeldWriteRequest = z.infer<
  typeof ResolveHeldWriteRequestSchema
>

export const ResolveHeldWriteResponseSchema = z
  .object({
    id: z.string().uuid().openapi({
      description: "The resolved held-write id.",
      example: "0196f1de-0000-7000-8000-000000000001",
    }),
    resolution: z.enum(["approved", "rejected"]).openapi({
      description: "How the review was resolved.",
      example: "approved",
    }),
    result: z
      .record(z.string(), z.unknown())
      .optional()
      .openapi({
        description:
          "Domain result when approved — same shape as the original " +
          "endpoint's applied body (eventId / summaryRecordId / postingId…).",
      }),
  })
  .openapi({ description: "Held-write resolution result." })
export type ResolveHeldWriteResponse = z.infer<
  typeof ResolveHeldWriteResponseSchema
>

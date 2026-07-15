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
  "SECTION_108",
])
/**
 * How the capture was produced — a CLIENT-DECLARED discriminator that drives the
 * OCR novelty fail-closed leg. `"ocr"` (vision/OCR extraction from a PDF/image) is
 * the untrusted path: an OCR capture the server cannot tie to a CONFIRMED template
 * is HELD. `"structured"` (parsed from a Pohoda XML/xlsx/csv export) and
 * `"manual"` (hand-entered) are not screened by that leg.
 *
 * HONEST on what is verifiable: only the field's ABSENCE is server-checkable. A
 * MISSING value is fail-closed to the MOST conservative case (`"ocr"`), so an
 * agent cannot OMIT its way past the screen. But the DECLARED value is NOT
 * server-verifiable in v1 — a client that labels an actually-OCR capture as
 * `"structured"`/`"manual"` to skip the leg is UNDETECTABLE (no server-side
 * extraction telemetry to cross-check). So this discriminator must NOT be treated
 * as verified extraction telemetry: it may not lift the cold-start
 * `extraction_failed` floor. Closing the lying-client route-around is a B2/M4
 * floor-lift precondition (tracked follow-up), not something this leg achieves.
 *
 * Gate-only + audit — stripped before the domain mutation, never persisted as a
 * business field.
 */
const EXTRACTION_METHOD = z.enum(["structured", "ocr", "manual"])
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
/**
 * §92 kód předmětu plnění — mirrors SECTION_92_COMMODITY_CODES (classify.ts):
 * "1" zlato §92b / "3" nemovitost §92d / "4" stavební-montážní §92e / "5"
 * příloha 5 §92c. Drives the kontrolní hlášení A.1/B.1 kód předmětu plnění.
 */
const COMMODITY_CODE = z.enum(["1", "3", "4", "5"])

const LEGAL_DATE = z.iso.date().openapi({
  description: "Czech legal calendar date (YYYY-MM-DD).",
  example: "2026-03-14",
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
    commodityCode: COMMODITY_CODE.optional().openapi({
      description:
        "§92 kód předmětu plnění for a DOMESTIC reverse-charge supply (1 zlato " +
        "/ 3 nemovitost / 4 stavební-montážní / 5 příloha 5). Only meaningful " +
        "when jurisdiction = REVERSE_CHARGE; ignored otherwise.",
      example: "4",
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
    supplyKind: SUPPLY_KIND.optional().openapi({
      description:
        "The supply nature (echoed from the request) to stamp on the capture " +
        "partial — the deterministic booker reads it to pick the cost/revenue " +
        "account (504 goods / 518 services / …). Optional for backward compat.",
      example: "SERVICES",
    }),
    vatJurisdiction: VAT_JURISDICTION.openapi({
      description:
        "vat_jurisdiction to stamp on the capture partial — splits an EU supply " +
        "(ř.20/21 + Souhrnné hlášení) from a domestic §92 PDP (ř.25 + KH A.1).",
      example: "EU",
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
    commodityCode: COMMODITY_CODE.nullable().openapi({
      description:
        "§92 kód předmětu plnění to stamp on the partial record for kontrolní " +
        "hlášení A.1/B.1; null unless this is a domestic reverse-charge supply.",
      example: "4",
    }),
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

const TEMPLATE_ID = z
  .string()
  .uuid()
  .nullish()
  .openapi({
    description:
      "OCR extraction template this capture was derived from (null for " +
      "structured-export captures). NOT domain data — carried alongside the " +
      "gate envelope so a future server veto leg can key off the template's " +
      "confirmation state; it is stripped before the domain mutation runs.",
    example: "0196f1de-0000-7000-8000-0000000000e1",
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
// Exported so /v1/invoices reuses the exact evidence envelope the write gate
// scores (single source of truth, zero drift).
export const EVIDENCE_SIGNALS = z
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

/** The `extractionMethod` field schema (see `EXTRACTION_METHOD`). */
const EXTRACTION_METHOD_FIELD = EXTRACTION_METHOD.optional().openapi({
  description:
    "CLIENT-DECLARED discriminator of how this capture was produced: " +
    "'structured' (parsed from a Pohoda XML/xlsx/csv export), 'ocr' " +
    "(vision/OCR extraction from a PDF/image), or 'manual' (hand-entered). " +
    "NOT domain data, and NOT server-verifiable in v1 (a false " +
    "'structured'/'manual' label on an actually-OCR capture is undetectable) " +
    "— [#565] the declared value is therefore advisory only and can never " +
    "release a hold: a capture with no CONFIRMED OCR-template basis is HELD " +
    "regardless of what this field says (present, absent, or any value). " +
    "Stripped before the domain mutation.",
  example: "structured",
})

/**
 * The server-gate envelope — the gate-only + audit fields the capture request
 * carries ALONGSIDE its domain data. Defined ONCE and spread into
 * `CaptureAccountingDocumentRequestSchema` so the field schemas, `GATE_ENVELOPE_KEYS`,
 * and `stripGateEnvelope` can never drift: `confidence`/`rationale` drive the
 * auto-apply/hold decision, `conversationId` is audit correlation, `signals` is the
 * (#464) evidence envelope, and `templateId`/`extractionMethod` feed the OCR-template
 * basis screen. NONE is domain data — every one is stripped before the domain
 * mutation runs (on the live path, on API held-write replay, and on the web replay).
 */
export const GATE_ENVELOPE = {
  confidence: CONFIDENCE,
  rationale: RATIONALE,
  conversationId: CONVERSATION_ID,
  signals: EVIDENCE_SIGNALS.nullish(),
  templateId: TEMPLATE_ID,
  extractionMethod: EXTRACTION_METHOD_FIELD,
} as const

/** The exact key set `stripGateEnvelope` removes — the keys of {@link GATE_ENVELOPE}. */
export const GATE_ENVELOPE_KEYS = Object.keys(
  GATE_ENVELOPE,
) as (keyof typeof GATE_ENVELOPE)[]

/** The gate-envelope fields, as a type — the shape `stripGateEnvelope` peels off. */
export type GateEnvelope = {
  [K in keyof typeof GATE_ENVELOPE]: z.infer<(typeof GATE_ENVELOPE)[K]>
}

/**
 * Peel the gate envelope off a stored/live capture payload, returning ONLY the
 * domain fields `captureDocument` consumes. The single source of truth for all
 * three re-run paths (the API capture controller, the API held-write resolve, and
 * the web approvals replay) so they hand `captureDocument` the identical field set
 * — no path can silently drift a key in or out. Non-mutating (returns a fresh
 * object); tolerant of extra/absent keys (an events/postings payload simply has
 * none of the capture-only keys to remove).
 */
export function stripGateEnvelope<T extends Record<string, unknown>>(
  payload: T,
): Omit<T, keyof typeof GATE_ENVELOPE> {
  const rest = { ...payload }
  for (const key of GATE_ENVELOPE_KEYS) delete rest[key]
  return rest as Omit<T, keyof typeof GATE_ENVELOPE>
}

/**
 * Every gated accounting write operationId — the ops that run through
 * `runGatedWrite` and can therefore be HELD for human review. This is the SINGLE
 * SOURCE OF TRUTH the held-write replay coverage tests assert against: a held row
 * whose `tool_name` is registered in the live controller + OpenAPI registry but
 * MISSED in either resolve switch (the web approvals action OR the API held-write
 * controller) is permanently un-approvable — a stuck safety state, not just a
 * bug. Adding a new gated op MUST extend this list, and the coverage tests then
 * force a matching replay branch in BOTH switches or fail.
 */
export const GATED_WRITE_OPERATION_IDS = [
  "createAccountingEvent",
  "captureAccountingDocument",
  "createAccountingPosting",
  "createAsset",
  "createDepreciationPlan",
  "createInventoryCount",
] as const
export type GatedWriteOperationId = (typeof GATED_WRITE_OPERATION_IDS)[number]

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
    counterparty: z
      .object({
        name: z.string().min(1).max(400).openapi({
          description: "Obchodní jméno / jméno osoby.",
          example: "ACME s.r.o.",
        }),
        ico: z
          .string()
          .regex(/^\d{1,8}$/)
          .nullish()
          .openapi({
            description: "IČO (up to 8 digits).",
            example: "12345678",
          }),
        dic: z
          .string()
          .max(20)
          .nullish()
          .openapi({ description: "DIČ / EU VAT id.", example: "CZ12345678" }),
        countryCode: z
          .string()
          .length(2)
          .nullish()
          .openapi({ description: "ISO 3166-1 alpha-2.", example: "CZ" }),
      })
      .nullish()
      .openapi({
        description:
          "THEIR side by IDENTITY — the server finds-or-creates the counterparty " +
          "(dedup by IČO → DIČ → name). Used when counterpartyId is unknown; " +
          "counterpartyId takes precedence.",
      }),
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
    occurredOn: LEGAL_DATE.optional().openapi({
      description:
        "Explicit Czech legal date for period membership. Legacy callers may omit it and the server derives Europe/Prague from occurredAt.",
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
  commodityCode: COMMODITY_CODE.optional().openapi({
    description:
      "§92 kód předmětu plnění for a DOMESTIC reverse-charge supply: 1 zlato " +
      "§92b / 3 nemovitost §92d / 4 stavební-montážní §92e / 5 příloha 5 §92c. " +
      "Drives the kontrolní hlášení A.1/B.1 kód. Optional; only meaningful on a " +
      "domestic §92 PDP line (absent -> no kód). Distinct from supplyKind.",
    example: "4",
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

// Exported so /v1/invoices can reuse the exact doklad line/partial shape its
// create path feeds to `captureDocument` (single source of truth, zero drift).
export const IndividualRecordSchema = z.object({
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
    taxPointDate: LEGAL_DATE.nullish().openapi({
      description:
        "DUZP/DPPD used by VAT outputs. Missing means the legal date remains unresolved.",
    }),
    receivedDate: LEGAL_DATE.nullish().openapi({
      description:
        "Proven date a received invoice was obtained. Missing means input-VAT eligibility is incomplete.",
    }),
    roundingAmount: SignedDecimal.optional().openapi({
      description: "§37 doc-total rounding → 548/648.",
    }),
    lines: z.array(IndividualRecordSchema).min(1).max(200),
    // The gate-only + audit fields (confidence / rationale / conversationId /
    // signals / templateId / extractionMethod), defined ONCE in GATE_ENVELOPE and
    // stripped before the domain mutation via `stripGateEnvelope`.
    ...GATE_ENVELOPE,
  })
  .superRefine((value, ctx) => {
    const isInvoice =
      value.type === "RECEIVED_INVOICE" || value.type === "ISSUED_INVOICE"
    if (value.taxPointDate != null && !isInvoice) {
      ctx.addIssue({
        code: "custom",
        path: ["taxPointDate"],
        message: "taxPointDate is only valid for an invoice",
      })
    }
    if (value.receivedDate != null && value.type !== "RECEIVED_INVOICE") {
      ctx.addIssue({
        code: "custom",
        path: ["receivedDate"],
        message: "receivedDate is only valid for a received invoice",
      })
    }
  })
  .openapi({
    description:
      "Capture a summary document (doklad) with its lines/partials. Tenant + user injected.",
  })
export type CaptureAccountingDocumentRequest = z.infer<
  typeof CaptureAccountingDocumentRequestSchema
>
/** The server-verifiable extraction discriminator (see `EXTRACTION_METHOD`). */
export type ExtractionMethod = z.infer<typeof EXTRACTION_METHOD>

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

/**
 * OPTIONAL "also open the saldokonto obligation this posting's saldo leg represents" directive.
 * DOMAIN data (it drives a mutation) — NOT part of the gate envelope, so it survives held-write
 * replay. It carries ONLY what the server cannot derive: the saldo account NUMBER (one of the
 * posting's own line accounts) and the obligation DIRECTION (pohledávka 311 / závazek 321). The
 * statutory parts are server-authoritative: the counterparty comes from the posting's event
 * (never the client), the currency from the period, the account_id from the chart, and the
 * AMOUNT is the exact signed net movement read off the posted lines — so this can pick WHICH leg
 * opens, never fabricate the partner or the amount. Valid ONLY for kind=double (a monetary/cash
 * posting has no double-entry saldo leg). A null counterparty fails closed; a net ≤ 0 (dobropis)
 * opens nothing.
 */
const OpenObligationDirectiveSchema = z
  .object({
    saldoAccountNumber: z.string().min(3).max(6).openapi({
      description: "saldokonto účet BY NUMBER (311/321/…).",
      example: "321",
    }),
    direction: z.enum(["RECEIVABLE", "PAYABLE"]).openapi({
      description: "pohledávka (RECEIVABLE, 311) / závazek (PAYABLE, 321).",
      example: "PAYABLE",
    }),
    issueDate: LEGAL_DATE.nullish().openapi({
      description: "Obligation issue date; defaults to the posting date.",
    }),
    dueDate: LEGAL_DATE.nullish().openapi({
      description: "Splatnost (due date).",
    }),
    variableSymbol: z.string().max(30).nullish().openapi({
      description: "Variabilní symbol for párování.",
    }),
  })
  .openapi({
    description:
      "Open the saldokonto obligation (pohledávka/závazek) this posting's saldo " +
      "leg represents. Only valid for a double-entry posting.",
  })
export type OpenObligationDirective = z.infer<
  typeof OpenObligationDirectiveSchema
>

export const CreateAccountingPostingRequestSchema = z
  .object({
    kind: z.enum(["double", "monetary"]),
    entry: z.union([DoubleEntrySchema, MonetaryEntrySchema]),
    // Open the saldokonto obligation this posting's saldo leg represents (contracts + internal
    // doklady, not just invoices). TOP-LEVEL domain data — survives held-write replay.
    openObligation: OpenObligationDirectiveSchema.nullish(),
    confidence: CONFIDENCE,
    rationale: RATIONALE,
    conversationId: CONVERSATION_ID,
    // TOP-LEVEL only — never inside `entry`. held-writes replay pulls only
    // {kind, entry, openObligation} for postings, so a top-level `signals` is safely dropped.
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
  // A saldokonto obligation is a double-entry concept (openObligation sums the
  // posting_double_entry_line) — reject the directive on a monetary/cash posting up front.
  .refine((data) => data.openObligation == null || data.kind === "double", {
    message: "openObligation is only valid for a double-entry posting",
    path: ["openObligation"],
  })
  .openapi({
    description:
      "Post a double-entry (kind=double) or monetary/cash-regime (kind=monetary) " +
      "posting, optionally opening its saldokonto obligation (openObligation, " +
      "double-entry only). Tenant + responsible user injected; opening/correction/" +
      "generated linkage is not client-settable.",
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

/**
 * Tier 3 — register-card creators (odpisy + inventory difference reach).
 *
 * The `asset`, `depreciation_plan`, and `inventory_count` tables exist but had
 * only INTERNAL-ONLY creator functions, so the agent could not populate the
 * register cards its later postings (odpisy MD 551 / D 08x, inventurní rozdíl
 * manko/přebytek) reference. These three gated ops expose the pure-INSERT
 * creators (no ledger effect — the postings stay on `createAccountingPosting`),
 * so the agent can PROPOSE a card / plan / count and a human approves it into
 * the register. Each mirrors `createAccountingEvent`: inline gate envelope
 * (confidence/rationale/conversationId/signals — no OCR-template basis, these
 * are not document captures), tenant + responsible user injected server-side,
 * NEVER from the body. Account numbers are stored as text and resolved to the
 * period chart only later at posting time (same deferral as the internal fns).
 */

// --- POST /v1/accounting/assets ---------------------------------------------
export const CreateAssetRequestSchema = z
  .object({
    periodId: z
      .string()
      .uuid()
      .openapi({
        description:
          "Účetní období the proposal is bound to (audit + close-blocking). The " +
          "asset register card itself is org-scoped, not period-scoped; this only " +
          "binds the held write to a period.",
      }),
    seriesId: z
      .string()
      .uuid()
      .openapi({ description: "ASSET number series (see GET number-series)." }),
    name: z.string().min(1).max(400).openapi({
      description: "Asset name (název majetku).",
      example: "Notebook Dell Latitude",
    }),
    category: z
      .enum(["INTANGIBLE", "TANGIBLE_DEPRECIABLE", "TANGIBLE_NON_DEPRECIABLE"])
      .openapi({ description: "Asset category (kategorie majetku)." }),
    accountNumber: z.string().min(1).max(20).openapi({
      description: "Rozvahový účet majetku BY NUMBER (022/013/…).",
      example: "022",
    }),
    commissioningDate: LEGAL_DATE.openapi({
      description: "Datum zařazení do užívání — drives the depreciation start.",
    }),
    acquisitionCost: Decimal.openapi({
      description: "Pořizovací cena (input price ex depreciation).",
      example: "45000.00",
    }),
    directiveCode: z.string().max(40).nullish().openapi({
      description: "Odpisová skupina / směrnice code (directive_account.code).",
    }),
    acquisitionDate: LEGAL_DATE.nullish().openapi({
      description: "Datum pořízení (defaults to commissioning date if absent).",
    }),
    location: z.string().max(400).nullish().openapi({
      description: "Umístění majetku.",
    }),
    confidence: CONFIDENCE,
    rationale: RATIONALE,
    conversationId: CONVERSATION_ID,
    signals: EVIDENCE_SIGNALS.nullish(),
  })
  .openapi({
    description:
      "Create a fixed-asset register card (karta majetku). Gated (201 applied " +
      "/ 202 held). Tenant + responsible user injected from the principal.",
  })
export type CreateAssetRequest = z.infer<typeof CreateAssetRequestSchema>

export const CreateAssetResponseSchema = z
  .object({
    status: z.enum(["applied", "held"]).openapi({
      description: "applied = card created; held = queued for human review.",
    }),
    reviewId: z
      .string()
      .uuid()
      .nullish()
      .openapi({ description: "tool_call_log id when held." }),
    assetId: z.string().uuid().nullish(),
    designation: z.string().nullish(),
    sequenceNumber: z.number().int().nullish(),
  })
  .openapi({ description: "Create-asset result (applied or held)." })
export type CreateAssetResponse = z.infer<typeof CreateAssetResponseSchema>

// --- POST /v1/accounting/depreciation-plans ---------------------------------
export const CreateDepreciationPlanRequestSchema = z
  .object({
    periodId: z.string().uuid().openapi({
      description:
        "Účetní období the proposal is bound to (audit + close-blocking).",
    }),
    assetId: z
      .string()
      .uuid()
      .openapi({ description: "Asset this odpisový plán depreciates." }),
    method: z.enum(["STRAIGHT_LINE", "PERFORMANCE", "DECLINING"]).openapi({
      description: "Účetní odpisová metoda.",
    }),
    startDate: LEGAL_DATE.openapi({
      description: "Datum zahájení odpisování.",
    }),
    monthlyAmount: Decimal.openapi({
      description: "Měsíční účetní odpis (drives MD 551 / D 08x).",
      example: "1250.00",
    }),
    expenseAccountNumber: z.string().min(1).max(20).openapi({
      description: "Nákladový účet odpisu BY NUMBER (551).",
      example: "551",
    }),
    accumulatedAccountNumber: z.string().min(1).max(20).openapi({
      description: "Oprávky účet BY NUMBER (082/072/…).",
      example: "082",
    }),
    usefulLifeMonths: z.number().int().positive().max(1200).nullish().openapi({
      description: "Doba použitelnosti v měsících.",
    }),
    residualValue: Decimal.nullish().openapi({
      description: "Zbytková hodnota (defaults to 0).",
    }),
    supersedesPlanId: z.string().uuid().nullish().openapi({
      description: "Předchozí plán, který tento nahrazuje (revize).",
    }),
    confidence: CONFIDENCE,
    rationale: RATIONALE,
    conversationId: CONVERSATION_ID,
    signals: EVIDENCE_SIGNALS.nullish(),
  })
  .openapi({
    description:
      "Create an účetní odpisový plán. Gated (201 applied / 202 held). Tenant " +
      "injected from the principal; account numbers resolved to the chart at " +
      "posting time.",
  })
export type CreateDepreciationPlanRequest = z.infer<
  typeof CreateDepreciationPlanRequestSchema
>

export const CreateDepreciationPlanResponseSchema = z
  .object({
    status: z.enum(["applied", "held"]).openapi({
      description: "applied = plan created; held = queued for human review.",
    }),
    reviewId: z.string().uuid().nullish().openapi({
      description: "tool_call_log id when held.",
    }),
    depreciationPlanId: z.string().uuid().nullish(),
  })
  .openapi({
    description: "Create-depreciation-plan result (applied or held).",
  })
export type CreateDepreciationPlanResponse = z.infer<
  typeof CreateDepreciationPlanResponseSchema
>

// --- POST /v1/accounting/inventory-counts -----------------------------------
export const CreateInventoryCountRequestSchema = z
  .object({
    periodId: z.string().uuid().openapi({
      description:
        "Účetní období the proposal is bound to (audit + close-blocking).",
    }),
    seriesId: z.string().uuid().openapi({
      description: "INVENTORY_COUNT number series (see GET number-series).",
    }),
    countDate: LEGAL_DATE.openapi({
      description: "Datum inventury (§29-30).",
    }),
    description: z.string().max(2000).nullish().openapi({
      description: "Popis inventurního soupisu.",
    }),
    confidence: CONFIDENCE,
    rationale: RATIONALE,
    conversationId: CONVERSATION_ID,
    signals: EVIDENCE_SIGNALS.nullish(),
  })
  .openapi({
    description:
      "Create an inventurní soupis (§29-30). Gated (201 applied / 202 held). " +
      "Tenant injected from the principal.",
  })
export type CreateInventoryCountRequest = z.infer<
  typeof CreateInventoryCountRequestSchema
>

export const CreateInventoryCountResponseSchema = z
  .object({
    status: z.enum(["applied", "held"]).openapi({
      description: "applied = count created; held = queued for human review.",
    }),
    reviewId: z.string().uuid().nullish().openapi({
      description: "tool_call_log id when held.",
    }),
    inventoryCountId: z.string().uuid().nullish(),
    designation: z.string().nullish(),
    sequenceNumber: z.number().int().nullish(),
  })
  .openapi({ description: "Create-inventory-count result (applied or held)." })
export type CreateInventoryCountResponse = z.infer<
  typeof CreateInventoryCountResponseSchema
>

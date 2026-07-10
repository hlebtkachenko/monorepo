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

export const VatFilingPeriodQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .openapi({
      description: "Calendar month or quarter start (YYYY-MM-DD).",
      example: "2026-01-01",
    }),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .openapi({
      description: "Calendar month or quarter end (YYYY-MM-DD).",
      example: "2026-03-31",
    }),
})

export const VatFilingPeriodSchema = VatFilingPeriodQuerySchema.openapi({
  description: "Statutory calendar VAT filing period used for the worksheet.",
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
    eventDescription: z.string().nullable().openapi({
      description: "Description of the originating accounting event (case).",
      example: "Účtenka MOL — nafta služební vůz",
    }),
    counterpartyName: z.string().nullable().openapi({
      description: "Counterparty (their side) of the originating event.",
      example: "MOL Česká republika, s.r.o.",
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
    accountName: z.string().openapi({
      description: "Account name from the účtový rozvrh.",
      example: "Odběratelé",
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

/** One hlavní kniha / obratová předvaha account row — opening | turnover | closing. */
export const LedgerAccountRowSchema = z
  .object({
    accountId: z.string().uuid().openapi({
      description: "Account id.",
      example: "bb22cc33-dd44-4e55-9f66-001122334455",
    }),
    accountNumber: z.string().openapi({
      description: "Account number (účtový rozvrh).",
      example: "311000",
    }),
    accountName: z.string().openapi({
      description: "Account name.",
      example: "Odběratelé — tuzemsko",
    }),
    nature: z.string().openapi({
      description:
        "Account nature (ASSET / LIABILITY / EQUITY / EXPENSE / REVENUE / CLOSING).",
      example: "ASSET",
    }),
    normalBalance: z.enum(["DEBIT", "CREDIT"]).nullable().openapi({
      description: "Normal balance side, or null for accounts without one.",
      example: "DEBIT",
    }),
    openingBalance: z.string().openapi({
      description: "Počáteční stav as a decimal string.",
      example: "0.00",
    }),
    turnoverDebit: z.string().openapi({
      description: "Obrat MD (debit turnover) as a decimal string.",
      example: "121000.00",
    }),
    turnoverCredit: z.string().openapi({
      description: "Obrat Dal (credit turnover) as a decimal string.",
      example: "121000.00",
    }),
    closingBalance: z.string().openapi({
      description: "Konečný stav as a decimal string.",
      example: "0.00",
    }),
  })
  .openapi({
    description:
      "Per-account balance row from the read-model — počáteční stav, obraty " +
      "MD/Dal, konečný stav.",
  })
export type LedgerAccountRow = z.infer<typeof LedgerAccountRowSchema>

/** `GET /v1/accounting/periods/{periodId}/ledger` response (hlavní kniha / obratová předvaha). */
export const LedgerResponseSchema = z
  .object({
    organizationId: OrganizationIdSchema,
    periodId: z.string().uuid().openapi({
      description: "The period these balances belong to.",
      example: "3f5b2c14-8d9a-4e2b-b1f0-2a6d7c9e4a10",
    }),
    accounts: z.array(LedgerAccountRowSchema).openapi({
      description: "Per-account balances, ordered by account number.",
    }),
  })
  .openapi({
    description:
      "Hlavní kniha / obratová předvaha — per-account opening | turnover | " +
      "closing straight from the read-model.",
  })
export type LedgerResponse = z.infer<typeof LedgerResponseSchema>

/** Optional query filters for the open-items (saldokonto) list. */
export const OpenItemsQuerySchema = z.object({
  dueBefore: z.string().optional().openapi({
    description: "Only items due strictly before this ISO date (YYYY-MM-DD).",
    example: "2025-12-31",
  }),
  direction: z.enum(["RECEIVABLE", "PAYABLE"]).optional().openapi({
    description: "Restrict to receivables or payables.",
    example: "RECEIVABLE",
  }),
})

/** One open item (unsettled receivable/payable). */
export const OpenItemRowSchema = z
  .object({
    id: z.string().uuid().openapi({
      description: "Open-item id.",
      example: "aa11bb22-cc33-4d44-9e55-ff6677889900",
    }),
    counterpartyId: z.string().uuid().openapi({
      description: "Counterparty (partner) id.",
      example: "cc33dd44-ee55-4f66-9077-112233445566",
    }),
    accountNumber: z.string().openapi({
      description: "Receivable/payable account number.",
      example: "311000",
    }),
    direction: z.enum(["RECEIVABLE", "PAYABLE"]).openapi({
      description: "Receivable or payable.",
      example: "RECEIVABLE",
    }),
    variableSymbol: z.string().nullable().openapi({
      description: "Variabilní symbol, or null.",
      example: "20250042",
    }),
    originalAmount: z.string().openapi({
      description: "Original amount (decimal string).",
      example: "121000.00",
    }),
    settledAmount: z.string().openapi({
      description: "Settled amount so far (decimal string).",
      example: "0.00",
    }),
    remainingAmount: z.string().openapi({
      description: "Remaining unsettled amount (decimal string).",
      example: "121000.00",
    }),
    isSettled: z
      .boolean()
      .openapi({ description: "True once fully settled.", example: false }),
    currencyCode: z
      .string()
      .openapi({ description: "ISO 4217 currency code.", example: "CZK" }),
    issueDate: z.string().openapi({
      description: "Issue date (YYYY-MM-DD).",
      example: "2025-03-14",
    }),
    dueDate: z.string().nullable().openapi({
      description: "Due date (YYYY-MM-DD), or null.",
      example: "2025-04-13",
    }),
  })
  .openapi({ description: "An unsettled receivable or payable (open item)." })
export type OpenItemRow = z.infer<typeof OpenItemRowSchema>

/** `GET /v1/accounting/open-items` response. */
export const OpenItemsResponseSchema = z
  .object({
    organizationId: OrganizationIdSchema,
    items: z
      .array(OpenItemRowSchema)
      .openapi({ description: "Open items matching the filters." }),
  })
  .openapi({
    description: "Open items (saldokonto) — unsettled receivables/payables.",
  })
export type OpenItemsResponse = z.infer<typeof OpenItemsResponseSchema>

/** Per-partner saldo aggregate row. */
export const SaldoPerPartnerRowSchema = z
  .object({
    counterpartyId: z.string().uuid().openapi({
      description: "Counterparty (partner) id.",
      example: "cc33dd44-ee55-4f66-9077-112233445566",
    }),
    accountNumber: z.string().openapi({
      description: "Receivable/payable account number.",
      example: "311000",
    }),
    direction: z.enum(["RECEIVABLE", "PAYABLE"]).openapi({
      description: "Receivable or payable.",
      example: "RECEIVABLE",
    }),
    openTotal: z.string().openapi({
      description:
        "Total open (unsettled) amount for the partner (decimal string).",
      example: "121000.00",
    }),
  })
  .openapi({ description: "Per-partner open balance." })
export type SaldoPerPartnerRow = z.infer<typeof SaldoPerPartnerRowSchema>

/** `GET /v1/accounting/saldokonto` response. */
export const SaldokontoResponseSchema = z
  .object({
    organizationId: OrganizationIdSchema,
    partners: z
      .array(SaldoPerPartnerRowSchema)
      .openapi({ description: "Per-partner open balances." }),
  })
  .openapi({
    description: "Saldokonto — per-partner open receivable/payable balances.",
  })
export type SaldokontoResponse = z.infer<typeof SaldokontoResponseSchema>

/**
 * DPH přiznání line values (§ references in each field). Every value is a
 * decimal string in CZK. Line numbers follow the official tax-return form.
 */
const dec = (description: string) =>
  z.string().openapi({ description, example: "0.00" })

export const DphRowsSchema = z
  .object({
    r1_base: dec("ř.1 základ — dodání zboží/služeb 21 % (§13/§14)."),
    r1_dan: dec("ř.1 daň — 21 %."),
    r2_base: dec("ř.2 základ — dodání 12 % (§13/§14, §47)."),
    r2_dan: dec("ř.2 daň — 12 %."),
    r3_base: dec("ř.3 základ — pořízení zboží z EU, samovyměření 21 % (§16)."),
    r3_dan: dec("ř.3 daň."),
    r4_base: dec("ř.4 základ — pořízení zboží z EU, samovyměření 12 %."),
    r4_dan: dec("ř.4 daň."),
    r5_base: dec(
      "ř.5 základ — přijetí služby dle §9/1 z EU, samovyměření 21 %.",
    ),
    r5_dan: dec("ř.5 daň."),
    r6_base: dec(
      "ř.6 základ — přijetí služby dle §9/1 z EU, samovyměření 12 %.",
    ),
    r6_dan: dec("ř.6 daň."),
    r10_base: dec("ř.10 základ — PDP odběratel 21 % (§92e)."),
    r10_dan: dec("ř.10 daň."),
    r11_base: dec("ř.11 základ — PDP odběratel 12 %."),
    r11_dan: dec("ř.11 daň."),
    r20_base: dec(
      "ř.20 základ — dodání zboží do JČS (§64); osvobozeno s nárokem, bez daně.",
    ),
    r21_base: dec(
      "ř.21 základ — poskytnutí služby s místem plnění v JČS dle §9/1; bez daně.",
    ),
    r25_base: dec("ř.25 základ — PDP dodavatel (§92a); daň odvádí odběratel."),
    r40_base: dec("ř.40 základ — odpočet na vstupu 21 % (§72-73)."),
    r40_dan: dec("ř.40 daň."),
    r41_base: dec("ř.41 základ — odpočet na vstupu 12 %."),
    r41_dan: dec("ř.41 daň."),
    r43_base: dec("ř.43 základ — odpočet u samovyměření 21 % (§73/4)."),
    r43_dan: dec("ř.43 daň."),
    r44_base: dec("ř.44 základ — odpočet u samovyměření 12 %."),
    r44_dan: dec("ř.44 daň."),
    r50_base: dec("ř.50 — osvobozená plnění (§51 a násl.)."),
    dan_na_vystupu: dec("Daň na výstupu celkem."),
    odpocet: dec("Odpočet celkem."),
    vlastni_dan: dec("Vlastní daň (+) / nadměrný odpočet (−)."),
  })
  .openapi({ description: "DPH přiznání line values." })
export type DphRows = z.infer<typeof DphRowsSchema>

export const KontrolniHlaseniTotalsSchema = z
  .object({
    a1_base: dec("A.1 základ — PDP dodavatel (ISSUED, REVERSE_CHARGE)."),
    a1_dan: dec("A.1 daň."),
    a4_base: dec(
      "A.4/A.5 základ — tuzemská výstupní plnění (ISSUED, STANDARD).",
    ),
    a4_dan: dec("A.4/A.5 daň."),
    b1_base: dec(
      "B.1 základ — PDP odběratel samovyměření (RECEIVED, REVERSE_CHARGE).",
    ),
    b1_dan: dec("B.1 daň."),
    b2_base: dec(
      "B.2/B.3 základ — tuzemská vstupní plnění (RECEIVED, STANDARD).",
    ),
    b2_dan: dec("B.2/B.3 daň."),
  })
  .openapi({ description: "Kontrolní hlášení section totals." })
export type KontrolniHlaseniTotals = z.infer<
  typeof KontrolniHlaseniTotalsSchema
>

export const VatEvidenceCompletenessSchema = z
  .object({
    status: z.enum(["PARTIAL", "NEEDS_INPUT"]),
    missingTaxPointDocuments: z.number().int().nonnegative(),
    missingReceivedDateDocuments: z.number().int().nonnegative(),
    missingClassificationDocuments: z.number().int().nonnegative(),
    limitations: z.array(z.string()),
  })
  .openapi({
    description:
      "Blocking evidence gaps and declared limitations for a partial VAT worksheet.",
  })
export type VatEvidenceCompleteness = z.infer<
  typeof VatEvidenceCompletenessSchema
>

/** `GET /v1/accounting/periods/{periodId}/outputs/vat-return` response. */
export const DphResponseSchema = z
  .object({
    organizationId: OrganizationIdSchema,
    periodId: z.string().uuid().openapi({
      description: "Accounting context used to authorize this request.",
      example: "3f5b2c14-8d9a-4e2b-b1f0-2a6d7c9e4a10",
    }),
    filingPeriod: VatFilingPeriodSchema,
    rows: DphRowsSchema,
    kh: KontrolniHlaseniTotalsSchema,
    completeness: VatEvidenceCompletenessSchema,
  })
  .openapi({
    description:
      "Partial DPH worksheet for one statutory calendar filing period — line values plus kontrolní " +
      "hlášení section totals, computed from the posted facts.",
  })
export type DphResponse = z.infer<typeof DphResponseSchema>

// --- DPPO (corporate income tax) ---------------------------------------------
export const AnnualArtifactCompletenessSchema = z.object({
  status: z.enum(["WORKSHEET_READY", "NEEDS_INPUT", "DRAFT"]),
  filingReady: z.literal(false),
  blockingInputs: z.array(z.string()),
  unsupportedRequirements: z.array(z.string()),
})

const ProvenancedDecimalSchema = z.object({
  amount: dec("Adjustment amount."),
  provenance: z.object({
    source: z.enum(["USER", "ADVISOR", "LEDGER"]),
    reference: z.string(),
    recordedAt: z.string(),
  }),
})

const DppoRateResolutionSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("SUPPORTED"),
    category: z.enum([
      "STANDARD",
      "BASIC_INVESTMENT_FUND",
      "QUALIFYING_PENSION_INSTITUTION",
    ]),
    rate: dec("Effective tax rate."),
    effectiveFrom: z.string(),
    effectiveTo: z.string().nullable(),
    sourceUrl: z.string().url(),
    verifiedOn: z.string(),
  }),
  z.object({
    status: z.literal("UNSUPPORTED"),
    category: z.enum([
      "STANDARD",
      "BASIC_INVESTMENT_FUND",
      "QUALIFYING_PENSION_INSTITUTION",
      "OTHER",
      "UNKNOWN",
    ]),
    reason: z.string(),
  }),
])

/** `GET /v1/accounting/periods/{periodId}/outputs/corporate-income-tax`. */
export const DppoResponseSchema = z
  .object({
    organizationId: OrganizationIdSchema,
    periodId: z.string().uuid().openapi({
      description: "Period covered.",
      example: "3f5b2c14-8d9a-4e2b-b1f0-2a6d7c9e4a10",
    }),
    artifactKind: z.literal("DPPO_CALCULATION_WORKSHEET"),
    periodStart: z.string(),
    periodEnd: z.string(),
    bookValues: z.object({
      accountingResult: dec(
        "Accounting profit or loss from the book balances.",
      ),
    }),
    adjustments: z.object({
      nonDeductibleExpenses: ProvenancedDecimalSchema.nullable(),
      exemptRevenue: ProvenancedDecimalSchema.nullable(),
      excludeLossMakingMainActivity: ProvenancedDecimalSchema.nullable(),
      lossCarryForward: ProvenancedDecimalSchema.nullable(),
      taxReliefs: ProvenancedDecimalSchema.nullable(),
      advancesPaid: ProvenancedDecimalSchema.nullable(),
    }),
    rateResolution: DppoRateResolutionSchema,
    completeness: AnnualArtifactCompletenessSchema,
    ucetniVysledek: dec("Účetní výsledek hospodaření."),
    nedanoveNaklady: dec("Daňově neuznatelné náklady (§25).").nullable(),
    osvobozeneVynosy: dec("Osvobozené/nezdaňované výnosy.").nullable(),
    zakladDane: dec("Základ daně §23/1 (před §34).").nullable(),
    odpocetZtraty: dec("Odpočet daňové ztráty minulých let §34.").nullable(),
    zakladZaokrouhleny: dec("Zaokrouhlený základ daně.").nullable(),
    sazba: dec("Sazba daně.").nullable(),
    dan: dec("Daň.").nullable(),
    slevy: dec("Slevy na dani.").nullable(),
    danPoSlevach: dec("Daň po slevách.").nullable(),
    zalohy: dec("Zaplacené zálohy §38a.").nullable(),
    doplatek: dec("Doplatek (+) / přeplatek (−).").nullable(),
  })
  .openapi({
    description:
      "DPPO calculation worksheet. Missing category or provenanced adjustments block derived tax totals.",
  })
export type DppoResponse = z.infer<typeof DppoResponseSchema>

// --- Souhrnné hlášení (EC sales list) ----------------------------------------
export const EcSalesRowSchema = z
  .object({
    countryCode: z.string().nullable().openapi({
      description: "Acquirer member state (ISO 3166-1 alpha-2).",
      example: "DE",
    }),
    taxId: z.string().nullable().openapi({
      description: "Acquirer VAT id (DIČ) incl. country prefix.",
      example: "DE123456789",
    }),
    kodPlneni: z.string().openapi({
      description:
        "Kód plnění (0 goods / 1 transfer / 2 triangular / 3 service).",
      example: "0",
    }),
    count: z
      .number()
      .int()
      .openapi({ description: "Počet plnění (distinct dokladů).", example: 3 }),
    value: dec("Celková hodnota plnění (CZK, bez daně)."),
  })
  .openapi({
    description: "One souhrnné hlášení row (per partner + kód plnění).",
  })
export type EcSalesRow = z.infer<typeof EcSalesRowSchema>

/** `GET /v1/accounting/periods/{periodId}/outputs/ec-sales-list`. */
export const EcSalesListResponseSchema = z
  .object({
    organizationId: OrganizationIdSchema,
    periodId: z.string().uuid().openapi({
      description: "Accounting context used to authorize this request.",
      example: "3f5b2c14-8d9a-4e2b-b1f0-2a6d7c9e4a10",
    }),
    filingPeriod: VatFilingPeriodSchema,
    rows: z
      .array(EcSalesRowSchema)
      .openapi({ description: "EU supply recap rows (§102)." }),
    completeness: VatEvidenceCompletenessSchema,
  })
  .openapi({
    description:
      "Partial souhrnné hlášení worksheet for one statutory calendar filing period.",
  })
export type EcSalesListResponse = z.infer<typeof EcSalesListResponseSchema>

// --- Kontrolní hlášení (per-counterparty control statement) ------------------
export const KhRowSchema = z
  .object({
    taxId: z.string().nullable().openapi({
      description: "DIČ of the other party.",
      example: "CZ12345678",
    }),
    doklad: z.string().openapi({
      description: "Evidenční číslo daňového dokladu.",
      example: "FV2025/0042",
    }),
    dppd: z.string().openapi({
      description: "DPPD — datum povinnosti přiznat daň (YYYY-MM-DD).",
      example: "2025-03-14",
    }),
    kod: z
      .string()
      .nullable()
      .openapi({
        description:
          "§92 kód předmětu plnění — set on the domestic reverse-charge rows " +
          "(A.1/B.1): 1 zlato / 3 nemovitost / 4 stavební-montážní / 5 příloha 5. " +
          "Null on A.2 (EU) and the STANDARD rows (A.4/B.2).",
        example: "4",
      }),
    base21: dec("Základ, 21 % bucket."),
    dan21: dec("Daň, 21 % bucket."),
    base12: dec("Základ, 12 % bucket."),
    dan12: dec("Daň, 12 % bucket."),
  })
  .openapi({ description: "One kontrolní hlášení detail row (per doklad)." })
export type KhRow = z.infer<typeof KhRowSchema>

export const KhAggregateSchema = z
  .object({
    base: dec("Základ celkem."),
    dan: dec("Daň celkem."),
    count: z.number().int().openapi({
      description: "Počet dokladů folded into the aggregate.",
      example: 12,
    }),
  })
  .openapi({
    description:
      "Aggregated KH section (A.5 / B.3 — below the reporting threshold).",
  })
export type KhAggregate = z.infer<typeof KhAggregateSchema>

/** `GET /v1/accounting/periods/{periodId}/outputs/control-statement`. */
export const ControlStatementResponseSchema = z
  .object({
    organizationId: OrganizationIdSchema,
    periodId: z.string().uuid().openapi({
      description: "Accounting context used to authorize this request.",
      example: "3f5b2c14-8d9a-4e2b-b1f0-2a6d7c9e4a10",
    }),
    filingPeriod: VatFilingPeriodSchema,
    a1: z.array(KhRowSchema).openapi({ description: "A.1 — PDP dodavatel." }),
    a2: z
      .array(KhRowSchema)
      .openapi({ description: "A.2 — EU acquisitions self-assessed." }),
    a4: z
      .array(KhRowSchema)
      .openapi({ description: "A.4 — taxable supplies over threshold." }),
    a5: KhAggregateSchema.openapi({
      description: "A.5 — taxable supplies under threshold (aggregate).",
    }),
    b1: z
      .array(KhRowSchema)
      .openapi({ description: "B.1 — PDP odběratel self-assessed." }),
    b2: z
      .array(KhRowSchema)
      .openapi({ description: "B.2 — received supplies over threshold." }),
    b3: KhAggregateSchema.openapi({
      description: "B.3 — received supplies under threshold (aggregate).",
    }),
    completeness: VatEvidenceCompletenessSchema,
  })
  .openapi({
    description:
      "Partial kontrolní hlášení worksheet for one statutory calendar filing period (§101c-i).",
  })
export type ControlStatementResponse = z.infer<
  typeof ControlStatementResponseSchema
>

// --- Financial statements (závěrka) ------------------------------------------
export const StatementLineRowSchema = z
  .object({
    accountNumber: z
      .string()
      .openapi({ description: "Account number.", example: "311000" }),
    nature: z
      .string()
      .openapi({ description: "Account nature.", example: "ASSET" }),
    closingBalance: dec("Konečný stav."),
    balanceSheetLine: z.string().nullable().openapi({
      description: "Rozvaha line code, or null.",
      example: "C.II.1",
    }),
    incomeStatementLine: z
      .string()
      .nullable()
      .openapi({ description: "VZZ line code, or null.", example: "A.1" }),
  })
  .openapi({
    description: "One závěrka account line mapped to statement lines.",
  })
export type StatementLineRow = z.infer<typeof StatementLineRowSchema>

/** `GET /v1/accounting/periods/{periodId}/outputs/financial-statements`. */
export const FinancialStatementsResponseSchema = z
  .object({
    organizationId: OrganizationIdSchema,
    periodId: z.string().uuid().openapi({
      description: "Period covered.",
      example: "3f5b2c14-8d9a-4e2b-b1f0-2a6d7c9e4a10",
    }),
    artifactKind: z.literal("DRAFT_CLOSING_WORKSHEET"),
    completeness: AnnualArtifactCompletenessSchema,
    aktiva: dec("Aktiva celkem."),
    pasiva: dec("Pasiva celkem."),
    naklady: dec("Náklady celkem."),
    vynosy: dec("Výnosy celkem."),
    vysledek: dec("Výsledek hospodaření."),
    lines: z.array(StatementLineRowSchema).openapi({
      description: "Per-account closing balances mapped to statement lines.",
    }),
  })
  .openapi({
    description:
      "Draft closing worksheet with explicit statutory completion gaps.",
  })
export type FinancialStatementsResponse = z.infer<
  typeof FinancialStatementsResponseSchema
>

// --- Statement layout (formatted rozvaha / VZZ) ------------------------------
export const StatementLayoutQuerySchema = z.object({
  rozsah: z
    .enum(["FULL", "ABBREVIATED"])
    .optional()
    .openapi({ description: "Plný / zkrácený rozsah.", example: "FULL" }),
  unit: z.enum(["CZK", "THOUSANDS"]).optional().openapi({
    description: "Presentation unit (celé Kč / v tisících).",
    example: "CZK",
  }),
})

export const LayoutLineSchema = z
  .object({
    code: z.string().openapi({
      description: "Příloha line code (e.g. B, B.II, B.II.1).",
      example: "B.II.1",
    }),
    depth: z.number().int().openapi({
      description: "Nesting depth (1 = letter, 2 = roman, …).",
      example: 3,
    }),
    amount: dec("Rolled-up amount in the presentation unit."),
    comparativeAmount: dec("Amount for the preceding period.").nullable(),
  })
  .openapi({ description: "One formatted statement layout line." })
export type LayoutLine = z.infer<typeof LayoutLineSchema>

/** `GET /v1/accounting/periods/{periodId}/outputs/statement-layout`. */
export const StatementLayoutResponseSchema = z
  .object({
    organizationId: OrganizationIdSchema,
    periodId: z.string().uuid().openapi({
      description: "Period covered.",
      example: "3f5b2c14-8d9a-4e2b-b1f0-2a6d7c9e4a10",
    }),
    rozsah: z
      .enum(["FULL", "ABBREVIATED"])
      .openapi({ description: "Rozsah used.", example: "FULL" }),
    unit: z
      .enum(["CZK", "THOUSANDS"])
      .openapi({ description: "Presentation unit used.", example: "CZK" }),
    artifactKind: z.literal("DRAFT_CLOSING_WORKSHEET"),
    completeness: AnnualArtifactCompletenessSchema,
    comparativePeriod: z
      .object({ periodStart: z.string(), periodEnd: z.string() })
      .nullable(),
    aktiva: z
      .array(LayoutLineSchema)
      .openapi({ description: "Rozvaha — aktiva lines." }),
    aktivaTotal: dec("Aktiva celkem."),
    aktivaTotalComparative: dec("Prior-period aktiva celkem.").nullable(),
    pasiva: z
      .array(LayoutLineSchema)
      .openapi({ description: "Rozvaha — pasiva lines." }),
    pasivaTotal: dec("Pasiva celkem."),
    pasivaTotalComparative: dec("Prior-period pasiva celkem.").nullable(),
    vzz: z
      .array(LayoutLineSchema)
      .openapi({ description: "Výkaz zisku a ztráty lines." }),
    naklady: dec("Náklady celkem."),
    nakladyComparative: dec("Prior-period náklady celkem.").nullable(),
    vynosy: dec("Výnosy celkem."),
    vynosyComparative: dec("Prior-period výnosy celkem.").nullable(),
    vysledek: dec("Výsledek hospodaření."),
    vysledekComparative: dec("Prior-period výsledek hospodaření.").nullable(),
  })
  .openapi({
    description:
      "Draft rozvaha and VZZ layout with prior-period comparisons when available.",
  })
export type StatementLayoutResponse = z.infer<
  typeof StatementLayoutResponseSchema
>

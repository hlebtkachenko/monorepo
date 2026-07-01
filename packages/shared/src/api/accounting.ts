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
    r10_base: dec("ř.10 základ — PDP odběratel 21 % (§92e)."),
    r10_dan: dec("ř.10 daň."),
    r11_base: dec("ř.11 základ — PDP odběratel 12 %."),
    r11_dan: dec("ř.11 daň."),
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

/** `GET /v1/accounting/periods/{periodId}/outputs/vat-return` response. */
export const DphResponseSchema = z
  .object({
    organizationId: OrganizationIdSchema,
    periodId: z.string().uuid().openapi({
      description: "The period this return covers.",
      example: "3f5b2c14-8d9a-4e2b-b1f0-2a6d7c9e4a10",
    }),
    rows: DphRowsSchema,
    kh: KontrolniHlaseniTotalsSchema,
  })
  .openapi({
    description:
      "DPH přiznání (VAT return) for the period — line values plus kontrolní " +
      "hlášení section totals, computed from the posted facts.",
  })
export type DphResponse = z.infer<typeof DphResponseSchema>

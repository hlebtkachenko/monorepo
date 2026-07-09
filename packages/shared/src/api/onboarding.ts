/**
 * Org-onboarding write/read surface — the tools an agent (or the UI) uses to
 * finish provisioning an organization's accounting structure: create a number
 * series, open an accounting period (with its coupled chart + number series),
 * and list the org's periods.
 *
 * NONE of these request schemas declare `organization_id` / `user_id` /
 * `workspace_id` / `role` — the tenant is injected server-side from the API-key
 * principal (invariant I3).
 */
import { z } from "zod"
import { NumberSeriesRowSchema } from "./accounting-writes"

const RegimeCodeSchema = z.enum(["DOUBLE_ENTRY", "SINGLE_ENTRY", "TAX_RECORDS"])
const PeriodStatusSchema = z.enum(["OPEN", "CLOSED"])
const AccountingSizeCodeSchema = z.enum(["MICRO", "SMALL", "MEDIUM", "LARGE"])
const FxRatePolicySchema = z.enum(["DAILY", "REAL", "FIXED"])

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected an ISO date (YYYY-MM-DD)")

// ── create number series ────────────────────────────────────────────────────

export const CreateNumberSeriesRequestSchema = z
  .object({
    entityType: z
      .enum(["EVENT", "DOCUMENT", "ASSET", "INVENTORY_COUNT"])
      .openapi({
        description: "What the series numbers.",
        example: "DOCUMENT",
      }),
    code: z.string().min(1).max(32).openapi({
      description: "Company série label (unique per entity type).",
      example: "FP",
    }),
    pattern: z.string().min(1).max(64).openapi({
      description:
        "Designation format. `{YYYY}` = year, `{NNNN}` = zero-padded sequence.",
      example: "FP{YYYY}{NNNN}",
    }),
    nextNumber: z.number().int().min(1).optional().openapi({
      description: "First sequence number to allocate (defaults to 1).",
      example: 1,
    }),
  })
  .openapi({ description: "Create a gapless number series." })
export type CreateNumberSeriesRequest = z.infer<
  typeof CreateNumberSeriesRequestSchema
>

export const CreateNumberSeriesResponseSchema = z
  .object({
    series: NumberSeriesRowSchema.openapi({
      description: "The created number series.",
    }),
  })
  .openapi({ description: "The created number series." })
export type CreateNumberSeriesResponse = z.infer<
  typeof CreateNumberSeriesResponseSchema
>

// ── create accounting period ────────────────────────────────────────────────

export const CreateAccountingPeriodRequestSchema = z
  .object({
    periodStart: isoDate.openapi({
      description: "First day of the účetní období (YYYY-MM-DD).",
      example: "2025-01-01",
    }),
    periodEnd: isoDate.optional().openapi({
      description:
        "Last day of the účetní období. Omit to derive the fiscal-year end " +
        "containing periodStart from the org's fiscal-year start month.",
      example: "2025-12-31",
    }),
    regimeCode: RegimeCodeSchema.optional().openapi({
      description:
        "Bookkeeping regime. Required only when the org's legal form permits " +
        "more than one and no period exists yet; otherwise derived/reused.",
      example: "DOUBLE_ENTRY",
    }),
    accountingCurrency: z.string().length(3).optional().openapi({
      description: "Měna účetnictví (ISO 4217). Defaults to CZK.",
      example: "CZK",
    }),
    accountingSizeCode: AccountingSizeCodeSchema.nullish().openapi({
      description: "Účetní jednotka size category (§1b). Null until assessed.",
      example: "MICRO",
    }),
    fxRatePolicy: FxRatePolicySchema.nullish().openapi({
      description: "FX-rate směrnice policy (§24). Null defaults to DAILY.",
      example: "DAILY",
    }),
  })
  .openapi({
    description:
      "Open an accounting period. Also creates its coupled chart of accounts " +
      "(double-entry) and default number series, so the org is fully bookable.",
  })
export type CreateAccountingPeriodRequest = z.infer<
  typeof CreateAccountingPeriodRequestSchema
>

export const CreateAccountingPeriodResponseSchema = z
  .object({
    periodId: z.string().uuid().openapi({
      description: "The created accounting period id.",
      example: "0196f1de-0000-7000-8000-0000000000d1",
    }),
    regimeCode: RegimeCodeSchema.openapi({
      description: "Regime the period was opened under.",
      example: "DOUBLE_ENTRY",
    }),
    periodStart: isoDate.openapi({
      description: "Resolved first day of the period.",
      example: "2025-01-01",
    }),
    periodEnd: isoDate.openapi({
      description: "Resolved last day of the period.",
      example: "2025-12-31",
    }),
    chartId: z.string().uuid().nullable().openapi({
      description:
        "The created chart of accounts id (null for non-double-entry regimes).",
      example: "0196f1de-0000-7000-8000-0000000000c1",
    }),
    accountsSeeded: z.number().int().openapi({
      description: "Number of účty seeded into the chart (0 without a chart).",
      example: 218,
    }),
    seriesCreated: z.number().int().openapi({
      description:
        "Default number series inserted (0 when the org already had them).",
      example: 8,
    }),
  })
  .openapi({ description: "The provisioned accounting period." })
export type CreateAccountingPeriodResponse = z.infer<
  typeof CreateAccountingPeriodResponseSchema
>

// ── list accounting periods ─────────────────────────────────────────────────

export const AccountingPeriodSchema = z
  .object({
    id: z.string().uuid().openapi({
      description: "Accounting period id — reference this as periodId.",
      example: "0196f1de-0000-7000-8000-0000000000d1",
    }),
    periodStart: isoDate.openapi({
      description: "First day of the period.",
      example: "2025-01-01",
    }),
    periodEnd: isoDate.openapi({
      description: "Last day of the period.",
      example: "2025-12-31",
    }),
    status: PeriodStatusSchema.openapi({
      description: "OPEN (bookable) or CLOSED.",
      example: "OPEN",
    }),
    regimeCode: RegimeCodeSchema.openapi({
      description: "Bookkeeping regime (immutable per period).",
      example: "DOUBLE_ENTRY",
    }),
    accountingSizeCode: AccountingSizeCodeSchema.nullable().openapi({
      description: "Size category, or null until assessed at period end.",
      example: "MICRO",
    }),
    accountingCurrency: z.string().length(3).openapi({
      description: "Měna účetnictví (ISO 4217).",
      example: "CZK",
    }),
    fxRatePolicy: FxRatePolicySchema.nullable().openapi({
      description: "FX-rate směrnice policy, or null (defaults to DAILY).",
      example: "DAILY",
    }),
  })
  .openapi({ description: "An účetní období." })
export type AccountingPeriod = z.infer<typeof AccountingPeriodSchema>

export const ListAccountingPeriodsResponseSchema = z
  .object({
    periods: z
      .array(AccountingPeriodSchema)
      .openapi({ description: "The organization's accounting periods." }),
  })
  .openapi({ description: "The organization's accounting periods." })
export type ListAccountingPeriodsResponse = z.infer<
  typeof ListAccountingPeriodsResponseSchema
>

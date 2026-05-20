import { z } from "zod"

/**
 * Cross-resource primitive Zod schemas — reusable building blocks for every
 * public-API operation. Authored flat (no subdirectory) so a contributor can
 * skim the entire primitives surface in one file.
 */
import "./zod-openapi"

/**
 * UUID v1–8 plus the all-zero and all-f sentinels used for system /
 * placeholder identities in fixtures and migrations.
 */
const UUID_PATTERN =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/

/**
 * Branded ID factory. Each resource gets its own zod schema so the OpenAPI
 * docs show e.g. `organization_id` versus `invoice_id`, and so the SDK
 * brands them apart for compile-time guards.
 */
export function resourceId<TResource extends string>(resource: TResource) {
  return z
    .string()
    .regex(UUID_PATTERN, { message: `Invalid ${resource} id` })
    .openapi({
      type: "string",
      format: "uuid",
      description: `Opaque ${resource} identifier (UUID).`,
    })
}

export const OrganizationIdSchema = resourceId("organization")
export const WorkspaceIdSchema = resourceId("workspace")
export const InvoiceIdSchema = resourceId("invoice")
export const AccountIdSchema = resourceId("account")
export const JournalEntryIdSchema = resourceId("journal entry")

/**
 * ISO 4217 currency code. Restricted to the set Afframe actually transacts in
 * — extends as the product opens new markets. CZK is the platform default.
 */
export const CurrencyCodeSchema = z.enum(["CZK", "EUR", "USD", "GBP"]).openapi({
  description:
    "ISO 4217 currency code. Afframe stores amounts in the source currency " +
    "and converts via `FxRate` at read time. CZK is the platform default.",
  example: "CZK",
})
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>

/**
 * Monetary value in minor units (haléře for CZK, cents for EUR/USD/GBP). Sent
 * over the wire as a string to avoid JSON float precision loss on amounts
 * larger than 2^53 minor units. The SDK overlays a `Money<Currency>` branded
 * type so callers cannot mix currencies accidentally.
 */
export const MoneySchema = z
  .object({
    amount: z
      .string()
      .regex(/^-?\d+$/, { message: "amount must be an integer string" })
      .openapi({
        description:
          "Amount in minor units, as a decimal string. Negative for debits.",
        example: "125000",
      }),
    currency: CurrencyCodeSchema,
  })
  .openapi({
    description:
      "Currency-aware monetary value. `amount` is integer minor units (e.g. " +
      "haléře for CZK), serialised as a string so JS clients keep precision " +
      "on large numbers.",
  })
export type Money = z.infer<typeof MoneySchema>

/**
 * Cursor pagination — opaque cursors per Stripe convention. The server-side
 * implementation may swap the encoding without breaking clients.
 */
export const CursorSchema = z.string().min(1).max(512).openapi({
  description:
    "Opaque pagination cursor returned by the previous page. Do not parse.",
  example: "cur_2ZdAk5x",
})

export const PageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25).openapi({
      description: "Page size. 1–100; default 25.",
      example: 25,
    }),
    cursor: CursorSchema.optional(),
  })
  .openapi({
    description: "Cursor pagination query parameters.",
  })
export type PageQuery = z.infer<typeof PageQuerySchema>

/**
 * Generic page envelope. Use `pageOf(ItemSchema)` per response, e.g.
 * `pageOf(InvoiceSchema)`.
 */
export function pageOf<T extends z.ZodType>(item: T) {
  return z
    .object({
      data: z.array(item),
      next_cursor: CursorSchema.nullable().openapi({
        description:
          "Cursor for the next page, or `null` when the current page is last.",
      }),
      has_more: z.boolean().openapi({
        description: "`true` when more pages remain after this one.",
      }),
    })
    .openapi({
      description: "Cursor-paginated collection envelope.",
    })
}

/**
 * RFC 7807 Problem Details — surfaces alongside the Plaid envelope for clients
 * that prefer the standard `application/problem+json` shape. Not yet emitted
 * by the api; reserved for future content negotiation.
 */
export const ProblemDetailsSchema = z
  .object({
    type: z.url().openapi({
      description: "URI identifying the problem type.",
      example: "https://example.com/probs/validation",
    }),
    title: z.string(),
    status: z.number().int().min(100).max(599),
    detail: z.string().optional(),
    instance: z.string().optional(),
  })
  .openapi({
    description:
      "RFC 7807 Problem Details. Reserved for future `application/problem+json` " +
      "responses; the canonical error shape today is `ApiError`.",
  })
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>

import { z } from "zod"

import { AccountIdSchema } from "./primitives"
import "./zod-openapi"

/**
 * Public-API view of a chart-of-accounts entry (`account`). camelCase JSON;
 * the api maps from the snake_case row. The chart is per účetní období
 * (§14/3) and exists only for DOUBLE_ENTRY periods — SINGLE_ENTRY /
 * TAX_RECORDS orgs have no chart and list empty.
 *
 * The four structural levels (`class` / `groupCode` / `syntheticCode` /
 * `isSynthetic`) are GENERATED projections of `number` — read-only, never
 * settable. See `packages/db/src/schema/account.ts`.
 */
export const AccountSchema = z
  .object({
    id: AccountIdSchema,
    chartId: z.string().uuid().openapi({
      description: "The chart (účtový rozvrh) this account belongs to.",
      example: "0196f1de-0000-7000-8000-0000000000c1",
    }),
    periodId: z
      .string()
      .uuid()
      .openapi({
        description:
          "The účetní období the chart is scoped to. Accounts are minted fresh " +
          "(new ids) each period when the chart is copied forward.",
        example: "0196f1de-0000-7000-8000-0000000000d1",
      }),
    parentId: z
      .string()
      .uuid()
      .nullable()
      .openapi({
        description:
          "The synthetic account this analytical account rolls up to (§16), or " +
          "`null` for a synthetic account.",
        example: null,
      }),
    number: z.string().openapi({
      description:
        "Account number: class/group/synthetic/analytical, e.g. `311.001`.",
      example: "311.001",
    }),
    name: z.string().openapi({
      description: "Human-readable account name.",
      example: "Odběratelé — tuzemsko",
    }),
    nature: z.string().openapi({
      description:
        "Account nature (ASSET | LIABILITY | EQUITY | EXPENSE | REVENUE | " +
        "OFF_BALANCE).",
      example: "ASSET",
    }),
    normalBalance: z
      .enum(["DEBIT", "CREDIT"])
      .nullable()
      .openapi({
        description:
          "The side that increases the account, or `null` where the sign flips " +
          "(431, 481, FX accounts).",
        example: "DEBIT",
      }),
    tracksOpenItems: z.boolean().openapi({
      description:
        "Whether this account is kept on saldokonto (per-open-item tracking). " +
        "The one operator-chosen stored flag on an account.",
      example: true,
    }),
    class: z
      .number()
      .int()
      .nullable()
      .openapi({
        description:
          "Účtová třída 0–9, generated from the leading digit of `number` " +
          "(present for every account, including off-balance 8/9).",
        example: 3,
      }),
    groupCode: z
      .string()
      .nullable()
      .openapi({
        description:
          "Two-digit účtová skupina (generated), or `null` for off-balance " +
          "classes 8/9.",
        example: "31",
      }),
    syntheticCode: z.string().openapi({
      description:
        "Synthetic account code (generated from `number`): two digits for a " +
        "group-level account (e.g. `31`), three otherwise (e.g. `311`).",
      example: "311",
    }),
    isSynthetic: z.boolean().openapi({
      description:
        "`true` for a synthetic account, `false` for an analytical one " +
        "(generated from `parentId`).",
      example: false,
    }),
    specializesDirectiveCode: z
      .string()
      .nullable()
      .openapi({
        description:
          "Soft link to the 3-digit směrná-účtová-osnova catalogue code this " +
          "account specializes, or `null`.",
        example: "311",
      }),
  })
  .openapi({
    description:
      "A chart-of-accounts entry (účet) within one accounting period.",
  })
export type Account = z.infer<typeof AccountSchema>

/** `GET /v1/accounts` query — optional per-period / per-shape filters. */
export const ListAccountsQuerySchema = z
  .object({
    periodId: z
      .string()
      .uuid()
      .optional()
      .openapi({
        description:
          "Restrict to one účetní období. Omit to list every period's accounts " +
          "the tenant can see.",
        example: "0196f1de-0000-7000-8000-0000000000d1",
      }),
    isSynthetic: z.enum(["true", "false"]).optional().openapi({
      description:
        "Filter to synthetic (`true`) or analytical (`false`) accounts only.",
      example: "false",
    }),
  })
  .openapi({ description: "Filters for the chart-of-accounts list." })
export type ListAccountsQuery = z.infer<typeof ListAccountsQuerySchema>

/** `GET /v1/accounts` response — the tenant's chart-of-accounts entries. */
export const ListAccountsResponseSchema = z
  .object({
    accounts: z.array(AccountSchema).openapi({
      description: "Chart-of-accounts entries matching the filters.",
    }),
  })
  .openapi({
    description:
      "The organization's chart of accounts (organization-scoped, FORCE RLS). " +
      "Empty for non-DOUBLE_ENTRY orgs (they keep no chart).",
  })
export type ListAccountsResponse = z.infer<typeof ListAccountsResponseSchema>

/** `GET /v1/accounts/{accountId}` and PATCH response — a single account. */
export const GetAccountResponseSchema = z
  .object({ account: AccountSchema })
  .openapi({ description: "A single chart-of-accounts entry." })
export type GetAccountResponse = z.infer<typeof GetAccountResponseSchema>

/** Path param for the single-account operations. */
export const AccountIdParamSchema = z.object({
  accountId: AccountIdSchema.openapi({
    param: { name: "accountId", in: "path" },
  }),
})
export type AccountIdParam = z.infer<typeof AccountIdParamSchema>

/**
 * `PATCH /v1/accounts/{accountId}` body — narrow admin edit. Only the two
 * operator-editable columns are accepted: `name` and `tracksOpenItems`.
 * Structural / generated columns (`number`, `nature`, `normalBalance`,
 * `parentId`, the generated levels) are immutable through this surface —
 * changing them retroactively reclassifies posted history and is out of scope.
 * No tenant identifiers accepted — the server injects them from the API key.
 */
export const UpdateAccountRequestSchema = z
  .object({
    name: z.string().min(1).max(255).optional().openapi({
      description: "New account name.",
      example: "Odběratelé — EU",
    }),
    tracksOpenItems: z.boolean().optional().openapi({
      description: "Whether to keep this account on saldokonto.",
      example: true,
    }),
  })
  .openapi({
    description:
      "Partial edit of an account. At least one editable field must be " +
      "provided (the api rejects an empty body with 422).",
  })
export type UpdateAccountRequest = z.infer<typeof UpdateAccountRequestSchema>

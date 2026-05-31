# Runbook: Endpoint Addition

How to add a public API endpoint, step by step. Pairs with
`docs/conventions/ENDPOINT-ADDITION.md` (the design contract).

## TL;DR

```bash
# 1. Author the schema + register the path
$EDITOR packages/shared/src/api/invoices.ts
$EDITOR packages/shared/src/api/registry.ts

# 2. Implement the controller
mkdir -p apps/api/src/v1/invoices
$EDITOR apps/api/src/v1/invoices/invoices.controller.ts
$EDITOR apps/api/src/v1/v1.module.ts

# 3. Run codegen + tests
pnpm gen:all
pnpm --filter @workspace/shared --filter api --filter @afframe/sdk --filter @afframe/mcp test

# 4. Write the E2E test

# 5. Changeset
pnpm changeset

# 6. Verify everything
pnpm verify
```

## Step 1. Zod schema

`packages/shared/src/api/invoices.ts`

```typescript
import { z } from "zod"

import {
  InvoiceIdSchema,
  MoneySchema,
  OrganizationIdSchema,
} from "./primitives"
import "./zod-openapi"

export const InvoiceSchema = z
  .object({
    id: InvoiceIdSchema,
    organizationId: OrganizationIdSchema,
    legalName: z.string().openapi({ example: "Acme Czechia s.r.o." }),
    total: MoneySchema,
    issuedAt: z.iso.datetime(),
  })
  .openapi({ description: "Single invoice." })
export type Invoice = z.infer<typeof InvoiceSchema>

export const GetInvoiceResponseSchema = z
  .object({ invoice: InvoiceSchema })
  .openapi({ description: "Invoice fetch response." })
export type GetInvoiceResponse = z.infer<typeof GetInvoiceResponseSchema>
```

Every public field carries `.openapi({ description, example })`. The
SDK + the Scalar Reference at `api.afframe.com/` both surface these.

## Step 2. Register the path

`packages/shared/src/api/registry.ts`

```typescript
import { GetInvoiceResponseSchema, InvoiceSchema } from "./invoices"

const Invoice = registry.register("Invoice", InvoiceSchema)
const GetInvoiceResponse = registry.register(
  "GetInvoiceResponse",
  GetInvoiceResponseSchema,
)

registry.registerPath({
  method: "get",
  path: "/v1/invoices/{invoiceId}",
  operationId: "getInvoice",
  summary: "Get invoice",
  description: "Returns the invoice identified by `invoiceId`.",
  tags: ["Invoices"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ invoiceId: InvoiceIdSchema }),
  },
  responses: {
    "200": {
      description: "The invoice.",
      content: { "application/json": { schema: GetInvoiceResponse } },
    },
    ...ERROR_RESPONSE_REFS,
  },
})
```

Spread `ERROR_RESPONSE_REFS` — never re-declare the 401/403/404/409/422/429
responses on a single operation.

## Step 3. NestJS controller

`apps/api/src/v1/invoices/invoices.controller.ts`

```typescript
import { Controller, Get, Param, UseFilters, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import type { GetInvoiceResponse } from "@workspace/shared/api"
import { NotFoundError } from "@workspace/shared/errors"
import type { ApiKeyPrincipal } from "@workspace/auth/api-key-verifier"

import { ApiKeyGuard } from "../../auth/api-key.guard"
import { CurrentPrincipal } from "../../auth/principal.decorator"
import { DomainExceptionFilter } from "../domain-exception.filter"

@ApiTags("Invoices")
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@UseFilters(DomainExceptionFilter)
@Controller({ path: "invoices", version: "1" })
export class InvoicesController {
  @Get(":invoiceId")
  @ApiOperation({ summary: "Get invoice" })
  async getInvoice(
    @CurrentPrincipal() principal: ApiKeyPrincipal,
    @Param("invoiceId") invoiceId: string,
  ): Promise<GetInvoiceResponse> {
    // … look up the invoice scoped to principal.organizationId …
    throw new NotFoundError("Invoice not found")
  }
}
```

Mount on `V1Module`:

```typescript
@Module({
  controllers: [PingController, OrganizationController, InvoicesController],
})
export class V1Module {}
```

## Step 4. Codegen

```bash
pnpm gen:all
```

Regenerates in order:

1. `apps/api/openapi/v1.json` — `pnpm --filter api emit:openapi`
2. `packages/sdk/src/generated/openapi.ts` — `pnpm --filter @afframe/sdk gen`
3. `apps/mcp/src/tools/generated/getInvoice.ts` + `index.ts` —
   `pnpm --filter @afframe/mcp gen`

Commit every regenerated file. CI's `sdk-drift`, `mcp-coverage`, and
`openapi-lint` re-run the same pipeline and fail on any diff.

The pre-push `endpoint-checklist` lefthook hook catches the most common
"I edited the registry and forgot to regen" mistake before the push
even leaves your machine.

## Step 5. E2E test

```typescript
// apps/api/src/v1/invoices/invoices.controller.test.ts
it("404s when the invoice belongs to a different tenant", async () => {
  // … create invoice as tenant A, fetch as tenant B → 404 not_found …
})
```

Confirms RLS isolation. Skipping this is the single most common cause
of cross-tenant data leaks.

## Step 6. Changeset

```bash
pnpm changeset      # describe the surface change
```

Add a `.changeset/` entry summarising the surface change (new endpoint,
response field additions, etc.). `pnpm changeset status` fails the
release pipeline if this is missing.

## Step 7. Verify

```bash
pnpm verify         # typecheck + lint + test + boundaries + openapi-lint
```

## Common mistakes

- **Editing a `generated/` file.** It will be overwritten on the next
  `pnpm gen:all`. The CI drift gate will catch it; the PR review will
  reject it.
- **Accepting `organization_id` as input.** Always inject from the
  principal. The AI tool input schemas explicitly forbid this; the
  Cerbos policy bind would reject a request anyway.
- **Inlining error responses.** Always spread `ERROR_RESPONSE_REFS`.
- **Skipping the changeset.** `pnpm changeset status` fails the
  release pipeline.

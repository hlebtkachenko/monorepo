---
name: add-endpoint
description: |
  Walk a contributor through adding a public API endpoint to the
  Afframe monorepo. Triggers when the user says "add endpoint <resource>",
  "/add-endpoint <resource>", "scaffold an endpoint", "new public API
  operation", or invokes any phrasing that maps to the seven-step
  endpoint-addition workflow at
  `docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md`. The skill enforces the
  drift-gated codegen seam: every step in the right order, no hand-edits
  of `generated/` directories, no `organization_id` / `user_id` /
  `workspace_id` / `role` in request bodies.
---

# Add endpoint

## Trigger

- `/add-endpoint <resource>`
- "add an endpoint for invoices"
- "scaffold a new public API operation"
- "I need a `GET /v1/invoices/:invoiceId` endpoint"

## Pre-flight

Before writing any code:

1. **Read the runbook**: `docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md`.
   It has the exact diff for every step.
2. **Read the convention**: `docs/conventions/ENDPOINT-ADDITION.md`.
   Naming rules, error variants, breaking-change triggers.
3. **Check whether the resource exists already** in
   `packages/shared/src/api/`. If yes, add the operation to the existing
   resource file; don't create a new one.

## Hard rules (refuse if violated)

1. **Never hand-edit a `generated/` file.** Paths to refuse:
   `packages/sdk/src/generated/**`, `apps/mcp/src/tools/generated/**`.
   Regenerate via `pnpm gen:all`.
2. **Never declare `organization_id`, `user_id`, `workspace_id`, or `role`**
   as request input. The server injects all four from the API-key
   principal. AI tool input schemas, request bodies, and query
   parameters all forbid these.
3. **Never inline error responses.** Always spread `ERROR_RESPONSE_REFS`
   into the operation's `responses` map.
4. **Never skip the test triplet.** Per `docs/conventions/ENDPOINT-ADDITION.md`
   "Tests" section, every new operation needs (a) an E2E test that
   exercises cross-tenant isolation, (b) a per-error-code test for every
   variant the operation can emit (`not_found`, `forbidden`,
   `validation_error`, …), and (c) an SDK roundtrip test that calls the
   endpoint through `@afframe/sdk`.

## Seven-step workflow

For a worked example using `GET /v1/invoices/:invoiceId`, see the
runbook. The steps in order:

| #   | What               | Where                                                 |
| --- | ------------------ | ----------------------------------------------------- |
| 1   | Zod schema         | `packages/shared/src/api/<resource>.ts`               |
| 2   | Register operation | `packages/shared/src/api/registry.ts`                 |
| 3   | NestJS controller  | `apps/api/src/v1/<resource>/<resource>.controller.ts` |
| 4   | Codegen            | `pnpm gen:all` (regenerates spec + SDK + MCP)         |
| 5   | E2E test           | `apps/api/src/**/*.test.ts` or `apps/web/e2e/**`      |
| 6   | Changeset          | `pnpm changeset` (describe the surface change)        |
| 7   | Verify             | `pnpm verify` (typecheck + lint + test + boundaries)  |

## Open questions to ask the user before scaffolding

- **Resource name** (singular noun, kebab-case in URLs, camelCase in TS).
- **Operations needed** (list, get, create, update, delete, custom verbs).
- **Auth scopes** required per op (read / write / admin).
- **Idempotency** for mutations (always default yes; ask only if the
  user wants to opt out — rare).
- **Pagination** for list ops (default: cursor via `pageOf(…)`).
- **Whether the resource is tenant-scoped** (almost always yes; if no,
  flag a security-review checkpoint).

## Stop conditions

Refuse and report when:

- The diff would hand-edit a `generated/` file.
- The Zod schema declares `organization_id` / `user_id` / `workspace_id` / `role`.
- The user wants to ship without the test triplet (E2E tenancy test +
  per-error-code tests + SDK roundtrip test) defined in
  `docs/conventions/ENDPOINT-ADDITION.md`.
- The change is breaking (per
  `docs/conventions/ENDPOINT-ADDITION.md` § Breaking changes) and no
  major SDK bump or deprecation window is planned.

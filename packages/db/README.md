# @workspace/db

Multi-tenant Postgres runtime: client, tenancy helpers, schema, audit, migrations.

## Public surface

```ts
import {
  // Tenancy helpers — ALL queries go through these. ESLint enforces it
  // via workspace-rls/require-with-organization.
  withOrganization,   // organization-tier RLS scope
  withWorkspace,      // workspace-tier RLS scope
  withAdminBypass,    // BYPASSRLS — admin-only, gated on pg_has_role probe

  // Branded transaction types — never produced outside the helpers.
  type OrganizationBoundDb,
  type WorkspaceBoundDb,
  type AdminBypassDb,

  // Schema barrel (Drizzle table objects).
  // import { app_user, organization, ... } from '@workspace/db/schema'

  // Branded compile-time types for domain values.
  type Money,
  type Currency,
  type FxRate,
  type WorkspaceId,
  type OrganizationId,
  type UserId,
} from "@workspace/db"

import { writeToolCallLog, listAuditTimeline } from "@workspace/db/audit"
```

## Usage

```ts
import { withOrganization } from "@workspace/db"
import { tool_call_log } from "@workspace/db/schema"

await withOrganization(organizationId, userId, async (db) => {
  // db is OrganizationBoundDb. RLS GUCs are set; queries see only this org.
  const rows = await db.select().from(tool_call_log).limit(10)
  return rows
})
```

## Migrations

Handwritten SQL only. `drizzle-kit generate` and `drizzle-kit push` are
forbidden (ADR-0009); both scripts in `package.json` fail loudly.

```sh
pnpm db:migrate            # apply pending migrations (uses DATABASE_DIRECT_URL)
pnpm db:studio             # read-only Drizzle Studio against DATABASE_URL
```

## Layout

```
src/
  client.ts              # postgres-js + drizzle factory
  tenancy.ts             # withOrganization, withWorkspace, withAdminBypass
  types.ts               # Money, FxRate, branded IDs
  columns.ts             # money(name) helper
  policies/rls.ts        # declarative org-scoped table list + test helper
  audit/                 # write-log, query, get-detail, redact, registry
  schema/                # one Drizzle file per table + _enums.ts + index
  index.ts               # public barrel

migrations/              # handwritten SQL (0001–0011, see ADR-0009)
scripts/apply-migrations.ts  # runner with advisory lock + checksum drift
drizzle.config.ts        # config only for runtime type metadata
```

## Design references

- ADR-0009 — ORM and migration style
- ADR-0010 — Multi-tenant RLS design (workspace + organization tiers)
- ADR-0011 — Audit log (two-table append-only, two-pass redaction)
- ADR-0013 — Money + FX representation

## Constraints summary (for contributors)

1. **No raw `db.transaction|select|insert|update|delete|execute` outside
   `packages/db/src/`.** Use a helper. ESLint will block it.
2. **No bare `SET LOCAL app.*` strings outside the tenancy helpers.** ESLint
   blocks it; the helpers use `set_config(..., true)` exclusively.
3. **No hardcoded role-name string literals** (`'app_user'`, etc.) in runtime
   code. Role identity comes from `app.app_user_role_name` GUC set per role in
   `infra/compose/postgres/init.d/00-roles.sql`.
4. **No `drizzle-kit generate` or `drizzle-kit push`.** Migrations are
   handwritten. The `_journal.json` is intentionally empty.
5. **Money columns use the `money(name)` helper.** Never raw
   `numeric(19, 4)` — the helper attaches the `Money<Currency>` brand.

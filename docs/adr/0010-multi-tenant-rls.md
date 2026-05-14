# 10. Multi-tenant RLS design (workspace + organization tiers)

- Status: Accepted
- Date: 2026-05-11 (Accepted 2026-05-14)
- Deciders: Hleb Tkachenko
- Related: ADR-0018 (three-layer authz extends this with OpenFGA + Cerbos)

## Context and Problem Statement

The platform is a multi-tenant accounting tool. A single PostgreSQL database hosts data for
multiple client organizations, each belonging to exactly one accountant workspace. A query
that leaks one organization's data to another is a critical compliance failure under GDPR,
DORA, and Czech AML regulations.

Three approaches are possible: app-layer filtering (WHERE clauses in every query), database
views with built-in predicates, or PostgreSQL Row Level Security. The choice affects where
the enforcement boundary sits and whether a missing WHERE clause silently returns wrong data
or loudly fails.

The platform uses the Drizzle ORM, which generates arbitrary SQL at compile time and runtime.
No single abstraction in the ORM layer can guarantee that every generated query carries the
correct WHERE clause. A higher-level, DB-enforced mechanism is required.

## Decision

Row Level Security with FORCE mode is used for every tenant-scoped table. GUCs
(`app.organization_id`, `app.workspace_id`, `app.user_id`, `app.app_user_role_name`) are set
inside transaction-scoped TypeScript helpers (`withOrganization`, `withWorkspace`,
`withAdminBypass`) that are the only permitted entry points for tenant-scoped queries.

## Three-tier scoping model

| Tier | GUC set | Covers |
|------|---------|--------|
| Global | none | Identity tables: `app_user`, `workspace`, `invitation`. No RLS. |
| Workspace | `app.workspace_id` + `app.user_id` | Accountant office: workspace settings, billing, cross-org audit dashboards. |
| Organization | `app.organization_id` + `app.workspace_id` + `app.user_id` | Client books: `organization`, `tool_call_log`, ledger, invoices, contacts. |

`withOrganization` also derives and sets `app.workspace_id` from the organization row inside
the same transaction so workspace-tier policies resolve correctly without a nested
`withWorkspace` frame.

## GUC contract

All four GUCs are set via `set_config(name, value, true)` (is_local = true). This is
transaction-scoped and safe under pgBouncer transaction pooling: the GUC reverts to the
session default when the transaction commits or rolls back. No bare `SET` or `SET LOCAL`
statements are used in application code; the `workspace-rls/no-set-local-outside-wrapper`
ESLint rule closes that escape hatch.

Policy USING expressions use the NULLIF guard:

```sql
organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
```

This returns NULL (no match) rather than a cast error when the GUC is unset or empty. The
pattern is applied consistently in migrations 0003 and 0004.

The four GUCs and their purpose:

| GUC | Type | Set by |
|-----|------|--------|
| `app.organization_id` | uuid text | `withOrganization` |
| `app.workspace_id` | uuid text | `withOrganization`, `withWorkspace` |
| `app.user_id` | uuid text | `withOrganization`, `withWorkspace` |
| `app.app_user_role_name` | text | `ALTER ROLE` in init.d/00-roles.sql (not set by runtime helpers) |

`app.app_user_role_name` is **not** set by runtime helpers. It is configured per role via
`ALTER ROLE ... SET app.app_user_role_name = '...'` in `infra/compose/postgres/init.d/00-roles.sql`.
The last-owner-demotion trigger on `workspace_membership` reads this GUC to distinguish the
application role from the admin bypass role. `withAdminBypass` uses `SET LOCAL ROLE app_admin`
and relies on the per-role GUC default; the runtime helpers do not set
`app.app_user_role_name` directly.

**Consequence for test environments without init.d**: the trigger fails closed when the GUC
is NULL. Testcontainer setups must apply equivalent `ALTER ROLE` statements at boot, or set
`app.app_user_role_name` explicitly via `SET` on the test connection, or the first
`workspace_membership` write through any helper will raise `check_violation`. This is
intentional fail-closed behavior; do not paper over it with a runtime default.

## Branded types + helpers

Three TypeScript-level constructs enforce the contract at the call site:

```typescript
// packages/db/src/tenancy.ts
export type OrganizationBoundDb = AnyTx & { readonly [organizationBrand]: true }
export type WorkspaceBoundDb    = AnyTx & { readonly [workspaceBrand]: true }

export async function withOrganization<T>(
  organizationId: string,
  userId: string | null,
  fn: (db: OrganizationBoundDb) => Promise<T>,
  outerTx?: AnyTx,
): Promise<T>

export async function withWorkspace<T>(
  workspaceId: string,
  userId: string,
  fn: (db: WorkspaceBoundDb) => Promise<T>,
  outerTx?: AnyTx,
): Promise<T>

export async function withAdminBypass<T>(
  fn: (db: Db) => Promise<T>,
  outerTx?: AnyTx,
): Promise<T>
```

`OrganizationBoundDb` and `WorkspaceBoundDb` are compile-time brands using unique symbols.
A raw `Db` variable cannot be passed where `OrganizationBoundDb` is expected; the TypeScript
compiler rejects the assignment at the property level (the brand symbol is absent). The cast
from `AnyTx` to the branded type happens exactly once inside each helper, after all GUCs are
set.

`withAdminBypass` probes `pg_has_role(current_user, 'app_admin', 'MEMBER')` before the role
switch. A failing `SET LOCAL ROLE` aborts the transaction and poisons subsequent statements;
the defensive probe converts that to a loud application-level error with a remediation hint.

## Composability (nested helpers)

All three helpers accept an optional `outerTx` parameter to nest inside an existing
transaction via SAVEPOINT. When `outerTx` is provided, the helper snapshots the prior GUC
values before running `fn` and restores them in the `finally` block regardless of outcome.

The save/restore pair is load-bearing: `set_config(name, value, true)` is transaction-scoped,
not SAVEPOINT-scoped. `ROLLBACK TO SAVEPOINT` undoes data changes but does NOT undo a
`set_config` call made inside the SAVEPOINT. Without explicit restore, a nested
`withOrganization('org-B', ...)` inside a `withOrganization('org-A', ...)` would leave
`app.organization_id = org-B` for the remainder of the outer transaction.

## ESLint enforcement

The `workspace-rls/require-with-organization` rule forbids raw calls to `db.transaction`,
`db.select`, `db.insert`, `db.update`, `db.delete`, and `db.execute` on any identifier named
`db` or ending in `Db` outside `packages/db/src/`. Files under `packages/db/src/` are the
helpers themselves and are explicitly excluded. The rule is wired as `"error"` in
`packages/eslint-config/base.js` under the `workspace-rls` plugin namespace.

## Consequences

Positive:

- Enforcement is in the database engine, not in the ORM layer. A missed WHERE clause
  returns zero rows or errors rather than leaking data.
- FORCE mode applies the policy even to the table owner (app_admin). Only a superuser
  bypasses FORCE RLS.
- The branded-type pattern produces compile-time errors when application code skips the
  helper wrappers.
- GUC save/restore makes nested helpers composable without risk of cross-tenant leakage
  within a single request.

Negative / trade-offs:

- Every query inside a tenant-scoped context requires an open transaction (no autocommit
  queries). This is intentional but adds one round-trip per helper entry.
- Raw SQL via `tx.execute(sql\`...\`)` bypasses the brand: the TypeScript compiler cannot
  inspect the SQL string. The `no-set-local-outside-wrapper` rule catches attempts to inject
  GUCs via raw SQL strings, but not arbitrary table-bypassing queries.
- pgBouncer session-mode pooling would break the GUC contract. The platform uses transaction
  mode only; `DATABASE_DIRECT_URL` pointing at port 5432 is required for migrations.

Follow-up work required:

- Add pgTAP tests that verify each organization-scoped table blocks cross-tenant reads
  when `app.organization_id` is set to a different org's UUID.
- Add the `app_owner` + `app_admin` + `app_user` role grants to the CI testcontainer
  init script so `withAdminBypass` probe succeeds in test environments.
- Extend `ORGANIZATION_SCOPED_TABLES` in `packages/db/src/policies/rls.ts` as new
  tenant-scoped tables are added. Failing to do so creates a silent enforcement gap.

## Alternatives considered

- **App-layer filtering (WHERE clauses in every query)** — rejected. A single missing
  WHERE clause leaks data silently. The ORM produces arbitrary SQL; no abstraction in the
  app layer can guarantee completeness. Defense-in-depth requires a DB-enforced layer.

- **Postgres views with built-in predicates** — rejected. Views can embed GUC-based
  predicates but only for SELECT. INSERT/UPDATE/DELETE require WITH CHECK OPTION or triggers
  which add the same complexity as FORCE RLS without the FORCE guarantee. Views also
  complicate Drizzle schema definitions and migration tooling.

- **Row Security Policy without FORCE** — rejected. Standard RLS (without FORCE) is
  bypassed by the table owner. The application role (`app_user`) is not the table owner
  (`app_owner`), but `withAdminBypass` switches to `app_admin` which inherits from
  `app_owner`. Without FORCE, `app_admin` queries bypass the policy entirely, making the
  bypass route unauditable. FORCE mode ensures the policy fires even for `app_admin`; only
  the literal superuser bypasses it.

## See also

- `packages/db/src/tenancy.ts` — `withOrganization`, `withWorkspace`, `withAdminBypass`
- `packages/db/src/policies/rls.ts` — `ORGANIZATION_SCOPED_TABLES`, `applyOrganizationPolicy`
- `packages/eslint-config/rules/require-with-organization.js`
- `packages/eslint-config/rules/no-set-local-outside-wrapper.js`
- `packages/db/migrations/0003_rls_force.sql` — FORCE RLS + policy for `organization`
- `packages/db/migrations/0004_audit.sql` — FORCE RLS + policy for `tool_call_log`
- ADR 0011 — audit log append-only design (uses `withOrganization` as a pre-condition)

# 25. Accounting Records System — shared capture core, regime-branched posting

- Status: Accepted
- Date: 2026-06-22
- Deciders: Hleb Tkachenko

## Context and Problem Statement

The platform must support three Czech bookkeeping regimes simultaneously: podvojné účetnictví
(zákon č. 563/1991 Sb. §13), jednoduché účetnictví (§13b), and daňová evidence (§7b ZDP). Each
regime has different posting mechanics and legal output obligations, but every economic event
begins with the same statutory chain: fact → source document → money decomposition → posting.
The problem was whether to build three separate pipelines or a shared capture core with
regime-specific posting tails.

Multi-tenant isolation was a second load-bearing question. The platform uses FORCE RLS keyed on
the `app.organization_id` GUC. PostgreSQL referential-integrity checks run as the table owner and
bypass RLS, which means a child row in org X can reference a parent row in org Y through a
plain single-column FK — RLS alone is not enough.

A third question was money representation. The repo already has a compile-time `Money<Currency>`
brand type (ADR-0013), but accounting amounts live in SQL-visible `numeric(19,4)` columns where
precision must be exact end-to-end with no JS float involved.

## Decision

**Shared capture core, regime-branched posting.** All three regimes feed the same four-table
capture pipeline: `ucetni_pripad` (the economic fact, §6/1) → `ucetni_doklad` (the source
document, §11) → `doklad_radek` (one line per case documented, §4/11) → `dilci_zaznam` (money
decomposition: base/VAT/rounding, §33/5). Posting (Zaúčtování, §6/2) creates a shared
`ucetni_zapis` header, then branches by regime: `zapis_radek` (MD/Dal lines against `ucet` in the
`uctovy_rozvrh`) for PODVOJNE, or `penezni_denik_radek` (classified cash-book rows, §9) for
JEDNODUCHE and DANOVA_EVIDENCE.

**Tenancy via composite FKs on `organization_id`.** Because FK checks bypass RLS, every
tenant-scoped table carries both its own PK and a `UNIQUE(id, organization_id)` target
constraint. Every child-to-parent FK is composite — `(fk_id, organization_id) → parent(id,
organization_id)` — so cross-tenant referencing is structurally impossible even when RLS is not
in effect. `ucetni_jednotka` has a `UNIQUE organization_id` constraint (strict 1:1 with
`organization`), so org-consistency implies accounting-unit-consistency throughout the FK chain.
External lookup stubs (`protistrana`, `majetek`) are organization-scoped for RLS but do not carry
`jednotka_id` per spec §5.7.

**Regime-branch enforcement is declarative.** `ucetni_zapis` carries a
`UNIQUE(id, organization_id, regime)`. Both posting-line tables denormalize `regime` and use a
composite FK `(zapis_id, organization_id, regime) → ucetni_zapis(id, organization_id, regime)`,
plus a `CHECK` that pins each table to its regime set (`regime = 'PODVOJNE'` on `zapis_radek`;
`regime IN ('JEDNODUCHE', 'DANOVA_EVIDENCE')` on `penezni_denik_radek`). Soundness relies on
`ucetni_zapis.regime` being immutable after insert — guaranteed by the append-only BEFORE
UPDATE/DELETE triggers in migration 0027 (R8).

**Money as exact decimal in SQL, decimal strings in TypeScript.** SQL columns are
`numeric(19,4)`. The TypeScript layer transports amounts as the `Decimal = string` alias (e.g.
`"121.00"`) with zero JS arithmetic. All sums, balances, and output figures are computed in SQL
via `SUM(castka) FILTER (...)`. The `Money<Currency>` brand from ADR-0013 is compile-time only
and is not used in this domain; bigint minor-unit conversion would add no safety on top of
`numeric(19,4)` and would require an extra round-trip through JS (R13).

**Books are `security_invoker` views.** The five accounting books (deník, hlavní kniha, kniha
analytických účtů, kniha podrozvahových účtů, peněžní deník) are SQL views with
`WITH (security_invoker = on)`. The PostgreSQL default (`security_definer` semantics for views)
would run base-table RLS as the view owner (`app_owner`), bypassing `organization_isolation` and
leaking cross-org data. `security_invoker` makes RLS evaluate as the querying role (`app_user`),
so each table's policy applies. Views are not added to the RLS-policy loop (for tables only) and
receive explicit `GRANT SELECT TO app_user` in migration 0028.

**Invariant enforcement is split between the DB and the service layer.** DB triggers handle the
invariants that must not be bypassed regardless of caller:

- R4 (double-entry balance): deferred constraint trigger on `ucetni_zapis` and `zapis_radek`;
  fires at COMMIT so multi-line inserts are legal mid-transaction.
- R7 (regime branch): CHECK constraints plus the composite-FK trick above.
- R8 (append-only posting): BEFORE UPDATE/DELETE row triggers + BEFORE TRUNCATE statement
  triggers on `ucetni_zapis`, `zapis_radek`, and `penezni_denik_radek`.
- R12 (closed period): BEFORE INSERT trigger on `ucetni_zapis` and `ucetni_doklad`.

Service-layer enforcement covers invariants that need business context:

- R5 (analytical reconciliation, §16): `reconcileAnalytics()` query.
- R6 (completeness gate): `unpostedCases()` checked inside `generateOutput()` before a
  `vystup` row is created.
- R9 (output derived, not entered): `buildZaverka / buildPrehledy / buildDpfo` compute from
  SQL aggregates; no manual figures accepted.
- R11 (bidirectional audit trail): `traceAccount()` and `tracePripad()` queries.

**`DANOVA_EVIDENCE` uses the shared `ucetni_zapis` header as a technical container.** Daňová
evidence is governed by §7b ZDP, not by zákon č. 563/1991 Sb.; its `ucetni_zapis` rows are
not legal účetní záznamy. The shared header is reused for implementation simplicity; callsites
and comments make the distinction explicit.

## Consequences

Positive:

- One capture pipeline means one code path for document creation, signature recording, and
  period membership — no per-regime duplication.
- Composite-FK tenancy is enforced structurally; a misconfigured GUC cannot cause cross-org
  data leakage through FK traversal.
- Exact decimal arithmetic in SQL eliminates floating-point drift in all amount columns and
  all output figures.
- `security_invoker` views mean book queries inherit the caller's RLS policies automatically;
  no additional filtering logic is needed in the service layer.
- Deferred constraint trigger for R4 allows a PODVOJNE posting to be built line-by-line
  inside one transaction without requiring all lines to be inserted atomically.
- Append-only triggers for R8 are role-independent — even a superuser cannot silently corrupt
  the ledger without bypassing the trigger.

Negative / trade-offs:

- Denormalizing `regime` into both posting-line tables adds one column per row and a CHECK per
  table. This is the price of the declarative R7 guarantee.
- Composite FKs are wider than single-column FKs and slightly increase index footprint.
- `security_invoker` views cannot be used as FK targets; any integrity constraint that needs
  a view as its reference must be done at the base-table level.
- `DANOVA_EVIDENCE` routing through `ucetni_zapis` means the header table mixes legal accounting
  records with technical records. The distinction is documented but requires discipline at
  callsites.
- The `app_user` role inherits DML from `app_admin` (migration 0002); the REVOKE of UPDATE/DELETE
  on posting tables is currently inert until that inheritance is severed. The triggers are the
  real enforcement.

Follow-up work required:

- HTTP API layer (Zod schema, OpenAPI registry, SDK codegen, MCP tool) — deferred per spec §11.
- DPH/VAT returns, kontrolní hlášení — deferred.
- Multi-currency / FX — deferred (CZK only for MVP, §4/12).
- Full `protistrana` / `majetek` / `kategorie` design — deferred (stubs per §5.7).
- `přehled o majetku a závazcích` in PREHLEDY output — deferred.
- Statutory formatted layouts (rozvaha, VZZ form) — deferred.
- E-signatures (§33a) — MVP uses `odpovedna_osoba` UUID + timestamp; full §33a deferred.

## Alternatives considered

- **Three independent pipelines** — rejected. The capture phase is identical for all regimes
  (§11, §33/5), so three pipelines would triple the document/signature/period code with no
  benefit.
- **Merge `ucetni_jednotka.id` with `organization.id`** — rejected by the advisor review.
  Fusing PKs would couple the accounting schema to the identity schema and make future
  many-units-per-org impossible. Strict 1:1 via `UNIQUE(organization_id)` is sufficient.
- **RLS-only tenancy (no composite FKs)** — rejected. PostgreSQL FK checks bypass RLS; a
  composite-FK lattice is the only structural guarantee.
- **JS money arithmetic with `Money<Currency>` bigint** — rejected for this domain. The
  `Money<Currency>` brand is a compile-time check only (ADR-0013, no runtime enforcement).
  SQL `numeric(19,4)` with decimal strings gives exact arithmetic where the amounts actually
  live, at lower complexity.
- **`security_definer` views** — rejected. Default view semantics evaluate RLS as the view
  owner, bypassing `organization_isolation`; this would allow one org to read another's books
  through the view.

## See also

- [ADR-0010](0010-multi-tenant-rls.md) — FORCE RLS and `organization_isolation` policy
- [ADR-0013](0013-money-and-fx.md) — `Money<Currency>` brand; why bigint minor units are not used here
- [ADR-0009](0009-orm-and-migration-style.md) — migration style (plain `CREATE`, no `IF NOT EXISTS`)
- `docs/specs/accounting-records-system.md` — entity-relationship reference and invariant map
- `packages/accounting/src/` — domain layer implementation
- `packages/db/migrations/0024_accounting_enums_core.sql` through `0028_accounting_views.sql`
- `.context/accounting/PLAN-v2-resolutions.md` — advisor-hardened design notes

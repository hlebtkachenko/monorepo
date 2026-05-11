# 13. Money + FX representation: `numeric(19,4)` storage + `Money<Currency>` brand

- Status: **Proposed**
- Date: 2026-05-11
- Deciders: Hleb Tkachenko

## Context and Problem Statement

The platform is an accounting tool. Every amount that lands in the database is regulated:
under Czech law (zákon č. 563/1991 Sb. and the implementing decrees), recorded amounts must
preserve every haléř (1/100 CZK) of precision, support proportional VAT splits, and be
expressible across foreign-currency invoices via documented FX rates with traceable source
and date.

Native JavaScript `number` is IEEE 754 double-precision binary, which cannot represent
0.1 exactly. Multiplying two amounts in `number` produces silent rounding error that
accumulates across journal lines; a four-line journal where each line is computed as a
fraction of a parent invoice can drift from balance by 0.001 CZK over a year of activity.
PostgreSQL's `decimal` / `numeric` is exact arbitrary precision but TypeScript values
arrive as strings; mixing those strings into arithmetic via `parseFloat` re-introduces the
binary float bug.

A second problem: amounts in different currencies are not interchangeable. A function
`convertToCzk(amount, fromCurrency)` that accepts two unbranded `number` arguments invites
calls like `convertToCzk(amountUsd, 'EUR')`. The type system cannot help. The wrong-currency
bug is a regulatory issue (incorrect VAT base, wrong CIT exposure) that linters cannot catch.

A third problem: FX conversion has documented rules under Czech accounting practice. The
rate for a given (currency_from, currency_to, date) tuple comes from the organization's
declared rate source (typically the Czech National Bank daily fix), is never auto-inverted
(EUR→CZK rate is not 1/(CZK→EUR rate) in the legal sense), and is never substituted from
a neighboring date if missing — a missing rate must raise an error so the user can supply
a manual override or wait. A naive `getFxRate(from, to, date)` helper that returns the
nearest available rate is a compliance violation.

## Decision

Storage: `numeric(19, 4)` in PostgreSQL for every monetary column. 19 digits total,
4 after the decimal point. Precision sufficient for trillions of CZK with sub-haléř
resolution.

TypeScript: `Money<Currency>` branded type. Compile-time only, no runtime cost. The brand
encodes the currency in the type parameter, so `Money<'CZK'>` and `Money<'EUR'>` are
incompatible at the type level. Currency conversion goes through `FxRate.convert(money)`
which returns a new `Money<TargetCurrency>` with the rate applied.

Helper: `money(name)` factory in `packages/db/src/columns.ts` wraps Drizzle's `numeric`
column declaration with `.$type<Money<Currency>>()` so every money column in the schema
files carries the brand through to consumer types.

FX rates: `FxRate<From, To>` struct holds `{ rate: decimal, source: string, observed_at:
timestamptz, currency_from: Currency, currency_to: Currency }`. `FxRate.convert(money:
Money<From>): Money<To>` is the only call site; no `convertToCzk`, no `inverse()`, no
`nearestRate()`. Missing-rate cases raise `FxRateNotFoundError` to the caller.

## Three known limitations of the brand

Branded types are TypeScript-level only. Three escape hatches exist:

1. **`db.execute(sql\`SELECT amount FROM invoice\`)`** returns `unknown[]`. The brand is
   lost. Callers that bypass the schema-builder API and write raw SQL must manually assert
   `Money<Currency>` on the read. The `workspace-rls/require-with-organization` ESLint rule
   forbids raw `db.execute` outside `packages/db/src/`, which closes most of this hole.

2. **JSON serialization.** `JSON.stringify(money)` yields a string. Deserializing via
   `JSON.parse` loses the brand. API boundaries that send Money over the wire must
   round-trip through a Zod schema that re-brands.

3. **Migration-generated values.** When a database trigger or migration computes a money
   value (e.g., a SUM in a balance-invariant constraint), the value enters the application
   layer through a `db.select` that returns the column-typed result. The Drizzle `$type`
   declaration carries the brand here, so this case is closed via the `columns.ts` helper.

The brand is documented as "compile-time guarantee with three known leaks" rather than
sold as runtime-safe.

## FX rate rules (the non-obvious part)

| Rule | Why |
|------|-----|
| **Never auto-invert.** EUR→CZK at 24.50 does NOT imply CZK→EUR at 0.040816. | Under CZ accounting practice, each direction is a separately declared rate. An organization can have a CZK→EUR rate from the CNB and a EUR→CZK rate from a commercial bank. Auto-inverting masks the difference. |
| **Never substitute neighbor date.** Friday's rate is not Saturday's rate. | Czech accounting law requires the rate for the booking date, not the nearest available date. Substituting silently rewrites the legal record. |
| **Precedence: org override → CNB daily fix → error.** | Organizations can declare manual rates for specific dates (e.g., a forward contract closing rate). Manual override beats the CNB rate. Missing both: caller error. |
| **Books are CZK-only in v1.** Foreign postings carry both native amount and CZK amount. | Czech statutory bookkeeping is CZK; foreign-currency invoices are recorded at booking-date rate and revalued at year-end per §24(6) of zákon 563/1991 Sb. v1 ships single-currency reporting; multi-currency reporting comes when accounting bundle ships. |

`FxRate.convert` enforces all four. There is no `FxRate.nearestRate`, no `FxRate.inverse()`,
no autoconversion fallback. A missing rate raises and the caller decides (UI prompts for
manual rate, batch import logs and skips, etc.).

## Alternatives considered

- **`bigint` minor units (CZK in haléř as a JavaScript `bigint`).** Considered. Rejected
  for v1 because the schema's `numeric(19, 4)` carries 4 decimal places, not 2; some asset
  classes need sub-haléř resolution (fractional shares, foreign-currency conversions with
  intermediate steps). `bigint` minor units would force a separate "scale" column per
  amount or commit to two decimal places everywhere. The branded `Money<Currency>` over
  `numeric(19, 4)` is simpler and matches the lac production schema.

- **`decimal.js` runtime class.** Considered. Rejected: every read from the database
  becomes an object construction, every write a serialization. The performance overhead is
  measurable on bulk imports (thousands of rows per second). The branded primitive-typed
  approach achieves the same compile-time safety with zero runtime cost.

- **Money as an opaque class with methods (`money.add(other)`, `money.scale(0.5)`).**
  Considered. Rejected because TypeScript's class type identity is structural by default;
  the brand provides a tighter compile-time check without requiring every consumer to
  instantiate a class. Arithmetic helpers live as free functions in the future
  `@workspace/finance` package.

- **Multiple decimal precisions per use case (`numeric(13, 2)` for invoices,
  `numeric(19, 6)` for FX intermediate results).** Considered. Rejected because the
  variation invites accidental cross-table assignment that silently truncates. Single
  precision across all money columns means the only conversion friction is the brand,
  not the storage format.

- **Always-store-in-CZK + foreign-amount in jsonb.** Considered. Rejected because journal
  entries against foreign-currency bank accounts need direct queryability of the foreign
  amount (`SELECT sum(amount) FROM ledger_entry WHERE account_id = (eur_bank) AND currency
  = 'EUR'`). Foreign-amount-in-jsonb makes that an unindexable expression scan.

## Consequences

Positive:

- Storage is exact. Arithmetic in the database is exact. Application code that obeys the
  schema-builder API gets compile-time currency safety with zero runtime cost.
- FX semantics are encoded in code; missing rates fail loudly instead of silently
  substituting.
- The schema can support multi-currency journals (foreign amount + CZK amount per line)
  without precision loss.
- Compatibility with lac production schema; ports of accounting logic do not need
  re-typing.

Negative / trade-offs:

- The brand is compile-time. Raw `db.execute` and JSON deserialization can lose it;
  documented and partly closed by ESLint, but the discipline matters.
- Every foreign-currency line carries two amounts (native + CZK), so storage cost is ~2x
  per foreign line. Acceptable: foreign-currency lines are the minority.
- TypeScript narrowing on union currency types (`Money<'CZK' | 'EUR'>`) requires explicit
  narrowing in the caller; the type system cannot infer which case applies without runtime
  knowledge.
- No runtime check that the `Currency` brand on a database read matches the actual column
  currency. If the schema mislabels a column, the type system lies. Caught by integration
  tests in Section 3.

Follow-up work required:

- `@workspace/finance` package (or expanded `@workspace/db`) housing `FxRate.convert`,
  rate lookup, and exception types. Out of scope for Section 2.
- `fx_rate` table schema + RLS + ingest job for CNB daily rates. Out of scope until
  accounting bundle ships.
- Zod schema for `Money<Currency>` round-trip across the API boundary. Out of scope
  until first API exposes money in payload.
- Integration test asserting that a `numeric(19, 4)` column read through Drizzle returns
  a value the TypeScript layer accepts as `Money<C>` (the brand survives the round-trip
  via `$type`).

## Code anchors

- `packages/db/src/types.ts` — `Money<Currency>`, `Currency`, `FxRate<From, To>` shapes.
- `packages/db/src/columns.ts` — `money(name)` helper.
- `packages/db/migrations/*.sql` — any future migration adding a money column uses the
  `numeric(19, 4)` type.

## See also

- ADR-0009 — ORM and migration style (governs how this typing convention lands in schema
  files).
- ADR-0010 — Multi-tenant RLS design (money columns inherit organization-tier RLS like
  any other column).
- ADR-0011 — Audit log design (money values in tool_call_log payloads also go through
  redaction; amounts above a threshold may be redacted to range bands in future).
- Future ADR-0014 — FX rate ingest + override (Section 3 or accounting-bundle).
- `CLAUDE.md` "Domain Rules" — repeats the no-auto-invert and no-neighbor-date rules as
  hard constraints.
- ADR-0012 (reserved) — Local Postgres infrastructure (Section 3); reserved slot.

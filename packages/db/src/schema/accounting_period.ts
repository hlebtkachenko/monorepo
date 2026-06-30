/**
 * accounting_period — one účetní období. regime fixed per period (immutable until
 * closed); size assessed at period_end (§1b). period_start/end cover transitions.
 *
 * Mirrors: packages/db/migrations/0026_accounting_organization_reshape.sql (CREATE TABLE accounting_period)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * Carries three UNIQUE targets used by composite FKs across the schema:
 *   - (id, organization_id)              — tenancy target
 *   - (id, organization_id, regime_code) — the regime spine target (posting/chart pin)
 * Triggers / RLS / CHECK constraints live in the migration, not this DSL.
 */
import {
  char,
  date,
  boolean,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { fxRateKind, periodStatus } from "./_enums"
import { accounting_size } from "./accounting_size"
import { currency } from "./currency"
import { organization } from "./organization"
import { regime } from "./regime"

export const accounting_period = pgTable(
  "accounting_period",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    period_start: date("period_start").notNull(),
    period_end: date("period_end").notNull(),
    status: periodStatus("status").notNull().default("OPEN"),
    regime_code: text("regime_code")
      .notNull()
      .references(() => regime.code),
    accounting_size_code: text("accounting_size_code").references(
      () => accounting_size.code,
    ), // null until assessed
    accounting_currency: char("accounting_currency", { length: 3 })
      .notNull()
      .references(() => currency.code), // měna účetnictví (§4/12), 1/org/period
    // §24a: accounting_currency must be a functional currency. Gated by the generated-constant
    // + composite-FK idiom (regime-spine pattern); read-only projection.
    accounting_currency_is_functional: boolean(
      "accounting_currency_is_functional",
    ).generatedAlwaysAs(sql`true`),
    fx_rate_policy: fxRateKind("fx_rate_policy"), // §24 směrnice: DAILY | FIXED; NULL = default DAILY
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("accounting_period_id_org_unique").on(t.id, t.organization_id),
    unique("accounting_period_id_org_regime_unique").on(
      t.id,
      t.organization_id,
      t.regime_code,
    ),
    // §24a functional-currency gate (migration 0036): only currencies flagged
    // is_functional_currency may be a měna účetnictví.
    foreignKey({
      name: "accounting_period_functional_currency_fk",
      columns: [t.accounting_currency, t.accounting_currency_is_functional],
      foreignColumns: [currency.code, currency.is_functional_currency],
    }),
  ],
)

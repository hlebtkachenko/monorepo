/**
 * chart_of_accounts — one účtový rozvrh per účetní období (§14/3).
 *
 * Mirrors: packages/db/migrations/0028_accounting_chart.sql (CREATE TABLE chart_of_accounts)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * regime_code is a GENERATED constant ('DOUBLE_ENTRY'), so the composite FK to the
 * period's 3-col unique proves this org's DOUBLE_ENTRY period (D5 regime gate,
 * unbypassable, no separate CHECK). Composite FK + the three UNIQUEs (one-per-period,
 * id-org, id-period) mirrored below. Triggers / RLS / CHECK constraints live in the
 * migration, not this DSL.
 */
import {
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { accounting_period } from "./accounting_period"

export const chart_of_accounts = pgTable(
  "chart_of_accounts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id").notNull(),
    period_id: uuid("period_id").notNull(),
    // GENERATED ALWAYS AS ('DOUBLE_ENTRY') STORED — read-only projection
    regime_code: text("regime_code").generatedAlwaysAs(sql`'DOUBLE_ENTRY'`),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "chart_period_regime_fk",
      columns: [t.period_id, t.organization_id, t.regime_code],
      foreignColumns: [
        accounting_period.id,
        accounting_period.organization_id,
        accounting_period.regime_code,
      ],
    }),
    unique("chart_one_per_period").on(t.period_id),
    unique("chart_id_org_unique").on(t.id, t.organization_id),
    unique("chart_id_period_unique").on(t.id, t.period_id),
  ],
)

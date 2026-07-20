/**
 * period_output (vystup §5.5) — R9-derived output marker, append-only.
 *
 * Mirrors: packages/db/migrations/0033_accounting_output_read_surface.sql (CREATE TABLE period_output)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * R9-DERIVED (no number column); NOT unique on (period_id, type) — append-only
 * re-issues (opravná / mimořádná / mezitímní závěrka) are allowed. The append-only
 * block (no UPDATE/DELETE) is a migration trigger, not this DSL.
 */
import {
  foreignKey,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { periodOutputType } from "./_enums"
import { accounting_period } from "./accounting_period"
import { app_user } from "./app_user"
import { organization } from "./organization"

export const period_output = pgTable(
  "period_output",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    period_id: uuid("period_id").notNull(), // obdobi_id (§5.5)
    type: periodOutputType("type").notNull(), // FINANCIAL_STATEMENTS / OVERVIEWS / PERSONAL_INCOME_TAX
    generated_at: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(), // okamžik sestavení — append-only finalization marker
    generated_by: uuid("generated_by")
      .notNull()
      .references(() => app_user.id), // R10 attributable
    // Set only on a period-reopen reversal marker (migration 0076): points at the
    // závěrka output this row voids. period_output is append-only (no delete), so a
    // reopen inserts a marker instead of deleting the sealed output. NULL on a
    // normally-generated output.
    reverses_output_id: uuid("reverses_output_id"),
  },
  (t) => [
    unique("period_output_id_org_unique").on(t.id, t.organization_id),
    foreignKey({
      name: "period_output_period_fk",
      columns: [t.period_id, t.organization_id],
      foreignColumns: [accounting_period.id, accounting_period.organization_id],
    }),
    // period_output_reverses_fk (reverses_output_id, organization_id) -> period_output
    // (id, organization_id): a composite SELF-FK. Kept in the migration (authoritative);
    // omitted from the DSL to avoid drizzle's self-referential circular type inference
    // (same treatment as account_parent_fk).
  ],
)

/**
 * number_series_period — per-účetní-období numbering config + gapless counter for
 * a DOCUMENT číselná řada (Dokladové řady). Each row = one accounting period's
 * format (prefix + zero-padded number_length + postfix) and its own gapless
 * `current_number`, so a new period restarts the sequence.
 *
 * Mirrors: packages/db/migrations/0069_number_series_period.sql
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0069).
 * Composite (fk, organization_id) FKs — FK bypasses RLS. UNIQUE(id, organization_id)
 * is the composite-FK target; UNIQUE(number_series_id, period_id) = one config row
 * per série per účetní období. The CHECK (number_length 1..18) lives in the
 * migration, not this DSL. `current_number` is advanced via UPDATE…RETURNING.
 */
import {
  bigint,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { accounting_period } from "./accounting_period"
import { number_series } from "./number_series"

export const number_series_period = pgTable(
  "number_series_period",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id").notNull(),
    number_series_id: uuid("number_series_id").notNull(), // the DOCUMENT série
    period_id: uuid("period_id").notNull(), // Účetní období
    number_length: integer("number_length").notNull(), // Délka čísla
    prefix: text("prefix").notNull().default(""), // Prefix
    postfix: text("postfix").notNull().default(""), // Postfix ({YYYY}/{YY}/{MM} tokens)
    current_number: bigint("current_number", { mode: "number" })
      .notNull()
      .default(1), // Akt.číslo — gapless per (series, period)
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "number_series_period_series_fk",
      columns: [t.number_series_id, t.organization_id],
      foreignColumns: [number_series.id, number_series.organization_id],
    }),
    foreignKey({
      name: "number_series_period_period_fk",
      columns: [t.period_id, t.organization_id],
      foreignColumns: [accounting_period.id, accounting_period.organization_id],
    }),
    unique("number_series_period_id_org_unique").on(t.id, t.organization_id),
    unique("number_series_period_series_period_unique").on(
      t.number_series_id,
      t.period_id,
    ),
  ],
)

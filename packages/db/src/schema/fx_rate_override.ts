/**
 * fx_rate_override — an organization's manual exchange-rate override for a
 * specific date (e.g. a forward-contract closing rate), beating the shared
 * fx_rate at the same (from, to, rate_date, rate_kind). Precedence:
 * override -> ČNB fx_rate -> error (ADR-0013).
 *
 * Mirrors: packages/db/migrations/0072_fx_rate.sql
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0072).
 * Frozen once a posting has used it (is_locked) so a booked rate is never
 * silently rewritten. Composite UNIQUE(id, organization_id) is the composite-FK
 * target; currency_code and created_by_user_id are single-col FKs to
 * shared/global tables. `rate` numeric(18,6) matches the shared fx_rate. The
 * natural UNIQUE, CHECKs and RLS policy live in the migration, not this DSL.
 */
import {
  boolean,
  char,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { fxRateKind } from "./_enums"
import { app_user } from "./app_user"
import { currency } from "./currency"
import { organization } from "./organization"

export const fx_rate_override = pgTable(
  "fx_rate_override",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    from_code: char("from_code", { length: 3 })
      .notNull()
      .references(() => currency.code),
    to_code: char("to_code", { length: 3 })
      .notNull()
      .references(() => currency.code),
    rate_date: date("rate_date").notNull(),
    rate_kind: fxRateKind("rate_kind").notNull().default("DAILY"),
    unit_amount: integer("unit_amount").notNull().default(1),
    rate: numeric("rate", { precision: 18, scale: 6 }).notNull(),
    reason: text("reason").notNull(),
    is_locked: boolean("is_locked").notNull().default(false),
    created_by_user_id: uuid("created_by_user_id").references(
      () => app_user.id,
    ),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("fx_rate_override_id_org_unique").on(t.id, t.organization_id),
    unique("fx_rate_override_natural_unique").on(
      t.organization_id,
      t.from_code,
      t.to_code,
      t.rate_date,
      t.rate_kind,
    ),
  ],
)

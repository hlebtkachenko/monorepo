/**
 * org_currency — the currencies an organization has ENABLED for use beyond its
 * functional currency. Pure enablement (row present = enabled); the org's
 * functional / accounting currency (měna účetnictví) lives per-period on
 * accounting_period.accounting_currency, NOT here.
 *
 * Mirrors: packages/db/migrations/0076_org_currency.sql
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0076).
 * currency_code -> currency (shared, no RLS) and enabled_by_user_id -> app_user
 * (global, no RLS) are single-col FKs. Composite UNIQUE(id, organization_id) is
 * the composite-FK target for future refs; UNIQUE(organization_id, currency_code)
 * keeps enablement idempotent. The RLS policy lives in the migration, not this DSL.
 */
import { char, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { app_user } from "./app_user"
import { currency } from "./currency"
import { organization } from "./organization"

export const org_currency = pgTable(
  "org_currency",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    currency_code: char("currency_code", { length: 3 })
      .notNull()
      .references(() => currency.code),
    enabled_at: timestamp("enabled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    enabled_by_user_id: uuid("enabled_by_user_id").references(
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
    unique("org_currency_id_org_unique").on(t.id, t.organization_id),
    unique("org_currency_org_currency_unique").on(
      t.organization_id,
      t.currency_code,
    ),
  ],
)

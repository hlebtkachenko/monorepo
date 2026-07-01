/**
 * category (= kategorie) — peněžní-deník income/expense category (§5.7, §9).
 *
 * Mirrors: packages/db/migrations/0029_accounting_posting.sql (CREATE TABLE category)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * UNIQUE(id, organization_id) is the composite-FK target for monetary lines and
 * the monetary read-model summary. Triggers / RLS / CHECK constraints live in the
 * migration, not this DSL.
 */
import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { categoryType } from "./_enums"
import { organization } from "./organization"

export const category = pgTable(
  "category",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    type: categoryType("type").notNull(),
    name: text("name").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("category_id_org_unique").on(t.id, t.organization_id)],
)

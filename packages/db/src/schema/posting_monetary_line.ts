/**
 * posting_monetary_line (= penezni_denik_radek) — one classified peněžní-deník row
 * (§13b / §7b). §5.4 + §9. The posted form of a partial_record in cash-book format.
 * JEDNODUCHÉ / DAŇOVÁ EVIDENCE only (R7).
 *
 * Mirrors: packages/db/migrations/0029_accounting_posting.sql (CREATE TABLE posting_monetary_line)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * regime_code is constrained to ('SINGLE_ENTRY','TAX_RECORDS') by CHECK (migration);
 * the composite FK carries tenancy + regime. Triggers / RLS / CHECK constraints live
 * in the migration, not this DSL.
 */
import {
  boolean,
  foreignKey,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { monetaryDirection, monetaryLocation } from "./_enums"
import { category } from "./category"
import { partial_record } from "./partial_record"
import { posting } from "./posting"

export const posting_monetary_line = pgTable(
  "posting_monetary_line",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id").notNull(),
    posting_id: uuid("posting_id").notNull(), // zapis_id (§5.4)
    regime_code: text("regime_code").notNull(), // CHECK IN ('SINGLE_ENTRY','TAX_RECORDS') (R7)
    partial_record_id: uuid("partial_record_id"), // dilci_id (§5.4); nullable
    category_id: uuid("category_id"), // kategorie_id (§5.4, §9); nullable (generated postings)
    location: monetaryLocation("location").notNull(), // misto (§5.4): CASH | BANK
    direction: monetaryDirection("direction").notNull(), // smer (§5.4): INFLOW | OUTFLOW
    is_tax_relevant: boolean("is_tax_relevant").notNull(), // danovy (§5.4, §9)
    is_clearing: boolean("is_clearing").notNull().default(false), // prubezny (§5.4, §9): průběžná položka
    tax_base: numeric("tax_base", { precision: 19, scale: 4 }), // zaklad_dane (§5.4, §9); nullable
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(), // castka (§5.4, R13)
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "posting_monetary_line_posting_fk",
      columns: [t.posting_id, t.organization_id, t.regime_code],
      foreignColumns: [posting.id, posting.organization_id, posting.regime_code],
    }),
    foreignKey({
      name: "posting_monetary_line_partial_fk",
      columns: [t.partial_record_id, t.organization_id],
      foreignColumns: [partial_record.id, partial_record.organization_id],
    }),
    foreignKey({
      name: "posting_monetary_line_category_fk",
      columns: [t.category_id, t.organization_id],
      foreignColumns: [category.id, category.organization_id],
    }),
  ],
)

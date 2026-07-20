/**
 * party_bank_account — a counterparty's bank accounts (číslo účtu / IBAN / …).
 *
 * Mirrors: packages/db/migrations/0086_party_child_tables.sql
 *
 * WORKSPACE-scoped child of counterparty (composite FK + 4 command policies in the
 * migration). `published` / `blocked` / `verified` are security-sensitive (CRPDPH
 * trust) and default false. UNIQUE(id, workspace_id) makes it a composite-FK
 * target for party_relationship.default_bank_account_id. CHECK constraints live in
 * the migration, not this DSL.
 */
import {
  boolean,
  char,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { counterparty } from "./counterparty"
import { workspace } from "./workspace"

export const party_bank_account = pgTable(
  "party_bank_account",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    counterparty_id: uuid("counterparty_id").notNull(),
    holder: text("holder"),
    account_number: text("account_number"),
    bank_code: text("bank_code"),
    iban: text("iban"),
    bic: text("bic"),
    currency_code: char("currency_code", { length: 3 }),
    purpose: text("purpose").notNull().default("GENERAL"),
    is_primary: boolean("is_primary").notNull().default(false),
    published: boolean("published").notNull().default(false),
    blocked: boolean("blocked").notNull().default(false),
    verified: boolean("verified").notNull().default(false),
    valid_from: date("valid_from"),
    valid_to: date("valid_to"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("party_bank_account_id_workspace_unique").on(t.id, t.workspace_id),
    unique("party_bank_account_id_counterparty_unique").on(
      t.id,
      t.counterparty_id,
    ),
    foreignKey({
      name: "party_bank_account_counterparty_fk",
      columns: [t.counterparty_id, t.workspace_id],
      foreignColumns: [counterparty.id, counterparty.workspace_id],
    }),
    index("party_bank_account_counterparty_idx").on(t.counterparty_id),
    uniqueIndex("party_bank_account_one_primary")
      .on(t.counterparty_id)
      .where(sql`${t.is_primary} AND ${t.valid_to} IS NULL`),
  ],
)

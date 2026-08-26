/**
 * trial_balance_line — obratová předvaha, account-keyed.
 *
 * Mirrors: apps/beta/db/migrations/0007_import_spine.sql (CREATE TABLE
 * trial_balance_line).
 *
 * Its own table rather than a fourth `statement_kind` (Advisor F7): a předvaha
 * has no ozn, no row order imposed by a vyhláška and no brutto/korekce pair — it
 * has an account number, and the account number is its identity.
 *
 * It is also the feeder for Finance › Účty a hotovost (spec §2.4): the balances
 * of účty 211/221 are read from here through `account_balance_map` (PR 26), so
 * the office types no bank balance anywhere. "Zero extra entry" is only true if
 * this table holds the closing balance verbatim.
 *
 * `account_code` is deliberately NOT constrained to digits — Czech účtové
 * rozvrhy carry analytics with separators ("343.01", "311100"), and a CHECK that
 * guessed wrong would refuse a real client's real předvaha at month end.
 *
 * DB-enforced invariants, all in the migration:
 *   - `trial_balance_line_identity_unique` — spec §4's "unique org+batch+account".
 *   - `trial_balance_line_batch_fk` — composite, ON DELETE CASCADE.
 *   - trigger `trial_balance_line_requires_draft_batch` — published payload is
 *     frozen.
 *   - trigger `trial_balance_line_matches_dataset` — only inside a `predvaha`
 *     batch.
 */
import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { organization } from "./organization"

export const trial_balance_line = pgTable(
  "trial_balance_line",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    import_batch_id: uuid("import_batch_id").notNull(),
    period_id: uuid("period_id").notNull(),
    /** Syntetický nebo analytický účet, as the office's software spells it. */
    account_code: varchar("account_code", { length: 20 }).notNull(),
    account_name: text("account_name").notNull(),
    /**
     * Počáteční stav / obraty MD a D / konečný zůstatek, all as imported. Money,
     * `numeric(14,2)` (§0.7), read as a STRING. Nullable because a předvaha may
     * omit a column and an omitted column is not a zero (§0.4).
     */
    opening_balance: numeric("opening_balance", { precision: 14, scale: 2 }),
    turnover_debit: numeric("turnover_debit", { precision: 14, scale: 2 }),
    turnover_credit: numeric("turnover_credit", { precision: 14, scale: 2 }),
    closing_balance: numeric("closing_balance", { precision: 14, scale: 2 }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("trial_balance_line_identity_unique").on(
      table.organization_id,
      table.import_batch_id,
      table.account_code,
    ),
    index("trial_balance_line_batch_idx").on(
      table.import_batch_id,
      table.account_code,
    ),
    index("trial_balance_line_account_idx").on(
      table.organization_id,
      table.account_code,
      table.period_id,
    ),
  ],
)

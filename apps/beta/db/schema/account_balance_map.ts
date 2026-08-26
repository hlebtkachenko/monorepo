/**
 * account_balance_map — which účet of the obratová předvaha is a bank account,
 * and which is the pokladna (spec §2.4 Finance › Účty a hotovost, §4).
 *
 * Mirrors: apps/beta/db/migrations/0014_account_balance_map.sql.
 *
 * IT HOLDS NO MONEY. The balances live in `trial_balance_line`, published by
 * the office's own software; this table only says which účty a card covers and
 * what the client calls it. Spec §2.4's "zero extra entry" is only true because
 * nothing here is a figure anybody has to type monthly.
 *
 * DB-enforced invariants, all in the migration:
 *   - `account_balance_map_account_idx` — one entry per (org, account_code).
 *     It is also the ingestion API's upsert key; there is deliberately no
 *     `external_ref` here (see the migration for why a second key would be a
 *     defect rather than a convenience).
 *   - trigger `account_balance_map_no_overlap` — a prefix entry may not claim
 *     an účet another entry already claims, so "celkem" is a sum over disjoint
 *     sets rather than a double count.
 *   - triggers `beta_touch_updated_at` / `beta_freeze_organization_id`.
 */
import {
  boolean,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { betaAccountKind, betaAccountMatchKind } from "./_enums"
import { organization } from "./organization"

export const account_balance_map = pgTable(
  "account_balance_map",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /**
     * Syntetický or analytický účet, spelled as the office's software spells
     * it. `varchar(20)` mirrors `trial_balance_line.account_code` exactly — a
     * map entry that could not be spelled the way the předvaha spells it would
     * match nothing.
     */
    account_code: varchar("account_code", { length: 20 }).notNull(),
    /** `exact` = this one účet; `prefix` = every účet whose code starts with it. */
    match_kind: betaAccountMatchKind("match_kind").notNull().default("exact"),
    /** What the CLIENT calls the account. The účtový rozvrh has no such name. */
    friendly_label: text("friendly_label").notNull(),
    kind: betaAccountKind("kind").notNull(),
    sort_order: smallint("sort_order").notNull().default(0),
    /** A closed account is deactivated, never deleted — past předvahy still carry it. */
    active: boolean("active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("account_balance_map_account_idx").on(
      table.organization_id,
      table.account_code,
    ),
    index("account_balance_map_organization_idx").on(
      table.organization_id,
      table.sort_order,
      table.friendly_label,
    ),
  ],
)

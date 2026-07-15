/**
 * posting_double_entry_line (= zapis_radek) — one Má dáti / Dal side (§13/2). §5.3.
 * The posted form of a partial_record (dílčí). PODVOJNÉ only (R7).
 *
 * Mirrors: packages/db/migrations/0029_accounting_posting.sql (CREATE TABLE posting_double_entry_line)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * regime_code is fixed to 'DOUBLE_ENTRY' by CHECK (migration); the composite FKs carry
 * tenancy + regime + period so the account is provably in the posting's period chart.
 * Triggers / RLS / CHECK constraints (regime-check, R4 balance) live in the migration,
 * not this DSL.
 */
import {
  foreignKey,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { debitCredit } from "./_enums"
import { account } from "./account"
import { partial_record } from "./partial_record"
import { posting } from "./posting"

export const posting_double_entry_line = pgTable(
  "posting_double_entry_line",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id").notNull(),
    posting_id: uuid("posting_id").notNull(), // zapis_id (§5.3)
    period_id: uuid("period_id").notNull(), // B1: = posting's period
    regime_code: text("regime_code").notNull(), // CHECK = 'DOUBLE_ENTRY' (R7)
    account_id: uuid("account_id").notNull(), // ucet_id (§5.3, R1)
    partial_record_id: uuid("partial_record_id"), // dilci_id (§5.3); nullable for generated postings
    side: debitCredit("side").notNull(), // strana (§5.3): MD | Dal
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(), // castka (§5.3, R13); may be negative (storno)
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Provenance: approved gated write this line landed from (NULL = human).
    // BARE uuid, NO FK — org-only table; FK to workspace inbox_item bypasses RLS.
    inbox_id: uuid("inbox_id"),
  },
  (t) => [
    foreignKey({
      name: "posting_de_line_posting_fk",
      columns: [t.posting_id, t.organization_id, t.regime_code],
      foreignColumns: [
        posting.id,
        posting.organization_id,
        posting.regime_code,
      ],
    }),
    foreignKey({
      name: "posting_de_line_posting_period_fk",
      columns: [t.posting_id, t.period_id],
      foreignColumns: [posting.id, posting.period_id],
    }),
    foreignKey({
      name: "posting_de_line_account_fk",
      columns: [t.account_id, t.organization_id],
      foreignColumns: [account.id, account.organization_id],
    }),
    foreignKey({
      name: "posting_de_line_account_period_fk",
      columns: [t.account_id, t.period_id],
      foreignColumns: [account.id, account.period_id],
    }),
    foreignKey({
      name: "posting_de_line_partial_fk",
      columns: [t.partial_record_id, t.organization_id],
      foreignColumns: [partial_record.id, partial_record.organization_id],
    }),
  ],
)

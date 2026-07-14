/**
 * open_item — one open obligation (saldokonto, §16 párování).
 *
 * Mirrors: packages/db/migrations/0031_accounting_saldokonto.sql (CREATE TABLE open_item)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * settled_amount is maintained by the settlement trigger (migration). remaining_amount
 * and is_settled are GENERATED ALWAYS STORED — read-only projections. account_number
 * references the saldokonto účet BY NUMBER (D8). counterparty_id rides through
 * (counterparty_id, workspace_id). Triggers / RLS / CHECK constraints live in the
 * migration, not this DSL.
 */
import {
  boolean,
  char,
  date,
  foreignKey,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { openItemDirection } from "./_enums"
import { counterparty } from "./counterparty"
import { currency } from "./currency"
import { organization } from "./organization"
import { posting } from "./posting"

export const open_item = pgTable(
  "open_item",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id").notNull(),
    workspace_id: uuid("workspace_id").notNull(),
    counterparty_id: uuid("counterparty_id").notNull(), // protistrana (workspace-shared)
    origin_posting_id: uuid("origin_posting_id").notNull(), // the invoice posting that opened the obligation
    account_number: text("account_number").notNull(), // saldokonto účet (311/321/…) BY NUMBER (D8)
    direction: openItemDirection("direction").notNull(), // RECEIVABLE | PAYABLE
    variable_symbol: text("variable_symbol"), // VS / párovací symbol
    original_amount: numeric("original_amount", {
      precision: 19,
      scale: 4,
    }).notNull(), // full obligation (účetní měna)
    currency_code: char("currency_code", { length: 3 })
      .notNull()
      .references(() => currency.code),
    issue_date: date("issue_date").notNull(), // datum vystavení
    due_date: date("due_date"), // splatnost
    settled_amount: numeric("settled_amount", { precision: 19, scale: 4 })
      .notNull()
      .default("0"), // maintained by the settlement trigger (may exceed original = přeplatek)
    // GENERATED ALWAYS STORED — read-only projections
    remaining_amount: numeric("remaining_amount", {
      precision: 19,
      scale: 4,
    }).generatedAlwaysAs(sql`original_amount - settled_amount`),
    is_settled: boolean("is_settled").generatedAlwaysAs(
      sql`settled_amount >= original_amount`,
    ),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("open_item_id_org_unique").on(t.id, t.organization_id),
    // One posting opens at most one obligation (one event = one direction = one
    // saldo account). Belt-and-suspenders against a replayed/duplicate open, which
    // could never be cleaned up (open_item is append-only). Mirrors migration 0057.
    unique("open_item_origin_posting_unique").on(
      t.origin_posting_id,
      t.organization_id,
    ),
    foreignKey({
      name: "open_item_org_fk",
      columns: [t.organization_id, t.workspace_id],
      foreignColumns: [organization.id, organization.workspace_id],
    }),
    foreignKey({
      name: "open_item_counterparty_fk",
      columns: [t.counterparty_id, t.workspace_id],
      foreignColumns: [counterparty.id, counterparty.workspace_id],
    }),
    foreignKey({
      name: "open_item_posting_fk",
      columns: [t.origin_posting_id, t.organization_id],
      foreignColumns: [posting.id, posting.organization_id],
    }),
  ],
)

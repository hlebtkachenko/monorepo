/**
 * party_identifier — SECONDARY / foreign identifiers of a counterparty (LEI, EORI,
 * foreign registration number, …). Primary IČO/DIČ stay scalar on the party.
 *
 * Mirrors: packages/db/migrations/0086_party_child_tables.sql
 *
 * WORKSPACE-scoped child of counterparty (composite FK + 4 command policies in the
 * migration). The identifier_type CHECK lives in the migration, not this DSL.
 */
import {
  boolean,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { counterparty } from "./counterparty"
import { workspace } from "./workspace"

export const party_identifier = pgTable(
  "party_identifier",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    counterparty_id: uuid("counterparty_id").notNull(),
    identifier_type: text("identifier_type").notNull(),
    value: text("value").notNull(),
    normalized: text("normalized"),
    issuer: text("issuer"),
    valid_from: date("valid_from"),
    valid_to: date("valid_to"),
    verified: boolean("verified").notNull().default(false),
    verification_source: text("verification_source"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "party_identifier_counterparty_fk",
      columns: [t.counterparty_id, t.workspace_id],
      foreignColumns: [counterparty.id, counterparty.workspace_id],
    }),
    index("party_identifier_counterparty_idx").on(t.counterparty_id),
  ],
)

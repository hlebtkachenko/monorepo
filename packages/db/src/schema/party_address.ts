/**
 * party_address — a counterparty's postal addresses (sídlo / korespondenční / …).
 *
 * Mirrors: packages/db/migrations/0088_party_child_tables.sql
 *
 * WORKSPACE-scoped child of counterparty: composite FK (counterparty_id,
 * workspace_id) -> counterparty(id, workspace_id), FORCE RLS + 4 command policies
 * on workspace_id (in the migration). CHECK constraints (purpose, country format)
 * live in the migration, not this DSL.
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
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { counterparty } from "./counterparty"
import { workspace } from "./workspace"

export const party_address = pgTable(
  "party_address",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    counterparty_id: uuid("counterparty_id").notNull(),
    purpose: text("purpose").notNull().default("REGISTERED"),
    country_code: char("country_code", { length: 2 }),
    region: text("region"),
    municipality: text("municipality"),
    street: text("street"),
    house_no: text("house_no"),
    orientation_no: text("orientation_no"),
    unit: text("unit"),
    postal_code: text("postal_code"),
    valid_from: date("valid_from"),
    valid_to: date("valid_to"),
    verified: boolean("verified").notNull().default(false),
    source: text("source"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "party_address_counterparty_fk",
      columns: [t.counterparty_id, t.workspace_id],
      foreignColumns: [counterparty.id, counterparty.workspace_id],
    }),
    index("party_address_counterparty_idx").on(t.counterparty_id),
  ],
)

/**
 * party_contact — named people at a counterparty (jméno / funkce / e-mail / tel.).
 *
 * Mirrors: packages/db/migrations/0088_party_child_tables.sql
 *
 * WORKSPACE-scoped child of counterparty (composite FK + 4 command policies in the
 * migration). May hold natural-person PII — lawful basis Art. 6(1)(c), same as
 * counterparty.name (see the migration header). The `purpose` CHECK lives in the
 * migration, not this DSL.
 */
import {
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

export const party_contact = pgTable(
  "party_contact",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    counterparty_id: uuid("counterparty_id").notNull(),
    first_name: text("first_name"),
    last_name: text("last_name"),
    position: text("position"),
    purpose: text("purpose").notNull().default("GENERAL"),
    email: text("email"),
    phone: text("phone"),
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
    foreignKey({
      name: "party_contact_counterparty_fk",
      columns: [t.counterparty_id, t.workspace_id],
      foreignColumns: [counterparty.id, counterparty.workspace_id],
    }),
    index("party_contact_counterparty_idx").on(t.counterparty_id),
  ],
)

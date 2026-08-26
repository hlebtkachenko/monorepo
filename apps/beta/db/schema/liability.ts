/**
 * liability — the manual residue behind Finance › Dluhy a platby.
 *
 * Mirrors: apps/beta/db/migrations/0006_liabilities.sql (CREATE TABLE liability).
 *
 * Spec §2.4 makes Dluhy a platby a DERIVED read model over three sources, and
 * §4 calls this one "liability (residual manual only)". It is what is left after
 * the filing registry and the imported saldokonto have each said everything they
 * can: a penalty, an interest charge, an installment schedule, a debt to
 * somebody who is not a supplier. Anything a filing already carries belongs on
 * the filing, and anything the saldokonto import carries belongs to PR 28 — see
 * the migration header for the residue rule in full.
 *
 * DB-enforced invariants, all in the migration:
 *   - `liability_group_is_residue` — `dodavatele` is refused: that group belongs
 *     wholly to the imported saldokonto, and hand-typing into it is the
 *     triple-entry defect (Advisor F11) the read model exists to kill.
 *   - `liability_label_present` — a blank titul renders an empty row.
 *   - `liability_amount_positive` — money owed TO the company is a receivable
 *     (Pohledávky, PR 27), not a negative debt. NOT NULL, unlike filing's
 *     sign-carrying, nullable `amount_due`.
 *   - `liability_variable_symbol_digits` — VS is 1-10 digits.
 *   - trigger `liability_freeze_organization_id` — a liability never changes
 *     books.
 *   - trigger `liability_touch_updated_at` — `updated_at` is the §2.4 source
 *     stamp.
 */
import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { betaObligationGroup } from "./_enums"
import { organization } from "./organization"

export const liability = pgTable(
  "liability",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Who is owed, as the §2.4 grouping. Never `dodavatele` (DB CHECK). */
    creditor_group: betaObligationGroup("creditor_group")
      .notNull()
      .default("ostatni"),
    /**
     * The §2.4 row's "titul" — the ONE free-text field. There is deliberately no
     * `creditor_name` beside it: `Obligation` (the read model's row shape)
     * carries one free-text slot shared by every source that has one, and the
     * creditor a client reads is the group heading the row sits under.
     */
    label: text("label").notNull(),
    /**
     * Money, `numeric(14,2)` (spec §0.7), read as a STRING and never as a
     * JavaScript number. NOT NULL and strictly positive — see the class comment.
     */
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    /** Splatnost. */
    due_on: date("due_on").notNull(),
    paid_at: timestamp("paid_at", { withTimezone: true }),
    /** Variabilní symbol for the payment (§2.4 row shape). */
    variable_symbol: varchar("variable_symbol", { length: 10 }),
    /** Client-visible note. Rendered in the portal. */
    note_client: text("note_client"),
    /**
     * Office-internal note. NEVER serialized to a client — the name is on
     * `CLIENT_FORBIDDEN_COLUMNS` and no projection carries it.
     */
    note_internal: text("note_internal"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The freshness stamp of the manual source (§2.4). */
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("liability_organization_due_idx").on(
      table.organization_id,
      table.due_on,
    ),
  ],
)

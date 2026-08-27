/**
 * organization_indicator — the office-stated figures that are not a line of any
 * statement (spec §2.1 item 4, §4 data model, narrowed).
 *
 * Mirrors: apps/beta/db/migrations/0020_indicators.sql.
 *
 * ONE KIND TODAY: `annual_turnover`, the obrat Přehled's Obrat watch measures
 * against the two statutory DPH thresholds. Obrat is 12 consecutive months of
 * taxable supplies with place of plnění in tuzemsko — not derivable from any row
 * this database holds (§0.2), which is exactly why it is STATED rather than
 * computed, and why it always travels with the date it is as of (§0.4).
 *
 * IT COMPUTES AND ROLLS NOTHING FORWARD. A reading is true as of `as_of` and
 * stays so; the office states a new row when the window moves.
 *
 * DB-enforced invariants, all in the migration:
 *   - `organization_indicator_amount_nonnegative` — obrat is a sum of supplies.
 *   - unique `(organization_id, kind, as_of)` — one reading per kind per date,
 *     and the upsert key both the form and the agent API match on.
 *   - trigger `organization_indicator_freeze_organization_id` — a stated figure
 *     never changes books.
 *   - trigger `organization_indicator_touch_updated_at`.
 */
import {
  date,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { betaIndicatorKind } from "./_enums"
import { organization } from "./organization"

export const organization_indicator = pgTable(
  "organization_indicator",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: betaIndicatorKind("kind").notNull(),
    /**
     * `numeric(14,2)` (spec §0.7), read as a STRING and never as a JavaScript
     * number — `turnoverTier` compares it in exact minor units.
     */
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    /** The date the figure is stated as of. Never "today" (spec §0.4). */
    as_of: date("as_of").notNull(),
    /**
     * Office-internal note. NEVER serialized to a client — the name is already
     * on `CLIENT_FORBIDDEN_COLUMNS`.
     */
    note_internal: text("note_internal"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("organization_indicator_kind_as_of_idx").on(
      table.organization_id,
      table.kind,
      table.as_of,
    ),
  ],
)

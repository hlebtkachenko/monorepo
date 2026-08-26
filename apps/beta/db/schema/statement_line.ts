/**
 * statement_line — rozvaha (aktiva + pasiva) and výkaz zisku a ztráty rows.
 *
 * Mirrors: apps/beta/db/migrations/0007_import_spine.sql (CREATE TABLE
 * statement_line).
 *
 * THE FIVE VALUE COLUMNS ARE THE POINT (Advisor F7/F8, binding). A Czech rozvaha
 * aktiva is printed in FOUR columns — brutto, korekce, netto, minulé období —
 * and pasiva in two; a `value_current` / `value_previous` pair cannot hold it.
 * All five ColKey columns exist and each statement kind fills its own, enforced
 * by `statement_line_column_shape` in the migration.
 *
 * `value_netto` is STORED, not derived. It is arithmetically brutto − korekce,
 * and this application still does not compute it (spec §0.2): the office's own
 * software printed that number and the client is entitled to see that number.
 *
 * Every value column is nullable, including the ones its own kind uses — a blank
 * cell on a statutory form is not a zero (§0.4), and the korekce column is
 * printed "x" (not applicable) on many aktiva lines.
 *
 * DB-enforced invariants, all in the migration:
 *   - `statement_line_column_shape` — F7/F8, per statement kind.
 *   - `statement_line_identity_unique` — one row per (batch, kind, row_code).
 *   - `statement_line_batch_fk` — composite, ON DELETE CASCADE: a line has no
 *     meaning apart from the batch that imported it.
 *   - trigger `statement_line_requires_draft_batch` — a published batch's
 *     payload is frozen; a correction is a new batch.
 *   - trigger `statement_line_matches_dataset` — a rozvaha kind only inside a
 *     `rozvaha` batch, `vzz` only inside a `vzz` batch.
 */
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { betaStatementKind } from "./_enums"
import { organization } from "./organization"

export const statement_line = pgTable(
  "statement_line",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    import_batch_id: uuid("import_batch_id").notNull(),
    statement_kind: betaStatementKind("statement_kind").notNull(),
    /**
     * Denormalised from the batch, as spec §4 specifies, so a period read need
     * not join `import_batch`. Kept honest by the draft-batch trigger, which
     * refuses a line whose period differs from its batch's.
     */
    period_id: uuid("period_id").notNull(),
    /** Označení, column (a): "B.II.", "A.1.", "*", "**", or blank. */
    ozn: varchar("ozn", { length: 16 }),
    /** Číslo řádku — the form's own identifier, and the period-over-period join key. */
    row_code: varchar("row_code", { length: 10 }).notNull(),
    /** Column (b): the Czech label as printed, stored rather than looked up. */
    row_label: text("row_label").notNull(),
    sort_order: integer("sort_order").notNull(),
    indent: smallint("indent").notNull().default(0),
    is_bold: boolean("is_bold").notNull().default(false),
    /** Money, `numeric(14,2)` (§0.7), read as a STRING and never as a number. */
    value_brutto: numeric("value_brutto", { precision: 14, scale: 2 }),
    value_korekce: numeric("value_korekce", { precision: 14, scale: 2 }),
    value_netto: numeric("value_netto", { precision: 14, scale: 2 }),
    value_bezne: numeric("value_bezne", { precision: 14, scale: 2 }),
    value_minule: numeric("value_minule", { precision: 14, scale: 2 }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("statement_line_identity_unique").on(
      table.import_batch_id,
      table.statement_kind,
      table.row_code,
    ),
    index("statement_line_batch_idx").on(
      table.import_batch_id,
      table.statement_kind,
      table.sort_order,
    ),
  ],
)

/**
 * partner_saldo — one partner's receivables and payables for ONE published
 * period (spec §2.4 "Pohledávky a závazky", §4).
 *
 * Mirrors: apps/beta/db/migrations/0015_partners_saldokonto.sql (CREATE TABLE
 * partner_saldo).
 *
 * A BATCH PAYLOAD TABLE, the third one. Spec §4 lists `saldokonto` among
 * `import_batch.kind`'s five datasets, so this table carries an
 * `import_batch_id` exactly as `statement_line` and `trial_balance_line` do and
 * inherits §3.2's publish semantics whole: rows land in a draft nobody reads,
 * one UPDATE flips what the product means by "the saldokonto for 07/2026", and a
 * re-publish supersedes rather than mutates. The identity of the partner is
 * deliberately NOT in the batch (see `partner.ts`) — a saldo is a measurement,
 * a partner is an identity, and re-importing a month must not delete the
 * office's own edits to the second.
 *
 * IT COMPUTES NOTHING (spec §0.2). The two totals and the oldest splatnost are
 * the office's own saldokonto figures, stored verbatim: no netting of the two
 * sides, no ageing column, no days-overdue. The aging bucket Pohledávky renders
 * is derived at read time from `oldest_due` against `CURRENT_DATE`, the same way
 * §2.4's "Po splatnosti" is, and must never become a stored column.
 *
 * DB-enforced invariants, all in the migration:
 *   - `partner_saldo_identity_unique` — one row per partner per batch.
 *   - `partner_saldo_totals_nonnegative` — a negative receivable is a payable;
 *     storing it as a negation would make the two Pohledávky columns and the
 *     obligations union disagree about the same row.
 *   - `partner_saldo_states_something` — a row with neither total is noise.
 *   - `partner_saldo_payable_has_oldest_due` — a stated payable carries the date
 *     it is due, because the `dodavatele` arm of the obligations read model
 *     lists it with that date and a dateless payable would be silently dropped
 *     from Dluhy a platby.
 *   - trigger `partner_saldo_requires_draft_batch` (shared with the other two
 *     payload tables) — rows are frozen once the batch leaves draft, and the
 *     denormalised `period_id` must equal the batch's.
 *   - trigger `partner_saldo_matches_dataset` — only a `saldokonto` batch.
 *   - trigger `partner_saldo_freeze_organization_id`.
 */
import {
  date,
  index,
  numeric,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { organization } from "./organization"

export const partner_saldo = pgTable(
  "partner_saldo",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    import_batch_id: uuid("import_batch_id").notNull(),
    partner_id: uuid("partner_id").notNull(),
    /** Denormalised from the batch; the trigger refuses a mismatch. */
    period_id: uuid("period_id").notNull(),
    /**
     * "Dlužné nám" (§2.4). `numeric(14,2)` (spec §0.7), read as a STRING and
     * never as a JavaScript number. Nullable — an unstated side is not a zero.
     */
    receivable_total: numeric("receivable_total", { precision: 14, scale: 2 }),
    /** "Dlužíme" (§2.4). The figure the `dodavatele` obligations arm reads. */
    payable_total: numeric("payable_total", { precision: 14, scale: 2 }),
    /**
     * The oldest unpaid splatnost among this partner's open items, whichever
     * side it sits on — ONE date, as spec §4 models it. Required whenever a
     * payable is stated (DB CHECK).
     */
    oldest_due: date("oldest_due"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("partner_saldo_batch_idx").on(
      table.import_batch_id,
      table.partner_id,
    ),
    index("partner_saldo_partner_idx").on(
      table.organization_id,
      table.partner_id,
      table.period_id,
    ),
  ],
)

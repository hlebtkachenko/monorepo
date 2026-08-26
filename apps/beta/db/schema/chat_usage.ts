/**
 * chat_usage — the ledger behind Asistent's budget controls (spec §2.8 F31).
 *
 * Mirrors: apps/beta/db/migrations/0018_assistant.sql (CREATE TABLE
 * chat_usage).
 *
 * ONE GRAIN — (organization, user, day) — answers both budget questions the
 * spec asks: the per-user daily message allowance is the row for today, and the
 * install-wide monthly token budget is a SUM over the month. A second table at
 * month grain would be a denormalization of this one that can disagree with it.
 *
 * `message_count` is written PREFLIGHT (before the provider call, so a burst of
 * concurrent requests cannot race past the allowance) and the two token columns
 * POSTFLIGHT (from the provider's own usage report). A turn refused before it
 * reached the provider therefore burns an allowance slot and zero tokens, which
 * is what makes the two readable independently.
 *
 * There is no `id` column: the identity IS the primary key
 * (`chat_usage_pkey`), which is also the ON CONFLICT target of both writes.
 *
 * DB-enforced invariants, both in the migration:
 *   - `chat_usage_counts_nonnegative` — no counter ever goes below zero.
 *   - trigger `chat_usage_freeze_identity` — a ledger row never moves book,
 *     user or day.
 */
import {
  bigint,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { app_user } from "./app_user"
import { organization } from "./organization"

export const chat_usage = pgTable(
  "chat_usage",
  {
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => app_user.id, { onDelete: "cascade" }),
    /**
     * The PRAGUE calendar day, computed by the application — never
     * `CURRENT_DATE`. The container runs in UTC and a daily allowance that
     * resets an hour or two before local midnight is a bug the office reports
     * as "it forgot my limit early".
     */
    usage_date: date("usage_date").notNull(),
    /** Preflight counter — the `BETA_ASSISTANT_USER_DAILY_MESSAGES` control. */
    message_count: integer("message_count").notNull().default(0),
    /**
     * Postflight counters, summed for the monthly budget control. `mode:
     * "number"` because these are token COUNTS: they are nowhere near
     * `Number.MAX_SAFE_INTEGER` and nothing here is money (the beta money rule
     * — `numeric(14,2)` read as a string — does not apply to a counter).
     */
    input_tokens: bigint("input_tokens", { mode: "number" })
      .notNull()
      .default(0),
    output_tokens: bigint("output_tokens", { mode: "number" })
      .notNull()
      .default(0),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "chat_usage_pkey",
      columns: [table.organization_id, table.user_id, table.usage_date],
    }),
    index("chat_usage_date_idx").on(table.usage_date),
  ],
)

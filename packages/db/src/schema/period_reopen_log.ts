/**
 * period_reopen_log — append-only audit of a period reopen (READ-MODEL-DESIGN §3).
 * One row per reopen: who reopened which účetní období N, when, why, and the ids of
 * the three storno postings (result 710 / balance 702 / opening 701 in N+1 — each
 * nullable, since a monetary regime or an empty period may lack a given close
 * generation).
 *
 * Mirrors: packages/db/migrations/0077_period_reopen.sql
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0077).
 * Composite (period_id, organization_id) FK — FK bypasses RLS. UNIQUE(id,
 * organization_id) is the composite-FK target idiom. `reopened_by` → app_user (R10).
 */
import {
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { accounting_period } from "./accounting_period"
import { app_user } from "./app_user"

export const period_reopen_log = pgTable(
  "period_reopen_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id").notNull(),
    period_id: uuid("period_id").notNull(), // the reopened období N
    reopened_by: uuid("reopened_by")
      .notNull()
      .references(() => app_user.id), // R10 attributable
    reason: text("reason"), // optional free-text justification
    result_storno_posting_id: uuid("result_storno_posting_id"), // storno of the 710 result-close
    balance_storno_posting_id: uuid("balance_storno_posting_id"), // storno of the 702 balance-close
    opening_storno_posting_id: uuid("opening_storno_posting_id"), // storno of the 701 opening in N+1
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "period_reopen_log_period_fk",
      columns: [t.period_id, t.organization_id],
      foreignColumns: [accounting_period.id, accounting_period.organization_id],
    }),
    unique("period_reopen_log_id_org_unique").on(t.id, t.organization_id),
  ],
)

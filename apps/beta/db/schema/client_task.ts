/**
 * client_task — Pro účetní › Úkoly klientovi (spec §3.4), the ONE table behind
 * both a real task and a task TEMPLATE (`is_template`).
 *
 * Mirrors: apps/beta/db/migrations/0009_client_tasks.sql.
 *
 * See that migration's header for why a template and a task share one table,
 * how the two shapes are enforced (CHECK, not convention), and how
 * `source_template_id` / `source_period_id` make "Vytvořit měsíční sadu úkolů"
 * idempotent. CHECK constraints, the self-referencing composite FK, the
 * partial idempotency index and both triggers live in the migration — repo
 * convention.
 */
import {
  boolean,
  date,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { app_user } from "./app_user"
import { betaClientTaskLinkKind, betaClientTaskStatus } from "./_enums"
import { organization } from "./organization"

export const client_task = pgTable(
  "client_task",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    is_template: boolean("is_template").notNull().default(false),
    title: text("title").notNull(),
    description: text("description"),
    /** Set iff `is_template = false` — the migration's own CHECK. */
    due_date: date("due_date"),
    /** Set only when `is_template = true`. Day of month, 1-31. */
    template_due_day: smallint("template_due_day"),
    link_kind: betaClientTaskLinkKind("link_kind").notNull().default("none"),
    status: betaClientTaskStatus("status").notNull().default("open"),
    done_at: timestamp("done_at", { withTimezone: true }),
    /**
     * Which template generated this row, and for which month — the
     * idempotency key `client_task_source_unique` (partial UNIQUE, migration)
     * is built on. Composite tenancy-carrying FKs, declared in the migration
     * only (Drizzle DSL cannot express the column-list `ON DELETE SET NULL`
     * form), same convention `filing.document_id` documents.
     */
    source_template_id: uuid("source_template_id"),
    source_period_id: uuid("source_period_id"),
    created_by: uuid("created_by").references(() => app_user.id, {
      onDelete: "set null",
    }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("client_task_organization_due_idx").on(
      table.organization_id,
      table.due_date,
    ),
    index("client_task_organization_template_idx").on(table.organization_id),
  ],
)

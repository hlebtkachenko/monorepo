/**
 * app_user — global identity for the beta portal.
 *
 * Mirrors: apps/beta/db/migrations/0000_init.sql (CREATE TABLE app_user).
 *
 * Design notes:
 *   - `email` is lowercased by the DB trigger `app_user_lowercase_email`, so the
 *     UNIQUE constraint is genuinely case-insensitive. Never rely on the caller.
 *   - `is_staff` is the office-staff flag, NOT a role. It gates the cross-org
 *     /admin area (Advisor blocker B4-6) and is the DB-enforced precondition for
 *     holding an `owner` membership (trigger
 *     `organization_membership_owner_requires_staff`). It must never appear in
 *     a user-writable form or in an AI tool input schema: the only write paths
 *     are /admin (PR 08) and the bootstrap seed.
 *   - `disabled_at` is the deactivation path. Deactivation never deletes the
 *     row — a leaver still needs their last payslip (spec §2.6.1). The trigger
 *     `app_user_owner_guard` refuses to deactivate an org's last owner.
 *   - `locale` defaults to 'cs': beta ships Czech-only for now (plan Part 3).
 *   - `email_notifications_enabled` is the Nastavení › Účet toggle (spec §2.10,
 *     §2.11 — migration 0012). Defaults true; self-service, unlike `is_staff` /
 *     `disabled_at` / `two_factor_enabled`.
 */
import {
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const app_user = pgTable("app_user", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  email: varchar("email", { length: 320 }).notNull().unique(),
  email_verified: boolean("email_verified").notNull().default(false),
  name: text("name").notNull().default(""),
  image: text("image"),
  is_staff: boolean("is_staff").notNull().default(false),
  two_factor_enabled: boolean("two_factor_enabled").notNull().default(false),
  locale: varchar("locale", { length: 10 }).notNull().default("cs"),
  email_notifications_enabled: boolean("email_notifications_enabled")
    .notNull()
    .default(true),
  disabled_at: timestamp("disabled_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

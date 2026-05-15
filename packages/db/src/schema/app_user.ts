/**
 * app_user — global user identity.
 *
 * Mirrors: packages/db/migrations/0002_auth.sql (CREATE TABLE app_user)
 * Onboarding columns added in 0002 directly (profile_completed_at etc.).
 */
import { boolean, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core"
import { pgTable } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { appUserExperience } from "./_enums"

export const app_user = pgTable("app_user", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  /** Normalized to lowercase by trigger app_user_normalize_email (BEFORE INSERT OR UPDATE). The trigger fires on UPDATE so existing rows are normalized on next write. */
  email: varchar("email", { length: 320 }).notNull().unique(),
  email_verified: boolean("email_verified").notNull().default(false),
  name: text("name").notNull().default(""),
  image: text("image"),
  /** Better Auth application role. CHECK enforced by DB: ('user', 'admin'). Not the same as PostgreSQL role. */
  role: text("role").notNull().default("user"),
  banned: boolean("banned").notNull().default(false),
  ban_reason: text("ban_reason"),
  ban_expires: timestamp("ban_expires", { withTimezone: true }),
  phone: text("phone"),
  two_factor_enabled: boolean("two_factor_enabled").notNull().default(false),
  display_name: text("display_name"),
  avatar_url: text("avatar_url"),
  locale: varchar("locale", { length: 10 }).notNull().default("en"),
  timezone: text("timezone").notNull().default("UTC"),
  job_title: text("job_title"),
  // Onboarding experience level — added in migration 0012_onboarding_extensions.sql
  experience: appUserExperience("experience"),
  profile_completed_at: timestamp("profile_completed_at", {
    withTimezone: true,
  }),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

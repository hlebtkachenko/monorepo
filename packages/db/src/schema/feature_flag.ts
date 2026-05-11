/**
 * feature_flag — global kill-switch / rollout toggle catalog (no RLS).
 *
 * Mirrors: packages/db/migrations/0008_feature_flag.sql
 *
 * Global catalog, not organization-scoped. SELECT-only for app_user;
 * writes go through withAdminBypass (app_admin, BYPASSRLS).
 *
 * Key shape: dotted-lowercase namespace (e.g. lago.resolver.enabled).
 */
import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const feature_flag = pgTable("feature_flag", {
  key: text("key").primaryKey(),
  description: text("description").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  payload: jsonb("payload"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

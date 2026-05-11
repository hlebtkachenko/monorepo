/**
 * two_factor_policy — per-workspace 2FA enforcement governance.
 *
 * Mirrors: packages/db/migrations/0010_impersonation.sql (CREATE TABLE two_factor_policy)
 *
 * v1 stores intent only; Phase 6 wires the middleware that reads enforced_at +
 * workspace_membership.mfa_grace_until to gate sign-ins.
 */
import { boolean, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"
import { workspace } from "./workspace.js"
import { app_user } from "./app_user.js"

export const two_factor_policy = pgTable("two_factor_policy", {
  workspace_id: uuid("workspace_id")
    .notNull()
    .primaryKey()
    .references(() => workspace.id, { onDelete: "cascade" }),
  required_for_owners: boolean("required_for_owners").notNull().default(false),
  required_for_admins: boolean("required_for_admins").notNull().default(false),
  required_for_members: boolean("required_for_members")
    .notNull()
    .default(false),
  grace_period_days: integer("grace_period_days").notNull().default(30),
  enforced_at: timestamp("enforced_at", { withTimezone: true }),
  declared_by_user_id: uuid("declared_by_user_id").references(
    () => app_user.id,
    {
      onDelete: "set null",
    },
  ),
  declared_at: timestamp("declared_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

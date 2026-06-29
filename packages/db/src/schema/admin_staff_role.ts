import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { app_user } from "./app_user"

/**
 * Per-user role inside the admin portal. Missing row = treat as `guest`
 * (minimal access). Independent of `workspace_membership.role` so admin
 * authz can evolve without touching tenant authz.
 *
 * Reads + writes go through `withAdminBypass` only; the table is invisible
 * to app_user via FORCE RLS with no app_user policy.
 */
export const admin_staff_role = pgTable(
  "admin_staff_role",
  {
    user_id: uuid("user_id")
      .primaryKey()
      .references(() => app_user.id, { onDelete: "cascade" }),
    role: text("role").notNull().$type<StaffRole>(),
    granted_by: uuid("granted_by").references(() => app_user.id, {
      onDelete: "set null",
    }),
    granted_at: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text("notes"),
  },
  (t) => [index("admin_staff_role_role_idx").on(t.role)],
)

export const STAFF_ROLES = [
  "owner",
  "admin",
  "developer",
  "designer",
  "support",
  "security",
  "guest",
] as const

export type StaffRole = (typeof STAFF_ROLES)[number]

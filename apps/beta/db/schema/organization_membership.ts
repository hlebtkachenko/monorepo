/**
 * organization_membership — which user sees which client book, and as what.
 *
 * Mirrors: apps/beta/db/migrations/0000_init.sql (CREATE TABLE
 * organization_membership).
 *
 * Membership rows are the ONLY visibility mechanism; there is no accountant
 * bypass (Advisor Part 4 — an implicit bypass multiplies the offboarding
 * surface and permits incoherent per-org states). /admin instead offers a
 * one-click "grant owner in all active orgs" (PR 08).
 *
 * DB-enforced invariants, all in the migration:
 *   - UNIQUE (user_id, organization_id) — one role per pair, never two.
 *   - trigger `organization_membership_owner_requires_staff` — an owner
 *     membership requires `app_user.is_staff`, so owner-ness can only originate
 *     from office staff even if a route-level check is bypassed.
 *   - trigger `organization_membership_prevent_last_owner_removal` — an
 *     organization always keeps at least one active owner held by an enabled
 *     user (Advisor blocker B4-8).
 */
import {
  boolean,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { app_user } from "./app_user"
import { betaOrgRole } from "./_enums"
import { organization } from "./organization"

export const organization_membership = pgTable(
  "organization_membership",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => app_user.id, { onDelete: "cascade" }),
    role: betaOrgRole("role").notNull(),
    /** Deactivated membership: the row stays for the audit trail. */
    active: boolean("active").notNull().default(true),
    invited_by_user_id: uuid("invited_by_user_id").references(
      () => app_user.id,
      { onDelete: "set null" },
    ),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("organization_membership_user_organization_unique").on(
      table.user_id,
      table.organization_id,
    ),
    index("organization_membership_organization_idx").on(table.organization_id),
  ],
)

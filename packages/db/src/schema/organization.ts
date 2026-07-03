/**
 * organization — root tenant, organization-scoped (FORCE RLS).
 *
 * Mirrors: packages/db/migrations/0003_rls_force.sql (CREATE TABLE organization)
 *
 * Design notes:
 *   - organization_id always equals id (enforced by trigger app_organization_self_id).
 *     Both columns exist so RLS policies can use the uniform organization_id predicate.
 *   - workspace_id is immutable once set (enforced by trigger app_organization_workspace_immutable).
 *   - person_kind + legal_subject_kind consistency is enforced by CHECK constraint.
 *   - No ico/dic columns: CZ-specific fields are not in the monorepo greenfield DDL.
 *   - workspace FK wired in 0005_workspace.sql after workspace table exists.
 *   - person_type: typed projection of person_kind, added as a GENERATED STORED
 *     column in 0026_accounting_organization_reshape.sql. Read-only; onboarding keeps
 *     writing person_kind and the two can never diverge.
 *   - UNIQUE(id, workspace_id) (added in 0026) is the composite-FK target the v2
 *     capture layer references; declared in the migration, not mirrored here.
 */
import {
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { personType } from "./_enums"

export const organization = pgTable("organization", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  // always equals id; enforced by trigger; kept for uniform RLS predicate
  organization_id: uuid("organization_id").notNull(),
  workspace_id: uuid("workspace_id").notNull(),
  slug: varchar("slug", { length: 64 }).notNull(),
  legal_name: text("legal_name").notNull(),
  person_kind: text("person_kind").notNull(),
  // typed projection of person_kind; GENERATED STORED in 0026 (read-only)
  person_type: personType("person_type").generatedAlwaysAs(
    sql`CASE person_kind WHEN 'natural_person' THEN 'NATURAL'::person_type WHEN 'legal_entity' THEN 'LEGAL'::person_type END`,
  ),
  legal_subject_kind: text("legal_subject_kind"),
  fiscal_year_start_month: smallint("fiscal_year_start_month")
    .notNull()
    .default(sql`1`)
    .$type<number>(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

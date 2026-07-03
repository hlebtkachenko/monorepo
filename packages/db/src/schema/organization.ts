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
 *   - legal_form_code / ico / registered sídlo columns added in
 *     0041_org_scaffolding.sql — identity written by the scaffolding orchestrator.
 *     ico CHECK (8 digits) lives in the migration, not this DSL.
 *   - workspace FK wired in 0005_workspace.sql after workspace table exists.
 *   - person_type: typed projection of person_kind, added as a GENERATED STORED
 *     column in 0026_accounting_organization_reshape.sql. Read-only; onboarding keeps
 *     writing person_kind and the two can never diverge.
 *   - UNIQUE(id, workspace_id) (added in 0026) is the composite-FK target the v2
 *     capture layer references; declared in the migration, not mirrored here.
 */
import {
  char,
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
  // právní forma (FK legal_form.code) — drives regime derivation + period rules.
  legal_form_code: text("legal_form_code"),
  // IČO (8 digits); stable business key for ARES re-lookup + dedup + výkaz headers.
  ico: varchar("ico", { length: 8 }),
  // Registered seat (sídlo) — used on přiznání / výkaz headers. house/orientation
  // number + region added in 0041 (feed EPO XML headers); registered_street stays
  // the composed display line.
  registered_street: text("registered_street"),
  registered_house_number: varchar("registered_house_number", { length: 16 }),
  registered_orientation_number: varchar("registered_orientation_number", {
    length: 16,
  }),
  registered_city: text("registered_city"),
  registered_postal_code: varchar("registered_postal_code", { length: 10 }),
  registered_region: text("registered_region"),
  registered_country_code: char("registered_country_code", { length: 2 }),
  // Delivery (poštovní) address — ARES adresaDorucovaci is 3 free-text lines.
  delivery_address_line1: text("delivery_address_line1"),
  delivery_address_line2: text("delivery_address_line2"),
  delivery_address_line3: text("delivery_address_line3"),
  // Contact. Config columns added in 0041; data_box CHECK lives in the migration.
  data_box_id: varchar("data_box_id", { length: 7 }),
  contact_email: text("contact_email"),
  contact_phone: varchar("contact_phone", { length: 32 }),
  website: text("website"),
  // Finanční úřad (ÚFO) + územní pracoviště codes; spisová značka (§435 NOZ).
  tax_office_code: varchar("tax_office_code", { length: 4 }),
  tax_office_workplace_code: varchar("tax_office_workplace_code", {
    length: 4,
  }),
  registry_file_number: text("registry_file_number"),
  // Manage-orgs archive flag; NULL = active.
  archived_at: timestamp("archived_at", { withTimezone: true }),
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

/**
 * document_type — Typy dokladů. The org-scoped config taxonomy every Doklady page
 * reads: a doklad's Druh/type carries its default číselná řada, default účtování,
 * DPH routing, and payment defaults.
 *
 * Mirrors: packages/db/migrations/0076_document_type.sql (CREATE TABLE document_type)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0076).
 * Layers OVER summary_record_type (the posting-lane discriminant) — never replaces
 * it. `category` is the config-facing bucket (document_category, a superset of the
 * booked types). UNIQUE(id, organization_id) is the composite-FK target future
 * doklad rows point at; (default_series_id, organization_id) is the composite FK to
 * number_series so an org can only default to its own série. Triggers / RLS / CHECK
 * constraints live in the migration, not this DSL.
 */
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { documentCategory, documentKind } from "./_enums"
import { organization } from "./organization"

export const document_type = pgTable(
  "document_type",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    category: documentCategory("category").notNull(),
    code: text("code").notNull(), // Zkratka
    name: text("name").notNull(), // Název
    kind: documentKind("kind"), // Druh (validated per category in app)
    default_series_id: uuid("default_series_id"), // → number_series (composite FK in migration)
    is_primary: boolean("is_primary").notNull().default(false),
    is_active: boolean("is_active").notNull().default(true),
    default_account: text("default_account"),
    posting_prescription: text("posting_prescription"),
    cost_centre: text("cost_centre"),
    activity: text("activity"),
    bank_account: text("bank_account"),
    payment_form: text("payment_form"),
    due_days: integer("due_days"),
    vat_country: text("vat_country"),
    kh_section: text("kh_section"),
    description: text("description"),
    valid_from_year: integer("valid_from_year"),
    valid_to_year: integer("valid_to_year"),
    external_source_id: text("external_source_id"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("document_type_id_org_unique").on(t.id, t.organization_id),
    // (org, category, code) — its backing index also serves the (org, category)
    // per-category list read as a leading-column prefix, so no separate index.
    unique("document_type_org_cat_code_unique").on(
      t.organization_id,
      t.category,
      t.code,
    ),
  ],
)

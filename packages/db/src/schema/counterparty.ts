/**
 * counterparty — workspace-shared protistrana; self-of-org identity row.
 *
 * Mirrors: packages/db/migrations/0026_accounting_organization_reshape.sql (CREATE TABLE counterparty)
 *
 * WORKSPACE-scoped (NOT organization-scoped): 4 command-specific RLS policies on
 * workspace_id land in 0034, so this table is intentionally absent from
 * ORGANIZATION_SCOPED_TABLES.
 * UNIQUE(id, workspace_id) is the composite-FK target for org-tier tables that
 * reference a counterparty (accounting_event, open_item), closing the
 * cross-workspace FK-bypass hole via (counterparty_id, workspace_id).
 * Triggers / RLS / CHECK constraints live in the migration, not this DSL.
 */
import {
  char,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { legal_form } from "./legal_form"
import { organization } from "./organization"
import { party_kind } from "./party_kind"
import { workspace } from "./workspace"

export const counterparty = pgTable(
  "counterparty",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    self_of_organization_id: uuid("self_of_organization_id")
      .unique()
      .references(() => organization.id, { onDelete: "set null" }),
    // Tax identity for per-partner outputs (KH §101d, SH §102). Added in 0039;
    // CHECK on country_code lives in the migration, not this DSL.
    name: text("name"), // obchodní jméno / jméno osoby
    tax_id: text("tax_id"), // DIČ incl. country prefix (CZ12345678)
    country_code: char("country_code", { length: 2 }), // ISO 3166-1 alpha-2 member state
    // IČO (8 digits); §435 NOZ obchodní listiny + ARES supplier prefill. Added 0041.
    ico: varchar("ico", { length: 8 }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Party-identity overlay (adresar M1, migrations 0086/0087). All additive +
    // nullable; Directories owns these. `name` stays the resolveCounterparty dedup
    // key — these overlays never feed dedup. The data_box_id / verification_source
    // CHECK constraints and the FK constraints live in the migration, not this DSL.
    party_kind_code: text("party_kind_code").references(() => party_kind.code),
    legal_name: text("legal_name"),
    display_name: text("display_name"),
    legal_form_code: text("legal_form_code").references(() => legal_form.code),
    data_box_id: varchar("data_box_id", { length: 7 }),
    registration_status: text("registration_status"),
    verification_source: text("verification_source"),
    last_verified_at: timestamp("last_verified_at", { withTimezone: true }),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    unique("counterparty_id_workspace_unique").on(t.id, t.workspace_id),
    // Race-safe dedup keys for supplier→counterparty resolution (resolveCounterparty
    // upserts ON CONFLICT against these). IČO and DIČ are independent identities.
    // Mirrors migration 0058.
    uniqueIndex("counterparty_workspace_ico_unique")
      .on(t.workspace_id, t.ico)
      .where(sql`ico IS NOT NULL AND self_of_organization_id IS NULL`),
    uniqueIndex("counterparty_workspace_tax_id_unique")
      .on(t.workspace_id, t.tax_id)
      .where(sql`tax_id IS NOT NULL AND self_of_organization_id IS NULL`),
  ],
)

/**
 * asset_type — Typy majetku: org-defined fixed-asset type templates (majetek §6).
 *
 * Mirrors: packages/db/migrations/0080_asset_type.sql (CREATE TABLE asset_type)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0080).
 * Fixes the accounting family + depreciability + předkontace (5 GL account
 * NUMBERS, D8 by-number) an asset of this type defaults to. `name` is org-entered
 * text (NOT reference-i18n). Composite UNIQUE (id, organization_id) is the
 * composite-FK target for asset.asset_type_id. RLS / policies live in the
 * migration, not this DSL.
 */
import {
  boolean,
  date,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { assetCategory } from "./_enums"
import { organization } from "./organization"

export const asset_type = pgTable(
  "asset_type",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    family: assetCategory("family").notNull(), // DHM / DNM / neodpisovaný
    is_depreciated: boolean("is_depreciated").notNull(), // jeOdpis
    // předkontace: 5-GL posting profile (account NUMBERS, D8 by-number); NULL where n/a
    asset_account_number: text("asset_account_number"),
    acquisition_account_number: text("acquisition_account_number"),
    accumulated_account_number: text("accumulated_account_number"),
    expense_account_number: text("expense_account_number"),
    disposal_account_number: text("disposal_account_number"),
    valid_from: date("valid_from"),
    valid_to: date("valid_to"),
    active: boolean("active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("asset_type_id_org_unique").on(t.id, t.organization_id),
    unique("asset_type_org_code_unique").on(t.organization_id, t.code),
  ],
)

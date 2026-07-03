/**
 * asset — fixed-asset register card (majetek §5.7, ČÚS 013). DFM excluded (D1).
 *
 * Mirrors: packages/db/migrations/0030_accounting_supporting.sql (CREATE TABLE asset)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * oprávky/ZC derived not stored (D3). account_number references the balance-sheet
 * majetkový účet BY NUMBER (D8) with a directive_code anchor (renumber survival /
 * závěrka classifier, NOT the posting key). Triggers / RLS / CHECK constraints live
 * in the migration, not this DSL.
 */
import {
  bigint,
  char,
  date,
  foreignKey,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { assetCategory, assetDisposalMethod } from "./_enums"
import { app_user } from "./app_user"
import { directive_account } from "./directive_account"
import { number_series } from "./number_series"
import { organization } from "./organization"

export const asset = pgTable(
  "asset",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    number_series_id: uuid("number_series_id").notNull(), // Označení series (entity_type = ASSET)
    sequence_number: bigint("sequence_number", { mode: "number" }).notNull(),
    designation: text("designation").notNull(), // FROZEN inventární číslo
    name: text("name").notNull(),
    category: assetCategory("category").notNull(),
    account_number: text("account_number").notNull(), // D8: balance-sheet majetkový účet number (02x/01x/03x)
    directive_code: char("directive_code", { length: 3 }), // D8 anchor
    acquisition_date: date("acquisition_date"), // datum pořízení
    commissioning_date: date("commissioning_date").notNull(), // datum zařazení do užívání — depreciation START
    disposal_date: date("disposal_date"), // datum vyřazení
    disposal_method: assetDisposalMethod("disposal_method"),
    acquisition_cost: numeric("acquisition_cost", {
      precision: 19,
      scale: 4,
    }).notNull(), // pořizovací cena účetní (§47)
    improvement_total: numeric("improvement_total", { precision: 19, scale: 4 })
      .notNull()
      .default("0"), // technické zhodnocení účetní (§33)
    location: text("location"), // umístění
    responsible_user_id: uuid("responsible_user_id").references(
      () => app_user.id,
    ),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("asset_id_org_unique").on(t.id, t.organization_id),
    unique("asset_oznaceni_unique").on(t.number_series_id, t.sequence_number),
    foreignKey({
      name: "asset_series_fk",
      columns: [t.number_series_id, t.organization_id],
      foreignColumns: [number_series.id, number_series.organization_id],
    }),
    foreignKey({
      name: "asset_directive_fk",
      columns: [t.directive_code],
      foreignColumns: [directive_account.code],
    }),
  ],
)

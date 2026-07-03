/**
 * tax_depreciation — DAŇOVÉ odpisy per asset (1:1); NOT posted. Feeds DPPO + odložená
 * daň (ČÚS 003). accumulated_amount STORED (annual, can be suspended — not derivable).
 *
 * Mirrors: packages/db/migrations/0030_accounting_supporting.sql (CREATE TABLE tax_depreciation)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * UNIQUE(asset_id, organization_id) enforces the 1:1 to asset. Triggers / RLS / CHECK
 * constraints live in the migration, not this DSL.
 */
import {
  boolean,
  foreignKey,
  numeric,
  pgTable,
  smallint,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { taxDepreciationMethod } from "./_enums"
import { asset } from "./asset"
import { depreciation_group } from "./depreciation_group"
import { organization } from "./organization"

export const tax_depreciation = pgTable(
  "tax_depreciation",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    asset_id: uuid("asset_id").notNull(),
    depreciation_group_code: smallint("depreciation_group_code")
      .notNull()
      .references(() => depreciation_group.code),
    method: taxDepreciationMethod("method").notNull(), // irrevocable (§30/2)
    tax_base: numeric("tax_base", { precision: 19, scale: 4 }).notNull(), // vstupní cena daňová (§29)
    tax_improvement_total: numeric("tax_improvement_total", {
      precision: 19,
      scale: 4,
    })
      .notNull()
      .default("0"), // TZ daňové (§33)
    accumulated_amount: numeric("accumulated_amount", {
      precision: 19,
      scale: 4,
    })
      .notNull()
      .default("0"), // claimed cumulative — STORED
    start_year: smallint("start_year").notNull(), // rok zahájení (§26/5)
    is_suspended: boolean("is_suspended").notNull().default(false), // přerušení (§26/8)
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("tax_depreciation_id_org_unique").on(t.id, t.organization_id),
    unique("tax_depreciation_asset_unique").on(t.asset_id, t.organization_id), // 1:1
    foreignKey({
      name: "tax_depreciation_asset_fk",
      columns: [t.asset_id, t.organization_id],
      foreignColumns: [asset.id, asset.organization_id],
    }),
  ],
)

/**
 * asset — the Majetek register (spec §2.7 Přehled majetku / Karta majetku, §4
 * data model).
 *
 * Mirrors: apps/beta/db/migrations/0008_assets.sql (CREATE TABLE asset).
 *
 * SHALLOW BY DESIGN (spec depth map: "Majetek ... table + stamp suffices").
 * The office types every figure its own records already hold — acquisition
 * cost, accumulated depreciation and its as-of date — and this table stores
 * exactly those figures. It computes nothing: `accumulated_depreciation` is
 * NEVER derived from a depreciation schedule here, and `depreciation_as_of`
 * is the office's own stamp, never "today" (spec §0.4 / Advisor F15). The one
 * arithmetic this product performs on these numbers — zůstatková cena =
 * acquisition_cost − accumulated_depreciation — is presentation-level SQL
 * over already-provided rows, explicitly allowed by spec §0.2, and it lives
 * in `lib/data/assets.ts` at read time, never here and never in a stored
 * column.
 *
 * DB-enforced invariants, all in the migration:
 *   - `asset_dispose_coherence` — `status = 'disposed'` ⟺ `disposed_on` set.
 *   - `asset_depreciation_stamp_coherence` — the oprávky figure and its as-of
 *     date travel together or not at all.
 *   - `asset_minor_has_no_depreciation` — spec §2.7: drobný majetek carries no
 *     depreciation fields.
 *   - trigger `asset_freeze_organization_id` — an asset never changes books.
 *   - trigger `asset_touch_updated_at` — `updated_at` is the row's own
 *     freshness stamp, distinct from `depreciation_as_of`.
 */
import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { betaAssetCategory, betaAssetStatus } from "./_enums"
import { organization } from "./organization"

export const asset = pgTable(
  "asset",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: betaAssetCategory("category").notNull(),
    /** Drobný majetek — spec §2.7: no depreciation fields on these rows. */
    is_minor: boolean("is_minor").notNull().default(false),
    /**
     * Pořizovací cena. `numeric(14,2)` (spec §0.7), read as a STRING and never
     * as a JavaScript number.
     */
    acquisition_cost: numeric("acquisition_cost", {
      precision: 14,
      scale: 2,
    }).notNull(),
    /** Datum pořízení — distinct from `placed_in_service_on`. */
    acquired_on: date("acquired_on"),
    /** Zařazeno — the Přehled majetku column of the same name. */
    placed_in_service_on: date("placed_in_service_on"),
    /**
     * Office-provided oprávky. NEVER computed — see the file header. Paired
     * with `depreciation_as_of` by `asset_depreciation_stamp_coherence`.
     */
    accumulated_depreciation: numeric("accumulated_depreciation", {
      precision: 14,
      scale: 2,
    }),
    /**
     * The office's own as-of date for `accumulated_depreciation`. Never
     * "today" — spec §0.4 forbids the interpolation.
     */
    depreciation_as_of: date("depreciation_as_of"),
    /** Daňová zůstatková, shown collapsed on the Karta (spec §2.7). */
    tax_residual_value: numeric("tax_residual_value", {
      precision: 14,
      scale: 2,
    }),
    /** Stavby grouping (spec §2.2 pattern, mirrored on `document.site_ref`). */
    site_ref: text("site_ref"),
    status: betaAssetStatus("status").notNull().default("in_use"),
    disposed_on: date("disposed_on"),
    /** Client-visible note. Rendered on the Karta. */
    note_client: text("note_client"),
    /**
     * Office-internal note. NEVER serialized to a client — the name is
     * already on `CLIENT_FORBIDDEN_COLUMNS` (shared with `filing.note_internal`).
     */
    note_internal: text("note_internal"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The row's own freshness stamp — distinct from `depreciation_as_of`. */
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("asset_organization_status_idx").on(
      table.organization_id,
      table.status,
    ),
    index("asset_organization_name_idx").on(table.organization_id, table.name),
  ],
)

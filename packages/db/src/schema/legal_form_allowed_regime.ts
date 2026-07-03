/**
 * legal_form_allowed_regime — which regimes each legal form may use (§4 matrix).
 *
 * Mirrors: packages/db/migrations/0024_accounting_enums_reference.sql (CREATE TABLE legal_form_allowed_regime)
 *
 * Reference (law) table — shared, NOT tenant-scoped. Rows seeded in 0025.
 * Triggers / RLS / CHECK / EXCLUDE constraints live in the migration, not this DSL.
 */
import { pgTable, primaryKey, text } from "drizzle-orm/pg-core"
import { legal_form } from "./legal_form"
import { regime } from "./regime"

export const legal_form_allowed_regime = pgTable(
  "legal_form_allowed_regime",
  {
    legal_form_code: text("legal_form_code")
      .notNull()
      .references(() => legal_form.code),
    regime_code: text("regime_code")
      .notNull()
      .references(() => regime.code),
  },
  (t) => [primaryKey({ columns: [t.legal_form_code, t.regime_code] })],
)

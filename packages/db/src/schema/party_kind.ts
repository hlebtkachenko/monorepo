/**
 * party_kind — Directories party taxonomy (what KIND of subject a counterparty
 * is: LEGAL_ENTITY / SOLE_TRADER / NATURAL_PERSON / PUBLIC_AUTHORITY / NON_PROFIT).
 *
 * Mirrors: packages/db/migrations/0084_party_kind.sql (CREATE TABLE + seed)
 *
 * Reference (law-adjacent) table — shared, NOT tenant-scoped, no RLS (a table, not
 * a pg enum, so the set grows as data). person_type ties each kind to the existing
 * NATURAL / LEGAL split. Display names are localized via next-intl messages in the
 * web layer, not stored here. Residency is NOT a kind — it derives from
 * counterparty.country_code.
 */
import { pgTable, text } from "drizzle-orm/pg-core"
import { personType } from "./_enums"

export const party_kind = pgTable("party_kind", {
  code: text("code").primaryKey(),
  person_type: personType("person_type").notNull(),
})

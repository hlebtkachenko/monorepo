/**
 * business_activity — předmět podnikání = CZ-NACE 2025 (5-level hierarchy).
 *
 * Mirrors: packages/db/migrations/0024_accounting_enums_reference.sql (CREATE TABLE business_activity)
 *
 * Reference (law) table — shared, NOT tenant-scoped. Seeded from the ČSÚ
 * systematická část (~1763 rows): A -> 01 -> 01.1 -> 01.11 -> 01.11.0.
 * Self-FK parent_code (declared inline) + the level-range CHECK live in the
 * migration; triggers / RLS / CHECK constraints stay there, not in this DSL.
 */
import { pgTable, smallint, text } from "drizzle-orm/pg-core"
import type { AnyPgColumn } from "drizzle-orm/pg-core"

export const business_activity = pgTable("business_activity", {
  code: text("code").primaryKey(), // 'A', '01', '01.1', '01.11', '01.11.0'
  level: smallint("level").notNull(), // 1..5
  parent_code: text("parent_code").references(
    (): AnyPgColumn => business_activity.code,
  ),
  name_cs: text("name_cs").notNull(),
  name_en: text("name_en"),
})

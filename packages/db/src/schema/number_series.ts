/**
 * number_series — company-defined číselné řady per entity_type. Gapless counter.
 *
 * Mirrors: packages/db/migrations/0027_accounting_capture.sql (CREATE TABLE number_series)
 *
 * Organization-scoped (FORCE RLS + organization_isolation, applied in 0034).
 * next_number is a gapless counter advanced via SELECT … FOR UPDATE, never a SEQUENCE.
 * UNIQUE(id, organization_id) is the composite-FK target used by event/document/asset/
 * inventory rows. Triggers / RLS / CHECK constraints live in the migration, not this DSL.
 */
import {
  bigint,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { documentCategory, numberSeriesEntity } from "./_enums"
import { organization } from "./organization"

export const number_series = pgTable(
  "number_series",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id),
    entity_type: numberSeriesEntity("entity_type").notNull(), // EVENT | DOCUMENT | ASSET | INVENTORY_COUNT
    category: documentCategory("category"), // config bucket for Dokladové řady; NULL for non-DOCUMENT séries
    code: text("code").notNull(), // Zkratka — company's série label
    pattern: text("pattern").notNull(), // company-defined format, e.g. 'FP{YYYY}{NNNN}'
    // Dokladová řada editor fields (NULL for non-DOCUMENT séries)
    name: text("name"), // Název
    note: text("note"), // Poznámka
    description: text("description"), // Popis
    valid_from_year: integer("valid_from_year"), // Platí od roku
    valid_to_year: integer("valid_to_year"), // Platí do roku
    next_number: bigint("next_number", { mode: "number" }).notNull().default(1),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("number_series_id_org_unique").on(t.id, t.organization_id),
    unique("number_series_org_entity_code_unique").on(
      t.organization_id,
      t.entity_type,
      t.code,
    ),
  ],
)

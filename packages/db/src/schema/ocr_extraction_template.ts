/**
 * ocr_extraction_template — workspace-shared Brain OCR template library.
 *
 * Mirrors: packages/db/migrations/0046_ocr_extraction_template.sql
 *
 * WORKSPACE-scoped (NOT organization-scoped): a supplier's invoice layout is a
 * workspace fact — it does not change per client book, so one learned template
 * is shared across every org in the office. 4 command-specific RLS policies on
 * workspace_id land in 0046, so this table is intentionally absent from
 * ORGANIZATION_SCOPED_TABLES and present in WORKSPACE_SCOPED_TABLES.
 * UNIQUE(id, workspace_id) is the composite-FK target for org-tier tables that
 * may later reference a template, closing the cross-workspace FK-bypass hole via
 * (ocr_extraction_template_id, workspace_id).
 * RLS / grants live in the migration, not this DSL.
 *
 * See ADR-0029 "Brain learned state is workspace-scoped".
 */
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { workspace } from "./workspace"

export const ocr_extraction_template = pgTable(
  "ocr_extraction_template",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    supplier_key: text("supplier_key").notNull(), // IČO or normalized supplier name
    doc_kind: text("doc_kind").notNull(),
    locators: jsonb("locators").notNull(), // field -> region map
    layout_fingerprint: text("layout_fingerprint"), // hash of field-region geometry (drift re-detection)
    human_confirmed_at: timestamp("human_confirmed_at", {
      withTimezone: true,
    }), // NULL = unconfirmed
    held_count: integer("held_count").notNull().default(0),
    last_reject_at: timestamp("last_reject_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    learned_at: timestamp("learned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    provenance: jsonb("provenance"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("ocr_extraction_template_id_workspace_unique").on(
      t.id,
      t.workspace_id,
    ),
  ],
)

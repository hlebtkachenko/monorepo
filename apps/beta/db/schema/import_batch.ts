/**
 * import_batch — one office-fed dataset for one period, in one of three states.
 *
 * Mirrors: apps/beta/db/migrations/0007_import_spine.sql (CREATE TABLE
 * import_batch).
 *
 * Spec §3.2: "draft → published → superseded batches, one published per (org,
 * period, kind), atomic transaction, idempotent re-publish, rollback". The
 * publish semantics live in `lib/data/imports.ts`; what lives here is the shape
 * they operate on.
 *
 * Neither `period_id` nor `superseded_by_batch_id` carries a `.references()`,
 * for the same reason `filing.period_id` does not: both real constraints are
 * COMPOSITE — `(x_id, organization_id)` against the referenced table's own
 * `(id, organization_id)` — which makes a cross-tenant reference
 * unrepresentable rather than merely unwritten, and the ON DELETE rules belong
 * in one file.
 *
 * DB-enforced invariants, all in the migration:
 *   - `import_batch_one_published_idx` — the partial unique that makes two
 *     published batches for one (org, period, dataset) impossible.
 *   - `import_batch_supersession_injective_idx` — at most one batch is
 *     superseded BY any given batch, which is what makes rollback's backward
 *     walk a function.
 *   - `import_batch_status_coherence` — the three states spelled out, so a
 *     rollback that forgot to clear `published_at` cannot leave a draft carrying
 *     a publication date the freshness read would still stamp a surface with.
 *   - `import_batch_supersession_fk` — composite, and deliberately with NO
 *     `ON DELETE` action: `RESTRICT` would refuse an organization cascade and
 *     `SET NULL` would violate the coherence CHECK.
 *   - triggers `import_batch_freeze_organization_id` (never changes books) and
 *     `import_batch_freeze_identity` (period + dataset are what the partial
 *     unique is computed over).
 */
import {
  char,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { betaImportDataset, betaImportSource, betaImportStatus } from "./_enums"
import { app_user } from "./app_user"
import { organization } from "./organization"

export const import_batch = pgTable(
  "import_batch",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    period_id: uuid("period_id").notNull(),
    /**
     * Spec §4 spells this `kind`; it is `dataset` here because a batch read
     * already reaches `statement_line.statement_kind` and `filing.kind`, and the
     * spec's own freshness contract (§0.4) is stated "per DATASET".
     */
    dataset: betaImportDataset("dataset").notNull(),
    status: betaImportStatus("status").notNull().default("draft"),
    source: betaImportSource("source").notNull(),
    /** Provenance of a manual file drop; NULL for an agent-fed batch. */
    filename: text("filename"),
    sha256: char("sha256", { length: 64 }),
    /** Payload size as written, in the same transaction as the rows. */
    row_count: integer("row_count").notNull().default(0),
    /** The office mapping of a manual CSV drop. Office-internal. */
    mapping: jsonb("mapping"),
    /**
     * Office-internal note. NEVER serialized to a client — the name is on
     * `CLIENT_FORBIDDEN_COLUMNS` and no projection carries it.
     */
    note_internal: text("note_internal"),
    imported_by_user_id: uuid("imported_by_user_id").references(
      () => app_user.id,
      { onDelete: "set null" },
    ),
    imported_at: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The §0.4 freshness stamp. NULL until published, cleared by a rollback. */
    published_at: timestamp("published_at", { withTimezone: true }),
    published_by_user_id: uuid("published_by_user_id").references(
      () => app_user.id,
      { onDelete: "set null" },
    ),
    superseded_at: timestamp("superseded_at", { withTimezone: true }),
    /** The FORWARD pointer of spec §4: "the batch that replaced me". */
    superseded_by_batch_id: uuid("superseded_by_batch_id"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("import_batch_one_published_idx")
      .on(table.organization_id, table.period_id, table.dataset)
      .where(sql`status = 'published'`),
    uniqueIndex("import_batch_supersession_injective_idx")
      .on(table.superseded_by_batch_id)
      .where(sql`superseded_by_batch_id IS NOT NULL`),
    index("import_batch_organization_dataset_idx").on(
      table.organization_id,
      table.dataset,
      table.period_id,
    ),
  ],
)

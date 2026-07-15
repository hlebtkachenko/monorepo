/**
 * inbox_attachment — durable DB identity of a confirmed source-document blob.
 *
 * Mirrors: packages/db/migrations/0057_inbox_attachment.sql
 *
 * WORKSPACE-scoped (NOT organization-scoped): a received file precedes org
 * filing, and the same invoice blob can be re-filed between companies in the
 * office WITHOUT re-uploading — the org-tier record (invoice) references this
 * attachment; moving it between orgs never touches the blob. So this table is
 * absent from ORGANIZATION_SCOPED_TABLES and present in WORKSPACE_SCOPED_TABLES.
 * 4 command-specific RLS policies on workspace_id land in 0057.
 *
 * UNIQUE(workspace_id, sha256) = content-addressed dedup (idempotent confirm).
 * UNIQUE(id, workspace_id) = composite-FK target for org-tier tables that
 * reference an attachment via (inbox_attachment_id, workspace_id), closing the
 * cross-workspace FK-bypass hole.
 *
 * SAFETY: a row exists only after S3 confirm tagged the blob and got 200
 * (never DB-first — the reaper's untagged>24h branch depends on it), so
 * `confirmed_at` is NOT NULL. RLS / grants live in the migration, not this DSL.
 *
 * See ADR-0029, ADR-0031, and docs/runbooks/DOCUMENT-STORE.md.
 */
import {
  bigint,
  check,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { workspace } from "./workspace"

export const inbox_attachment = pgTable(
  "inbox_attachment",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    // Content-addressed S3 key: documents/{workspace_id}/{sha256}.{ext}
    storage_key: text("storage_key").notNull(),
    // Lowercase hex sha256 of the bytes — the content address, matches the key.
    sha256: text("sha256").notNull(),
    content_type: text("content_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    filename: text("filename").notNull(),
    // Set at row creation (confirm already succeeded). Never NULL.
    confirmed_at: timestamp("confirmed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Soft delete: reaper purges the S3 bytes 60d later unless undone.
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("inbox_attachment_workspace_sha256_unique").on(
      t.workspace_id,
      t.sha256,
    ),
    unique("inbox_attachment_id_workspace_unique").on(t.id, t.workspace_id),
    check("inbox_attachment_sha256_hex", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    check("inbox_attachment_size_positive", sql`${t.size} > 0`),
  ],
)

/**
 * document — one uploaded file on a client's book.
 *
 * Mirrors: apps/beta/db/migrations/0004_documents.sql.
 *
 * The bytes live in S3 under an OPAQUE key (`org/<org uuid>/<object uuid>.<ext>`);
 * this row holds everything a human would recognise, `original_filename` above
 * all. A CHECK in the migration enforces both halves of the key rule — the shape
 * (two UUIDs, so a filename cannot be smuggled in) and the containment (the
 * first segment IS `organization_id`).
 *
 * CHECK constraints and the two triggers (touch `updated_at`, refuse an UPDATE
 * that moves `organization_id` / `storage_key` / `sha256`) live in the
 * migration, not in this DSL — repo convention.
 */
import {
  bigint,
  boolean,
  char,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { isNull, sql } from "drizzle-orm"

import { app_user } from "./app_user"
import { betaDocumentStatus, betaDocumentType } from "./_enums"
import { organization } from "./organization"

export const document = pgTable(
  "document",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),

    doc_type: betaDocumentType("doc_type").notNull().default("other"),
    status: betaDocumentStatus("status").notNull().default("received"),

    /** As the uploader's filesystem spelled it. Never used to build a key. */
    original_filename: text("original_filename").notNull(),
    /** `org/<organization uuid>/<object uuid>.<ext>` — opaque by construction. */
    storage_key: text("storage_key").notNull(),

    /** Sniffed from the leading bytes; the client's declared type is ignored. */
    content_type: text("content_type").notNull(),
    extension: varchar("extension", { length: 8 }).notNull(),

    /**
     * `bigint` with `mode: "number"`: the DB column is 8 bytes for headroom, but
     * every value is capped at 25 MiB by a CHECK, which is nine orders of
     * magnitude below `Number.MAX_SAFE_INTEGER`. This is a byte count, not
     * money — the `Money`/string rule does not apply.
     */
    byte_size: bigint("byte_size", { mode: "number" }).notNull(),
    /** Hex sha256 of the stored bytes; feeds the duplicate soft-detect. */
    sha256: char("sha256", { length: 64 }).notNull(),

    /** Office-typed display fields (spec §2.2). Nothing writes them in PR 10. */
    document_date: date("document_date"),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    site_ref: text("site_ref"),

    /** Written by the office FOR the client; part of every client projection. */
    office_message: text("office_message"),
    /** The office's own layer. Never serialised below owner. */
    internal_note: text("internal_note"),

    visible_to_client: boolean("visible_to_client").notNull().default(true),

    /**
     * Payslip groundwork (spec §4). FK-less until PR 29 / PR 16 introduce the
     * tables they reference; those PRs add the constraints.
     */
    payslip_employee_id: uuid("payslip_employee_id"),
    payslip_period_id: uuid("payslip_period_id"),

    uploaded_by_user_id: uuid("uploaded_by_user_id").references(
      () => app_user.id,
      { onDelete: "set null" },
    ),

    /** Soft delete: never listed, never served, never counted against quota. */
    deleted_at: timestamp("deleted_at", { withTimezone: true }),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("document_storage_key_unique").on(table.storage_key),
    uniqueIndex("document_organization_sha256_unique")
      .on(table.organization_id, table.sha256)
      .where(isNull(table.deleted_at)),
    index("document_organization_created_idx")
      .on(table.organization_id, table.created_at.desc())
      .where(isNull(table.deleted_at)),
  ],
)

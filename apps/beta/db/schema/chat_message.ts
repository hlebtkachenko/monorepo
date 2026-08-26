/**
 * chat_message — the transcript of one Asistent conversation (spec §2.8).
 *
 * Mirrors: apps/beta/db/migrations/0018_assistant.sql (CREATE TABLE
 * chat_message).
 *
 * APPEND-ONLY at the database (trigger `chat_message_is_append_only`), which is
 * why this module exports no update path and no update path can be written. The
 * Hleb gate on client exposure is discharged by reviewing a real adversarial
 * transcript; a transcript that can be edited afterwards is not evidence.
 *
 * There is no `system` role — the system prompt is a versioned FILE
 * (`lib/assistant/system-prompt.cs.ts`), stamped on `chat.prompt_version`, not
 * a row in this table. See the migration for why.
 *
 * DB-enforced invariants, all in the migration:
 *   - `chat_message_content_shape` — 1..100 000 trimmed chars.
 *   - `chat_message_chat_fk` — COMPOSITE (chat_id, organization_id), so a
 *     message can never name a chat in another book.
 *   - trigger `chat_message_is_append_only` — UPDATE refused; DELETE stays
 *     available so deleting a chat (and an organization) cascades.
 */
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { betaChatRole } from "./_enums"
import { organization } from "./organization"

export const chat_message = pgTable(
  "chat_message",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    chat_id: uuid("chat_id").notNull(),
    role: betaChatRole("role").notNull(),
    content: text("content").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The composite `chat_message_chat_fk` is declared in the migration only,
    // mirroring `asset_event`: the DSL is the typed READ of the SQL, and the
    // drift test compares tables, columns and enums, not constraints.
    index("chat_message_chat_idx").on(table.chat_id, table.id),
    index("chat_message_organization_idx").on(table.organization_id),
  ],
)

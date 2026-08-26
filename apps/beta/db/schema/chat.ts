/**
 * chat — one Asistent conversation (spec §2.8: the sidebar chat list).
 *
 * Mirrors: apps/beta/db/migrations/0018_assistant.sql (CREATE TABLE chat).
 *
 * PRIVATE TO ITS AUTHOR, NOT SHARED ACROSS THE BOOK. `user_id` is a stored
 * column, not just a query filter, and every read in `lib/data/assistant.ts`
 * matches on `organization_id` AND `user_id`. An org-wide chat list would
 * publish one colleague's questions to the others.
 *
 * DB-enforced invariants, all in the migration:
 *   - `chat_title_shape` — a title is either absent or 1..120 trimmed chars.
 *   - `chat_prompt_version_present` — every chat records the system-prompt file
 *     version in force when it started.
 *   - trigger `chat_freeze_identity` — a chat never changes books OR owners.
 *   - trigger `chat_touch_updated_at` — `updated_at` is the retention key
 *     (spec §2.8: chats older than 12 months are purged).
 */
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { app_user } from "./app_user"
import { organization } from "./organization"

export const chat = pgTable(
  "chat",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** The one person who can read this conversation. */
    user_id: uuid("user_id")
      .notNull()
      .references(() => app_user.id, { onDelete: "cascade" }),
    /**
     * NULL until renamed. The Czech placeholder ("Nový chat") is an i18n key,
     * never a database default — see the migration.
     */
    title: text("title"),
    /** `ASSISTANT_SYSTEM_PROMPT_VERSION` at the moment the chat was created. */
    prompt_version: text("prompt_version").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Last activity — the retention sweep's key, not the creation date. */
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("chat_organization_user_idx").on(
      table.organization_id,
      table.user_id,
      table.updated_at.desc(),
    ),
    index("chat_updated_at_idx").on(table.updated_at),
  ],
)

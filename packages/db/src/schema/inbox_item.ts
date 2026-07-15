/**
 * inbox_item — provenance record for one APPROVED gated write ("Created by
 * Agent"). One row per landed proposal; the domain rows it landed carry its id
 * in their `inbox_id` column.
 *
 * Mirrors: packages/db/migrations/0061_inbox_item.sql
 *
 * WORKSPACE-scoped (NOT organization-scoped): intake context precedes org filing
 * and can be re-filed between the office's companies (ADR-0029). Absent from
 * ORGANIZATION_SCOPED_TABLES, present in WORKSPACE_SCOPED_TABLES; 4
 * command-specific RLS policies on workspace_id land in 0061.
 *
 * UNIQUE(id, workspace_id) = composite-FK target for the workspace-carrying
 * landed tables (summary_record / accounting_event / open_item), RLS-safe.
 * UNIQUE(workspace_id, tool_call_log_id) = one inbox_item per approved held
 * write. tool_call_log_id is a BARE uuid (NO FK): tool_call_log is org-scoped, a
 * workspace->org FK would bypass RLS. inbox_attachment_id is a composite FK (both
 * workspace-scoped). RLS / grants live in the migration, not this DSL.
 */
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { inbox_attachment } from "./inbox_attachment"
import { workspace } from "./workspace"

export const inbox_item = pgTable(
  "inbox_item",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    // The gated write (tool_call_log row) this landed from. BARE uuid, NO FK.
    tool_call_log_id: uuid("tool_call_log_id").notNull(),
    // Optional source blob (composite FK — both tables workspace-scoped).
    inbox_attachment_id: uuid("inbox_attachment_id"),
    // The gated operation the write targeted (createAccountingEvent, …).
    kind: text("kind").notNull(),
    // How it was received (e.g. 'agent').
    source: text("source"),
    // Denormalized counterparty label for the inbox list.
    counterparty_name: text("counterparty_name"),
    // The agent's rationale for the write.
    reasoning: text("reasoning"),
    // Actor that authored the underlying write (from tool_call_log.actor_kind).
    created_by: text("created_by").notNull(),
    // Landed-fact lifecycle (NOT proposal lifecycle).
    status: text("status").notNull().default("APPLIED"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("inbox_item_id_workspace_unique").on(t.id, t.workspace_id),
    unique("inbox_item_workspace_tool_call_unique").on(
      t.workspace_id,
      t.tool_call_log_id,
    ),
    foreignKey({
      name: "inbox_item_attachment_fk",
      columns: [t.inbox_attachment_id, t.workspace_id],
      foreignColumns: [inbox_attachment.id, inbox_attachment.workspace_id],
    }),
    check(
      "inbox_item_status_valid",
      sql`${t.status} IN ('APPLIED', 'SUPERSEDED', 'REVERSED', 'CORRECTED')`,
    ),
    index("inbox_item_workspace_created_idx").on(
      t.workspace_id,
      t.created_at.desc(),
    ),
  ],
)

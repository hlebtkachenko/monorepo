import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { workspace } from "./workspace"

export const admin_workspace_allowlist = pgTable("admin_workspace_allowlist", {
  workspace_id: uuid("workspace_id")
    .primaryKey()
    .references(() => workspace.id, { onDelete: "cascade" }),
  added_at: timestamp("added_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  added_by: text("added_by").notNull().default("system"),
})

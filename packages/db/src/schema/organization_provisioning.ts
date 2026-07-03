/**
 * organization_provisioning — workspace-tier idempotency + registry provenance
 * for the org creation-scaffolding protocol.
 *
 * Mirrors: packages/db/migrations/0041_org_scaffolding.sql (CREATE TABLE)
 *
 * WORKSPACE-scoped (NOT organization-scoped): the idempotency replay lookup runs
 * BEFORE any app.organization_id GUC exists, so the RLS policy keys on
 * app.workspace_id (like counterparty). One row per scaffolding attempt, keyed on
 * (workspace_id, idempotency_key). Carries the ARES/DPH snapshots (folds the
 * separate registry_snapshot concept in) — never logged, PII behind RLS.
 * RLS policies + GRANT live in the migration, not this DSL.
 */
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { organization } from "./organization"
import { workspace } from "./workspace"

export const organization_provisioning = pgTable(
  "organization_provisioning",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    workspace_id: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    idempotency_key: text("idempotency_key").notNull(),
    // The flat ScaffoldInput the orchestrator consumed (audit / replay).
    input: jsonb("input").notNull(),
    // Raw ARES / DPH-registry payloads captured at prefill time (provenance).
    ares_snapshot: jsonb("ares_snapshot"),
    dph_snapshot: jsonb("dph_snapshot"),
    // The org this attempt produced; replay returns it.
    organization_id: uuid("organization_id").references(() => organization.id),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("organization_provisioning_key_unique").on(
      t.workspace_id,
      t.idempotency_key,
    ),
  ],
)

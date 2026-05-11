/**
 * Drizzle pgEnum declarations — single source of truth.
 *
 * Every enum declaration here MUST mirror the SQL exactly. If a future
 * migration adds a value via `ALTER TYPE ... ADD VALUE`, the same PR MUST
 * update this file.
 *
 * Comments point to the migration that creates each SQL enum.
 */
import { pgEnum } from "drizzle-orm/pg-core"

// Mirrors: packages/db/migrations/0004_audit.sql — CREATE TYPE actor_kind AS ENUM
export const actorKind = pgEnum("actor_kind", [
  "human",
  "ai",
  "ai_on_behalf",
  "system",
])

// Mirrors: packages/db/migrations/0005_workspace.sql — CREATE TYPE workspace_role AS ENUM
export const workspaceRole = pgEnum("workspace_role", [
  "owner",
  "admin",
  "member",
])

// Mirrors: packages/db/migrations/0005_workspace.sql — CREATE TYPE organization_role AS ENUM
export const organizationRole = pgEnum("organization_role", [
  "owner",
  "admin",
  "member",
  "agent",
  "guest",
])

// Mirrors: packages/db/migrations/0002_auth.sql — CREATE TYPE invite_status AS ENUM
export const inviteStatus = pgEnum("invite_status", [
  "pending",
  "accepted",
  "revoked",
  "expired",
])

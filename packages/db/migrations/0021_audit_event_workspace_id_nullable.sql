-- Migration 0021: relax audit_event.workspace_id to NULLABLE (AFF-208).
--
-- Pre-account auth events (failed login of an unknown email, signup probes,
-- magic-link send/consume failures before a session exists) carry no
-- workspace context — `writeAuditEventGlobal` silently skipped them because
-- audit_event.workspace_id was NOT NULL. Those are precisely the most
-- forensically interesting events. Relax the column and update the RLS
-- predicates so NULL rows remain invisible to tenant-bound app_user
-- connections; only `withAdminBypass` (BYPASSRLS) can read them.
--
-- This is the single-table answer (advisor verdict Option A): the event
-- shape is identical to a workspace-bound audit_event, only the scoping
-- column is legitimately unknown. ADR-0011's two-table split is about AI
-- tool calls vs workspace events, not a third event-shape category, so a
-- new `auth_audit_event` table would only fragment the timeline.
--
-- Reversal: re-add NOT NULL after backfilling NULL rows to a sentinel
-- workspace; then recreate the original RLS policies without the
-- `workspace_id IS NOT NULL` guard.

BEGIN;

-- 1. Drop NOT NULL on workspace_id ------------------------------------------
ALTER TABLE audit_event ALTER COLUMN workspace_id DROP NOT NULL;

-- 2. Recreate RLS policies with explicit NULL-row exclusion -----------------
-- Tenant-bound reads (workspace admins + organization members) must never
-- see pre-account rows. Only withAdminBypass (BYPASSRLS) sees them.
-- The INSERT policy is recreated with the same predicate; pre-account
-- inserts go through withAdminBypass so they bypass RLS entirely.

DROP POLICY IF EXISTS audit_event_ws_admin_read    ON audit_event;
DROP POLICY IF EXISTS audit_event_org_member_read  ON audit_event;
DROP POLICY IF EXISTS audit_event_insert           ON audit_event;

CREATE POLICY audit_event_ws_admin_read ON audit_event
  FOR SELECT
  USING (
    workspace_id IS NOT NULL
    AND workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_admin(
          audit_event.workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

CREATE POLICY audit_event_org_member_read ON audit_event
  FOR SELECT
  USING (
    workspace_id    IS NOT NULL
    AND workspace_id    = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND organization_id IS NOT NULL
    AND organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    AND app_is_workspace_member(
          audit_event.workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

CREATE POLICY audit_event_insert ON audit_event
  FOR INSERT
  WITH CHECK (
    workspace_id IS NOT NULL
    AND workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_member(
          audit_event.workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

-- 3. ws+org consistency trigger already handles NULL workspace_id correctly:
--    its body early-returns when `NEW.organization_id IS NULL` and otherwise
--    compares organization.workspace_id to NEW.workspace_id (which can now
--    legitimately be NULL — IS DISTINCT FROM still rejects the mismatch).
--    Pre-account rows pass through with both columns NULL, which is the
--    intended shape. No trigger change needed.

COMMIT;

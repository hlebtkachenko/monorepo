-- Pre-v1 DB hardening (audit findings DB-03 / DB-04 / DB-05).
--
-- 1. DB-03 — plain btree indexes for the hot FK columns that have no usable
--    index for FK enforcement (Postgres does not auto-index FK columns; every
--    delete on the referenced table seq-scans the referencing table):
--      - organization_membership.workspace_membership_id  (CASCADE from
--        workspace_membership delete — a normal admin operation)
--      - impersonation.auth_session_id                    (SET NULL — fires on
--        every auth_session delete, i.e. routine session cleanup)
--      - auth_verification.workspace_id                   (CASCADE from
--        workspace delete)
--      - api_key.workspace_id                             (CASCADE from
--        workspace delete)
--    Plain CREATE INDEX (not CONCURRENTLY) is deliberate: all four tables are
--    tiny pre-v1, and CONCURRENTLY cannot run inside the transactional
--    migration runner. The remaining un-indexed FK columns from the audit are
--    accepted while tables are small (revisit before tool_call_log /
--    auth_token grow).
--
-- 2. DB-04 — drop `workspace_billing_workspace_idx`: it duplicates the
--    primary key index (workspace_id IS the PK). Pure write overhead.
--
-- 3. DB-05 — `impersonation.workspace_id` FK changes ON DELETE CASCADE →
--    NO ACTION. The impersonation table is an audit envelope for compliance
--    + SLA reporting; compliance records must NOT vanish with tenant
--    deletion. Aligns with audit_event, whose FKs are NO ACTION for exactly
--    this reason.
--
-- Idempotent: IF NOT EXISTS / IF EXISTS forms; the FK swap is a
-- DROP-IF-EXISTS + ADD pair inside the transaction.

BEGIN;

-- DB-03 — FK-enforcement indexes (hot set).
CREATE INDEX IF NOT EXISTS organization_membership_ws_membership_idx
  ON organization_membership (workspace_membership_id);

CREATE INDEX IF NOT EXISTS impersonation_auth_session_idx
  ON impersonation (auth_session_id);

CREATE INDEX IF NOT EXISTS auth_verification_workspace_idx
  ON auth_verification (workspace_id);

CREATE INDEX IF NOT EXISTS api_key_workspace_idx
  ON api_key (workspace_id);

-- DB-04 — duplicate of the workspace_billing primary key index.
DROP INDEX IF EXISTS workspace_billing_workspace_idx;

-- DB-05 — impersonation is an audit record: do not cascade-delete it with
-- the workspace. NO ACTION means a workspace with impersonation history
-- cannot be hard-deleted without an explicit, audited cleanup decision.
ALTER TABLE impersonation
  DROP CONSTRAINT IF EXISTS impersonation_workspace_id_fkey;
ALTER TABLE impersonation
  ADD CONSTRAINT impersonation_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE NO ACTION;

COMMIT;

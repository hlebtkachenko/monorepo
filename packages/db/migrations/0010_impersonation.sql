-- Migration 0010: Impersonation audit envelope + two_factor_policy.
--
-- Creates:
--   impersonation        workspace-tier audit record for admin impersonation sessions
--   two_factor_policy    per-workspace 2FA enforcement governance
--
-- Design decisions:
--   - impersonation is workspace-tier: Better Auth owns the live session
--     via auth_session.impersonated_by; this table is the compliance record.
--   - All RLS policies use NULLIF guards.
--   - Consistency trigger (app_impersonation_ws_org_consistent) is SECURITY DEFINER
--     so it can read actual workspace/org values regardless of caller RLS.
--   - app_user cannot INSERT/UPDATE/DELETE impersonation rows directly;
--     every lifecycle mutation goes through withAdminBypass.
--   - two_factor_policy: workspace admins read/write; workspace members read
--     (so the future enforcement middleware can check policy without elevating).

BEGIN;

-- 1. impersonation ------------------------------------------------------------

CREATE TABLE impersonation (
  id                  uuid         NOT NULL DEFAULT uuidv7(),
  workspace_id        uuid         NOT NULL REFERENCES workspace(id)    ON DELETE CASCADE,
  organization_id     uuid                  REFERENCES organization(id) ON DELETE SET NULL,
  actor_user_id       uuid         NOT NULL REFERENCES app_user(id)     ON DELETE RESTRICT,
  target_user_id      uuid         NOT NULL REFERENCES app_user(id)     ON DELETE RESTRICT,
  reason              text         NOT NULL,
  auth_session_id     uuid                  REFERENCES auth_session(id) ON DELETE SET NULL,
  started_at          timestamptz  NOT NULL DEFAULT now(),
  ended_at            timestamptz,
  expected_end_at     timestamptz  NOT NULL,
  CONSTRAINT impersonation_pkey                  PRIMARY KEY (id),
  CONSTRAINT impersonation_actor_target_distinct CHECK (actor_user_id <> target_user_id),
  CONSTRAINT impersonation_envelope_ordered      CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT impersonation_expected_after_start  CHECK (expected_end_at >= started_at),
  CONSTRAINT impersonation_reason_length         CHECK (length(reason) BETWEEN 8 AND 500)
);

COMMENT ON TABLE  impersonation                 IS 'Workspace-tier audit envelope for admin impersonation sessions. Better Auth owns the live session via auth_session.impersonated_by; this table records the start/end window for compliance + SLA reporting.';
COMMENT ON COLUMN impersonation.organization_id IS 'NULL = workspace-tier inspection; non-NULL = organization the impersonation session was actively operating against at start.';
COMMENT ON COLUMN impersonation.auth_session_id IS 'Better Auth session that performed the actual user switch. ON DELETE SET NULL because cleanup-auth-sessions cron hard-deletes expired sessions.';
COMMENT ON COLUMN impersonation.expected_end_at IS 'Predicted close time at start (started_at + better-auth impersonationSessionDuration). The impersonation-envelope-closer cron fills ended_at when this passes with ended_at IS NULL.';

CREATE INDEX impersonation_workspace_started_idx
  ON impersonation (workspace_id, started_at DESC);
CREATE INDEX impersonation_actor_started_idx
  ON impersonation (actor_user_id, started_at DESC);
CREATE INDEX impersonation_target_started_idx
  ON impersonation (target_user_id, started_at DESC);
CREATE INDEX impersonation_open_idx
  ON impersonation (workspace_id, started_at DESC)
  WHERE ended_at IS NULL;

-- Workspace+org consistency trigger (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION app_impersonation_ws_org_consistent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  ws_org uuid;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT workspace_id INTO ws_org FROM organization WHERE id = NEW.organization_id;
  IF ws_org IS NULL OR ws_org <> NEW.workspace_id THEN
    RAISE EXCEPTION 'impersonation: organization.workspace_id (%) must equal impersonation.workspace_id (%)', ws_org, NEW.workspace_id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_impersonation_ws_org_consistent() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app_impersonation_ws_org_consistent() FROM PUBLIC;

CREATE TRIGGER impersonation_ws_org_consistent
  BEFORE INSERT OR UPDATE ON impersonation
  FOR EACH ROW EXECUTE FUNCTION app_impersonation_ws_org_consistent();

-- RLS: workspace-admin read + target-self read; INSERT/UPDATE/DELETE only via app_admin.
ALTER TABLE impersonation ENABLE ROW LEVEL SECURITY;
ALTER TABLE impersonation FORCE  ROW LEVEL SECURITY;

CREATE POLICY impersonation_ws_admin_read ON impersonation
  FOR SELECT TO app_user
  USING (
    workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_admin(
          workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

CREATE POLICY impersonation_target_self_read ON impersonation
  FOR SELECT TO app_user
  USING (target_user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- app_user cannot INSERT, UPDATE, or DELETE: every impersonation lifecycle
-- mutation goes through withAdminBypass from the admin console route handler.
REVOKE INSERT, UPDATE, DELETE ON impersonation FROM app_user;
GRANT  SELECT                  ON impersonation TO app_user;
GRANT  SELECT, INSERT, UPDATE, DELETE ON impersonation TO app_admin;

-- 2. two_factor_policy --------------------------------------------------------

CREATE TABLE two_factor_policy (
  workspace_id           uuid     NOT NULL PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  required_for_owners    boolean  NOT NULL DEFAULT false,
  required_for_admins    boolean  NOT NULL DEFAULT false,
  required_for_members   boolean  NOT NULL DEFAULT false,
  grace_period_days      integer  NOT NULL DEFAULT 30 CHECK (grace_period_days BETWEEN 0 AND 90),
  enforced_at            timestamptz,
  declared_by_user_id    uuid              REFERENCES app_user(id) ON DELETE SET NULL,
  declared_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  two_factor_policy             IS 'Per-workspace 2FA enforcement policy. v1 stores intent only; Phase 6 wires the middleware that reads enforced_at + workspace_membership.mfa_grace_until to gate sign-ins.';
COMMENT ON COLUMN two_factor_policy.enforced_at IS 'NULL = policy declared but not yet enforced. Non-NULL = enforcement clock running; sign-ins outside the grace window block.';

CREATE OR REPLACE FUNCTION app_two_factor_policy_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_two_factor_policy_set_updated_at() OWNER TO app_owner;

CREATE TRIGGER two_factor_policy_set_updated_at
  BEFORE UPDATE ON two_factor_policy
  FOR EACH ROW EXECUTE FUNCTION app_two_factor_policy_set_updated_at();

ALTER TABLE two_factor_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE two_factor_policy FORCE  ROW LEVEL SECURITY;

-- NULLIF guards on all policies.
CREATE POLICY two_factor_policy_ws_admin_all ON two_factor_policy
  FOR ALL TO app_user
  USING (
    workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_admin(
          workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_admin(
          workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

CREATE POLICY two_factor_policy_ws_member_read ON two_factor_policy
  FOR SELECT TO app_user
  USING (
    workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_member(
          workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON two_factor_policy TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON two_factor_policy TO app_admin;

COMMIT;

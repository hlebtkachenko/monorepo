-- Migration 0008: Global feature-flag registry.
--
-- Creates:
--   feature_flag table (global kill-switch / rollout toggle catalog)
--
-- Tenancy: NOT RLS-bound (global catalog, no organization_id).
-- SELECT-only for app_user; writes go through withAdminBypass (app_admin,
-- BYPASSRLS). Per-workspace override table is deferred; first per-workspace
-- flag use case will add feature_flag_workspace_override.
--
-- Key shape: dotted-lowercase namespace (e.g. lago.resolver.enabled).
-- Single-segment keys are rejected by the CHECK constraint so the namespace
-- prefix is always meaningful.

BEGIN;

CREATE TABLE IF NOT EXISTS feature_flag (
  key          text         PRIMARY KEY,
  description  text         NOT NULL,
  enabled      boolean      NOT NULL DEFAULT false,
  payload      jsonb,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT feature_flag_key_dotted_lowercase
    CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

COMMENT ON TABLE feature_flag IS
  'Global feature-flag registry for rollout toggles and kill-switches. NOT RLS-bound (global like currency). SELECT-only for app_user; writes via withAdminBypass.';

COMMENT ON COLUMN feature_flag.key IS
  'Dotted-lowercase namespace shape (e.g. lago.resolver.enabled). Single-segment keys forbidden by CHECK constraint so the namespace prefix is always meaningful.';

COMMENT ON COLUMN feature_flag.payload IS
  'Optional jsonb for flags that need richer state than enabled/disabled (percentage threshold, allowlisted workspace ids during a soft rollout).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT ON feature_flag TO app_user;
  END IF;
END
$$;

COMMIT;

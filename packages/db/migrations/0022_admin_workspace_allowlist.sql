-- Admin workspace allowlist: controls which workspace members can access
-- the admin portal. Replaces the ADMIN_WORKSPACE_ALLOWLIST env var so
-- access changes no longer require a redeploy.
--
-- Fail-closed: empty table = nobody authorized (same as empty env var).

CREATE TABLE admin_workspace_allowlist (
  workspace_id UUID PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by     TEXT        NOT NULL DEFAULT 'system'
);

COMMENT ON TABLE admin_workspace_allowlist IS
  'Workspace IDs whose members may sign into the admin portal. Empty = deny all.';

ALTER TABLE admin_workspace_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_workspace_allowlist FORCE ROW LEVEL SECURITY;

-- app_user (web/admin runtime) can SELECT but not mutate.
CREATE POLICY admin_allowlist_read ON admin_workspace_allowlist
  FOR SELECT
  TO app_user
  USING (true);

-- app_admin (BYPASSRLS) inherits full access — withAdminBypass can write.
-- No explicit policy needed; BYPASSRLS skips RLS entirely.

-- Explicit deny on INSERT/UPDATE/DELETE for app_user via no matching policy.
-- RLS FORCE + no INSERT/UPDATE/DELETE policy = denied.

GRANT SELECT ON admin_workspace_allowlist TO app_user;
GRANT ALL    ON admin_workspace_allowlist TO app_admin;

-- Admin workspace allowlist: controls which workspace members can access
-- the admin portal. Replaces the ADMIN_WORKSPACE_ALLOWLIST env var so
-- access changes no longer require a redeploy.
--
-- Fail-closed: empty table = nobody authorized (same as empty env var).
--
-- Idempotent: prod deploy 26392392977 half-applied this migration when the
-- _app_migrations INSERT failed on a missing `checksum` column. The DDL
-- below had already committed (autocommit, no enclosing txn). The BEGIN
-- /COMMIT wrapper + IF NOT EXISTS / DROP-then-CREATE forms make it safe
-- to re-apply on the partial state AND on fresh databases.

BEGIN;

CREATE TABLE IF NOT EXISTS admin_workspace_allowlist (
  workspace_id UUID PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by     TEXT        NOT NULL DEFAULT 'system'
);

COMMENT ON TABLE admin_workspace_allowlist IS
  'Workspace IDs whose members may sign into the admin portal. Empty = deny all.';

ALTER TABLE admin_workspace_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_workspace_allowlist FORCE ROW LEVEL SECURITY;

-- app_user (web/admin runtime) can SELECT but not mutate.
DROP POLICY IF EXISTS admin_allowlist_read ON admin_workspace_allowlist;
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

COMMIT;

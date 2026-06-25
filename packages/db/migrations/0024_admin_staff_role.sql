-- Admin staff role: per-user role assignment for the admin portal. Decoupled
-- from `workspace_membership.role` so admin authz can evolve independently of
-- tenant authz. A user must ALSO be in `admin_workspace_allowlist` via an
-- active membership to reach the admin layout — this table only narrows
-- WHICH sections they can see once they're inside.
--
-- Fail-safe defaults:
--   • User missing from this table → effective role = 'guest'
--   • 'guest' = Home + own profile + changelog only
--   • Only 'owner' may write to this table; everyone else read-only
--
-- Roles (7):
--   owner      — full access; only role that can change roles or run nukes
--   admin      — broad day-to-day staff role
--   developer  — dev/MCP/SDK/sandbox/feature-flag-read
--   designer   — design system, growth previews, product surface
--   support    — orgs/users read, ack tickets, refresh views
--   security   — impersonation control, audit, sessions, 2FA enforcement
--   guest      — minimal default for new staff

CREATE TABLE admin_staff_role (
  user_id    UUID PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN (
    'owner','admin','developer','designer','support','security','guest'
  )),
  granted_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes      TEXT
);

CREATE INDEX admin_staff_role_role_idx ON admin_staff_role (role);

COMMENT ON TABLE admin_staff_role IS
  'Per-user role inside the admin portal. Missing row = guest (minimal access). Independent of workspace_membership.role.';

ALTER TABLE admin_staff_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_staff_role FORCE ROW LEVEL SECURITY;

-- No policy for app_user → deny-all read/write. All admin role lookups go
-- through `withAdminBypass` (app_admin BYPASSRLS). This keeps the staff role
-- table invisible to a compromised tenant connection.

GRANT ALL ON admin_staff_role TO app_admin;

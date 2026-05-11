-- 01-grants.sql — Default privileges for future tables.
--
-- Runs after 00-roles.sql in dictionary order. Sets up ALTER DEFAULT PRIVILEGES
-- so tables created by app_owner in the public schema automatically receive
-- SELECT/INSERT/UPDATE/DELETE grants to app_user and app_admin.
--
-- Without this, every migration that creates a new table must explicitly GRANT
-- access. With this, migrations only need to REVOKE specific privileges where
-- the append-only contract applies (e.g. tool_call_log, audit_event in 0004).
--
-- The DEFAULT PRIVILEGES block applies to objects created BY app_owner in the
-- future. Existing tables (created in previous sessions) are not affected; those
-- must be granted explicitly in each migration.

\set ON_ERROR_STOP on

ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_admin;

ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_admin;

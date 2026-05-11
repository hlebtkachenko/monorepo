-- 00-roles.sql — Postgres role bootstrap for local dev
--
-- Runs on container init via the standard postgres image's /docker-entrypoint-initdb.d
-- pipeline. Executed exactly once when the data dir is empty. Re-runs (e.g. after
-- volume reset) are idempotent via the DO/EXCEPTION pattern below.
--
-- Roles match the contracts assumed by packages/db migrations and by the
-- packages/db runtime tenancy helpers (Section 2 of the lac-port plan):
--
--   app_owner   SUPERUSER LOGIN  — runs migrations + owns objects + owns
--                                  SECURITY DEFINER functions. SUPERUSER is
--                                  dev-only; in RDS prod this maps to the
--                                  master user (rds_superuser-equivalent),
--                                  not a true SUPERUSER.
--   app_admin   BYPASSRLS NOLOGIN — used via SET LOCAL ROLE inside
--                                  withAdminBypass(); never connects
--                                  directly. BYPASSRLS so admin paths can
--                                  read across tenant boundaries.
--   app_user    LOGIN             — the application connection role.
--                                  RLS applies (FORCE RLS on tenant tables).
--   app_worker  NOLOGIN           — used via SET LOCAL ROLE inside the
--                                  pg-boss worker connection; SELECT/UPDATE
--                                  on permissions_outbox.
--
-- Passwords are dev-only literals. Production RDS gets credentials via
-- Secrets Manager, see ADR-0007 (single-account CDK) and ADR-0008
-- (Cloudflare Tunnel front door).
--
-- See ADR-0009 for the ORM + migration style decision that drives this
-- role topology.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    CREATE ROLE app_owner WITH SUPERUSER LOGIN PASSWORD 'dev_owner';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin WITH BYPASSRLS NOLOGIN;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD 'dev_user';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_worker') THEN
    CREATE ROLE app_worker WITH NOLOGIN;
  END IF;
END
$$;

-- Inheritance chain: app_user inherits app_admin's DML grants.
-- This carries forward lac's role topology and means catalog REVOKEs on
-- app_user are no-op as long as the inheritance is in place. Trigger
-- enforcement (BEFORE UPDATE / DELETE / TRUNCATE on audit tables, the
-- last-owner-demotion trigger on workspace_membership) is the load-bearing
-- defense layer. The trade-off is documented in the inline comment block
-- at the bottom of packages/db/migrations/0004_audit.sql and will be
-- formalized in a future ADR on audit-log design.
GRANT app_admin TO app_user;
GRANT app_worker TO app_user;

-- Default per-role GUC for the last-owner-demotion trigger fail-closed
-- check (packages/db/migrations/0005_workspace.sql). The runtime
-- tenancy helpers (withWorkspace/withOrganization) override this via
-- SET LOCAL on every transaction, but a per-role default catches the
-- case where someone forgets the SET LOCAL on a one-off connection.
ALTER ROLE app_user SET app.app_user_role_name = 'app_user';
ALTER ROLE app_owner SET app.app_user_role_name = 'app_owner';

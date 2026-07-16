-- 0063_brain_admission_slot.sql
--
-- brain_admission_slot — cross-instance concurrent-run admission caps (ADR-0028
-- §Decision.1, closes #472).
--
-- WHAT: a shared-state backing table for the Brain write-lane admission
-- controller. The in-memory `AdmissionController` (packages/db/src/admission.ts)
-- caps concurrency within ONE API process; behind the multi-task Fargate service
-- each container has its own counter, so N containers admit N× the intended
-- global cap. This table moves the counter into Postgres: every admitted run
-- holds one `scope='global'` row + one `scope='org'` row, and `acquire` counts
-- live rows across ALL instances inside one advisory-locked transaction. The
-- `DbAdmissionController` (same file) reads/writes this table; the in-memory
-- controller stays the default until `ACCOUNTING_ADMISSION_SHARED=1` flips it.
--
-- WHY NO RLS (deliberate — this is the one place a Brain-adjacent table omits
-- it): this is an infrastructure / admin-plane table, NOT tenant data. It holds
-- no organization-owned facts — only a scope tag, a scope key (the raw
-- organizationId string, already a non-secret public identifier), the API
-- instance id, and two timestamps. It is never read through a tenant-bound
-- (`withOrganization` / `withWorkspace`) connection; it is touched ONLY by the
-- admission module on the base app connection (acquire/release/heartbeat) and by
-- the backstop reaper via `withAdminBypass`. Adding RLS keyed on
-- `app.organization_id` would break the GLOBAL count (a run must see every
-- instance's rows, across all orgs, to enforce the global cap) — so RLS is not
-- just unnecessary here, it is actively wrong for this table's purpose. Access
-- is bounded by table GRANTs instead (app_user + app_admin only).
--
-- LIFECYCLE: rows are ephemeral. `acquire` reaps dead holders inline
-- (`heartbeat_at` older than 90s = 3 missed 30s heartbeats) before counting, so
-- a crashed instance's slots free themselves at the next acquire. A pg-boss
-- backstop reaper (packages/workers) sweeps every 5 minutes as belt-and-braces
-- for the case where `acquire` never runs again (traffic drains to zero).
--
-- Handwritten SQL (ADR-0009). One whole-file transaction; safe runner path.

BEGIN;

-- =============================================================================
-- 1. brain_admission_slot
-- =============================================================================
CREATE TABLE brain_admission_slot (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'global' rows count toward the whole-process cap; 'org' rows toward the
  -- per-organization cap. One acquire inserts exactly one of each.
  scope        text        NOT NULL CHECK (scope IN ('global', 'org')),
  -- For 'org' rows: the organizationId. For 'global' rows: the constant
  -- 'global' sentinel (the count filters on `scope`, not `scope_key`).
  scope_key    text        NOT NULL,
  -- Which API instance holds this slot (observability + crash attribution).
  instance_id  text        NOT NULL,
  acquired_at  timestamptz NOT NULL DEFAULT now(),
  -- Bumped every 30s by the holder's heartbeat timer; the inline + backstop
  -- reapers delete rows whose heartbeat has gone stale (dead holder).
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);

-- Serves both count paths: the global count (scope) and the per-key count
-- (scope, scope_key). The reaper's heartbeat_at scan is a small-table seq scan.
CREATE INDEX brain_admission_slot_scope_key_idx
  ON brain_admission_slot (scope, scope_key);

-- =============================================================================
-- 2. GRANTs — NO RLS (see header). app_user is the API's base runtime role
--    (acquire/release/heartbeat); app_admin is the reaper's role via
--    withAdminBypass. Default privileges (01-grants.sql) already cover both for
--    app_owner-created tables; this explicit block is the belt-and-suspenders
--    for deploys where default privileges are not applied (e.g. RDS role setup).
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON brain_admission_slot TO app_user;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON brain_admission_slot TO app_admin;
  END IF;
END
$$;

COMMIT;

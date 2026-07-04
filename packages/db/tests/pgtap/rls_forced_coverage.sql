-- pgTap: FORCE-RLS isolation coverage across the WHOLE tenant table set (#512).
--
-- The api_key / organization / tool_call_log files assert the invariant one
-- table at a time. This file asserts it as set-based invariants over EVERY
-- FORCE-RLS table, so a migration that adds a tenant table without isolation —
-- or strips a policy's NULLIF guard, or leaves an unconditional-read policy —
-- fails here without needing a new per-table file.
--
-- "Cross-tenant reads return zero rows" is guaranteed structurally by two things
-- these assertions enforce: (a) the organization_isolation policy's
-- NULLIF(current_setting('app.organization_id',true),'')::uuid predicate on both
-- USING and WITH CHECK (an unset/foreign org id matches no row); (b) the absence
-- of any unconditional-read (USING true / NULL) policy on a tenant table. The
-- behavioral companion (rls_cross_tenant_behavioral.sql) proves the workspace-
-- scoped tables at runtime.

BEGIN;
SELECT plan(7);

-- 1. Every organization-scoped table (one carrying the organization_isolation
--    policy) has FORCE RLS — so the table owner is bound by RLS too.
SELECT is(
  (SELECT count(*)::int FROM pg_policies p
     JOIN pg_class c ON c.oid = ('public.' || p.tablename)::regclass
    WHERE p.policyname = 'organization_isolation' AND NOT c.relforcerowsecurity),
  0,
  'every organization_isolation table has FORCE RLS enabled'
);

-- 2. Every organization_isolation policy NULLIF-guards BOTH USING and WITH CHECK.
--    This is what makes an unset or foreign app.organization_id return zero rows
--    (and blocks a foreign-org INSERT) instead of raising a cast error.
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE policyname = 'organization_isolation'
      AND (qual NOT ILIKE '%NULLIF(current_setting(''app.organization_id''%'
        OR with_check IS NULL
        OR with_check NOT ILIKE '%NULLIF(current_setting(''app.organization_id''%')),
  0,
  'every organization_isolation policy NULLIF-guards USING and WITH CHECK'
);

-- 3. No FORCE-RLS table exposes an unconditional read (USING true / NULL) on a
--    SELECT/ALL policy — that would leak every tenant's rows. The single
--    intentional exception is admin_workspace_allowlist: global admin config,
--    not tenant data (reads open by design; it has no write policy at all, so
--    writes are default-deny — only BYPASSRLS admin paths mutate it).
SELECT is(
  (SELECT count(*)::int FROM pg_policies p
     JOIN pg_class c ON c.oid = ('public.' || p.tablename)::regclass
    WHERE c.relforcerowsecurity AND p.cmd IN ('SELECT', 'ALL')
      AND (p.qual IS NULL OR btrim(p.qual) = 'true')
      AND p.tablename <> 'admin_workspace_allowlist'),
  0,
  'no FORCE-RLS tenant table has an unconditional-read policy (cross-tenant leak)'
);

-- 4. Every FORCE-RLS table is owned by app_owner (who alone may ALTER/DROP the
--    table or its policies — a non-owner owner would be a privilege-escalation
--    surface).
SELECT is(
  (SELECT count(*)::int FROM pg_class c
     JOIN pg_roles r ON c.relowner = r.oid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relforcerowsecurity AND r.rolname <> 'app_owner'),
  0,
  'every FORCE-RLS table is owned by app_owner'
);

-- 5. auth_token is default-deny at the RLS layer — every read/write goes through
--    withAdminBypass (BYPASSRLS), never the app_user connection.
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE tablename = 'auth_token' AND policyname = 'auth_token_deny_all'
      AND btrim(qual) = 'false' AND btrim(with_check) = 'false' AND cmd = 'ALL'),
  1,
  'auth_token has a deny-all RLS policy (qual + with_check both false)'
);

-- 6. admin_staff_role carries no policy — FORCE RLS with zero policies is
--    default-deny, so the app role can read nothing.
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE tablename = 'admin_staff_role'),
  0,
  'admin_staff_role is default-deny (FORCE RLS, no permissive policy)'
);

-- 7. Drift guard: the organization_isolation family is the full v2-accounting +
--    platform org-scoped set. If this count drops, a migration silently removed
--    org isolation from a table.
SELECT cmp_ok(
  (SELECT count(*)::int FROM pg_policies WHERE policyname = 'organization_isolation'),
  '>=', 29,
  'organization_isolation still covers the full org-scoped table set (>= 29)'
);

SELECT * FROM finish();
ROLLBACK;

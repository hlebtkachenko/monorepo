-- pgTap: RLS invariants for the `api_key` table.
--
-- api_key rows hold credential hashes (sha256 of raw API keys) — a policy
-- drop or qual rewrite here is credential disclosure. Verifies: FORCE RLS
-- enabled, organization_isolation policy exists with NULLIF guard on both
-- USING and WITH CHECK, table owner is app_owner.

BEGIN;
SELECT plan(6);

-- 1. RLS is enabled
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.api_key'::regclass),
  'api_key: RLS is enabled'
);

-- 2. FORCE RLS is enabled (table owner is also bound by RLS)
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.api_key'::regclass),
  'api_key: FORCE RLS is enabled'
);

-- 3. Exactly one policy named `organization_isolation` exists
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
   WHERE tablename = 'api_key' AND policyname = 'organization_isolation'),
  1,
  'api_key: organization_isolation policy exists exactly once'
);

-- 4. Policy USING expression uses NULLIF guard (no bare cast)
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'api_key'
      AND policyname = 'organization_isolation'
      AND qual ILIKE '%NULLIF(current_setting(''app.organization_id''%'
  ),
  'api_key: policy USING expression uses NULLIF guard'
);

-- 5. Policy WITH CHECK expression uses NULLIF guard too (blocks foreign-org INSERT)
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'api_key'
      AND policyname = 'organization_isolation'
      AND with_check ILIKE '%NULLIF(current_setting(''app.organization_id''%'
  ),
  'api_key: policy WITH CHECK expression uses NULLIF guard'
);

-- 6. Table owner is app_owner (controls who can ALTER TABLE / DROP / etc)
SELECT is(
  (SELECT rolname FROM pg_class c JOIN pg_roles r ON c.relowner = r.oid
   WHERE c.oid = 'public.api_key'::regclass),
  'app_owner',
  'api_key: table owner is app_owner'
);

SELECT * FROM finish();
ROLLBACK;

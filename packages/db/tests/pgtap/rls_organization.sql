-- pgTap: RLS invariants for the `organization` table.
--
-- Verifies: FORCE RLS enabled, organization_isolation policy exists with
-- NULLIF guard, no other policies on the table, table owner is app_owner.

BEGIN;
SELECT plan(5);

-- 1. RLS is enabled
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.organization'::regclass),
  'organization: RLS is enabled'
);

-- 2. FORCE RLS is enabled (table owner is also bound by RLS)
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.organization'::regclass),
  'organization: FORCE RLS is enabled'
);

-- 3. Exactly one policy named `organization_isolation` exists
SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
   WHERE tablename = 'organization' AND policyname = 'organization_isolation'),
  1,
  'organization: organization_isolation policy exists exactly once'
);

-- 4. Policy uses NULLIF guard (no bare cast)
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'organization'
      AND policyname = 'organization_isolation'
      AND qual ILIKE '%NULLIF(current_setting(''app.organization_id''%'
  ),
  'organization: policy USING expression uses NULLIF guard'
);

-- 5. Table owner is app_owner (controls who can ALTER TABLE / DROP / etc)
SELECT is(
  (SELECT rolname FROM pg_class c JOIN pg_roles r ON c.relowner = r.oid
   WHERE c.oid = 'public.organization'::regclass),
  'app_owner',
  'organization: table owner is app_owner'
);

SELECT * FROM finish();
ROLLBACK;

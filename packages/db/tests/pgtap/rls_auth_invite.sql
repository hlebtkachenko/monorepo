-- pgTap: RLS invariants for the `auth_invite` table.
--
-- auth_invite is workspace-scoped + organization-scoped (always set).
-- Verifies the organization_isolation policy + the workspace_id NOT NULL
-- constraint that replaced the scope_consistent CHECK (post-fix).

BEGIN;
SELECT plan(5);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.auth_invite'::regclass),
  'auth_invite: RLS enabled'
);

SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.auth_invite'::regclass),
  'auth_invite: FORCE RLS enabled'
);

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
   WHERE tablename = 'auth_invite' AND policyname = 'organization_isolation'),
  1,
  'auth_invite: organization_isolation policy exists'
);

-- workspace_id is NOT NULL (replaced the redundant scope_consistent CHECK)
SELECT is(
  (SELECT attnotnull FROM pg_attribute
   WHERE attrelid = 'public.auth_invite'::regclass
     AND attname = 'workspace_id'),
  true,
  'auth_invite: workspace_id is NOT NULL (always workspace-scoped)'
);

-- Both FKs (organization + workspace) exist
SELECT ok(
  (SELECT COUNT(*)::int FROM pg_constraint
   WHERE conrelid = 'public.auth_invite'::regclass
     AND contype = 'f'
     AND conname IN ('auth_invite_organization_id_fkey', 'auth_invite_workspace_id_fkey')) = 2,
  'auth_invite: both organization_id + workspace_id FKs declared'
);

SELECT * FROM finish();
ROLLBACK;

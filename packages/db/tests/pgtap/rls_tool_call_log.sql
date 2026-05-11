-- pgTap: RLS + append-only invariants for `tool_call_log`.
--
-- Verifies: FORCE RLS, organization_isolation with NULLIF, append-only
-- triggers (BEFORE UPDATE limited, BEFORE DELETE block, BEFORE TRUNCATE block),
-- trigger function ownership.

BEGIN;
SELECT plan(8);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tool_call_log'::regclass),
  'tool_call_log: RLS enabled'
);

SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.tool_call_log'::regclass),
  'tool_call_log: FORCE RLS enabled'
);

SELECT is(
  (SELECT COUNT(*)::int FROM pg_policies
   WHERE tablename = 'tool_call_log' AND policyname = 'organization_isolation'),
  1,
  'tool_call_log: organization_isolation policy exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tool_call_log'
      AND policyname = 'organization_isolation'
      AND qual ILIKE '%NULLIF(current_setting(''app.organization_id''%'
  ),
  'tool_call_log: policy uses NULLIF guard'
);

-- Append-only triggers: BEFORE UPDATE (limited), BEFORE DELETE (block),
-- BEFORE TRUNCATE (block).
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.tool_call_log'::regclass
      AND tgname = 'tool_call_log_limited_update'
      AND NOT tgisinternal
  ),
  'tool_call_log: BEFORE UPDATE limited-update trigger exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.tool_call_log'::regclass
      AND tgname = 'tool_call_log_no_delete'
      AND NOT tgisinternal
  ),
  'tool_call_log: BEFORE DELETE block trigger exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.tool_call_log'::regclass
      AND tgname = 'tool_call_log_no_truncate'
      AND NOT tgisinternal
  ),
  'tool_call_log: BEFORE TRUNCATE block trigger exists'
);

-- SECURITY DEFINER trigger function must be owned by a privileged role.
SELECT ok(
  (SELECT rolname FROM pg_proc p JOIN pg_roles r ON p.proowner = r.oid
   WHERE p.proname = 'app_block_mutation_tool_call_log') = 'app_owner',
  'tool_call_log: app_block_mutation function owned by app_owner'
);

SELECT * FROM finish();
ROLLBACK;

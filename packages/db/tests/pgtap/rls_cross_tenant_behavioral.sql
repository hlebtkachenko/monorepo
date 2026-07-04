-- pgTap: BEHAVIORAL cross-tenant read isolation for EVERY workspace-scoped
-- FORCE-RLS table (#512). These tables carry bespoke workspace_id / membership
-- policies rather than the organization_isolation policy (which the vitest
-- rls-cross-organization harness proves behaviorally for the org-scoped set), so
-- each gets a runtime proof here: a row written for tenant A is invisible to a
-- session scoped to tenant B.
--
-- This is the assertion the structural suite cannot make: a policy like
-- `USING (workspace_id IS NOT NULL)` leaks every workspace yet has no literal
-- `USING true`, so it passes rls_forced_coverage.sql — but fails HERE (tenant B
-- would see tenant A's row). Mutation-verified.
--
-- Mechanics: pgTap runs as app_owner (superuser, BYPASSRLS), so the reads happen
-- under SET ROLE app_user (LOGIN, NOBYPASSRLS) with the app.* GUCs set — the only
-- way RLS actually applies. Seed rows go in under session_replication_role =
-- replica so the app-side FK / trigger graph need not be materialised; the RLS
-- policies are the subject under test, not the FKs.

BEGIN;
SELECT plan(11);

-- Synthetic tenants. Tenant A owns the seeded rows; the reader is scoped to B.
\set ws_a '00000000-0000-0000-0000-0000000000aa'
\set ws_b '00000000-0000-0000-0000-0000000000bb'
\set org_a '00000000-0000-0000-0000-0000000000a0'
\set org_b '00000000-0000-0000-0000-0000000000b0'
\set usr '00000000-0000-0000-0000-0000000000e0'
\set usr2 '00000000-0000-0000-0000-0000000000e1'
-- The reader: a tenant-B user unrelated to any seeded row, so the user-scoped
-- self-read policies (org_membership_self_read, impersonation_target_self_read —
-- both intentionally global to the owning user) do not expose tenant-A rows.
\set usr_sess '00000000-0000-0000-0000-0000000000ef'
\set wm_a '00000000-0000-0000-0000-0000000000c0'

-- Seed tenant-A rows across every workspace-scoped FORCE-RLS table, bypassing
-- FK + triggers (RLS is the subject under test). Rows that others reference
-- (workspace_membership) get an explicit id.
SET session_replication_role = replica;

INSERT INTO audit_event (workspace_id, organization_id, action)
  VALUES (:'ws_a', :'org_a', 'pgtap.xtenant');
INSERT INTO two_factor_policy
  (workspace_id, required_for_owners, required_for_admins, required_for_members,
   grace_period_days, declared_at, updated_at)
  VALUES (:'ws_a', false, false, false, 0, now(), now());
INSERT INTO workspace_membership (id, workspace_id, user_id, role)
  VALUES (:'wm_a', :'ws_a', :'usr', 'member');
INSERT INTO workspace (id, created_by_user_id, display_name)
  VALUES (:'ws_a', :'usr', 'pgtap A');
INSERT INTO workspace_billing
  (workspace_id, legal_name, address_street, address_city, address_zip, country)
  VALUES (:'ws_a', 'PgTap s.r.o.', 'Ulice 1', 'Praha', '11000', 'CZ');
INSERT INTO counterparty (workspace_id) VALUES (:'ws_a');
INSERT INTO impersonation
  (workspace_id, actor_user_id, target_user_id, reason, expected_end_at)
  VALUES (:'ws_a', :'usr', :'usr2', 'pgtap isolation', now() + interval '1 hour');
INSERT INTO organization_membership
  (organization_id, workspace_id, user_id, workspace_membership_id, role)
  VALUES (:'org_a', :'ws_a', :'usr', :'wm_a', 'member');
INSERT INTO organization_provisioning (workspace_id, idempotency_key, input)
  VALUES (:'ws_a', 'pgtap-key', '{}'::jsonb);
INSERT INTO permission_template (workspace_id, name, base_role, is_system)
  VALUES (:'ws_a', 'pgtap-tpl', 'member', false);
INSERT INTO resource_grant (membership_id, resource_type, organization_id)
  VALUES (:'wm_a', 'account', :'org_a');

SET session_replication_role = origin;

-- Read as the app role, scoped to workspace/organization B.
SET ROLE app_user;
SET LOCAL app.workspace_id = :'ws_b';
SET LOCAL app.organization_id = :'org_b';
SET LOCAL app.user_id = :'usr_sess';

SELECT is((SELECT count(*)::int FROM audit_event WHERE action = 'pgtap.xtenant'), 0,
  'audit_event: workspace-B session cannot read a workspace-A row');
SELECT is((SELECT count(*)::int FROM two_factor_policy WHERE workspace_id = :'ws_a'), 0,
  'two_factor_policy: workspace-B session cannot read a workspace-A row');
SELECT is((SELECT count(*)::int FROM workspace_membership WHERE workspace_id = :'ws_a'), 0,
  'workspace_membership: workspace-B session cannot read a workspace-A row');
SELECT is((SELECT count(*)::int FROM workspace WHERE id = :'ws_a'), 0,
  'workspace: workspace-B session cannot read the workspace-A row');
SELECT is((SELECT count(*)::int FROM workspace_billing WHERE workspace_id = :'ws_a'), 0,
  'workspace_billing: workspace-B session cannot read a workspace-A row');
SELECT is((SELECT count(*)::int FROM counterparty WHERE workspace_id = :'ws_a'), 0,
  'counterparty: workspace-B session cannot read a workspace-A row');
SELECT is((SELECT count(*)::int FROM impersonation WHERE workspace_id = :'ws_a'), 0,
  'impersonation: workspace-B session cannot read a workspace-A row');
SELECT is((SELECT count(*)::int FROM organization_membership WHERE organization_id = :'org_a'), 0,
  'organization_membership: tenant-B session cannot read a tenant-A row');
SELECT is((SELECT count(*)::int FROM organization_provisioning WHERE workspace_id = :'ws_a'), 0,
  'organization_provisioning: workspace-B session cannot read a workspace-A row');
SELECT is((SELECT count(*)::int FROM permission_template WHERE name = 'pgtap-tpl'), 0,
  'permission_template: workspace-B session cannot read a workspace-A template');
SELECT is((SELECT count(*)::int FROM resource_grant WHERE membership_id = :'wm_a'), 0,
  'resource_grant: workspace-B session cannot read a workspace-A grant');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

-- Migration 0009: Permission catalog — DDL only.
--
-- Creates:
--   permission_rule      global catalog of capability keys (dotted-lowercase)
--   permission_template  reusable bundles of capability keys per workspace
--   resource_grant       per-membership / per-resource narrowing
--
-- Design decisions:
--   - permission_rule.action CHECK is deliberately kept open to the 4 canonical
--     verbs from lac (view, edit, delete, run); extend as categories grow.
--   - permission_template.base_role references workspace_role enum from 0005.
--   - resource_grant: workspace-scoped FORCE RLS via app_is_workspace_admin helper.
--   - All RLS policies use NULLIF guards.
--
-- Seed: DO NOT seed any permission_rule or permission_template rows here.
-- The monorepo's permission catalog is domain-specific and evolves with the
-- product. Seed via separate seed script in @workspace/permissions when that
-- package ships.
--
-- Seed monorepo's permission catalog via separate seed script in
-- @workspace/permissions when that package ships.

BEGIN;

-- 1. permission_rule ----------------------------------------------------------

CREATE TABLE permission_rule (
  key            text         PRIMARY KEY,
  label          text,
  category       text,
  resource_type  text,
  action         text         NOT NULL,
  legacy         boolean      NOT NULL DEFAULT false,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT permission_rule_category_enum
    CHECK (category IN ('workspace', 'organization', 'ledger', 'resource', 'system')),
  CONSTRAINT permission_rule_action_enum
    CHECK (action IN ('view', 'edit', 'delete', 'run')),
  CONSTRAINT permission_rule_key_dotted_lowercase
    CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

CREATE INDEX permission_rule_category_idx ON permission_rule (category);

-- 2. permission_template ------------------------------------------------------

CREATE TABLE permission_template (
  id             uuid           PRIMARY KEY DEFAULT uuidv7(),
  workspace_id   uuid           REFERENCES workspace(id) ON DELETE CASCADE,
  name           text           NOT NULL,
  base_role      workspace_role NOT NULL,
  granted_rules  text[]         NOT NULL DEFAULT '{}'::text[],
  is_system      boolean        NOT NULL DEFAULT false,
  created_at     timestamptz    NOT NULL DEFAULT now(),
  updated_at     timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT permission_template_system_scope
    CHECK ((is_system = true AND workspace_id IS NULL) OR is_system = false)
);

-- Two partial unique indexes replace the old full unique on (workspace_id, name).
-- A single UNIQUE (workspace_id, name) would silently allow multiple system
-- templates with the same name because NULLs are not equal in unique indexes.
CREATE UNIQUE INDEX permission_template_workspace_name_unique
  ON permission_template (workspace_id, name)
  WHERE workspace_id IS NOT NULL;

CREATE UNIQUE INDEX permission_template_system_name_unique
  ON permission_template (name)
  WHERE workspace_id IS NULL AND is_system = true;

CREATE INDEX permission_template_workspace_idx
  ON permission_template (workspace_id);

-- 3. resource_grant -----------------------------------------------------------

CREATE TABLE resource_grant (
  id              uuid         PRIMARY KEY DEFAULT uuidv7(),
  membership_id   uuid         NOT NULL REFERENCES workspace_membership(id) ON DELETE CASCADE,
  organization_id uuid         REFERENCES organization(id) ON DELETE CASCADE,
  resource_type   text         NOT NULL,
  resource_id     uuid,
  can_view        boolean      NOT NULL DEFAULT false,
  can_edit        boolean      NOT NULL DEFAULT false,
  can_delete      boolean      NOT NULL DEFAULT false,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT resource_grant_resource_type_enum CHECK (
    resource_type IN (
      'account', 'project', 'bank_account', 'counterparty',
      'category_income', 'category_expense', 'organization'
    )
  )
);

CREATE UNIQUE INDEX resource_grant_membership_scope_unique
  ON resource_grant (membership_id, organization_id, resource_type, resource_id);
CREATE INDEX resource_grant_membership_idx
  ON resource_grant (membership_id);
CREATE INDEX resource_grant_organization_type_idx
  ON resource_grant (organization_id, resource_type);

-- 4. FORCE RLS on permission_template + resource_grant ------------------------

-- permission_rule is a global catalog; no RLS.
ALTER TABLE permission_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_template FORCE  ROW LEVEL SECURITY;
ALTER TABLE resource_grant      ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_grant      FORCE  ROW LEVEL SECURITY;

-- permission_template policies: system templates are world-readable;
-- workspace templates gate on membership + admin for writes.
CREATE POLICY permission_template_system_read ON permission_template
  FOR SELECT
  USING (is_system = true);

CREATE POLICY permission_template_ws_read ON permission_template
  FOR SELECT
  USING (
    workspace_id IS NOT NULL
    AND workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_member(
          permission_template.workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

CREATE POLICY permission_template_ws_write ON permission_template
  FOR ALL
  USING (
    workspace_id IS NOT NULL
    AND workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_admin(
          permission_template.workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND is_system = false
  );

-- resource_grant policies: membership-owner self read; workspace admins read/write.
CREATE POLICY resource_grant_self_read ON resource_grant
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_membership wm
      WHERE wm.id           = resource_grant.membership_id
        AND wm.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND wm.user_id      = NULLIF(current_setting('app.user_id', true), '')::uuid
    )
  );

CREATE POLICY resource_grant_admin_read ON resource_grant
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_membership wm_target
      WHERE wm_target.id           = resource_grant.membership_id
        AND wm_target.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    )
    AND app_is_workspace_admin(
          NULLIF(current_setting('app.workspace_id', true), '')::uuid,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

CREATE POLICY resource_grant_admin_write ON resource_grant
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_membership wm_target
      WHERE wm_target.id           = resource_grant.membership_id
        AND wm_target.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    )
    AND app_is_workspace_admin(
          NULLIF(current_setting('app.workspace_id', true), '')::uuid,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_membership wm_target
      WHERE wm_target.id           = resource_grant.membership_id
        AND wm_target.workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    )
  );

-- resource_grant consistency trigger: organization must belong to same workspace
-- as the parent membership.
CREATE OR REPLACE FUNCTION app_resource_grant_consistent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_membership_ws uuid;
  v_org_ws        uuid;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT workspace_id INTO v_membership_ws
    FROM workspace_membership WHERE id = NEW.membership_id;
  SELECT workspace_id INTO v_org_ws
    FROM organization WHERE id = NEW.organization_id;
  IF v_membership_ws IS DISTINCT FROM v_org_ws THEN
    RAISE EXCEPTION
      'resource_grant organization % is in workspace %, expected % (membership=%)',
      NEW.organization_id, v_org_ws, v_membership_ws, NEW.membership_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_resource_grant_consistent() OWNER TO app_owner;

CREATE TRIGGER resource_grant_consistent
  BEFORE INSERT OR UPDATE ON resource_grant
  FOR EACH ROW EXECUTE FUNCTION app_resource_grant_consistent();

-- 5. GRANTs -------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT                           ON permission_rule     TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE   ON permission_template TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE   ON resource_grant      TO app_user;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE   ON permission_rule     TO app_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE   ON permission_template TO app_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE   ON resource_grant      TO app_admin;
  END IF;
END
$$;

COMMIT;

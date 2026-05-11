-- Migration 0005: Workspace tier — workspace, membership, and organization
-- membership in final greenfield form.
--
-- Creates:
--   workspace_role           ENUM ('owner', 'admin', 'member')
--   organization_role        ENUM ('owner', 'admin', 'member', 'agent', 'guest')
--   workspace                parent tenant (accounting office)
--   workspace_membership     user <-> workspace with role + active flag
--   organization_membership  user <-> organization join model
--   workspace_billing        per-workspace billing details (generalized)
--
-- Design decisions written in from final state of the lac migration bundle:
--   - workspace has NO slug column (workspace identified by UUID only)
--   - workspace.created_by_user_id NOT NULL
--   - workspace.display_name NOT NULL
--   - workspace_membership: partial unique WHERE active=true (no full unique)
--   - workspace_billing: ONE policy FOR ALL (not two overlapping policies)
--   - workspace_billing: generalized country/tax_id columns (no CZ regex)
--   - SECURITY DEFINER helpers: app_is_workspace_member, app_is_workspace_admin,
--     app_is_workspace_owner, app_is_org_member; owned by app_owner (BYPASSRLS)
--   - ONE app_prevent_last_owner_demotion function (not two)
--   - Trigger fires on INSERT OR UPDATE OR DELETE; hard-rejects owner inserts
--     from app_user connections (use withAdminBypass for legitimate owner inserts)
--   - All RLS policies use NULLIF guards: NULLIF(current_setting(..., true), '')::uuid
--   - ws_membership_admin_write WITH CHECK requires admin role
--   - workspace_billing includes app_admin grant inline
--   - audit_event FKs added here after both tables exist

BEGIN;

-- 1. Enum types ---------------------------------------------------------------

CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE organization_role AS ENUM ('owner', 'admin', 'member', 'agent', 'guest');

-- 2. workspace ----------------------------------------------------------------

CREATE TABLE workspace (
  id                  uuid         PRIMARY KEY DEFAULT uuidv7(),
  created_by_user_id  uuid         NOT NULL REFERENCES app_user(id),
  display_name        text         NOT NULL,
  purpose             text,
  contact_email       text,
  contact_phone       varchar(20),
  website             text,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now()
);

-- 3. Wire FKs from audit tables that were created before workspace existed ----

ALTER TABLE audit_event
  ADD CONSTRAINT audit_event_workspace_fk
  FOREIGN KEY (workspace_id) REFERENCES workspace(id);

ALTER TABLE audit_event
  ADD CONSTRAINT audit_event_organization_fk
  FOREIGN KEY (organization_id) REFERENCES organization(id);

-- Wire organization -> workspace FK (organization was created before workspace)
ALTER TABLE organization
  ADD CONSTRAINT organization_workspace_fk
  FOREIGN KEY (workspace_id) REFERENCES workspace(id);

-- auth_verification -> workspace (nullable; Better Auth's writers leave NULL)
ALTER TABLE auth_verification
  ADD CONSTRAINT auth_verification_workspace_fk
  FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE CASCADE;

-- auth_invite -> organization + workspace (back-wired after both tables exist)
ALTER TABLE auth_invite
  ADD CONSTRAINT auth_invite_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE;

ALTER TABLE auth_invite
  ADD CONSTRAINT auth_invite_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE CASCADE;

-- 4. workspace_membership -----------------------------------------------------

CREATE TABLE workspace_membership (
  id            uuid              PRIMARY KEY DEFAULT uuidv7(),
  workspace_id  uuid              NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id       uuid              NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role          workspace_role    NOT NULL,
  active        boolean           NOT NULL DEFAULT true,
  mfa_grace_until timestamptz,
  created_at    timestamptz       NOT NULL DEFAULT now(),
  updated_at    timestamptz       NOT NULL DEFAULT now()
);

-- Partial unique: one active row per (workspace_id, user_id).
-- Allows: one active + one (or more) inactive rows.
CREATE UNIQUE INDEX workspace_membership_active_unique
  ON workspace_membership (workspace_id, user_id)
  WHERE active = true;

CREATE INDEX workspace_membership_user_idx
  ON workspace_membership (user_id);
CREATE INDEX workspace_membership_workspace_role_idx
  ON workspace_membership (workspace_id, role);

-- 5. organization_membership --------------------------------------------------

CREATE TABLE organization_membership (
  id                      uuid               NOT NULL DEFAULT uuidv7(),
  organization_id         uuid               NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  workspace_id            uuid               NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id                 uuid               NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  workspace_membership_id uuid               NOT NULL REFERENCES workspace_membership(id) ON DELETE CASCADE,
  role                    organization_role  NOT NULL,
  active                  boolean            NOT NULL DEFAULT true,
  created_at              timestamptz        NOT NULL DEFAULT now(),
  updated_at              timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT organization_membership_pkey PRIMARY KEY (id),
  CONSTRAINT organization_membership_unique UNIQUE (organization_id, user_id)
);

CREATE INDEX organization_membership_org_idx
  ON organization_membership (organization_id)
  WHERE active = true;
CREATE INDEX organization_membership_user_idx
  ON organization_membership (user_id)
  WHERE active = true;
CREATE INDEX organization_membership_workspace_idx
  ON organization_membership (workspace_id)
  WHERE active = true;

-- 6. workspace_billing --------------------------------------------------------

CREATE TABLE workspace_billing (
  workspace_id   uuid         NOT NULL PRIMARY KEY REFERENCES workspace(id) ON DELETE CASCADE,
  legal_name     text         NOT NULL,
  tax_id         text,
  vat_id         text,
  address_street text         NOT NULL,
  address_city   text         NOT NULL,
  address_zip    varchar(20)  NOT NULL,
  country        varchar(2)   NOT NULL
                              CHECK (country ~ '^[A-Z]{2}$'),
  billing_email  text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX workspace_billing_workspace_idx ON workspace_billing (workspace_id);

-- 7. Email normalize trigger for workspace_billing.billing_email -------------

CREATE OR REPLACE FUNCTION app_workspace_billing_email_normalize()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.billing_email IS NOT NULL THEN
    NEW.billing_email := lower(NEW.billing_email);
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_workspace_billing_email_normalize() OWNER TO app_owner;

DROP TRIGGER IF EXISTS workspace_billing_email_normalize ON workspace_billing;
CREATE TRIGGER workspace_billing_email_normalize
  BEFORE INSERT OR UPDATE ON workspace_billing
  FOR EACH ROW EXECUTE FUNCTION app_workspace_billing_email_normalize();

-- 8. SECURITY DEFINER helper functions ----------------------------------------
--
-- These functions run as app_owner (BYPASSRLS superuser), which means their
-- internal SELECTs on workspace_membership bypass RLS. Without this, workspace
-- tier RLS policies would recurse infinitely (42P17) under FORCE RLS + app_user.

CREATE OR REPLACE FUNCTION app_is_workspace_member(
  p_ws_id   uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_membership
    WHERE workspace_id = p_ws_id
      AND user_id      = p_user_id
      AND active       = true
  );
$$;

ALTER FUNCTION app_is_workspace_member(uuid, uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app_is_workspace_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_is_workspace_member(uuid, uuid) TO app_user;
GRANT EXECUTE ON FUNCTION app_is_workspace_member(uuid, uuid) TO app_admin;

CREATE OR REPLACE FUNCTION app_is_workspace_admin(
  p_ws_id   uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_membership
    WHERE workspace_id = p_ws_id
      AND user_id      = p_user_id
      AND role         IN ('owner', 'admin')
      AND active       = true
  );
$$;

ALTER FUNCTION app_is_workspace_admin(uuid, uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app_is_workspace_admin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_is_workspace_admin(uuid, uuid) TO app_user;
GRANT EXECUTE ON FUNCTION app_is_workspace_admin(uuid, uuid) TO app_admin;

CREATE OR REPLACE FUNCTION app_is_workspace_owner(
  p_ws_id   uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_membership
    WHERE workspace_id = p_ws_id
      AND user_id      = p_user_id
      AND role         = 'owner'
      AND active       = true
  );
$$;

ALTER FUNCTION app_is_workspace_owner(uuid, uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app_is_workspace_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_is_workspace_owner(uuid, uuid) TO app_user;
GRANT EXECUTE ON FUNCTION app_is_workspace_owner(uuid, uuid) TO app_admin;

CREATE OR REPLACE FUNCTION app_is_org_member(
  p_org_id  uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_membership
    WHERE organization_id = p_org_id
      AND user_id         = p_user_id
      AND active          = true
  );
$$;

ALTER FUNCTION app_is_org_member(uuid, uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app_is_org_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_is_org_member(uuid, uuid) TO app_user;
GRANT EXECUTE ON FUNCTION app_is_org_member(uuid, uuid) TO app_admin;

-- 9. FORCE RLS on workspace-scoped tables ------------------------------------

ALTER TABLE workspace           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace           FORCE  ROW LEVEL SECURITY;
ALTER TABLE workspace_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_membership FORCE  ROW LEVEL SECURITY;
ALTER TABLE organization_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_membership FORCE  ROW LEVEL SECURITY;
ALTER TABLE workspace_billing   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_billing   FORCE  ROW LEVEL SECURITY;
ALTER TABLE audit_event         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_event         FORCE  ROW LEVEL SECURITY;

-- 10. workspace RLS policies --------------------------------------------------

CREATE POLICY workspace_member_read ON workspace
  FOR SELECT
  USING (
    id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_member(
          workspace.id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

CREATE POLICY workspace_owner_write ON workspace
  FOR ALL
  USING (
    id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_owner(
          workspace.id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  )
  WITH CHECK (
    id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
  );

-- 11. workspace_membership RLS policies ---------------------------------------

-- ws_membership_self_read: pure column predicates, never recurses.
CREATE POLICY ws_membership_self_read ON workspace_membership
  FOR SELECT
  USING (
    workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND user_id  = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

CREATE POLICY ws_membership_admin_read ON workspace_membership
  FOR SELECT
  USING (
    workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_admin(
          workspace_membership.workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

-- WITH CHECK requires admin role (must be admin to write admin-level rows).
CREATE POLICY ws_membership_admin_write ON workspace_membership
  FOR ALL
  USING (
    workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_admin(
          workspace_membership.workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_admin(
          workspace_membership.workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

-- 12. organization_membership RLS policies ------------------------------------

CREATE POLICY org_membership_self_read ON organization_membership
  FOR SELECT
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

CREATE POLICY org_membership_ws_admin_read ON organization_membership
  FOR SELECT
  USING (
    app_is_workspace_admin(
      organization_membership.workspace_id,
      NULLIF(current_setting('app.user_id', true), '')::uuid
    )
  );

-- Uses SECURITY DEFINER helper to avoid 42P17 recursion under FORCE RLS.
CREATE POLICY org_membership_org_read ON organization_membership
  FOR SELECT
  USING (
    organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    AND app_is_org_member(
          organization_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

CREATE POLICY org_membership_ws_admin_write ON organization_membership
  FOR ALL
  USING (
    app_is_workspace_admin(
      organization_membership.workspace_id,
      NULLIF(current_setting('app.user_id', true), '')::uuid
    )
  )
  WITH CHECK (
    app_is_workspace_admin(
      organization_membership.workspace_id,
      NULLIF(current_setting('app.user_id', true), '')::uuid
    )
  );

-- 13. workspace_billing RLS policy -------------------------------------------
-- ONE policy FOR ALL (not two overlapping policies).

CREATE POLICY app_workspace_billing_owner_admin ON workspace_billing
  FOR ALL
  USING (
    workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_admin(
          workspace_billing.workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_admin(
          workspace_billing.workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

-- 14. audit_event RLS policies -----------------------------------------------

CREATE POLICY audit_event_ws_admin_read ON audit_event
  FOR SELECT
  USING (
    workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_admin(
          audit_event.workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

CREATE POLICY audit_event_org_member_read ON audit_event
  FOR SELECT
  USING (
    workspace_id    = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND organization_id IS NOT NULL
    AND organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    AND app_is_workspace_member(
          audit_event.workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

CREATE POLICY audit_event_insert ON audit_event
  FOR INSERT
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND app_is_workspace_member(
          audit_event.workspace_id,
          NULLIF(current_setting('app.user_id', true), '')::uuid
        )
  );

-- 15. Triggers ----------------------------------------------------------------

-- Last-owner-demotion guard.
-- ONE function named app_prevent_last_owner_demotion.
-- INSERT arm: app_user connections cannot insert owner rows. All legitimate
-- owner-INSERT paths use withAdminBypass (app_admin, BYPASSRLS) which bypasses
-- this trigger. Uses pg_has_role() to avoid hardcoding a role-name string.
CREATE OR REPLACE FUNCTION app_prevent_last_owner_demotion()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  owner_count      integer;
  v_app_user_role  text := NULLIF(current_setting('app.app_user_role_name', true), '');
BEGIN
  -- Fail-closed: every connection must have app.app_user_role_name set.
  -- An unset GUC means the init script did not run; crash loudly rather than
  -- silently falling back to a default that might not match the real role.
  IF v_app_user_role IS NULL THEN
    RAISE EXCEPTION 'app.app_user_role_name GUC must be set on every connection (see init.d/03-set-guc.sql)'
      USING ERRCODE = 'check_violation';
  END IF;

  -- INSERT arm: the application user role cannot insert owner rows directly.
  -- withAdminBypass connections run as app_admin (BYPASSRLS) and bypass the trigger.
  -- Using pg_has_role avoids hardcoding the role name inside the trigger body.
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'owner'
       AND pg_has_role(current_user, v_app_user_role, 'MEMBER') THEN
      RAISE EXCEPTION
        'app_user cannot INSERT an owner workspace_membership row; use withAdminBypass'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE arm: prevent demoting / deactivating the last active owner.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'owner' AND (NEW.role <> 'owner' OR NEW.active = false) THEN
      SELECT count(*) INTO owner_count
        FROM workspace_membership
       WHERE workspace_id = OLD.workspace_id
         AND role = 'owner'
         AND active = true
         AND id <> OLD.id;
      IF owner_count = 0 THEN
        RAISE EXCEPTION 'cannot demote or deactivate the last owner of workspace %', OLD.workspace_id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE arm: prevent deleting the last active owner.
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' AND OLD.active = true THEN
      SELECT count(*) INTO owner_count
        FROM workspace_membership
       WHERE workspace_id = OLD.workspace_id
         AND role = 'owner'
         AND active = true
         AND id <> OLD.id;
      IF owner_count = 0 THEN
        RAISE EXCEPTION 'cannot delete the last owner of workspace %', OLD.workspace_id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION app_prevent_last_owner_demotion() OWNER TO app_owner;

DROP TRIGGER IF EXISTS workspace_membership_prevent_last_owner_demotion ON workspace_membership;
CREATE TRIGGER workspace_membership_prevent_last_owner_demotion
  BEFORE INSERT OR UPDATE OR DELETE ON workspace_membership
  FOR EACH ROW EXECUTE FUNCTION app_prevent_last_owner_demotion();

-- Workspace+org consistency trigger for organization_membership.
-- SECURITY DEFINER so it can read actual workspace_id values regardless of
-- caller RLS (otherwise it may see filtered/empty rows and fire spuriously).
CREATE OR REPLACE FUNCTION app_organization_membership_ws_consistent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  ws_member uuid;
  ws_org    uuid;
BEGIN
  SELECT workspace_id INTO ws_member FROM workspace_membership WHERE id = NEW.workspace_membership_id;
  SELECT workspace_id INTO ws_org    FROM organization        WHERE id = NEW.organization_id;
  IF ws_member IS NULL OR ws_org IS NULL OR ws_member <> ws_org THEN
    RAISE EXCEPTION 'organization_membership: workspace_membership.workspace_id (%) must equal organization.workspace_id (%)', ws_member, ws_org;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_organization_membership_ws_consistent() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app_organization_membership_ws_consistent() FROM PUBLIC;

CREATE TRIGGER organization_membership_ws_consistent
  BEFORE INSERT OR UPDATE ON organization_membership
  FOR EACH ROW EXECUTE FUNCTION app_organization_membership_ws_consistent();

-- audit_event ws+org consistency trigger.
-- SECURITY DEFINER so it can read organization rows regardless of caller RLS.
-- SET search_path locks the search path against search_path injection attacks.
CREATE OR REPLACE FUNCTION app_audit_event_ws_org_consistent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_ws uuid;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT workspace_id INTO v_org_ws FROM organization WHERE id = NEW.organization_id;
  IF v_org_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION
      'audit_event organization % belongs to workspace %, event references %',
      NEW.organization_id, v_org_ws, NEW.workspace_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_audit_event_ws_org_consistent() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app_audit_event_ws_org_consistent() FROM PUBLIC;

CREATE TRIGGER audit_event_ws_org_consistent
  BEFORE INSERT ON audit_event
  FOR EACH ROW EXECUTE FUNCTION app_audit_event_ws_org_consistent();

-- 16. GRANTs ------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace             TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_membership  TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON organization_membership TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_billing     TO app_user;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace             TO app_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_membership  TO app_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON organization_membership TO app_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_billing     TO app_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON audit_event           TO app_admin;
  END IF;
END
$$;

COMMIT;

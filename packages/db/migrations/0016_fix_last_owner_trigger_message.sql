-- Fix misleading error reference in app_prevent_last_owner_demotion().
--
-- The original message (migration 0005) pointed at init.d/03-set-guc.sql,
-- which never existed. The GUC is actually set by:
--   * compose dev:   infra/compose/postgres/init.d/00-roles.sql (ALTER ROLE SET)
--   * staging/prod:  withAdminBypass() per-transaction SET LOCAL (RDS rejects
--                    ALTER ROLE SET on custom GUCs — needs SUPERUSER, not
--                    rds_superuser; see packages/db/src/tenancy.ts).
--
-- Body identical to 0005 (including in-body PL/pgSQL comments, so prosrc
-- stays byte-equal to what schema-snapshot.sql captures). Only the
-- RAISE EXCEPTION text differs.

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
    RAISE EXCEPTION 'app.app_user_role_name GUC must be set on every connection (see infra/compose/postgres/init.d/00-roles.sql or withAdminBypass)'
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

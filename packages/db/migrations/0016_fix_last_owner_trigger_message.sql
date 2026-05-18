-- Fix misleading error reference in app_prevent_last_owner_demotion().
--
-- The original message (migration 0005) pointed at init.d/03-set-guc.sql,
-- which never existed. The GUC is actually set by:
--   * compose dev:   infra/compose/postgres/init.d/00-roles.sql (ALTER ROLE SET)
--   * staging/prod:  withAdminBypass() per-transaction SET LOCAL (RDS rejects
--                    ALTER ROLE SET on custom GUCs — needs SUPERUSER, not
--                    rds_superuser; see packages/db/src/tenancy.ts).
--
-- Body unchanged; only the RAISE EXCEPTION text differs.

CREATE OR REPLACE FUNCTION app_prevent_last_owner_demotion()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  owner_count      integer;
  v_app_user_role  text := NULLIF(current_setting('app.app_user_role_name', true), '');
BEGIN
  IF v_app_user_role IS NULL THEN
    RAISE EXCEPTION 'app.app_user_role_name GUC must be set on every connection (see infra/compose/postgres/init.d/00-roles.sql or withAdminBypass)'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'owner'
       AND pg_has_role(current_user, v_app_user_role, 'MEMBER') THEN
      RAISE EXCEPTION
        'app_user cannot INSERT an owner workspace_membership row; use withAdminBypass'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

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

-- 0053_responsible_assignee_membership.sql
-- Keep organization.responsible_user_id tied to an active member of the same
-- workspace. Existing stale assignments are conservatively cleared.

BEGIN;

UPDATE organization o
   SET responsible_user_id = NULL
 WHERE responsible_user_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
       FROM workspace_membership wm
      WHERE wm.workspace_id = o.workspace_id
        AND wm.user_id = o.responsible_user_id
        AND wm.active = true
   );

CREATE OR REPLACE FUNCTION app_validate_responsible_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.responsible_user_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM workspace_membership wm
        WHERE wm.workspace_id = NEW.workspace_id
          AND wm.user_id = NEW.responsible_user_id
          AND wm.active = true
     ) THEN
    RAISE EXCEPTION 'responsible user must be an active member of the organization workspace'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_validate_responsible_assignee() OWNER TO app_owner;

DROP TRIGGER IF EXISTS organization_responsible_assignee_guard ON organization;
CREATE TRIGGER organization_responsible_assignee_guard
BEFORE INSERT OR UPDATE OF workspace_id, responsible_user_id ON organization
FOR EACH ROW EXECUTE FUNCTION app_validate_responsible_assignee();

CREATE OR REPLACE FUNCTION app_unassign_inactive_workspace_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF (TG_OP = 'DELETE' OR OLD.active = true)
     AND NOT EXISTS (
       SELECT 1
         FROM workspace_membership wm
        WHERE wm.workspace_id = OLD.workspace_id
          AND wm.user_id = OLD.user_id
          AND wm.active = true
     ) THEN
    UPDATE organization
       SET responsible_user_id = NULL
     WHERE workspace_id = OLD.workspace_id
       AND responsible_user_id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$;
ALTER FUNCTION app_unassign_inactive_workspace_member() OWNER TO app_owner;

DROP TRIGGER IF EXISTS workspace_membership_unassign_responsibility
  ON workspace_membership;
CREATE TRIGGER workspace_membership_unassign_responsibility
AFTER UPDATE OF active, workspace_id, user_id OR DELETE ON workspace_membership
FOR EACH ROW EXECUTE FUNCTION app_unassign_inactive_workspace_member();

COMMIT;

-- 0053_responsible_assignee_membership.sql
-- Keep organization.responsible_user_id tied to an active member of the same
-- workspace. Existing stale assignments are conservatively cleared.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

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

-- Assignment and membership deactivation touch different rows, so row locks do
-- not serialize them. Both trigger paths take this transaction-scoped lock for
-- the same workspace/user pair before checking or changing responsibility.
CREATE OR REPLACE FUNCTION app_lock_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog
AS $$
  SELECT pg_advisory_xact_lock(
    hashtextextended(p_workspace_id::text || ':' || p_user_id::text, 0)
  );
$$;
ALTER FUNCTION app_lock_workspace_member(uuid, uuid) OWNER TO app_owner;

CREATE OR REPLACE FUNCTION app_validate_responsible_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.responsible_user_id IS NOT NULL THEN
    PERFORM public.app_lock_workspace_member(
      NEW.workspace_id,
      NEW.responsible_user_id
    );

    IF NOT EXISTS (
       SELECT 1
         FROM workspace_membership wm
        WHERE wm.workspace_id = NEW.workspace_id
          AND wm.user_id = NEW.responsible_user_id
          AND wm.active = true
    ) THEN
      RAISE EXCEPTION 'responsible user must be an active member of the organization workspace'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_validate_responsible_assignee() OWNER TO app_owner;

DROP TRIGGER IF EXISTS organization_responsible_assignee_guard ON organization;
CREATE TRIGGER organization_responsible_assignee_guard
BEFORE INSERT OR UPDATE OF workspace_id, responsible_user_id ON organization
FOR EACH ROW EXECUTE FUNCTION app_validate_responsible_assignee();

CREATE OR REPLACE FUNCTION app_prevent_inactive_responsible_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (
    OLD.active = true
    AND (
      NEW.active = false
      OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
    )
  ) THEN
    PERFORM public.app_lock_workspace_member(OLD.workspace_id, OLD.user_id);

    IF EXISTS (
       SELECT 1
         FROM organization o
        WHERE o.workspace_id = OLD.workspace_id
          AND o.responsible_user_id = OLD.user_id
    ) THEN
      RAISE EXCEPTION 'responsible user must be unassigned before workspace membership is deactivated or deleted'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
ALTER FUNCTION app_prevent_inactive_responsible_member() OWNER TO app_owner;

DROP TRIGGER IF EXISTS workspace_membership_unassign_responsibility
  ON workspace_membership;
DROP TRIGGER IF EXISTS workspace_membership_responsibility_guard
  ON workspace_membership;
CREATE TRIGGER workspace_membership_responsibility_guard
BEFORE UPDATE OF active, workspace_id, user_id OR DELETE ON workspace_membership
FOR EACH ROW EXECUTE FUNCTION app_prevent_inactive_responsible_member();

COMMIT;

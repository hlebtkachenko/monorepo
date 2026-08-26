-- Migration 0002: ownership-invariant locking + offboarding link revocation.
--
-- Two Advisor carry-ins from the PR 05 gate, both on invariants 0000_init.sql
-- already installed. Nothing here creates a table or a column; every statement
-- replaces a trigger function body, or adds a trigger to an existing table.
--
--   SF-1  The last-owner guards COUNT, and a count is not a lock. Under READ
--         COMMITTED two transactions demoting two DIFFERENT owners of the same
--         organization each take their snapshot before the other commits, each
--         still sees the other's owner, and both pass — leaving the
--         organization with zero owners and nobody who can let anyone back in.
--         The same window sits between a demotion and a user deactivation, and
--         between clearing `app_user.is_staff` and inserting an `owner`
--         membership for that same user.
--
--         `beta_active_owner_count` cannot close it: it is STABLE, and a STABLE
--         function may not take row locks. The lock has to be taken by the
--         TRIGGER BODY, before the count, on a row every competing transaction
--         must also touch — the `organization` for the two owner-count guards,
--         the `app_user` for the staff guard. In READ COMMITTED each SPI
--         statement inside a PL/pgSQL function takes a FRESH snapshot, so the
--         count that runs after the lock is granted sees whatever the
--         transaction we waited for committed. That is the whole fix.
--
--   SF-6  Offboarding has to revoke what is still outstanding. Deactivating a
--         user, or deactivating a membership, leaves live `user_setup_token`
--         rows addressed to that person: an unclicked org invite, an
--         unactivated `account_setup` link, an unused password reset. Every one
--         of them hands the access straight back.
--
-- WHY SF-6 IS A TRIGGER AND NOT SERVER-ACTION CODE. It could equally live
-- inside the /admin transaction that writes the deactivation. It is here for
-- the reason the last-owner guard is here: /admin is not the only writer that
-- will ever exist. Nastavení › Lidé (PR 22) deactivates memberships from the
-- organization side, the employee-seat lifecycle (PR 32) deactivates leavers,
-- and a fix-up script writes SQL directly. A trigger is the floor none of them
-- can forget. The /admin actions are still tested end to end against it.
--
-- LOCK ORDER — read this before adding a third guard. A transaction that takes
-- both locks must take `app_user` FIRST and `organization` SECOND. That is the
-- order the triggers themselves produce: on `organization_membership` the
-- `..._owner_requires_staff` trigger sorts before `..._prevent_last_owner_removal`
-- and reaches for `app_user` first, and on `app_user` the row is already locked
-- by the UPDATE itself before `beta_app_user_owner_guard` reaches for any
-- organization. Every write path in this app touches one membership per
-- transaction, so none of them can invert it today. A future batch write must
-- not either.
--
-- NO `BEGIN;` / `COMMIT;` in this file — see the header of 0000_init.sql.

-- 1. SF-1 — the last-owner guard on organization_membership -------------------
--
-- Replaces the 0000 body. The trigger
-- `organization_membership_prevent_last_owner_removal` is unchanged.
CREATE OR REPLACE FUNCTION beta_prevent_last_owner_removal()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  organization_present boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'owner' AND (NEW.role <> 'owner' OR NEW.active = false) THEN
      -- Serialize every owner-losing write on this organization on one row.
      -- A concurrent demotion of a different owner blocks here and only then
      -- counts, so the two cannot both believe a second owner remains.
      PERFORM 1 FROM organization WHERE id = OLD.organization_id FOR UPDATE;

      IF beta_active_owner_count(OLD.organization_id, OLD.id) = 0 THEN
        RAISE EXCEPTION
          'cannot demote or deactivate the last owner of organization %', OLD.organization_id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' AND OLD.active THEN
      -- A cascading delete of the parent organization must not trip the guard:
      -- PostgreSQL applies the parent DELETE before firing the RI cascade, so
      -- an organization row this transaction can no longer see means "the whole
      -- org is going away". Locking and testing for it is ONE statement, so
      -- there is no window between the two. A cascade from app_user does NOT
      -- get that escape — hard-deleting a user is not a supported path
      -- (deactivation is) and must not strip a live org of its last owner.
      SELECT true INTO organization_present
        FROM organization WHERE id = OLD.organization_id FOR UPDATE;

      IF COALESCE(organization_present, false)
         AND beta_active_owner_count(OLD.organization_id, OLD.id) = 0 THEN
        RAISE EXCEPTION
          'cannot delete the last owner of organization %', OLD.organization_id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. SF-1 — owner ⇒ office staff, without the TOCTOU window -------------------
--
-- Replaces the 0000 body. The trigger
-- `organization_membership_owner_requires_staff` is unchanged.
CREATE OR REPLACE FUNCTION beta_membership_owner_requires_staff()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_is_staff boolean;
BEGIN
  IF NEW.role = 'owner' THEN
    -- FOR UPDATE, not a plain read. Without it, "clear is_staff on user X" and
    -- "insert an owner membership for user X" run concurrently, each sees the
    -- other's precondition still true, and both commit — producing an owner
    -- membership held by a non-staff account, which is precisely the state this
    -- guard and beta_app_user_owner_guard exist to make unreachable. With it,
    -- the two serialize on the app_user row, whichever starts first.
    SELECT is_staff INTO target_is_staff
      FROM app_user WHERE id = NEW.user_id FOR UPDATE;

    IF COALESCE(target_is_staff, false) = false THEN
      RAISE EXCEPTION
        'organization_membership.role = owner requires app_user.is_staff (user %)', NEW.user_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. SF-1 — the app_user guards ----------------------------------------------
--
-- Replaces the 0000 body. The trigger `app_user_owner_guard` is unchanged.
CREATE OR REPLACE FUNCTION beta_app_user_owner_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  owned record;
BEGIN
  IF OLD.disabled_at IS NULL AND NEW.disabled_at IS NOT NULL THEN
    -- One organization at a time, ascending by id. The ORDER BY is what keeps
    -- two concurrent deactivations from deadlocking when the two users co-own
    -- more than one organization; the lock is what makes the count that follows
    -- it authoritative. The outer query takes no locks of its own, so the only
    -- locks this loop holds are the ones it took in that order.
    FOR owned IN
      SELECT m.id AS membership_id, m.organization_id
        FROM organization_membership m
       WHERE m.user_id = OLD.id
         AND m.role = 'owner'
         AND m.active
       ORDER BY m.organization_id
    LOOP
      PERFORM 1 FROM organization WHERE id = owned.organization_id FOR UPDATE;

      IF beta_active_owner_count(owned.organization_id, owned.membership_id) = 0 THEN
        RAISE EXCEPTION
          'cannot deactivate the last owner of organization %', owned.organization_id
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;

  -- Revoking staff. No lock is taken here and none is needed: the UPDATE that
  -- fired this trigger already holds the row lock on this app_user, which is
  -- the row the competing owner-membership INSERT now waits for (section 2).
  IF OLD.is_staff AND NOT NEW.is_staff
     AND EXISTS (
       SELECT 1 FROM organization_membership m
        WHERE m.user_id = OLD.id AND m.role = 'owner' AND m.active
     ) THEN
    RAISE EXCEPTION
      'cannot clear is_staff while user % holds an active owner membership', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- 4. SF-6 — offboarding revokes the outstanding links -------------------------
--
-- AFTER triggers on purpose: the BEFORE guards above can still refuse the
-- deactivation, and a refused deactivation must not revoke anything.
CREATE OR REPLACE FUNCTION beta_revoke_live_setup_tokens()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  subject_email varchar(320);
BEGIN
  IF TG_TABLE_NAME = 'app_user' THEN
    -- The account itself is offboarded, so EVERY live link addressed to it
    -- dies, whatever its purpose and whatever its organization. The sharpest of
    -- them is an unclicked `account_setup` for a provisioned-but-unactivated
    -- identity: whoever consumes it BECOMES that identity, `is_staff` and all
    -- (lib/auth/setup-token.ts). Matching on the address rather than on
    -- `consumed_user_id` is deliberate — none of these links has been consumed
    -- yet, so the address is the only thing that ties them to the account.
    UPDATE user_setup_token
       SET revoked_at = now()
     WHERE email = OLD.email
       AND consumed_at IS NULL
       AND revoked_at IS NULL;
    RETURN NULL;
  END IF;

  -- A membership is being deactivated: every live link scoped to THAT
  -- organization for THAT address dies. Links into other organizations, and the
  -- account's own unscoped password reset, are not this organization's business
  -- and stay live.
  SELECT email INTO subject_email FROM app_user WHERE id = OLD.user_id;
  IF subject_email IS NOT NULL THEN
    UPDATE user_setup_token
       SET revoked_at = now()
     WHERE email = subject_email
       AND organization_id = OLD.organization_id
       AND consumed_at IS NULL
       AND revoked_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$;

-- No `UPDATE OF disabled_at`: the column list fires only when that column
-- appears in the statement's SET list, and the WHEN clause is the condition
-- that actually matters.
CREATE TRIGGER app_user_offboarding_revokes_setup_tokens
  AFTER UPDATE ON app_user
  FOR EACH ROW
  WHEN (OLD.disabled_at IS NULL AND NEW.disabled_at IS NOT NULL)
  EXECUTE FUNCTION beta_revoke_live_setup_tokens();

CREATE TRIGGER organization_membership_deactivation_revokes_setup_tokens
  AFTER UPDATE ON organization_membership
  FOR EACH ROW
  WHEN (OLD.active AND NOT NEW.active)
  EXECUTE FUNCTION beta_revoke_live_setup_tokens();

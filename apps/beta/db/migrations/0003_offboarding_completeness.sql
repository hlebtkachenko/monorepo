-- Migration 0003: offboarding completeness + the disabled-owner hole.
--
-- Three findings from the PR 08 security review, all on invariants 0002 left
-- half-closed. Like 0002 this file creates no table and no column; it replaces
-- trigger-function bodies and adds one trigger.
--
-- ============================================================================
-- THIS FILE SUPERSEDES THE LOCK-ORDER NOTE IN 0002 (0002 lines 39-47).
-- ============================================================================
--
-- 0002 claimed two lock classes and that "every write path in this app touches
-- one membership per transaction, so none of them can invert it". Both halves
-- were wrong by the time it was written:
--
--   * There are THREE lock classes, not two. `user_setup_token` is the third:
--     the SF-6 triggers UPDATE it from inside an `app_user` or
--     `organization_membership` transaction that is already holding locks in
--     the first two classes, and 0003 adds a third entry point on
--     `organization`.
--
--   * There IS a batch write. `grantOwnerInAllOrganizations`
--     (lib/data/office/memberships.ts) inserts one membership per live
--     organization in a single statement — "owner ve všech", spec §3.5. It now
--     sorts its organizations by id so two concurrent runs take the membership
--     row locks in the same order; without that they are a lock cycle waiting
--     for two accountants to click at once.
--
-- THE ORDER, and it is total:
--
--       1. app_user            2. organization            3. user_setup_token
--
-- Every path in the app obeys it today:
--
--   * organization_membership writes: `..._owner_requires_staff` sorts before
--     `..._prevent_last_owner_removal`, so app_user (1) is taken before
--     organization (2); the SF-6 trigger then touches tokens (3) last.
--   * app_user writes: the UPDATE itself holds the app_user row (1) before
--     `beta_app_user_owner_guard` reaches for organizations (2), and the SF-6
--     trigger touches tokens (3) last.
--   * organization writes: the archive trigger added below touches only
--     tokens (3), from a transaction already holding organization (2).
--   * batch writes: sort within the class, as above.
--
-- A cycle should therefore be unreachable. `isDeadlock` in lib/pg-error.ts is
-- the floor under "should be": 40P01 is surfaced to the caller as a retryable
-- refusal rather than a 500, because lock ordering is a convention enforced by
-- review and the failure mode of a broken convention must be legible.
--
-- NO `BEGIN;` / `COMMIT;` in this file — see the header of 0000_init.sql.

-- 1. Offboarding completeness: links the leaver ISSUED, not just received -----
--
-- 0002 revoked every live token ADDRESSED to a deactivated account. It said
-- nothing about the tokens that account HANDED OUT, and those are the more
-- dangerous half: an accountant who is being offboarded — or whose account is
-- being disabled precisely because it is suspected compromised — may have
-- minted invites into any number of books on the way out. Each one is a live
-- grant that outlives the account by up to 48 hours and creates an identity
-- nobody is expecting.
--
-- The two arms are one statement so a deactivation can never revoke half.
--
-- Also adds the `organization` entry point (section 2) to the same function.
CREATE OR REPLACE FUNCTION beta_revoke_live_setup_tokens()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  subject_email varchar(320);
BEGIN
  IF TG_TABLE_NAME = 'app_user' THEN
    -- The account is offboarded, so both directions die:
    --
    --   email = OLD.email          every live link ADDRESSED to it. The
    --                              sharpest is an unclicked `account_setup`
    --                              for a provisioned-but-unactivated identity:
    --                              whoever consumes it BECOMES that identity,
    --                              is_staff and all (lib/auth/setup-token.ts).
    --
    --   issued_by_user_id = OLD.id every live link it HANDED OUT. Revoking
    --                              these is the reason a compromised office
    --                              account can be contained by disabling it,
    --                              rather than by also hunting its invites
    --                              through the /admin registry by hand.
    UPDATE user_setup_token
       SET revoked_at = now()
     WHERE (email = OLD.email OR issued_by_user_id = OLD.id)
       AND consumed_at IS NULL
       AND revoked_at IS NULL;
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'organization' THEN
    -- The book has been archived. `requireScope` refuses an archived
    -- organization, so every live invite into it now resolves to a 404 for its
    -- holder — and would spring back to life the moment the book is
    -- unarchived, which is the actual hazard: an invite issued months ago,
    -- silently valid again. Revoke on the way out; re-invite on the way back.
    UPDATE user_setup_token
       SET revoked_at = now()
     WHERE organization_id = OLD.id
       AND consumed_at IS NULL
       AND revoked_at IS NULL;
    RETURN NULL;
  END IF;

  -- A membership is being deactivated: every live link scoped to THAT
  -- organization for THAT address dies. Links into other organizations, and
  -- the account's own unscoped password reset, are not this organization's
  -- business and stay live.
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

-- 2. Archiving a book revokes the invitations into it -------------------------
--
-- AFTER, like the other two: an archive that is rolled back must not have
-- revoked anything. `issueSetupToken` refuses to mint into an archived book
-- from the other side, so the two together close the loop — this trigger takes
-- care of what was already outstanding, the app check stops the office
-- re-minting into a book it has just withdrawn.
CREATE TRIGGER organization_archive_revokes_setup_tokens
  AFTER UPDATE ON organization
  FOR EACH ROW
  WHEN (OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL)
  EXECUTE FUNCTION beta_revoke_live_setup_tokens();

-- 3. An owner membership requires a LIVE office account -----------------------
--
-- 0000 required `app_user.is_staff` and stopped there, so a DEACTIVATED staff
-- account could still be handed an owner membership. That is a real hole rather
-- than a tidiness point: `beta_active_owner_count` excludes disabled users, so
-- an organization whose only owner is a disabled account counts as having ZERO
-- owners — the last-owner guard then cheerfully allows the remaining real owner
-- to be demoted, and the book is left with no reachable owner at all. Granting
-- ownership to a disabled account also looks like it worked, and does nothing.
--
-- SCOPED TO THE TRANSITION INTO "active owner", which 0000's version was not.
-- 0000 re-checked on EVERY update of a row whose new role is `owner`, including
-- `SET active = false`. Adding the `disabled_at` condition to that would have
-- made a disabled owner's membership impossible to deactivate — the guard would
-- refuse the very cleanup it exists to make necessary. Checking only when a row
-- BECOMES an active owner keeps every grant covered and leaves demotion and
-- deactivation reachable.
--
-- Nothing is weakened by the narrowing: an already-active owner cannot lose its
-- staff flag either, because `beta_app_user_owner_guard` refuses to clear
-- `is_staff` while an active owner membership exists, and cannot be deactivated
-- while it is an organization's last owner.
CREATE OR REPLACE FUNCTION beta_membership_owner_requires_staff()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target app_user%ROWTYPE;
BEGIN
  IF NEW.role = 'owner' AND NEW.active AND (
       TG_OP = 'INSERT'
       OR OLD.role <> 'owner'
       OR NOT OLD.active
       OR NEW.user_id <> OLD.user_id
     ) THEN
    -- FOR UPDATE, not a plain read. Without it, "clear is_staff on user X" (or
    -- "disable X") and "insert an owner membership for X" run concurrently,
    -- each sees the other's precondition still true, and both commit. This is
    -- lock class 1; see the order in this file's header.
    SELECT * INTO target FROM app_user WHERE id = NEW.user_id FOR UPDATE;

    IF NOT FOUND OR NOT target.is_staff THEN
      RAISE EXCEPTION
        'organization_membership.role = owner requires app_user.is_staff (user %)', NEW.user_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF target.disabled_at IS NOT NULL THEN
      RAISE EXCEPTION
        'organization_membership.role = owner requires an active account (user % is deactivated)', NEW.user_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

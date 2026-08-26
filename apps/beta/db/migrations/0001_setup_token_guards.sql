-- Migration 0001: setup-link replay + escalation guards.
--
-- Two Advisor carry-ins from the PR 05 gate, both on `user_setup_token`:
--
--   SF-2  An issued token is an immutable grant. Once the row exists, the fields
--         that decide WHAT the link grants (purpose, hash, email, organization,
--         role, TTL, issuer) can never change, and a spent link can never be
--         un-spent: `consumed_at` / `revoked_at` may go NULL -> value, never
--         value -> NULL. Without this, a single stray UPDATE turns a used guest
--         invite into a fresh owner grant, and every issuance check in 0000
--         (which is BEFORE INSERT only) is bypassed.
--
--   SF-5  A non-staff issuer may not mint an UNSCOPED `account_setup` link.
--         0000 constrains org-scoped issuance (the issuer must hold an active
--         owner|admin membership in that very org) but says nothing about a
--         token with `organization_id IS NULL` — which is precisely the shape
--         that creates a portal account attached to no organization. That is an
--         office-staff act. The NULL-issuer path stays open: it is the bootstrap
--         seed that mints the very first office account, before any user exists
--         to issue it.
--
-- Deliberately NOT done here: extending `user_setup_token_issuer_guard` to
-- `OR UPDATE`. Its checks read `NEW.issued_by_user_id`, which an UPDATE can
-- rewrite; the immutability trigger below is the correct floor for UPDATE and
-- makes the issuer guard's INSERT-time verdict permanent.

-- 1. SF-2 — an issued grant is immutable -------------------------------------
--
-- Trigger name sorts before `user_setup_token_lowercase_email`, so this fires
-- first and sees the caller's literal NEW row rather than a normalized one.
CREATE OR REPLACE FUNCTION beta_setup_token_immutable_grant()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- What the link grants, and who issued it: frozen for the row's lifetime.
  IF NEW.id                IS DISTINCT FROM OLD.id
     OR NEW.purpose           IS DISTINCT FROM OLD.purpose
     OR NEW.token_hash        IS DISTINCT FROM OLD.token_hash
     OR NEW.email             IS DISTINCT FROM OLD.email
     OR NEW.organization_id   IS DISTINCT FROM OLD.organization_id
     OR NEW.granted_role      IS DISTINCT FROM OLD.granted_role
     OR NEW.expires_at        IS DISTINCT FROM OLD.expires_at
     OR NEW.issued_by_user_id IS DISTINCT FROM OLD.issued_by_user_id
     OR NEW.issued_ip         IS DISTINCT FROM OLD.issued_ip
     OR NEW.issued_user_agent IS DISTINCT FROM OLD.issued_user_agent
     OR NEW.created_at        IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'user_setup_token % is an immutable grant: issuance fields cannot be updated', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Replay guard. Every consume/revoke column is WRITE-ONCE: NULL -> value is
  -- the one legal transition, so a spent link can neither be un-spent
  -- (value -> NULL) nor re-stamped for a second consumer (value -> other
  -- value). Write-once rather than a whole-row freeze because the consume is
  -- legitimately two writes inside one transaction: the atomic claim stamps
  -- `consumed_at` + IP + UA, and `consumed_user_id` is filled in once the
  -- account it created exists.
  IF OLD.consumed_at IS NOT NULL
     AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at THEN
    RAISE EXCEPTION
      'user_setup_token % is already consumed: consumed_at is write-once', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.consumed_ip IS NOT NULL
     AND NEW.consumed_ip IS DISTINCT FROM OLD.consumed_ip THEN
    RAISE EXCEPTION
      'user_setup_token % is already consumed: consumed_ip is write-once', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.consumed_user_agent IS NOT NULL
     AND NEW.consumed_user_agent IS DISTINCT FROM OLD.consumed_user_agent THEN
    RAISE EXCEPTION
      'user_setup_token % is already consumed: consumed_user_agent is write-once', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.consumed_user_id IS NOT NULL
     AND NEW.consumed_user_id IS DISTINCT FROM OLD.consumed_user_id THEN
    RAISE EXCEPTION
      'user_setup_token % is already consumed: consumed_user_id is write-once', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.revoked_at IS NOT NULL
     AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION
      'user_setup_token % is already revoked: revoked_at is write-once', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER user_setup_token_immutable_grant
  BEFORE UPDATE ON user_setup_token
  FOR EACH ROW EXECUTE FUNCTION beta_setup_token_immutable_grant();

-- 2. SF-5 — unscoped account_setup is an office-staff act ---------------------
--
-- Replaces the 0000 body; the BEFORE INSERT trigger that calls it is unchanged.
CREATE OR REPLACE FUNCTION beta_setup_token_issuer_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  issuer_is_staff boolean;
BEGIN
  SELECT is_staff INTO issuer_is_staff
    FROM app_user WHERE id = NEW.issued_by_user_id;

  IF NEW.granted_role = 'owner' AND COALESCE(issuer_is_staff, false) = false THEN
    RAISE EXCEPTION
      'only office staff may issue an owner grant (token purpose %)', NEW.purpose
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.purpose = 'password_reset' AND COALESCE(issuer_is_staff, false) = false THEN
    RAISE EXCEPTION 'only office staff may issue a password_reset link'
      USING ERRCODE = 'check_violation';
  END IF;

  -- SF-5. An org-less account_setup link creates a portal identity that no
  -- organization owner can see or revoke, so only office staff may mint one.
  -- `issued_by_user_id IS NULL` is exempt: that is the bootstrap seed, which
  -- runs before the first staff user exists.
  IF NEW.purpose = 'account_setup'
     AND NEW.organization_id IS NULL
     AND NEW.issued_by_user_id IS NOT NULL
     AND COALESCE(issuer_is_staff, false) = false THEN
    RAISE EXCEPTION
      'only office staff may issue an account_setup link with no organization'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.organization_id IS NOT NULL
     AND COALESCE(issuer_is_staff, false) = false
     AND NOT EXISTS (
       SELECT 1 FROM organization_membership m
        WHERE m.user_id = NEW.issued_by_user_id
          AND m.organization_id = NEW.organization_id
          AND m.active
          AND m.role IN ('owner', 'admin')
     ) THEN
    RAISE EXCEPTION
      'issuer % may not invite into organization %', NEW.issued_by_user_id, NEW.organization_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

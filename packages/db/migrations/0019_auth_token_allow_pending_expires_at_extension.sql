-- Migration 0019: allow controlled expires_at extension on pending auth_token
-- rows (ADR-0022 §"Kind taxonomy", D4 ons sliding renewal).
--
-- The 0017 append-only trigger treated `expires_at` as immutable to prevent
-- silent lifetime tampering. D4 introduces sliding renewal for kind='ons':
-- every read extends expires_at by 24h, capped at issued_at + 7d. The
-- alternative (bypassing the trigger via session_replication_role) requires
-- a SUPERUSER which is not available in production (RDS app_admin holds
-- BYPASSRLS but is not SUPERUSER), so the trigger itself must allow the
-- extension.
--
-- Relaxation rules (enforced inside the trigger):
--   1. The row must still be in status='pending'. Terminal states
--      (consumed / revoked / expired) keep expires_at locked.
--   2. The new expires_at must be in the future (>= now()). The trigger
--      refuses to backdate a row into "already-expired" via UPDATE.
--   3. The new expires_at must not exceed issued_at + 7 days. This is the
--      hard cap from ADR-0022 §"Kind taxonomy" `ons`. Applied uniformly
--      so any future sliding kind inherits the same upper bound;
--      single-shot kinds (sig, inv, lem) write expires_at once at INSERT
--      and never UPDATE it, so the cap is moot for them.
--   4. The shrink-forward case (new < old) is allowed only when the new
--      value is still >= now(); this lets ops revoke-soft a token by
--      shortening its lifetime without flipping status, if ever needed.
--      In practice the slide always extends forward.
--
-- Every other column listed in 0017 remains immutable. The only column the
-- relaxation unlocks is `expires_at`.

BEGIN;

CREATE OR REPLACE FUNCTION app_auth_token_limited_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- expires_at: permit mutation only when the row is pending and the new
  -- value satisfies the bounds (now() <= new <= issued_at + 7 days). When
  -- expires_at is unchanged, no checks apply.
  IF OLD.expires_at <> NEW.expires_at THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION
        'auth_token expires_at cannot change on non-pending row (id=%, kind=%, status=%)',
        OLD.id, OLD.kind, OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.expires_at < now() THEN
      RAISE EXCEPTION
        'auth_token expires_at must be in the future (id=%, kind=%)',
        OLD.id, OLD.kind
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.expires_at > OLD.issued_at + interval '7 days' THEN
      RAISE EXCEPTION
        'auth_token expires_at exceeds 7-day hard cap (id=%, kind=%)',
        OLD.id, OLD.kind
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF (OLD.id                     <> NEW.id
      OR OLD.token_hash          <> NEW.token_hash
      OR OLD.kind                <> NEW.kind
      OR OLD.env                 <> NEW.env
      OR OLD.payload::text       <> NEW.payload::text
      OR OLD.issued_at           <> NEW.issued_at
      OR OLD.issued_to_user_id   IS DISTINCT FROM NEW.issued_to_user_id
      OR OLD.issued_to_ip        IS DISTINCT FROM NEW.issued_to_ip
      OR OLD.issued_user_agent_hash IS DISTINCT FROM NEW.issued_user_agent_hash) THEN
    RAISE EXCEPTION
      'auth_token immutable columns changed (id=%, kind=%)', OLD.id, OLD.kind
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_auth_token_limited_update() OWNER TO app_owner;

COMMIT;

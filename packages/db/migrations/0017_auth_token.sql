-- Migration 0017: auth_token — unified opaque-token storage (ADR-0022).
--
-- Backs every app-issued in-flight token: signup (sig), invite (inv),
-- login-email (lem), onboarding-state (ons), active-workspace (wks),
-- and future kinds. Mirrors the opaque-token + DB-hash design already
-- in use by auth_invite + api_key; deprecates the four JWT modules in
-- packages/auth/src/tokens/{signup,login-email,onboarding-state,
-- active-workspace}.ts.
--
-- Storage model:
--   token_hash    sha256 hex of the raw afkey-... string. UNIQUE.
--   kind          'sig' | 'inv' | 'lem' | 'ons' | 'wks' | future codes
--   env           'dev' | 'stg' | 'prd' (encoded into the unkeyed checksum
--                                       on the raw token; stored to defend
--                                       against cross-env replay)
--   payload       per-kind JSONB metadata (email, workspace name, profile
--                 step state, etc.). Plaintext, same posture as
--                 app_user.email and workspace.contact_email under
--                 RDS at-rest encryption + RLS + TLS.
--   status        'pending' on mint; flips to 'consumed' | 'revoked' |
--                                              'expired'
--   issued_to_ip  truncated client IP (/24 IPv4, /48 IPv6) per CJEU
--                 2025 ruling on IP-as-personal-data
--   issued_user_agent_hash    sha256 of the issuing UA string
--   consumed_*    parallel forensic columns set on redemption
--
-- RLS contract (ADR-0010):
--   * FORCE RLS, default-deny policy.
--   * Tenant-bound roles (app_user when scoped by app.organization_id /
--     app.workspace_id) cannot SELECT, INSERT, UPDATE, or DELETE.
--   * All mint + consume paths go through withAdminBypass (SET LOCAL ROLE
--     app_admin) because the table is global — signup precedes workspace
--     creation, so no organization_id exists at issue time. app_admin has
--     BYPASSRLS and bypasses the deny policy.
--
-- Append-only contract (mirrors 0004_audit.sql layering):
--   Layer 1: REVOKE UPDATE, DELETE, TRUNCATE from app_user (defense-in-depth
--            anchor; today app_user inherits app_admin via 0002, so this
--            is load-bearing only after the inheritance is severed).
--   Layer 2: Limited-update BEFORE trigger — only status, consumed_at,
--            consumed_from_ip, consumed_user_agent_hash may change after
--            INSERT. Every other column is immutable.
--   Layer 3: BEFORE DELETE trigger refuses to delete rows with
--            status='pending' (pending tokens must transition via UPDATE
--            first). DELETE of consumed/revoked/expired rows is allowed
--            so the 90-day retention worker can prune. BEFORE TRUNCATE
--            trigger blocks bulk delete unconditionally
--            (see packages/workers/src/jobs/prune-auth-tokens.ts).

BEGIN;

-- 1. auth_token table --------------------------------------------------------

CREATE TABLE auth_token (
  id                        uuid         PRIMARY KEY DEFAULT uuidv7(),
  token_hash                text         NOT NULL UNIQUE,
  kind                      text         NOT NULL,
  env                       text         NOT NULL,
  payload                   jsonb        NOT NULL DEFAULT '{}'::jsonb,
  expires_at                timestamptz  NOT NULL,
  status                    text         NOT NULL DEFAULT 'pending',
  issued_at                 timestamptz  NOT NULL DEFAULT now(),
  issued_to_user_id         uuid         REFERENCES app_user(id),
  issued_to_ip              text,
  issued_user_agent_hash    text,
  consumed_at               timestamptz,
  consumed_from_ip          text,
  consumed_user_agent_hash  text,
  CONSTRAINT auth_token_payload_is_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT auth_token_status_valid CHECK (status IN ('pending','consumed','revoked','expired')),
  CONSTRAINT auth_token_env_valid CHECK (env IN ('dev','stg','prd'))
);

-- Partial index over the redemption hot path: lookups by token_hash filter
-- on status='pending'. The unique constraint on token_hash provides the
-- equality lookup; this partial index narrows the pending working set for
-- the prune worker and the kind-level audit queries.
CREATE INDEX auth_token_status_expires_idx
  ON auth_token (status, expires_at)
  WHERE status = 'pending';

CREATE INDEX auth_token_kind_issued_idx
  ON auth_token (kind, issued_at DESC);

-- 2. RLS ----------------------------------------------------------------------

ALTER TABLE auth_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_token FORCE  ROW LEVEL SECURITY;

-- Default-deny: tenant-bound roles get zero visibility. app_admin holds
-- BYPASSRLS so withAdminBypass callers (mint + consume) operate normally.
CREATE POLICY auth_token_deny_all ON auth_token
  USING (false)
  WITH CHECK (false);

-- 3. Append-only triggers -----------------------------------------------------

CREATE OR REPLACE FUNCTION app_auth_token_limited_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.id                     <> NEW.id
      OR OLD.token_hash          <> NEW.token_hash
      OR OLD.kind                <> NEW.kind
      OR OLD.env                 <> NEW.env
      OR OLD.payload::text       <> NEW.payload::text
      OR OLD.expires_at          <> NEW.expires_at
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

CREATE TRIGGER auth_token_limited_update
  BEFORE UPDATE ON auth_token
  FOR EACH ROW EXECUTE FUNCTION app_auth_token_limited_update();

CREATE OR REPLACE FUNCTION app_guard_delete_auth_token()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Pending tokens cannot be deleted directly: they must transition via
  -- UPDATE to 'consumed', 'revoked', or 'expired' first, so the lifecycle
  -- audit trail is preserved. The 90-day retention worker only deletes
  -- terminal-state rows; this trigger fail-closes against a buggy caller.
  IF OLD.status = 'pending' THEN
    RAISE EXCEPTION
      'auth_token row in status=pending cannot be deleted (id=%, kind=%); revoke or expire first.',
      OLD.id, OLD.kind
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

ALTER FUNCTION app_guard_delete_auth_token() OWNER TO app_owner;

CREATE TRIGGER auth_token_guard_delete
  BEFORE DELETE ON auth_token
  FOR EACH ROW EXECUTE FUNCTION app_guard_delete_auth_token();

CREATE OR REPLACE FUNCTION app_block_truncate_auth_token()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'auth_token is append-only at table level; TRUNCATE is blocked.'
    USING ERRCODE = 'feature_not_supported';
END;
$$;

ALTER FUNCTION app_block_truncate_auth_token() OWNER TO app_owner;

CREATE TRIGGER auth_token_no_truncate
  BEFORE TRUNCATE ON auth_token
  FOR EACH STATEMENT EXECUTE FUNCTION app_block_truncate_auth_token();

-- 4. GRANTs -------------------------------------------------------------------
--
-- app_admin owns the table by virtue of being the migration role's grantee
-- chain (0002_auth.sql GRANT app_admin TO app_owner). Explicit REVOKE on
-- app_user closes the inheritance path for the day Layer 1 becomes
-- authoritative. No GRANT to app_user — every read and write goes through
-- withAdminBypass, which switches to app_admin (BYPASSRLS).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON auth_token FROM app_user;
  END IF;
END
$$;

COMMIT;

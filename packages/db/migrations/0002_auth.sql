-- Migration 0002: Better Auth tables + app_user in final greenfield form.
--
-- Creates:
--   app_user            global user identity (Better Auth shape from day one)
--   auth_session        global session store (no RLS)
--   auth_account        global OAuth/password accounts (no RLS)
--   auth_verification   global token store + workspace_id binding
--   two_factor          per-user TOTP/backup-codes (FORCE RLS on app.user_id)
--   auth_invite         organization-scoped invite (FORCE RLS on organization_id)
--
-- Design decisions written in from final state:
--   - app_user.email_verified: boolean NOT NULL DEFAULT false (no timestamp swap)
--   - auth_invite.role: varchar(64) NOT NULL (no legacy enum; app-layer validates)
--   - auth_invite.workspace_id: NOT NULL (invites are always workspace-scoped)
--   - auth_invite: partial UNIQUE on app:-namespaced identifiers in auth_verification
--   - two_factor: no two_factor_secret_idx (secret is never queried by app)
--   - Email normalize BEFORE INSERT/UPDATE triggers on app_user + auth_invite
--   - GRANT app_admin TO app_user (role-inheritance for BYPASSRLS elevation path)

BEGIN;

-- 1. Roles (idempotent; testcontainer environments may not pre-create them) ---
--
-- Canonical role provisioning lives in infra/compose/postgres/init.d/00-roles.sql
-- (runs at compose container init). The blocks below are a fallback for
-- environments without the init.d hook (testcontainers, ad-hoc fresh DBs).
-- Attributes here MUST match init.d to avoid drift.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'dev_user';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin BYPASSRLS NOLOGIN;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    CREATE ROLE app_owner SUPERUSER LOGIN PASSWORD 'dev_owner';
  END IF;
END
$$;

-- 2. app_user -----------------------------------------------------------------

CREATE TABLE app_user (
  id                   uuid         PRIMARY KEY DEFAULT uuidv7(),
  email                varchar(320) NOT NULL UNIQUE,
  email_verified       boolean      NOT NULL DEFAULT false,
  name                 text         NOT NULL DEFAULT '',
  image                text,
  role                 text         NOT NULL DEFAULT 'user',
  banned               boolean      NOT NULL DEFAULT false,
  ban_reason           text,
  ban_expires          timestamptz,
  phone                text,
  two_factor_enabled   boolean      NOT NULL DEFAULT false,
  display_name         text,
  avatar_url           text,
  locale               varchar(10)  NOT NULL DEFAULT 'en',
  timezone             text         NOT NULL DEFAULT 'UTC',
  job_title            text,
  profile_completed_at timestamptz,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT app_user_system_role_valid
    CHECK (role IN ('user', 'admin')),
  CONSTRAINT app_user_phone_format
    CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE INDEX app_user_role_idx  ON app_user (role)  WHERE role <> 'user';
CREATE INDEX app_user_phone_idx ON app_user (phone) WHERE phone IS NOT NULL;

-- 3. auth_session -------------------------------------------------------------

CREATE TABLE auth_session (
  id               uuid         PRIMARY KEY DEFAULT uuidv7(),
  user_id          uuid         NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token            text         NOT NULL UNIQUE,
  expires_at       timestamptz  NOT NULL,
  ip_address       text,
  user_agent       text,
  impersonated_by  uuid         REFERENCES app_user(id),
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX auth_session_user_idx          ON auth_session (user_id);
CREATE INDEX auth_session_expires_idx       ON auth_session (expires_at);
CREATE INDEX auth_session_impersonated_idx  ON auth_session (impersonated_by)
  WHERE impersonated_by IS NOT NULL;

-- 4. auth_account -------------------------------------------------------------

CREATE TABLE auth_account (
  id                        uuid         PRIMARY KEY DEFAULT uuidv7(),
  user_id                   uuid         NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  account_id                text         NOT NULL,
  provider_id               text         NOT NULL,
  access_token              text,
  refresh_token             text,
  id_token                  text,
  access_token_expires_at   timestamptz,
  refresh_token_expires_at  timestamptz,
  scope                     text,
  password                  text,
  created_at                timestamptz  NOT NULL DEFAULT now(),
  updated_at                timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX auth_account_user_idx ON auth_account (user_id);
CREATE UNIQUE INDEX auth_account_provider_account_unique
  ON auth_account (provider_id, account_id);

-- 5. auth_verification --------------------------------------------------------

CREATE TABLE auth_verification (
  id           uuid         PRIMARY KEY DEFAULT uuidv7(),
  identifier   text         NOT NULL,
  value        text         NOT NULL,
  expires_at   timestamptz  NOT NULL,
  workspace_id uuid,        -- nullable: Better Auth's own writers leave NULL
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX auth_verification_identifier_idx ON auth_verification (identifier);
CREATE INDEX auth_verification_expires_idx    ON auth_verification (expires_at);

-- Partial UNIQUE on app:-namespaced identifiers.
-- Better Auth (password reset, email OTP) uses raw identifiers; this index
-- does not constrain those. Namespace prefix is our application convention.
CREATE UNIQUE INDEX auth_verification_app_identifier_unique
  ON auth_verification (identifier)
  WHERE identifier LIKE 'app:%';

-- 6. two_factor ---------------------------------------------------------------

CREATE TABLE two_factor (
  id           uuid         PRIMARY KEY DEFAULT uuidv7(),
  secret       text         NOT NULL,
  backup_codes text         NOT NULL,
  user_id      uuid         NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  verified     boolean      NOT NULL DEFAULT true,
  enabled      boolean      NOT NULL DEFAULT false,
  enrolled_at  timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

-- No two_factor_secret_idx: secret is never queried by the app layer.
CREATE INDEX two_factor_user_id_idx ON two_factor (user_id);

ALTER TABLE two_factor ENABLE ROW LEVEL SECURITY;
ALTER TABLE two_factor FORCE  ROW LEVEL SECURITY;

-- Self-access: a row belongs to its owner, scoped on the app.user_id GUC.
-- NULLIF guard: empty-string GUC yields NULL rather than a cast error.
CREATE POLICY two_factor_self_read ON two_factor
  FOR SELECT
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

CREATE POLICY two_factor_self_write ON two_factor
  FOR ALL
  USING      (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- 7. invite_status enum -------------------------------------------------------

CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');

-- 8. auth_invite (organization-scoped, FORCE RLS) -----------------------------

CREATE TABLE auth_invite (
  id                    uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id       uuid          NOT NULL,
  workspace_id          uuid          NOT NULL,  -- always workspace-scoped
  token_hash            text          NOT NULL UNIQUE,
  email                 varchar(320)  NOT NULL,
  role                  varchar(64)   NOT NULL,
  status                invite_status NOT NULL DEFAULT 'pending',
  issued_by_user_id     uuid          REFERENCES app_user(id),
  issued_at             timestamptz   NOT NULL DEFAULT now(),
  expires_at            timestamptz   NOT NULL,
  accepted_at           timestamptz,
  accepted_by_user_id   uuid          REFERENCES app_user(id)
);

CREATE INDEX auth_invite_organization_status_idx
  ON auth_invite (organization_id, status);
CREATE INDEX auth_invite_token_hash_idx
  ON auth_invite (token_hash);
CREATE INDEX auth_invite_organization_email_idx
  ON auth_invite (organization_id, email);

ALTER TABLE auth_invite ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_invite FORCE  ROW LEVEL SECURITY;

CREATE POLICY organization_isolation ON auth_invite
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- 9. Email normalize BEFORE triggers -----------------------------------------

CREATE OR REPLACE FUNCTION app_user_email_normalize()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.email := lower(NEW.email);
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_user_email_normalize() OWNER TO app_owner;

DROP TRIGGER IF EXISTS app_user_email_normalize ON app_user;
CREATE TRIGGER app_user_email_normalize
  BEFORE INSERT OR UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION app_user_email_normalize();

CREATE OR REPLACE FUNCTION app_auth_invite_email_normalize()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.email := lower(NEW.email);
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_auth_invite_email_normalize() OWNER TO app_owner;

DROP TRIGGER IF EXISTS auth_invite_email_normalize ON auth_invite;
CREATE TRIGGER auth_invite_email_normalize
  BEFORE INSERT OR UPDATE ON auth_invite
  FOR EACH ROW EXECUTE FUNCTION app_auth_invite_email_normalize();

-- 10. GRANTs ------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app_user          TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON auth_session      TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON auth_account      TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON auth_verification TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON two_factor        TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON auth_invite       TO app_user;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON app_user          TO app_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON auth_session      TO app_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON auth_account      TO app_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON auth_verification TO app_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON two_factor        TO app_admin;
    GRANT SELECT, INSERT, UPDATE, DELETE ON auth_invite       TO app_admin;
  END IF;
END
$$;

-- Grant app_admin membership to app_user so withAdminBypass (SET LOCAL ROLE
-- app_admin) is reachable from an app_user connection.
-- Note: Layer 1 REVOKEs on audit tables are defense-in-depth anchors only.
-- Under this topology app_user inherits app_admin grants, so the REVOKEs
-- take effect only after the inheritance is severed in a future ADR. The
-- append-only triggers (Layers 2+3) are the authoritative enforcement.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT app_admin TO app_user;
  END IF;
END
$$;

COMMIT;

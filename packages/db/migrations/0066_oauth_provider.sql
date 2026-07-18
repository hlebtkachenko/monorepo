-- 0066_oauth_provider.sql
--
-- OAuth 2.1 authorization server tables for the Better Auth `jwt()` +
-- `oauthProvider()` plugins, plus our own tenant-binding pending table.
-- Backs the hosted MCP endpoint's OAuth path (mcp.afframe.com) and any future
-- OAuth client; see packages/auth/src/server.ts and docs/adr/0023.
--
-- WHY NO RLS (deliberate): these are BA-owned identity/authorization tables,
-- not tenant data — the same posture as app_user / auth_session / two_factor
-- (0002_auth.sql, 0014_two_factor_relax_rls.sql). Access is exclusively through
-- the server-side auth flow (Better Auth owns it via the signed session /
-- authorize handlers), never through a tenant-bound withOrganization /
-- withWorkspace connection. Tenant isolation for the tokens they mint is
-- enforced downstream: the access-token's `reference_id` binds it to exactly
-- one organization, and the API re-validates that membership on every call
-- (customAccessTokenClaims + the OAuth token verifier), exactly like an api_key.
-- Access is bounded by table GRANTs (app_user + app_admin) instead.
--
-- Column naming: snake_case SQL columns (DB convention) behind camelCase Drizzle
-- keys (Better Auth's field vocabulary) — see packages/db/src/schema/jwks.ts.
--
-- Handwritten SQL (ADR-0009). One whole-file transaction; safe runner path.

BEGIN;

-- =============================================================================
-- 1. jwks — jwt() plugin signing keys
-- =============================================================================
CREATE TABLE jwks (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  public_key  text        NOT NULL,
  private_key text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz
);

-- =============================================================================
-- 2. oauth_client — registered OAuth 2.1 clients (dynamic registration + seeded)
-- =============================================================================
CREATE TABLE oauth_client (
  id                        uuid        PRIMARY KEY DEFAULT uuidv7(),
  client_id                 text        NOT NULL UNIQUE,
  client_secret             text,
  disabled                  boolean     NOT NULL DEFAULT false,
  skip_consent              boolean,
  enable_end_session        boolean,
  subject_type              text,
  scopes                    text[],
  user_id                   uuid        REFERENCES app_user (id) ON DELETE CASCADE,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  name                      text,
  uri                       text,
  icon                      text,
  contacts                  text[],
  tos                       text,
  policy                    text,
  software_id               text,
  software_version          text,
  software_statement        text,
  redirect_uris             text[]      NOT NULL,
  post_logout_redirect_uris text[],
  token_endpoint_auth_method text,
  grant_types               text[],
  response_types            text[],
  is_public                 boolean,
  type                      text,
  require_pkce              boolean,
  reference_id              text,
  metadata                  jsonb
);

CREATE INDEX oauth_client_user_id_idx ON oauth_client (user_id);

-- =============================================================================
-- 3. oauth_refresh_token
-- =============================================================================
CREATE TABLE oauth_refresh_token (
  id           uuid        PRIMARY KEY DEFAULT uuidv7(),
  token        text        NOT NULL UNIQUE,
  client_id    text        NOT NULL REFERENCES oauth_client (client_id) ON DELETE CASCADE,
  session_id   uuid        REFERENCES auth_session (id) ON DELETE SET NULL,
  user_id      uuid        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  reference_id text,
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked      timestamptz,
  auth_time    timestamptz,
  scopes       text[]      NOT NULL
);

CREATE INDEX oauth_refresh_token_client_id_idx  ON oauth_refresh_token (client_id);
CREATE INDEX oauth_refresh_token_session_id_idx ON oauth_refresh_token (session_id);
CREATE INDEX oauth_refresh_token_user_id_idx    ON oauth_refresh_token (user_id);

-- =============================================================================
-- 4. oauth_access_token
-- =============================================================================
CREATE TABLE oauth_access_token (
  id           uuid        PRIMARY KEY DEFAULT uuidv7(),
  token        text        UNIQUE,
  client_id    text        NOT NULL REFERENCES oauth_client (client_id) ON DELETE CASCADE,
  session_id   uuid        REFERENCES auth_session (id) ON DELETE SET NULL,
  user_id      uuid        REFERENCES app_user (id) ON DELETE CASCADE,
  reference_id text,
  refresh_id   uuid        REFERENCES oauth_refresh_token (id) ON DELETE SET NULL,
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  scopes       text[]      NOT NULL
);

CREATE INDEX oauth_access_token_client_id_idx  ON oauth_access_token (client_id);
CREATE INDEX oauth_access_token_session_id_idx ON oauth_access_token (session_id);
CREATE INDEX oauth_access_token_user_id_idx    ON oauth_access_token (user_id);
CREATE INDEX oauth_access_token_refresh_id_idx ON oauth_access_token (refresh_id);

-- =============================================================================
-- 5. oauth_consent — remembered consent so returning clients skip the prompt
-- =============================================================================
CREATE TABLE oauth_consent (
  id           uuid        PRIMARY KEY DEFAULT uuidv7(),
  client_id    text        NOT NULL REFERENCES oauth_client (client_id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES app_user (id) ON DELETE CASCADE,
  reference_id text,
  scopes       text[]      NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX oauth_consent_client_id_idx ON oauth_consent (client_id);
CREATE INDEX oauth_consent_user_id_idx   ON oauth_consent (user_id);

-- =============================================================================
-- 6. oauth_pending_reference — our tenant-binding state (NOT a BA model). One
--    row per user = the organization chosen at /select-organization, read by
--    postLogin.consentReferenceId. Last-choice-wins; consentReferenceId always
--    re-validates against a live active membership before trusting it.
-- =============================================================================
CREATE TABLE oauth_pending_reference (
  user_id         uuid        PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 7. GRANTs — NO RLS (see header). app_user is the API/web base runtime role;
--    app_admin is the withAdminBypass role. Mirrors 0063_brain_admission_slot.
-- =============================================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'jwks', 'oauth_client', 'oauth_refresh_token', 'oauth_access_token',
    'oauth_consent', 'oauth_pending_reference'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_admin', t);
    END IF;
  END LOOP;
END
$$;

COMMIT;

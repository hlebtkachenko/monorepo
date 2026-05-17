-- Migration 0015: api_key — organization-scoped machine-auth credentials.
--
-- Foundation for the public API (api.afframe.com). An api_key is an opaque
-- bearer credential issued per organization; only the SHA-256 hash is stored,
-- never the raw key (same opaque-token + DB-hash design as auth_invite, see
-- packages/auth/src/tokens/invite.ts).
--
-- organization + workspace both exist by now (0003, 0005), so the FKs are
-- wired inline — no back-wiring needed.
--
-- RLS: FORCE organization_isolation, identical to auth_invite. The verify
-- path looks a key up by hash across organizations and therefore runs under
-- withAdminBypass (see packages/domain/src/api-keys/verify.ts); every other
-- access path is organization-scoped.

BEGIN;

CREATE TABLE api_key (
  id                  uuid         PRIMARY KEY DEFAULT uuidv7(),
  organization_id     uuid         NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  workspace_id        uuid         NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name                text         NOT NULL,
  prefix              varchar(20)  NOT NULL,             -- non-secret display prefix, e.g. affk_live_xxxx
  key_hash            text         NOT NULL UNIQUE,      -- sha256 hex of the raw key
  scopes              text[]       NOT NULL DEFAULT '{}',
  created_by_user_id  uuid         REFERENCES app_user(id),
  last_used_at        timestamptz,
  expires_at          timestamptz,                       -- NULL = non-expiring
  revoked_at          timestamptz,                       -- non-NULL = dead
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX api_key_organization_idx ON api_key (organization_id);
CREATE INDEX api_key_key_hash_idx     ON api_key (key_hash);

ALTER TABLE api_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key FORCE  ROW LEVEL SECURITY;

CREATE POLICY organization_isolation ON api_key
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

COMMIT;

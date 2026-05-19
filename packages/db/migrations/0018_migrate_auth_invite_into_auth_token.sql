-- Migration 0018: backfill auth_invite into auth_token (ADR-0022 D2).
--
-- Copies every PENDING auth_invite row into auth_token with kind='inv' so
-- that, after USE_AUTH_TOKEN_FOR_INV is flipped on in staging, existing
-- in-flight invites can be redeemed via the new /auth/invite/landing
-- consume route without forcing every recipient to re-receive an email.
--
-- Status mapping: only `status='pending'` rows are copied. Already
-- accepted/revoked/expired invites stay terminal in auth_invite and are
-- not re-introduced into auth_token (they would never be redeemed).
--
-- Idempotent: ON CONFLICT (token_hash) DO NOTHING. Re-running the
-- migration in a hot DB never duplicates rows. The unique constraint on
-- auth_token.token_hash is the dedup key — both tables hash with sha256,
-- so a token_hash that exists in BOTH tables is the same wire token.
--
-- Trigger interaction: the auth_token append-only trigger
-- (app_auth_token_limited_update from 0017) treats expires_at as
-- immutable. Since this migration only INSERTs (no UPDATE of existing
-- auth_token rows), the trigger is not exercised.
--
-- DOES NOT drop auth_invite. The dual-read window (~14 days of staging
-- soak) requires both tables to coexist; the drop lands in the AFF-198
-- Phase 3 cleanup (E1).

BEGIN;

INSERT INTO auth_token (
  token_hash,
  kind,
  env,
  payload,
  expires_at,
  status,
  issued_at,
  issued_to_user_id,
  issued_to_ip,
  issued_user_agent_hash
)
SELECT
  i.token_hash,
  'inv'::text                                                            AS kind,
  COALESCE(NULLIF(current_setting('app.auth_token_env', true), ''), 'dev') AS env,
  jsonb_build_object(
    'email',           i.email,
    'organizationId',  i.organization_id::text,
    'workspaceId',     i.workspace_id::text,
    'role',            i.role,
    'issuedByUserId',  COALESCE(i.issued_by_user_id::text, '')
  )                                                                       AS payload,
  i.expires_at,
  'pending'::text                                                        AS status,
  i.issued_at,
  i.issued_by_user_id                                                    AS issued_to_user_id,
  NULL                                                                   AS issued_to_ip,
  NULL                                                                   AS issued_user_agent_hash
FROM auth_invite i
WHERE i.status = 'pending'
ON CONFLICT (token_hash) DO NOTHING;

COMMIT;

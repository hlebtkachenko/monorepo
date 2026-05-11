-- Migration 0006: permissions_outbox + app_worker role.
--
-- Creates:
--   app_worker role  (NOLOGIN; drain worker identity)
--   permissions_outbox table (cross-tenant outbox; no RLS by design)
--
-- Design decisions written in from final state:
--   - op_type, attempts, last_error, failed_at columns from day one
--   - Unprocessed index excludes rows where failed_at IS NOT NULL
--   - CHECK: (payload->>'workspace_id')::uuid IS NOT NULL
--   - CHECK: payload->>'user' ~ '^[a-z][a-z0-9_]*:[uuid-pattern]$'
--   - app_user INSERT only; app_worker SELECT + UPDATE
--   - No RLS: this is the cross-tenant outbox; the drain worker reads across all
--     workspaces and must not be scoped to a single workspace GUC.

BEGIN;

-- 1. app_worker role ----------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_worker') THEN
    CREATE ROLE app_worker NOLOGIN;
  END IF;
END
$$;

-- 2. permissions_outbox -------------------------------------------------------

CREATE TABLE permissions_outbox (
  id           uuid         NOT NULL DEFAULT uuidv7(),
  op_type      text         NOT NULL CHECK (op_type IN ('write', 'delete')),
  payload      jsonb        NOT NULL,
  attempts     int          NOT NULL DEFAULT 0,
  last_error   text,
  failed_at    timestamptz,
  processed_at timestamptz,
  created_at   timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT permissions_outbox_pkey PRIMARY KEY (id),
  CONSTRAINT permissions_outbox_payload_is_object
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT permissions_outbox_payload_workspace_id_valid
    CHECK (
      (payload->>'workspace_id') IS NOT NULL
      AND (payload->>'workspace_id')::uuid IS NOT NULL
    ),
  CONSTRAINT permissions_outbox_payload_user_valid
    CHECK (
      (payload->>'user') IS NOT NULL
      AND (payload->>'user') ~ '^[a-z][a-z0-9_]*:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
);

-- Unprocessed rows index: excludes permanently failed rows.
CREATE INDEX permissions_outbox_unprocessed_idx
  ON permissions_outbox (created_at)
  WHERE processed_at IS NULL AND failed_at IS NULL;

-- 3. GRANTs -------------------------------------------------------------------

-- No RLS on permissions_outbox (cross-tenant; intentional exception).
-- app_user INSERT only (writes new outbox rows during workspace mutations).
-- app_worker SELECT + UPDATE (drain worker reads and updates processed_at).

REVOKE ALL ON permissions_outbox FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON permissions_outbox FROM app_user;
    GRANT INSERT ON permissions_outbox TO app_user;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_worker') THEN
    GRANT SELECT, UPDATE ON permissions_outbox TO app_worker;
  END IF;
END
$$;

COMMIT;

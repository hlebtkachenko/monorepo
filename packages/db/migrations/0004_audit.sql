-- Migration 0004: Central audit tables + append-only enforcement.
--
-- Creates:
--   tool_call_log   central audit for every tool call (human + AI), 10-year retention
--   audit_event     workspace-tier append-only audit stream
--
-- Append-only contract enforced in three layers:
--   Layer 2: BEFORE UPDATE / BEFORE DELETE row triggers (raise on any attempt)
--   Layer 3: BEFORE TRUNCATE statement triggers (raise on any attempt)
--   Layer 1: REVOKE DELETE, TRUNCATE from app_user (defense-in-depth anchor;
--            today app_user inherits app_admin grants via 0002's GRANT chain,
--            so this REVOKE takes effect only after that inheritance is severed;
--            triggers are the authoritative enforcement path)
--
-- tool_call_log limited-update: output_json, auto_applied, approved_by_user_id,
-- and rationale may be set after the initial insert (post() finalize path).
-- Everything else is immutable.
--
-- audit_event is workspace-scoped; RLS policies live in 0005_workspace.sql
-- after the workspace table exists. tool_call_log is organization-scoped;
-- its organization_isolation policy is applied here.

BEGIN;

-- actor_kind enum (shared by tool_call_log)
CREATE TYPE actor_kind AS ENUM ('human', 'ai', 'ai_on_behalf', 'system');

-- 1. tool_call_log ------------------------------------------------------------

CREATE TABLE tool_call_log (
  id                   uuid         PRIMARY KEY DEFAULT uuidv7(),
  organization_id      uuid         NOT NULL,
  tool_name            text         NOT NULL,
  idempotency_key      text         NOT NULL,
  actor_kind           actor_kind   NOT NULL,
  user_id              uuid         REFERENCES app_user(id),
  conversation_id      uuid,
  input_json           jsonb        NOT NULL,
  output_json          jsonb,
  confidence           numeric(5,2),
  rationale            text,
  auto_applied         boolean      NOT NULL DEFAULT false,
  approved_by_user_id  uuid         REFERENCES app_user(id),
  created_at           timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tool_call_log_idemp_unique
  ON tool_call_log (organization_id, tool_name, idempotency_key);
CREATE INDEX tool_call_log_organization_created_idx
  ON tool_call_log (organization_id, created_at);
CREATE INDEX tool_call_log_organization_actor_idx
  ON tool_call_log (organization_id, actor_kind, created_at);
CREATE INDEX tool_call_log_tool_name_trgm_idx
  ON tool_call_log USING gin (tool_name gin_trgm_ops);

-- Apply FORCE RLS + organization_isolation policy on tool_call_log.
ALTER TABLE tool_call_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_call_log FORCE  ROW LEVEL SECURITY;

CREATE POLICY organization_isolation ON tool_call_log
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- 2. audit_event --------------------------------------------------------------

CREATE TABLE audit_event (
  id               uuid         PRIMARY KEY DEFAULT uuidv7(),
  workspace_id     uuid         NOT NULL,   -- FK to workspace added in 0005
  organization_id  uuid,                    -- FK to organization added in 0005
  actor_user_id    uuid         REFERENCES app_user(id),
  action           text         NOT NULL,
  payload          jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT audit_event_payload_is_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX audit_event_workspace_created_idx
  ON audit_event (workspace_id, created_at);
CREATE INDEX audit_event_workspace_action_idx
  ON audit_event (workspace_id, action);
CREATE INDEX audit_event_organization_created_idx
  ON audit_event (organization_id, created_at);
CREATE INDEX audit_event_actor_idx
  ON audit_event (actor_user_id);

-- RLS on audit_event is applied in 0005_workspace.sql after workspace table exists.

-- 3. Append-only: tool_call_log row triggers (Layer 2) -----------------------

CREATE OR REPLACE FUNCTION app_block_mutation_tool_call_log()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'tool_call_log is append-only (organization=%, id=%)',
    OLD.organization_id, OLD.id
    USING ERRCODE = 'check_violation';
END;
$$;

ALTER FUNCTION app_block_mutation_tool_call_log() OWNER TO app_owner;

CREATE TRIGGER tool_call_log_no_delete
  BEFORE DELETE ON tool_call_log
  FOR EACH ROW EXECUTE FUNCTION app_block_mutation_tool_call_log();

-- Limited-update trigger: only output_json, auto_applied, approved_by_user_id,
-- and rationale may change after insert. All other columns are immutable.
CREATE OR REPLACE FUNCTION app_tool_call_log_limited_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.organization_id    <> NEW.organization_id
      OR OLD.tool_name       <> NEW.tool_name
      OR OLD.idempotency_key <> NEW.idempotency_key
      OR OLD.actor_kind      <> NEW.actor_kind
      OR OLD.user_id         IS DISTINCT FROM NEW.user_id
      OR OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
      OR OLD.input_json::text <> NEW.input_json::text
      OR OLD.confidence      IS DISTINCT FROM NEW.confidence
      OR OLD.created_at      <> NEW.created_at) THEN
    RAISE EXCEPTION
      'tool_call_log is immutable except for output_json / auto_applied / approved_by_user_id / rationale (organization=%, id=%)',
      OLD.organization_id, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_tool_call_log_limited_update() OWNER TO app_owner;

CREATE TRIGGER tool_call_log_limited_update
  BEFORE UPDATE ON tool_call_log
  FOR EACH ROW EXECUTE FUNCTION app_tool_call_log_limited_update();

-- 4. TRUNCATE-blocking triggers (Layer 3) ------------------------------------

CREATE OR REPLACE FUNCTION app_block_truncate_tool_call_log()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'tool_call_log is append-only; TRUNCATE is blocked. Use the documented retention-purge ceremony instead.'
    USING ERRCODE = 'feature_not_supported';
END;
$$;

ALTER FUNCTION app_block_truncate_tool_call_log() OWNER TO app_owner;

DROP TRIGGER IF EXISTS tool_call_log_no_truncate ON tool_call_log;
CREATE TRIGGER tool_call_log_no_truncate
  BEFORE TRUNCATE ON tool_call_log
  FOR EACH STATEMENT EXECUTE FUNCTION app_block_truncate_tool_call_log();

CREATE OR REPLACE FUNCTION app_block_truncate_audit_event()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'audit_event is append-only; TRUNCATE is blocked. Use the documented retention-purge ceremony instead.'
    USING ERRCODE = 'feature_not_supported';
END;
$$;

ALTER FUNCTION app_block_truncate_audit_event() OWNER TO app_owner;

DROP TRIGGER IF EXISTS audit_event_no_truncate ON audit_event;
CREATE TRIGGER audit_event_no_truncate
  BEFORE TRUNCATE ON audit_event
  FOR EACH STATEMENT EXECUTE FUNCTION app_block_truncate_audit_event();

-- 5. Append-only: audit_event row triggers (Layer 2) -------------------------

CREATE OR REPLACE FUNCTION app_block_mutation_audit_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is append-only: % blocked', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

ALTER FUNCTION app_block_mutation_audit_event() OWNER TO app_owner;
REVOKE EXECUTE ON FUNCTION app_block_mutation_audit_event() FROM PUBLIC;

CREATE TRIGGER audit_event_block_update
  BEFORE UPDATE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION app_block_mutation_audit_event();

CREATE TRIGGER audit_event_block_delete
  BEFORE DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION app_block_mutation_audit_event();

-- DEFENSE-IN-DEPTH SUMMARY (audit tables: tool_call_log + audit_event)
-- Layer 1 (catalog REVOKE): REVOKE UPDATE, DELETE, TRUNCATE FROM app_user.
--   NOTE: Currently no-op because GRANT app_admin TO app_user (see 0003) is
--   in effect, so app_user inherits app_admin's DML. Layer 1 becomes
--   load-bearing only if/when the inheritance is severed.
-- Layer 2 (BEFORE triggers): block UPDATE+DELETE row-by-row at the database.
--   Fires regardless of role membership (app_admin too) unless the trigger
--   is explicitly disabled in the same transaction. This is the true defense.
-- Layer 3 (TRUNCATE trigger): block bulk delete via TRUNCATE.
-- See ADR-0009 (audit log design) when written.

-- 6. GRANTs -------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE ON tool_call_log TO app_user;
    -- No DELETE on tool_call_log for app_user: Layer 1 anchor.
    -- Layer 2 trigger is the authoritative enforcement today.
    REVOKE DELETE, TRUNCATE ON tool_call_log FROM app_user;
    GRANT SELECT, INSERT ON audit_event TO app_user;
    -- audit_event is append-only from app_user: no UPDATE/DELETE/TRUNCATE.
    REVOKE UPDATE, DELETE, TRUNCATE ON audit_event FROM app_user;
  END IF;
END
$$;

COMMIT;

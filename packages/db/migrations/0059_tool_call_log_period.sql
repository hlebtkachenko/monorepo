-- 0059_tool_call_log_period.sql
--
-- Normalize the accounting-period target already validated and carried by every
-- gated accounting write. Period close can then query unresolved HELD proposals
-- without interpreting mutable API payload shapes.
--
-- Existing rows from the three current gated operations are backfilled only
-- when their stored target resolves to a period in the same organization.
-- Malformed, missing, or cross-organization targets remain NULL so readiness can
-- surface them as an unscoped fail-closed blocker.

BEGIN;

ALTER TABLE tool_call_log
  ADD COLUMN period_id uuid;

COMMENT ON COLUMN tool_call_log.period_id IS
  'Normalized accounting-period target for gated accounting writes; NULL for non-period tool calls or unscoped legacy rows.';

-- The audit row is append-only. Disable its immutable-column trigger only for
-- this one migration backfill, then restore it before changing the function to
-- include period_id in the immutable set.
ALTER TABLE tool_call_log DISABLE TRIGGER tool_call_log_limited_update;

WITH candidates AS (
  SELECT
    id,
    organization_id,
    CASE
      WHEN tool_name IN ('createAccountingEvent', 'captureAccountingDocument')
        THEN input_json ->> 'periodId'
      WHEN tool_name = 'createAccountingPosting'
        THEN input_json #>> '{entry,periodId}'
      ELSE NULL
    END AS candidate_period_id
  FROM tool_call_log
  WHERE tool_name IN (
    'createAccountingEvent',
    'captureAccountingDocument',
    'createAccountingPosting'
  )
), valid_targets AS (
  SELECT candidates.id, accounting_period.id AS period_id
  FROM candidates
  JOIN accounting_period
    ON accounting_period.organization_id = candidates.organization_id
   AND accounting_period.id::text = candidates.candidate_period_id
  WHERE candidates.candidate_period_id ~
    '^[0-9A-Fa-f]{8}(-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}$'
)
UPDATE tool_call_log
SET period_id = valid_targets.period_id
FROM valid_targets
WHERE tool_call_log.id = valid_targets.id;

ALTER TABLE tool_call_log ENABLE TRIGGER tool_call_log_limited_update;

ALTER TABLE tool_call_log
  ADD CONSTRAINT tool_call_log_period_fk
  FOREIGN KEY (period_id, organization_id)
  REFERENCES accounting_period (id, organization_id);

CREATE INDEX tool_call_log_organization_period_pending_idx
  ON tool_call_log (organization_id, period_id, created_at)
  WHERE auto_applied = false AND approved_by_user_id IS NULL;

CREATE OR REPLACE FUNCTION app_tool_call_log_limited_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.organization_id    <> NEW.organization_id
      OR OLD.period_id       IS DISTINCT FROM NEW.period_id
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

COMMIT;

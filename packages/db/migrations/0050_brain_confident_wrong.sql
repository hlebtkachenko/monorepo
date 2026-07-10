-- 0050_brain_confident_wrong.sql
--
-- Confident-wrong circuit breaker — the persisted half of constitution §I8.
--
-- I8 (the cardinal sin): a write that reads GREEN (confidence >= the auto-apply
-- threshold) yet is WRONG is the worst failure the Brain can produce. The
-- constitution's remedy is a durable counter plus a startup circuit-breaker:
-- when a human confirms that a previously AUTO-APPLIED booking was confidently
-- wrong, the counter increments and the Brain HALTS — every subsequent
-- autonomous write is refused until a human investigates and clears it.
--
-- WORKSPACE-scoped (NOT organization-scoped): a confident-wrong is a failure of
-- the Brain's confidence CALIBRATION, and calibration + learned state are
-- workspace-scoped (ADR-0029, the same tier as `ocr_extraction_template` and
-- `counterparty`). A confident-wrong in ANY organization of a workspace indicts
-- that workspace's Brain, so the breaker halts every autonomous run in the
-- workspace, not just the one client book. One row per workspace: workspace_id
-- is the PRIMARY KEY (the isolation key and the upsert target).
--
-- DORMANT at cold start: green is structurally unreachable (the server score's
-- `extraction_failed` floor forces HELD), so no write can ever be auto-applied
-- yet, so no confident-wrong can be recorded yet -> the count stays 0 and the
-- breaker is a clean pass. The mechanism is built ready for post-M3 auto-apply.
--
-- Writers (per I5, the boundary is the tool/API surface, not the DB grant):
--   * INCREMENT — the human review surface only (web approvals `markConfidentWrong`
--     server action). No agent tool touches this table, and the agent has no raw
--     SQL, so an agent can neither increment nor clear it.
--   * RESET — an OPERATOR/ADMIN action (the `resetConfidentWrongCount` seam, run
--     via the write bastion). Deliberately NOT an org-member self-service action.
--   * READ — the write gate reads it fail-closed at run entry (`readConfidentWrongCount`).
--
-- Mirrors `ocr_extraction_template` (0047) / `counterparty` (0035 §2): FORCE RLS,
-- four command-specific policies keyed on `app.workspace_id`. Handwritten SQL
-- (ADR-0009). One whole-file transaction; runs through the safe runner path.

BEGIN;

-- =============================================================================
-- 1. Table
-- =============================================================================
CREATE TABLE brain_confident_wrong (
  workspace_id                    uuid        PRIMARY KEY REFERENCES workspace (id),
  -- The durable counter. > 0 trips the breaker (all autonomous writes refused).
  confident_wrong_count           integer     NOT NULL DEFAULT 0,
  -- Provenance of the most recent incident (audit-only, for the human investigation).
  last_incident_at                timestamptz,
  -- Bare uuid, NO FK: tool_call_log is ORGANIZATION-scoped; a workspace -> org FK
  -- would bypass RLS (Postgres FK checks skip RLS). This is a provenance pointer,
  -- not a referential-integrity boundary.
  last_incident_tool_call_log_id  uuid,
  last_incident_note              text,
  -- Who cleared the breaker, and when. Bare uuid (provenance) — app_user is the
  -- global identity tier; audit-only.
  cleared_at                      timestamptz,
  cleared_by_user_id              uuid,
  cleared_note                    text,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  -- The counter can never go negative (a decrement would be a bug).
  CONSTRAINT brain_confident_wrong_count_nonneg CHECK (confident_wrong_count >= 0)
);

-- =============================================================================
-- 2. RLS — workspace-scoped, 4 command-specific policies (mirror ocr_extraction_template)
-- =============================================================================
ALTER TABLE brain_confident_wrong ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_confident_wrong FORCE  ROW LEVEL SECURITY;

CREATE POLICY brain_confident_wrong_select ON brain_confident_wrong FOR SELECT
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY brain_confident_wrong_insert ON brain_confident_wrong FOR INSERT
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY brain_confident_wrong_update ON brain_confident_wrong FOR UPDATE
  USING      (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY brain_confident_wrong_delete ON brain_confident_wrong FOR DELETE
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- =============================================================================
-- 3. app_user grant — SELECT + INSERT + UPDATE only (no DELETE)
-- =============================================================================
-- Tighter than ocr_extraction_template (which gets full DML): the counter row is
-- NEVER deleted — a reset is an UPDATE to 0, so app_user has no DELETE. The
-- human-only property of increment/reset is enforced at the tool/API surface
-- (I5), not by these grants (an agent key also runs as app_user but has no tool
-- or raw-SQL path that touches this table).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE ON brain_confident_wrong TO app_user;
  END IF;
END
$$;

COMMIT;

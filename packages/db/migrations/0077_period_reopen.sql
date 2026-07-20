-- 0077_period_reopen.sql
--
-- Period reopen cascade support (READ-MODEL-DESIGN §3). Reopening a CLOSED účetní
-- období stornos its year-end close (the 701 carried into N+1, the 702 balance-close
-- in N, the 710 result-close in N) append-only — a storno is a new posting, never a
-- delete — then flips N back to OPEN. This migration adds the two schema artifacts
-- that cascade needs:
--
--   1. period_reopen_log — an append-only, org-scoped audit row: who reopened which
--      period, when, why, and the ids of the three storno postings (each nullable —
--      a monetary regime or an empty period may have no result/balance/opening close).
--      Genuinely append-only (R10): app_user gets SELECT + INSERT only, UPDATE/DELETE/
--      TRUNCATE are REVOKEd, and BEFORE UPDATE/DELETE/TRUNCATE block triggers are the
--      AUTHORITATIVE guard (app_user inherits app_admin's DML via 00-roles, so the
--      REVOKE alone is defense-in-depth — mirrors the open_item / period_output
--      append-only precedent in 0035).
--   2. period_output.reverses_output_id — a nullable self-FK. period_output is
--      append-only + UPDATE-blocked (0035), so a závěrka output can't be deleted to
--      reopen; the reopen instead INSERTS a reversal marker row whose
--      reverses_output_id points at the voided output.
--
-- Org-scoped (FORCE RLS + organization_isolation). Composite (fk, organization_id)
-- FKs — a Postgres FK check runs internal and bypasses RLS, so cross-tenant isolation
-- needs the composite target (postgres-fk-bypasses-rls). Handwritten SQL (ADR-0009).
-- ADD-only + idempotent (re-runnable). One whole-file transaction.

BEGIN;

-- 1. period_reopen_log — append-only reopen audit (R10-attributable).
CREATE TABLE IF NOT EXISTS period_reopen_log (
  id                        uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id           uuid        NOT NULL,
  period_id                 uuid        NOT NULL,               -- the reopened období N
  reopened_by               uuid        NOT NULL REFERENCES app_user (id),  -- R10 attributable
  reason                    text,                               -- optional free-text justification
  result_storno_posting_id  uuid,                               -- storno of the 710 result-close (nullable)
  balance_storno_posting_id uuid,                               -- storno of the 702 balance-close (nullable)
  opening_storno_posting_id uuid,                               -- storno of the 701 opening in N+1 (nullable)
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT period_reopen_log_period_fk FOREIGN KEY (period_id, organization_id)
    REFERENCES accounting_period (id, organization_id),
  CONSTRAINT period_reopen_log_id_org_unique UNIQUE (id, organization_id)
);

ALTER TABLE period_reopen_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_reopen_log FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON period_reopen_log;
CREATE POLICY organization_isolation ON period_reopen_log
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
-- Append-only (R10): a reopen audit row is INSERT-only. The REVOKE is defense-in-depth;
-- the block triggers below are authoritative because app_user inherits app_admin's DML.
GRANT SELECT, INSERT ON period_reopen_log TO app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON period_reopen_log FROM app_user;

CREATE INDEX IF NOT EXISTS period_reopen_log_period_idx
  ON period_reopen_log (period_id, organization_id);

-- Append-only block triggers (R10) — the authoritative guard. app_block_mutation_accounting
-- / app_block_truncate_accounting are defined in 0035 (< 0072), so they resolve here. Same
-- pattern as period_output / signature / posting. Idempotent via DROP TRIGGER IF EXISTS.
DROP TRIGGER IF EXISTS period_reopen_log_block_update   ON period_reopen_log;
DROP TRIGGER IF EXISTS period_reopen_log_block_delete   ON period_reopen_log;
DROP TRIGGER IF EXISTS period_reopen_log_block_truncate ON period_reopen_log;
CREATE TRIGGER period_reopen_log_block_update   BEFORE UPDATE   ON period_reopen_log FOR EACH ROW       EXECUTE FUNCTION app_block_mutation_accounting();
CREATE TRIGGER period_reopen_log_block_delete   BEFORE DELETE   ON period_reopen_log FOR EACH ROW       EXECUTE FUNCTION app_block_mutation_accounting();
CREATE TRIGGER period_reopen_log_block_truncate BEFORE TRUNCATE ON period_reopen_log FOR EACH STATEMENT EXECUTE FUNCTION app_block_truncate_accounting();

-- 2. period_output.reverses_output_id — a reopen INSERTS a marker row (never deletes /
--    updates the sealed output) pointing at the voided závěrka output. Composite
--    (reverses_output_id, organization_id) self-FK keeps the link tenant-isolated.
ALTER TABLE period_output
  ADD COLUMN IF NOT EXISTS reverses_output_id uuid;

-- DO-guarded: ADD CONSTRAINT has no IF NOT EXISTS, so re-running the migration would
-- otherwise error on the second apply.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'period_output_reverses_fk') THEN
    ALTER TABLE period_output
      ADD CONSTRAINT period_output_reverses_fk FOREIGN KEY (reverses_output_id, organization_id)
        REFERENCES period_output (id, organization_id);
  END IF;
END $$;

COMMIT;

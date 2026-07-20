-- 0069_number_series_period.sql
--
-- number_series_period — per-účetní-období numbering config + gapless counter for
-- a DOCUMENT číselná řada (Dokladové řady). One number_series (entity_type
-- DOCUMENT) may carry one number_series_period per accounting_period; each row has
-- its own format (prefix + zero-padded length + postfix) AND its own gapless
-- current_number, so a new účetní období restarts the sequence. Mirrors the
-- Dokladové řady editor grid: Účetní období | Délka čísla | Prefix | Postfix |
-- Akt.číslo. EVENT / ASSET / INVENTORY_COUNT series stay flat (never gain period
-- rows) and keep advancing number_series.next_number unchanged.
--
-- Because the counter now restarts per period, the doklad Označení is unique per
-- (series, PERIOD, sequence) — this widens summary_record's gapless constraint
-- accordingly. That is a RELAXATION of the old (series, sequence) unique, so it
-- passes on all existing rows (period_id is NOT NULL on every summary_record).
-- accounting_event / asset / inventory_count keep the flat (series, sequence)
-- unique because those series never gain period rows.
--
-- Org-scoped (FORCE RLS + organization_isolation). Composite (fk, organization_id)
-- FKs — FK bypasses RLS (postgres-fk-bypasses-rls). Handwritten SQL (ADR-0009).
-- ADD-only + idempotent (re-runnable). One whole-file transaction.

BEGIN;

CREATE TABLE IF NOT EXISTS number_series_period (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid        NOT NULL,
  number_series_id uuid        NOT NULL,             -- the DOCUMENT série this period configures
  period_id        uuid        NOT NULL,             -- Účetní období
  number_length    integer     NOT NULL,             -- Délka čísla (zero-pad width of the sequence)
  prefix           text        NOT NULL DEFAULT '',  -- Prefix (e.g. 'PF')
  postfix          text        NOT NULL DEFAULT '',  -- Postfix (e.g. '/{YYYY}'); {YYYY}/{YY}/{MM} tokens expand
  current_number   bigint      NOT NULL DEFAULT 1,   -- Akt.číslo — gapless per (series, period); never a SEQUENCE
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT number_series_period_series_fk FOREIGN KEY (number_series_id, organization_id)
    REFERENCES number_series (id, organization_id),
  CONSTRAINT number_series_period_period_fk FOREIGN KEY (period_id, organization_id)
    REFERENCES accounting_period (id, organization_id),
  CONSTRAINT number_series_period_id_org_unique       UNIQUE (id, organization_id),
  CONSTRAINT number_series_period_series_period_unique UNIQUE (number_series_id, period_id),
  CONSTRAINT number_series_period_length_chk          CHECK (number_length BETWEEN 1 AND 18)
);

ALTER TABLE number_series_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE number_series_period FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON number_series_period;
CREATE POLICY organization_isolation ON number_series_period
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON number_series_period TO app_user;

-- Widen the doklad gapless uniqueness to be period-scoped: per-period counters
-- restart at 1, so (series, sequence) is no longer globally unique — (series,
-- period, sequence) is. DROP IF EXISTS + ADD keeps this rerun-safe.
ALTER TABLE summary_record DROP CONSTRAINT IF EXISTS summary_record_cislena_rada_unique;
ALTER TABLE summary_record ADD  CONSTRAINT summary_record_cislena_rada_unique
  UNIQUE (number_series_id, period_id, sequence_number);

COMMIT;

-- 0081_accounting_sub_period.sql
--
-- accounting_sub_period — the fiscal month/quarter rows that subdivide one
-- účetní období (accounting_period). Foundation for the year -> month tree and
-- the per-slot document-flow padlocks that later waves attach.
--
-- FISCAL grain, deliberately distinct from the CALENDAR-grain filing_record:
-- these slots are children of a specific accounting_period, so the parent is a
-- composite (period_id, organization_id) FK, not a calendar (period_start,
-- period_end) pair. slot_index is the 0-based ordinal of the slot within its
-- period (0..11 for MONTH, 0..3 for QUARTER). status reuses the existing
-- period_status enum (OPEN | CLOSED) — a sub-period opens/closes exactly like a
-- period. allow_inbound_documents / allow_outbound_documents are the doc-flow
-- padlocks; this migration only stores them (default open). Enforcement triggers
-- and openPeriod seeding land in later waves (P14/P15), NOT here.
--
-- Org-scoped (FORCE RLS + organization_isolation, NULLIF guard — ADR-0010).
-- Composite (period_id, organization_id) FK — a Postgres FK check runs internal
-- and bypasses RLS, so cross-tenant isolation needs the composite target
-- (postgres-fk-bypasses-rls). UNIQUE (id, organization_id) is the composite-FK
-- target idiom for future refs; UNIQUE (organization_id, period_id, slot_index)
-- makes the slot ordinal one-per-period-per-org. status + the doc-flow flags are
-- mutable, so app_user keeps UPDATE. ADD-only, idempotent (re-runnable). One
-- whole-file transaction. Handwritten SQL (ADR-0009).

BEGIN;

-- sub_period_kind: the fiscal grain of a slot. A period is subdivided either into
-- 12 months or 4 quarters (chosen per period by the seeding wave).
DO $$ BEGIN
  CREATE TYPE sub_period_kind AS ENUM (
    'MONTH',    -- měsíc
    'QUARTER'   -- čtvrtletí
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS accounting_sub_period (
  id                       uuid            PRIMARY KEY DEFAULT uuidv7(),
  organization_id          uuid            NOT NULL,
  period_id                uuid            NOT NULL,               -- parent účetní období
  slot_index               integer         NOT NULL,              -- 0-based ordinal within the period
  slot_kind                sub_period_kind NOT NULL,
  period_start             date            NOT NULL,              -- fiscal slot start (inclusive)
  period_end               date            NOT NULL,              -- fiscal slot end (inclusive)
  status                   period_status   NOT NULL DEFAULT 'OPEN',
  allow_inbound_documents  boolean         NOT NULL DEFAULT true, -- doklady přijaté padlock
  allow_outbound_documents boolean         NOT NULL DEFAULT true, -- doklady vydané padlock
  created_at               timestamptz     NOT NULL DEFAULT now(),
  updated_at               timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT accounting_sub_period_dates_chk       CHECK (period_start <= period_end),
  CONSTRAINT accounting_sub_period_slot_index_chk  CHECK (slot_index >= 0),
  CONSTRAINT accounting_sub_period_period_fk FOREIGN KEY (period_id, organization_id)
    REFERENCES accounting_period (id, organization_id),
  CONSTRAINT accounting_sub_period_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT accounting_sub_period_slot_unique
    UNIQUE (organization_id, period_id, slot_index)
);

ALTER TABLE accounting_sub_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_sub_period FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON accounting_sub_period;
CREATE POLICY organization_isolation ON accounting_sub_period
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
-- Status + doc-flow flags are mutable (later waves toggle them); app_user keeps
-- UPDATE. Rows are created only by the openPeriod seeding wave and never
-- individually deleted, so DELETE is withheld.
GRANT SELECT, INSERT, UPDATE ON accounting_sub_period TO app_user;

-- Parent -> children read path (list a period's slots for the year -> month tree).
CREATE INDEX IF NOT EXISTS accounting_sub_period_period_idx
  ON accounting_sub_period (period_id, organization_id);

COMMIT;

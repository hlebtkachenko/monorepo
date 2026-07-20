-- 0080_filing_record.sql
--
-- filing_record — persisted tax-filing status for an organization's periodic
-- obligations (DPH / kontrolní hlášení / souhrnné hlášení / payroll levies).
-- Materializes the @workspace/accounting FilingRecord domain type: a row records
-- that a given obligation for a given filing period reached FILED / ACCEPTED /
-- REJECTED. The domain's NOT_TRACKED state is row-absence (no row = not tracked),
-- so it is never stored.
--
-- CALENDAR grain, deliberately decoupled from the fiscal period: VAT and payroll
-- filing periods are calendar-aligned (a month or a quarter), so the period is the
-- pair (period_start, period_end) and this table does NOT FK to accounting_period.
-- organization_id is the ONLY foreign key.
--
-- Org-scoped (FORCE RLS + organization_isolation, NULLIF guard — ADR-0010).
-- Composite UNIQUE (id, organization_id) is the composite-FK target for future
-- refs; UNIQUE (organization_id, obligation_kind, period_start, period_end) makes
-- the status idempotent (one filing row per obligation per period per org) and its
-- leading organization_id column also serves the per-org list read. Status is
-- mutable as a filing progresses FILED -> ACCEPTED / REJECTED, so app_user keeps
-- UPDATE (unlike the append-only audit logs). ADD-only, idempotent (re-runnable).
-- One whole-file transaction. Handwritten SQL (ADR-0009).

BEGIN;

-- obligation_kind: the periodic tax obligation this filing satisfies. Mirrors the
-- ObligationKind union in packages/accounting/src/obligations/model.ts verbatim.
DO $$ BEGIN
  CREATE TYPE obligation_kind AS ENUM (
    'VAT_RETURN',                   -- přiznání k DPH
    'CONTROL_STATEMENT',            -- kontrolní hlášení
    'EC_SALES_LIST',                -- souhrnné hlášení
    'SOCIAL_INSURANCE',             -- sociální pojištění (ČSSZ)
    'HEALTH_INSURANCE',             -- zdravotní pojištění
    'PAYROLL_TAX_ADVANCE',          -- záloha na daň ze závislé činnosti
    'SPECIAL_RATE_WITHHOLDING_TAX'  -- srážková daň (zvláštní sazba)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- filing_status: the persisted subset of FilingRecord.status. NOT_TRACKED is
-- represented by row-absence, so it is not a stored value.
DO $$ BEGIN
  CREATE TYPE filing_status AS ENUM (
    'FILED',      -- podáno
    'ACCEPTED',   -- přijato (potvrzeno FÚ / ČSSZ / ZP)
    'REJECTED'    -- odmítnuto
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS filing_record (
  id              uuid            PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid            NOT NULL REFERENCES organization (id),
  obligation_kind obligation_kind NOT NULL,
  period_start    date            NOT NULL,   -- calendar filing period (inclusive)
  period_end      date            NOT NULL,   -- calendar filing period (inclusive)
  status          filing_status   NOT NULL,
  recorded_at     timestamptz     NOT NULL DEFAULT now(),
  recorded_by     uuid            NOT NULL,   -- operator/user id who recorded it (no FK)
  CONSTRAINT filing_record_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT filing_record_org_kind_period_unique
    UNIQUE (organization_id, obligation_kind, period_start, period_end)
);

ALTER TABLE filing_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE filing_record FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON filing_record;
CREATE POLICY organization_isolation ON filing_record
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON filing_record TO app_user;

COMMIT;

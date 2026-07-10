-- 0054_dppo_annual_adjustment.sql
--
-- Per-accounting-period provenanced inputs the DPPO worksheet (buildDppo,
-- packages/accounting/src/output/dppo.ts) needs but cannot derive from the
-- books: the taxpayer category (§17a/§21 ZDP) and the six statutory adjustments
-- — §25 daňově neuznatelné náklady, §18a/§19 osvobozené výnosy, §18a/1 ztráta
-- z hlavní (nevýdělečné) činnosti, §34 odpočet daňové ztráty, §35 slevy na dani,
-- §38a zaplacené zálohy.
--
-- Normalized design, two tables:
--
--   dppo_annual_taxpayer_category — one row per (organization_id, period_id)
--     ONLY when a category has been chosen. Row absent = not chosen.
--
--   dppo_annual_adjustment — one row per ANSWERED adjustment, keyed by
--     (organization_id, period_id, adjustment_key). Row absent = not answered
--     → buildDppo reports it blocking; a present row (amount including "0") =
--     confirmed. The provenance columns (source / reference / recorded_at) are
--     NOT NULL: the all-or-none invariant lives in the row's existence, not in
--     per-group num_nulls CHECKs. loadDppoAdjustments trusts this — every
--     present row carries a full ProvenancedDecimal, no fallbacks.
--
-- Both are ADD-only replace-on-save stores (no version history, unlike
-- organization_tax_profile which is [valid_from, valid_to] versioned).
--
-- Both are org-scoped (FORCE RLS + organization_isolation, NULLIF guard —
-- ADR-0010). The composite FK (period_id, organization_id) → accounting_period
-- (id, organization_id) is MANDATORY, not period_id alone: Postgres FK checks
-- run internal and skip RLS, so the tenant column must be part of the FK to keep
-- cross-tenant references impossible.
--
-- ADD-only, idempotent (re-runnable). One whole-file transaction. Handwritten
-- SQL (ADR-0009).

BEGIN;

-- --------------------------------------------------------------------------
-- Taxpayer category — per period, present only when chosen (§17a/§21 ZDP).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dppo_annual_taxpayer_category (
  organization_id   uuid        NOT NULL REFERENCES organization (id),
  period_id         uuid        NOT NULL,
  taxpayer_category text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dppo_annual_taxpayer_category_pkey
    PRIMARY KEY (organization_id, period_id),
  CONSTRAINT dppo_annual_taxpayer_category_chk
    CHECK (taxpayer_category IN
      ('STANDARD', 'BASIC_INVESTMENT_FUND', 'QUALIFYING_PENSION_INSTITUTION', 'OTHER')),
  CONSTRAINT dppo_annual_taxpayer_category_period_fk
    FOREIGN KEY (period_id, organization_id)
    REFERENCES accounting_period (id, organization_id)
);

ALTER TABLE dppo_annual_taxpayer_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE dppo_annual_taxpayer_category FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON dppo_annual_taxpayer_category;
CREATE POLICY organization_isolation ON dppo_annual_taxpayer_category
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON dppo_annual_taxpayer_category TO app_user;

-- --------------------------------------------------------------------------
-- Adjustments — one row per ANSWERED adjustment; provenance is NOT NULL.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dppo_annual_adjustment (
  organization_id uuid          NOT NULL REFERENCES organization (id),
  period_id       uuid          NOT NULL,
  adjustment_key  text          NOT NULL,
  amount          numeric(19,4) NOT NULL,
  source          text          NOT NULL,
  reference       text          NOT NULL,
  recorded_at     timestamptz   NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT dppo_annual_adjustment_pkey
    PRIMARY KEY (organization_id, period_id, adjustment_key),
  CONSTRAINT dppo_annual_adjustment_adjustment_key_chk
    CHECK (adjustment_key IN
      ('nonDeductibleExpenses', 'exemptRevenue', 'excludeLossMakingMainActivity',
       'lossCarryForward', 'taxReliefs', 'advancesPaid')),
  CONSTRAINT dppo_annual_adjustment_source_chk
    CHECK (source IN ('USER', 'ADVISOR', 'LEDGER')),
  CONSTRAINT dppo_annual_adjustment_period_fk
    FOREIGN KEY (period_id, organization_id)
    REFERENCES accounting_period (id, organization_id)
);

ALTER TABLE dppo_annual_adjustment ENABLE ROW LEVEL SECURITY;
ALTER TABLE dppo_annual_adjustment FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON dppo_annual_adjustment;
CREATE POLICY organization_isolation ON dppo_annual_adjustment
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON dppo_annual_adjustment TO app_user;

COMMIT;

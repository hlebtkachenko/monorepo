-- 0054_dppo_annual_adjustment.sql
--
-- dppo_annual_adjustment — per-accounting-period provenanced inputs the DPPO
-- worksheet (buildDppo, packages/accounting/src/output/dppo.ts) needs but cannot
-- derive from the books: the taxpayer category (§17a/§21 ZDP) and the six
-- statutory adjustments — §25 daňově neuznatelné náklady, §18a/§19 osvobozené
-- výnosy, §18a/1 ztráta z hlavní (nevýdělečné) činnosti, §34 odpočet daňové
-- ztráty, §35 slevy na dani, §38a zaplacené zálohy.
--
-- One MUTABLE row per (organization_id, period_id) — overwritten on save (no
-- version history, unlike organization_tax_profile which is [valid_from,
-- valid_to] versioned). Each answered amount carries USER provenance
-- (<key>_source / <key>_reference / <key>_recorded_at). An empty amount = not
-- answered → buildDppo reports it blocking; a supplied value (including "0") =
-- confirmed. taxpayer_category is stored per period in this same row and is
-- nullable until chosen.
--
-- Natural key (organization_id, period_id) is the composite PRIMARY KEY: it is
-- the ON CONFLICT upsert target AND the (organization_id, period_id) lookup /
-- RLS index in one — mirrors account_period_balance (0032), which also keys a
-- single upserted row per natural tuple with a composite PK rather than a
-- surrogate id + separate UNIQUE + duplicate index.
--
-- Org-scoped (FORCE RLS + organization_isolation, NULLIF guard — ADR-0010). The
-- composite FK (period_id, organization_id) → accounting_period (id,
-- organization_id) is MANDATORY, not period_id alone: Postgres FK checks run
-- internal and skip RLS, so the tenant column must be part of the FK to keep
-- cross-tenant references impossible.
--
-- ADD-only, idempotent (re-runnable). One whole-file transaction. Handwritten
-- SQL (ADR-0009).

BEGIN;

CREATE TABLE IF NOT EXISTS dppo_annual_adjustment (
  organization_id   uuid        NOT NULL REFERENCES organization (id),
  period_id         uuid        NOT NULL,
  taxpayer_category text,       -- STANDARD | BASIC_INVESTMENT_FUND | QUALIFYING_PENSION_INSTITUTION | OTHER (or NULL)

  -- §25 daňově neuznatelné náklady
  non_deductible_expenses_amount            numeric(19,4),
  non_deductible_expenses_source            text,
  non_deductible_expenses_reference         text,
  non_deductible_expenses_recorded_at       timestamptz,

  -- §18a/§19 osvobozené / nezahrnované výnosy
  exempt_revenue_amount                     numeric(19,4),
  exempt_revenue_source                     text,
  exempt_revenue_reference                  text,
  exempt_revenue_recorded_at                timestamptz,

  -- §18a/1 ztráta z hlavní (nevýdělečné) činnosti (0 for a non-nonprofit org)
  exclude_loss_making_main_activity_amount        numeric(19,4),
  exclude_loss_making_main_activity_source        text,
  exclude_loss_making_main_activity_reference     text,
  exclude_loss_making_main_activity_recorded_at   timestamptz,

  -- §34 odpočet daňové ztráty minulých let
  loss_carry_forward_amount                 numeric(19,4),
  loss_carry_forward_source                 text,
  loss_carry_forward_reference              text,
  loss_carry_forward_recorded_at            timestamptz,

  -- §35 slevy na dani
  tax_reliefs_amount                        numeric(19,4),
  tax_reliefs_source                        text,
  tax_reliefs_reference                     text,
  tax_reliefs_recorded_at                   timestamptz,

  -- §38a zaplacené zálohy na daň
  advances_paid_amount                      numeric(19,4),
  advances_paid_source                      text,
  advances_paid_reference                   text,
  advances_paid_recorded_at                 timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dppo_annual_adjustment_pkey
    PRIMARY KEY (organization_id, period_id),
  CONSTRAINT dppo_annual_adjustment_taxpayer_category_chk
    CHECK (taxpayer_category IS NULL OR taxpayer_category IN
      ('STANDARD', 'BASIC_INVESTMENT_FUND', 'QUALIFYING_PENSION_INSTITUTION', 'OTHER')),
  CONSTRAINT dppo_annual_adjustment_period_fk
    FOREIGN KEY (period_id, organization_id)
    REFERENCES accounting_period (id, organization_id),

  -- Provenance is all-or-none per adjustment group: each group's four columns
  -- (amount, source, reference, recorded_at) are either ALL NULL (not answered)
  -- or ALL set (answered). loadDppoAdjustments trusts this — once the amount is
  -- non-null it reads the three provenance columns as non-null, no fallbacks.
  CONSTRAINT dppo_annual_adjustment_non_deductible_expenses_provenance_chk
    CHECK (num_nulls(non_deductible_expenses_amount, non_deductible_expenses_source,
                     non_deductible_expenses_reference, non_deductible_expenses_recorded_at) IN (0, 4)),
  CONSTRAINT dppo_annual_adjustment_exempt_revenue_provenance_chk
    CHECK (num_nulls(exempt_revenue_amount, exempt_revenue_source,
                     exempt_revenue_reference, exempt_revenue_recorded_at) IN (0, 4)),
  CONSTRAINT dppo_annual_adjustment_exclude_loss_activity_provenance_chk
    CHECK (num_nulls(exclude_loss_making_main_activity_amount, exclude_loss_making_main_activity_source,
                     exclude_loss_making_main_activity_reference, exclude_loss_making_main_activity_recorded_at) IN (0, 4)),
  CONSTRAINT dppo_annual_adjustment_loss_carry_forward_provenance_chk
    CHECK (num_nulls(loss_carry_forward_amount, loss_carry_forward_source,
                     loss_carry_forward_reference, loss_carry_forward_recorded_at) IN (0, 4)),
  CONSTRAINT dppo_annual_adjustment_tax_reliefs_provenance_chk
    CHECK (num_nulls(tax_reliefs_amount, tax_reliefs_source,
                     tax_reliefs_reference, tax_reliefs_recorded_at) IN (0, 4)),
  CONSTRAINT dppo_annual_adjustment_advances_paid_provenance_chk
    CHECK (num_nulls(advances_paid_amount, advances_paid_source,
                     advances_paid_reference, advances_paid_recorded_at) IN (0, 4))
);

ALTER TABLE dppo_annual_adjustment ENABLE ROW LEVEL SECURITY;
ALTER TABLE dppo_annual_adjustment FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON dppo_annual_adjustment;
CREATE POLICY organization_isolation ON dppo_annual_adjustment
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON dppo_annual_adjustment TO app_user;

COMMIT;

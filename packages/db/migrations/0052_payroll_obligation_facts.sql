-- 0052_payroll_obligation_facts.sql
--
-- Replace the has_employees shortcut with explicit, effective-dated payroll
-- relationship and remittance facts. Existing rows deliberately remain NULL:
-- the legacy boolean cannot prove insurance participation or either tax kind.

BEGIN;

ALTER TABLE organization_tax_profile
  ADD COLUMN IF NOT EXISTS has_standard_employment boolean,
  ADD COLUMN IF NOT EXISTS has_dpp boolean,
  ADD COLUMN IF NOT EXISTS has_dpc boolean,
  ADD COLUMN IF NOT EXISTS social_insurance_participation boolean,
  ADD COLUMN IF NOT EXISTS health_insurance_participation boolean,
  ADD COLUMN IF NOT EXISTS payroll_tax_advance_due boolean,
  ADD COLUMN IF NOT EXISTS special_rate_withholding_due boolean;

COMMENT ON COLUMN organization_tax_profile.has_employees IS
  'Legacy display fact only. Never decides payroll obligations after migration 0052.';
COMMENT ON COLUMN organization_tax_profile.social_insurance_participation IS
  'Explicit monthly participation fact; NULL means unconfigured.';
COMMENT ON COLUMN organization_tax_profile.health_insurance_participation IS
  'Explicit monthly participation fact; NULL means unconfigured.';
COMMENT ON COLUMN organization_tax_profile.payroll_tax_advance_due IS
  'Explicit monthly remittance fact; distinct from special-rate withholding.';
COMMENT ON COLUMN organization_tax_profile.special_rate_withholding_due IS
  'Explicit monthly special-rate withholding remittance fact.';

COMMIT;

-- 0051_vat_status_filing_period_guard.sql
-- A monthly or quarterly filing cadence describes VAT payers only. Payers may
-- remain NULL while configuration is incomplete; consumers surface that gap.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'vat_status_filing_period_regime_check'
       AND conrelid = 'vat_status'::regclass
  ) THEN
    ALTER TABLE vat_status
      ADD CONSTRAINT vat_status_filing_period_regime_check
      CHECK (vat_regime_code = 'PAYER' OR filing_period IS NULL) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE vat_status
  VALIDATE CONSTRAINT vat_status_filing_period_regime_check;

COMMIT;

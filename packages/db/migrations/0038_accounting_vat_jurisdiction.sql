-- 0038_accounting_vat_jurisdiction.sql
--
-- v2 accounting — persist the VAT JURISDICTION of a captured supply on
-- partial_record so the DPH return can split legally-distinct self-assessments
-- that all capture as vat_mode = REVERSE_CHARGE:
--   §16 pořízení zboží z jiného členského státu  → přiznání ř.3/4
--   §92a-92e domácí přenesení daňové povinnosti   → přiznání ř.10/11
-- Without this marker both collapse into one bucket (the EPIC-3 DPH limitation).
-- The column also feeds the souhrnné hlášení (§102) EU-supply recap (EU-marked
-- ISSUED supplies) and future ř.5/6 (EU services §9) work.
--
-- vat_jurisdiction mirrors the decision layer's VatJurisdiction union
-- (classify.ts): DOMESTIC / REVERSE_CHARGE / EU / IMPORT / EXEMPT / OUTSIDE_VAT.
-- NULLABLE — existing rows stay NULL and every reader treats NULL as "not
-- distinguished" (the legacy REVERSE_CHARGE→ř.10/11 default), so the change is
-- backward compatible. A CHECK constrains the domain; a text column (not a
-- pgEnum) keeps the migration additive and lock-light (no ALTER TYPE).
--
-- Law frame: ZDPH 235/2004 Sb. §16 / §92a-92e / §102. Additive column only; no
-- data backfill. Idempotent. Handwritten SQL (ADR-0009); one whole-file
-- transaction.

BEGIN;

ALTER TABLE partial_record
  ADD COLUMN IF NOT EXISTS vat_jurisdiction text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partial_record_vat_jurisdiction_chk'
  ) THEN
    ALTER TABLE partial_record
      ADD CONSTRAINT partial_record_vat_jurisdiction_chk
      CHECK (vat_jurisdiction IS NULL OR vat_jurisdiction IN
        ('DOMESTIC', 'REVERSE_CHARGE', 'EU', 'IMPORT', 'EXEMPT', 'OUTSIDE_VAT'));
  END IF;
END$$;

COMMENT ON COLUMN partial_record.vat_jurisdiction IS
  'VAT place-of-supply regime (ZDPH §16/§92/§102): DOMESTIC/REVERSE_CHARGE/EU/IMPORT/EXEMPT/OUTSIDE_VAT. Splits ř.3/4 (EU acquisition) from ř.10/11 (domestic PDP) on the DPH return; NULL = legacy/undistinguished.';

COMMIT;

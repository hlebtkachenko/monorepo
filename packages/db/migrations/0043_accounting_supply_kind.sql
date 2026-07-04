-- 0043_accounting_supply_kind.sql
--
-- v2 accounting — persist the SUPPLY KIND of a captured supply on partial_record
-- so the reports that need a goods-vs-service distinction can emit the correct
-- kód. Today souhrnné hlášení (§102) hardcodes kód plnění "0" (dodání zboží)
-- for every EU-marked ISSUED supply because partial_record carries only the
-- jurisdiction, not whether the supply was goods or a service (souhrnne-hlaseni
-- module doc + the DPH ř.5/6 follow-up). This column unblocks the §64 goods
-- (kód 0) vs §9/1 service (kód 3) split on the recapitulative statement.
--
-- supply_kind mirrors the decision layer's SupplyKind union (classify.ts):
-- GOODS / MATERIAL / SERVICES / UTILITY / RENT / INSURANCE / ASSET / ADVANCE /
-- CREDIT_NOTE / OTHER.
-- NULLABLE — existing rows stay NULL and every reader treats NULL as the legacy
-- kód-0 (goods) behavior, so the change is strictly backward compatible: no
-- pre-existing report row moves. A CHECK constrains the domain; a text column
-- (not a pgEnum) keeps the migration additive and lock-light (no ALTER TYPE).
--
-- Law frame: ZDPH 235/2004 Sb. §64 / §9 / §102 (souhrnné hlášení). Additive
-- column only; no data backfill. Idempotent. Handwritten SQL (ADR-0009); one
-- whole-file transaction.

BEGIN;

ALTER TABLE partial_record
  ADD COLUMN IF NOT EXISTS supply_kind text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partial_record_supply_kind_chk'
  ) THEN
    ALTER TABLE partial_record
      ADD CONSTRAINT partial_record_supply_kind_chk
      CHECK (supply_kind IS NULL OR supply_kind IN
        ('GOODS', 'MATERIAL', 'SERVICES', 'UTILITY', 'RENT', 'INSURANCE',
         'ASSET', 'ADVANCE', 'CREDIT_NOTE', 'OTHER'));
  END IF;
END$$;

COMMENT ON COLUMN partial_record.supply_kind IS
  'Kind of supply (ZDPH §64/§9): GOODS/MATERIAL/SERVICES/UTILITY/RENT/INSURANCE/ASSET/ADVANCE/CREDIT_NOTE/OTHER. Drives the souhrnné hlášení §102 kód plnění (SERVICES -> 3 service §9/1; else -> 0 goods §64); NULL = legacy/undistinguished (kód 0).';

COMMIT;

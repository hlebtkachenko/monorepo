-- 0039_accounting_counterparty_tax_identity.sql
--
-- v2 accounting — give the workspace-shared counterparty a tax identity so the
-- outputs that report PER PARTNER can name it:
--   kontrolní hlášení (§101c-101i) A.4/A.5/B.2/B.3 rows need DIČ + partner name,
--   souhrnné hlášení (§102) needs the acquirer's VAT id + member-state country.
-- The 0026 counterparty table was a bare identity row (id, workspace_id,
-- self_of_organization_id) with no name/DIČ/country — those fields had no home,
-- which forced the KH to section totals only (EPIC-3 limitation).
--
-- Columns (all NULLABLE, additive — existing rows and self-of-org rows stay
-- NULL; a self counterparty carries the org's own identity, filled by the app):
--   name          — obchodní jméno / jméno osoby (KH + SH display)
--   tax_id        — DIČ, incl. country prefix (e.g. 'CZ12345678', 'DE811234567')
--   country_code  — ISO 3166-1 alpha-2 member state ('CZ' domestic, 'DE' EU, …)
--
-- Workspace-scoped table (counterparty is shared across the workspace's orgs);
-- no organization_id. A light CHECK keeps country_code a 2-letter upper code.
--
-- Law frame: ZDPH 235/2004 Sb. §101d (KH náležitosti) + §102 (souhrnné hlášení).
-- Additive columns only; no backfill. Idempotent. Handwritten SQL (ADR-0009);
-- one whole-file transaction.

BEGIN;

ALTER TABLE counterparty
  ADD COLUMN IF NOT EXISTS name         text,
  ADD COLUMN IF NOT EXISTS tax_id       text,
  ADD COLUMN IF NOT EXISTS country_code char(2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'counterparty_country_code_chk'
  ) THEN
    ALTER TABLE counterparty
      ADD CONSTRAINT counterparty_country_code_chk
      CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');
  END IF;
END$$;

COMMENT ON COLUMN counterparty.tax_id IS
  'DIČ incl. country prefix (CZ12345678). Feeds kontrolní hlášení (§101d) + souhrnné hlášení (§102) per-partner rows.';
COMMENT ON COLUMN counterparty.country_code IS
  'ISO 3166-1 alpha-2 member state (CZ domestic / DE,SK,… EU). Drives §102 souhrnné hlášení grouping.';

COMMIT;

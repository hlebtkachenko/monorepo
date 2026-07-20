-- 0069_accounting_period_zkratka.sql
--
-- Účetní období — the editable short code (zkratka) of a period. The Closing →
-- Účetní období list shows a per-period "Zkratka": it auto-defaults to the fiscal
-- year (the year the books close) but is user-editable, so an accountant can label
-- a hospodářský rok or a kratší/delší období with their own code. Persisted here so
-- an edit survives; readers fall back to the derived fiscal year when NULL.
--
-- NULLABLE + additive: no existing row is rewritten, and no insert path is forced
-- to supply it yet (createPeriod sets the auto-default in a later change; the
-- app-edge read COALESCEs NULL -> derived fiscal year meanwhile). No backfill — a
-- NULL zkratka is a valid "not yet overridden" state. Idempotent, one whole-file
-- transaction. Handwritten SQL (ADR-0009; drizzle-kit forbidden).
BEGIN;

ALTER TABLE accounting_period
  ADD COLUMN IF NOT EXISTS zkratka text;

COMMIT;

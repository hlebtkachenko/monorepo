-- 0037_accounting_fx_year1.sql
--
-- v2 accounting — FX year-1 capabilities (Hleb 2026-07-01): cross-currency settlement (storage
-- already in 0035), the §24a functional-currency restriction, and the per-period elected rate
-- method (denní vs pevný kurz). Cross-currency settlement needs no further schema (the engine
-- in EPIC 2 populates open_item_settlement.settlement_fx_rate); this migration covers the other two.
--
-- Law frame: §24a ZoÚ (měna účetnictví may only be CZK/EUR/USD/GBP — the functional-currency
-- reform 2024) · §24 ZoÚ + ČÚS 006 (the entity fixes its kurz method — denní or pevný — in its
-- internal směrnice, per účetní období). Handwritten SQL (ADR-0009); one whole-file transaction.

BEGIN;

-- 1. §24a functional currencies — flag the currencies eligible as měna účetnictví. Transaction /
--    document currencies (partial_record.currency_code, open_item.currency_code) stay UNRESTRICTED
--    (any catalogue currency); only the org's functional currency is gated.
ALTER TABLE currency ADD COLUMN is_functional_currency boolean NOT NULL DEFAULT false;
UPDATE currency SET is_functional_currency = (code IN ('CZK', 'EUR', 'USD', 'GBP'));  -- §24a-eligible set
ALTER TABLE currency
  ADD CONSTRAINT currency_code_functional_unique UNIQUE (code, is_functional_currency);  -- composite-FK target

-- 2. accounting_period — gate accounting_currency to a functional currency via the generated-constant
--    + composite-FK idiom (same unbypassable pattern as the regime spine; no trigger). A period whose
--    accounting_currency is non-functional (e.g. PLN) has no matching (code, true) row -> rejected.
ALTER TABLE accounting_period
  ADD COLUMN accounting_currency_is_functional boolean NOT NULL GENERATED ALWAYS AS (true) STORED;
ALTER TABLE accounting_period
  ADD CONSTRAINT accounting_period_functional_currency_fk
    FOREIGN KEY (accounting_currency, accounting_currency_is_functional)
    REFERENCES currency (code, is_functional_currency);

-- 3. Per-period elected FX rate method (§24 směrnice): DAILY = denní kurz (ČNB rate of the day),
--    FIXED = pevný kurz (one rate fixed for the period). Nullable (NULL = not yet elected; the engine
--    defaults to DAILY). The applied rate is still frozen per transaction on partial_record.fx_rate;
--    this records the org's election so the EPIC-2 engine knows which rate to fetch.
ALTER TABLE accounting_period
  ADD COLUMN fx_rate_policy fx_rate_kind;  -- {DAILY, FIXED}; REAL is a per-transaction kind, not a policy

COMMIT;

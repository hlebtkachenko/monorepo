-- 0035_accounting_fx_coherence.sql
--
-- v2 accounting — FX / multi-currency: land the STORAGE + COHERENCE GUARDS now, defer the
-- ENGINE (rate fetch · 563/663 kurzový rozdíl · §4/12 balance-day revaluation · cross-currency
-- realized gain/loss) to EPIC 2 (advisor decision: option C — hybrid). All target tables are
-- empty (prelaunch, testers only), so this is a free, zero-data-migration moment to fix the
-- column set before any foreign-currency money rows exist.
--
-- Law frame: ČÚS 006 (kurzové rozdíly, §60 Vyhláška 500/2002) · §24a ZoÚ (měna účetnictví,
-- 2024 reform) · §4/12 ZoÚ (rozvahový den) · §4/5 ZDPH (ČNB/ECB rate for the VAT base).
-- Handwritten SQL (ADR-0009). One whole-file transaction; runs through the safe runner path.

BEGIN;

-- 1. open_item_settlement — record the FX rate applied at settlement so a future engine can
--    realize the kurzový rozdíl (ČÚS 006) without back-filling history. Nullable + dormant:
--    a same-currency settlement leaves both NULL.
ALTER TABLE open_item_settlement
  ADD COLUMN settlement_fx_rate            numeric(18,6),  -- ČNB/internal rate at settlement_date; NULL = accounting-currency settlement
  ADD COLUMN amount_in_accounting_currency numeric(19,4); -- frozen settled value in měna účetnictví; NULL until the engine populates it

-- 2. partial_record — row-local FX coherence (no cross-table reach needed). Guards the dormant
--    capture-layer FX columns so a buggy importer cannot silently corrupt the accounting-currency
--    totals the read model (account_period_balance) trusts blindly.
ALTER TABLE partial_record
  ADD CONSTRAINT partial_record_fx_pair_chk
    CHECK ((fx_rate IS NULL) = (fx_rate_kind IS NULL)),                 -- a rate kind iff a rate
  ADD CONSTRAINT partial_record_vat_fx_requires_fx_chk
    CHECK (vat_fx_rate IS NULL OR fx_rate IS NOT NULL),                 -- §4/5 VAT rate only alongside an accounting rate
  ADD CONSTRAINT partial_record_fx_positive_chk
    CHECK (fx_rate IS NULL OR fx_rate > 0);                             -- no zero/negative ČNB rate

-- 3. The cross-table identity guard (currency = accounting_currency => no FX, frozen = source;
--    foreign currency => an accounting rate is mandatory) needs the period's accounting_currency,
--    reachable only via individual_record -> summary_record -> accounting_period. Fold it into the
--    EXISTING app_partial_period_guard() (already BEFORE INSERT on partial_record) — one lookup,
--    no second trigger. CREATE OR REPLACE keeps the trigger + ownership.
CREATE OR REPLACE FUNCTION app_partial_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_period uuid; v_acc_currency char(3);
BEGIN
  SELECT s.period_id, p.accounting_currency INTO v_period, v_acc_currency
    FROM individual_record i
    JOIN summary_record    s ON s.id = i.summary_record_id
    JOIN accounting_period p ON p.id = s.period_id
   WHERE i.id = NEW.individual_record_id;
  PERFORM app_assert_period_writable(v_period, 'partial_record', NULL);

  -- FX coherence (option C): the dormant FX columns must never silently desync the
  -- accounting-currency totals the read model assumes are already in měna účetnictví.
  IF NEW.currency_code = v_acc_currency THEN
    -- single-currency case: no FX may be recorded, and the frozen amounts equal the source
    IF NEW.fx_rate IS NOT NULL OR NEW.fx_rate_kind IS NOT NULL OR NEW.vat_fx_rate IS NOT NULL THEN
      RAISE EXCEPTION 'partial_record %: currency_code = accounting_currency (%) but an FX rate is set', NEW.id, v_acc_currency
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.base_in_accounting_currency <> NEW.base_amount
       OR NEW.vat_in_accounting_currency <> NEW.vat_amount THEN
      RAISE EXCEPTION 'partial_record %: in the single-currency case accounting-currency amounts must equal the source amounts', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    -- foreign-currency case: an accounting rate is mandatory (ČNB §24 / §4-12)
    IF NEW.fx_rate IS NULL THEN
      RAISE EXCEPTION 'partial_record %: foreign currency % requires an fx_rate (ČNB §24 / §4-12)', NEW.id, NEW.currency_code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION app_partial_period_guard() OWNER TO app_owner;

COMMIT;

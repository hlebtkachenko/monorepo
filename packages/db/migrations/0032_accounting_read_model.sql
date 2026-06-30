-- 0032_accounting_read_model.sql
--
-- v2 accounting — read-model turnover tables (account_period_balance + monetary_period_summary)
--
-- Source: docs/specs/accounting-schema.sql (PG18-validated v2 design, #395 tip 0ea2bf31).
-- Books are NOT views. Maintenance triggers (SECURITY DEFINER) land in 0034.
-- Handwritten SQL (ADR-0009). One whole-file transaction; runs through the safe runner path.

BEGIN;

-- account_period_balance — double-entry obraty per (org, period, account).
-- Feeds obratová předvaha / hlavní kniha (summary) / rozvaha / výkaz zisku a ztráty.
CREATE TABLE account_period_balance (
  organization_id uuid          NOT NULL,
  period_id       uuid          NOT NULL,
  account_id      uuid          NOT NULL,                  -- the PERIOD chart account; cross-period joins use account.number/synthetic_code
  opening_balance numeric(19,4) NOT NULL DEFAULT 0,        -- počáteční stav (carried from prior closing; 0 for P&L 5xx/6xx)
  turnover_debit  numeric(19,4) NOT NULL DEFAULT 0,        -- obrat MD (signed-accumulating; storno may decrease, ČÚS 001)
  turnover_credit numeric(19,4) NOT NULL DEFAULT 0,        -- obrat Dal
  closing_balance numeric(19,4) GENERATED ALWAYS AS (opening_balance + turnover_debit - turnover_credit) STORED,  -- konečný stav
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, period_id, account_id),
  CONSTRAINT account_period_balance_period_fk   FOREIGN KEY (period_id, organization_id)  REFERENCES accounting_period (id, organization_id),
  CONSTRAINT account_period_balance_account_fk  FOREIGN KEY (account_id, organization_id) REFERENCES account (id, organization_id),
  CONSTRAINT account_period_balance_acct_period_fk FOREIGN KEY (account_id, period_id)    REFERENCES account (id, period_id)  -- B1: the balance's account belongs to THIS period's chart
);
CREATE INDEX account_period_balance_updated_idx ON account_period_balance (organization_id, period_id, updated_at);  -- cache token = max(updated_at), no hot counter
-- TRIGGER (migration): AFTER INSERT on posting_double_entry_line, SECURITY DEFINER owner app_owner, sets org+period from
--   the parent posting: INSERT … ON CONFLICT (org,period_id,account_id) DO UPDATE SET turnover_x = turnover_x + EXCLUDED.
--   GRANT SELECT,INSERT,UPDATE (NOT append-only; no R8 mutation block). 701 opening postings are tagged is_opening and
--   EXCLUDED from turnover (they set opening_balance) but still appear in the deník. Drift job: Σ(all lines)=closing_balance.
--   §16 reconcile: Σ analytical closing_balance GROUP BY synthetic_code = synthetic closing_balance.

-- monetary_period_summary — cash-regime (peněžní deník) totals.
-- Feeds peněžní deník totals / přehled o příjmech a výdajích (§13b/3) / DPFO (§7b).
CREATE TABLE monetary_period_summary (
  id              uuid               PRIMARY KEY DEFAULT uuidv7(),  -- surrogate: a nullable category_id can't sit in a PRIMARY KEY
  organization_id uuid               NOT NULL,
  period_id       uuid               NOT NULL,
  category_id     uuid,                                            -- nullable (uncategorized); folds via NULLS NOT DISTINCT
  direction       monetary_direction NOT NULL,                     -- INFLOW / OUTFLOW (příjem/výdaj)
  is_tax_relevant boolean            NOT NULL,                     -- daňový vs nedaňový (§9)
  is_clearing     boolean            NOT NULL,                     -- průběžná položka; tax/přehled views WHERE is_clearing=false
  location        monetary_location  NOT NULL,                     -- CASH (hotovost) / BANK (banka) — money position
  total_amount    numeric(19,4)      NOT NULL DEFAULT 0,
  total_tax_base  numeric(19,4)      NOT NULL DEFAULT 0,           -- Σ zaklad_dane (the §7b daňový základ)
  updated_at      timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT monetary_period_summary_period_fk   FOREIGN KEY (period_id, organization_id)   REFERENCES accounting_period (id, organization_id),
  CONSTRAINT monetary_period_summary_category_fk FOREIGN KEY (category_id, organization_id) REFERENCES category (id, organization_id),
  CONSTRAINT monetary_period_summary_grain_unique UNIQUE NULLS NOT DISTINCT
    (organization_id, period_id, category_id, direction, is_tax_relevant, is_clearing, location),  -- ON CONFLICT target; folds uncategorized
  -- minor: průběžná položka (bank<->till transfer) is neither příjem nor výdaj -> carries no tax base (§7b/§9)
  CONSTRAINT monetary_period_summary_clearing_chk CHECK (is_clearing = false OR total_tax_base = 0)
);
-- TRIGGER (migration): AFTER INSERT on posting_monetary_line, same SECURITY DEFINER upsert pattern.

COMMIT;

-- 0080_financial_institution.sql
--
-- financial_institution — Czech bank / payment-institution reference register
-- (Finance ▸ Číselníky ▸ Peněžní ústavy).
--
-- Reference (system) table — shared across all tenants, NOT tenant-scoped, no RLS
-- (Case-B, like `currency` / `country` / `payment_method`). Rows seeded in 0081
-- (GENERATED from packages/db/data/bank.json — the ČNB payment-system bank-code
-- list). Display NAMES are NOT stored here: they localize via next-intl
-- (`bankNames`, keyed by bank_code), matching the reference-name i18n mechanism.
--
-- bank_code is the 4-digit ČNB bank code (kód banky). GRANT SELECT to app_user.
-- Handwritten SQL (ADR-0009), snake_case, full words only.

BEGIN;

CREATE TABLE financial_institution (
  bank_code char(4)  PRIMARY KEY,
  active    boolean  NOT NULL DEFAULT true,
  CONSTRAINT financial_institution_bank_code_format CHECK (bank_code ~ '^[0-9]{4}$')
);

GRANT SELECT ON financial_institution TO app_user;

COMMIT;

-- 0082_constant_symbol.sql
--
-- constant_symbol — Czech konstantní symbol reference register (Finance ▸
-- Číselníky ▸ Konstantní symboly). The KS payment-code vocabulary carried on
-- bank orders and invoices.
--
-- Reference (system) table — shared across all tenants, NOT tenant-scoped, no RLS
-- (Case-B, like `currency` / `country` / `payment_method`). Rows seeded in 0083
-- (GENERATED from packages/db/data/constant-symbol.json). Display NAMES are NOT
-- stored here: they localize via next-intl (`constantSymbolNames`, keyed by code),
-- matching the reference-name i18n mechanism.
--
-- code is the 4-digit konstantní symbol. GRANT SELECT to app_user.
-- Handwritten SQL (ADR-0009), snake_case, full words only.

BEGIN;

CREATE TABLE constant_symbol (
  code    char(4)  PRIMARY KEY,
  active  boolean  NOT NULL DEFAULT true,
  CONSTRAINT constant_symbol_code_format CHECK (code ~ '^[0-9]{4}$')
);

GRANT SELECT ON constant_symbol TO app_user;

COMMIT;

-- 0084_payment_form.sql
--
-- payment_form — forma úhrady reference číselník (Finance ▸ Číselníky ▸ Formy
-- úhrady). The user-facing Czech payment-manner list (Dobírkou / Hotově /
-- Převodem / …) shown on invoices and cash documents, with per-surface offer
-- flags (invoice / cash desk / POS).
--
-- Distinct from `payment_method` (0079): that is the internal Brain-intake IR
-- vocabulary (cash | transfer | card | other, packages/brain/src/ir/records.ts)
-- that drives posting; this is the richer human číselník the user picks from.
--
-- Reference (system) table — shared across all tenants, NOT tenant-scoped, no RLS
-- (Case-B, like `currency` / `country` / `payment_method`). Rows seeded in 0085
-- (GENERATED from packages/db/data/payment-form.json). Display names and the
-- instrumental invoice phrase localize via next-intl (`paymentFormNames` /
-- `paymentFormPhrases`, keyed by code) — the DB stores no Czech text.
--
-- GRANT SELECT to app_user. Handwritten SQL (ADR-0009), snake_case, full words.

BEGIN;

CREATE TABLE payment_form (
  code               text     PRIMARY KEY,
  offer_on_invoice   boolean  NOT NULL DEFAULT false,
  offer_on_cash_desk boolean  NOT NULL DEFAULT false,
  offer_on_pos       boolean  NOT NULL DEFAULT false,
  is_active          boolean  NOT NULL DEFAULT true
);

GRANT SELECT ON payment_form TO app_user;

COMMIT;

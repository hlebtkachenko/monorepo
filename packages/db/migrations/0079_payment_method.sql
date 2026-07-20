-- 0079_payment_method.sql
--
-- payment_method — forma úhrady reference vocabulary (cash | transfer | card |
-- other): the intake IR PaymentMethod set (packages/brain/src/ir/records.ts). A
-- fixed PLATFORM vocabulary, not per-org data, so it is a Case-B shared reference
-- table (no tenant scope, no RLS) like `currency`. Display names are localized
-- via next-intl (org.paymentMethods.names.<code>), NOT stored per-language.
-- Flags: is_cash (drives cash-desk vs bank posting), requires_bank_detail (a
-- transfer needs an account). Seeded here (DDL + the 4 rows). GRANT SELECT to
-- app_user. ADD-only, idempotent (re-runnable). One whole-file transaction.
-- Handwritten SQL (ADR-0009).

BEGIN;

CREATE TABLE IF NOT EXISTS payment_method (
  code                 text        PRIMARY KEY,
  sort_order           integer     NOT NULL DEFAULT 0,
  is_cash              boolean     NOT NULL DEFAULT false,
  requires_bank_detail boolean     NOT NULL DEFAULT false,
  is_active            boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

INSERT INTO payment_method (code, sort_order, is_cash, requires_bank_detail) VALUES
  ('cash',     10, true,  false),
  ('transfer', 20, false, true),
  ('card',     30, false, false),
  ('other',    40, false, false)
ON CONFLICT (code) DO NOTHING;

GRANT SELECT ON payment_method TO app_user;

COMMIT;

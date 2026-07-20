-- 0073_financial_account.sql
--
-- financial_account — the operational money-place entity for the Finance module:
-- a bank account, a cash desk (pokladna), or a cash-equivalent store (ceniny =
-- kind CASH_EQUIVALENT, surfaced via a filtered view, not a separate table).
-- This is NET-NEW operational identity, distinct from the GL account (221/211/213
-- analytics) it links to: the accounting layer knows only GL accounts and the
-- bare posting_monetary_line.location CASH|BANK enum (single-entry), never an
-- operational bank account with an IBAN, an institution, or a responsible person.
-- One financial_account maps 1:1 to one analytic GL account (gl_account_number),
-- so a single account's balance is one account_period_balance lookup.
--
-- kind BANK | CASH | CASH_EQUIVALENT. status DRAFT -> ACTIVE -> INACTIVE ->
-- CLOSED -> ARCHIVED. Amounts numeric(19,4) / Money<Currency> (ADR-0013).
--
-- Org-scoped (FORCE RLS + organization_isolation, NULLIF guard — ADR-0010).
-- currency_code -> currency (shared, no RLS) and responsible_user_id -> app_user
-- (global, no RLS) are single-col FKs. number_series_id -> number_series is a
-- composite (id, organization_id) FK because that table is org-scoped and a
-- postgres FK check bypasses RLS (postgres-fk-bypasses-rls). Composite UNIQUE
-- (id, organization_id) is the composite-FK target for future refs
-- (money_transfer, statement_import). Institution is inlined as
-- bank_code/account_number/iban/bic text for v1; the shared financial_institution
-- directory + institution_id FK land with the Peněžní ústavy reference page.
-- ADD-only, idempotent (re-runnable). One whole-file transaction. Handwritten
-- SQL (ADR-0009).

BEGIN;

DO $$ BEGIN
  CREATE TYPE financial_account_kind AS ENUM ('BANK', 'CASH', 'CASH_EQUIVALENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE financial_account_status AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'CLOSED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS financial_account (
  id                         uuid                     PRIMARY KEY DEFAULT uuidv7(),
  organization_id            uuid                     NOT NULL REFERENCES organization (id),
  kind                       financial_account_kind   NOT NULL,
  status                     financial_account_status NOT NULL DEFAULT 'DRAFT',
  name                       text                     NOT NULL,
  code                       text                     NOT NULL,
  currency_code              char(3)                  NOT NULL REFERENCES currency (code),
  gl_account_number          text,                    -- the 1:1 analytic GL account (e.g. '221001'); NULL until linked
  -- bank fields (kind = BANK); inlined until the financial_institution directory lands
  account_number             text,
  bank_code                  text,
  iban                       text,
  bic                        text,
  is_default_payment_account boolean                  NOT NULL DEFAULT false,
  overdraft_limit            numeric(19,4),
  opened_on                  date,
  closed_on                  date,
  -- cash fields (kind = CASH / CASH_EQUIVALENT)
  location                   text,
  cash_limit                 numeric(19,4),
  number_series_id           uuid,
  -- common
  responsible_user_id        uuid                     REFERENCES app_user (id),
  created_at                 timestamptz              NOT NULL DEFAULT now(),
  updated_at                 timestamptz              NOT NULL DEFAULT now(),
  CONSTRAINT financial_account_id_org_unique   UNIQUE (id, organization_id),
  CONSTRAINT financial_account_org_code_unique UNIQUE (organization_id, code),
  CONSTRAINT financial_account_number_series_fk FOREIGN KEY (number_series_id, organization_id)
    REFERENCES number_series (id, organization_id),
  CONSTRAINT financial_account_overdraft_nonneg_chk CHECK (overdraft_limit IS NULL OR overdraft_limit >= 0),
  CONSTRAINT financial_account_cash_limit_nonneg_chk CHECK (cash_limit IS NULL OR cash_limit >= 0)
);

-- 1:1 analytic invariant: at most one financial_account per GL analytic per org,
-- so a single account's balance is exactly one account_period_balance lookup.
CREATE UNIQUE INDEX IF NOT EXISTS financial_account_org_gl_unique
  ON financial_account (organization_id, gl_account_number)
  WHERE gl_account_number IS NOT NULL;

-- At most one default payment account per org.
CREATE UNIQUE INDEX IF NOT EXISTS financial_account_org_default_pay_unique
  ON financial_account (organization_id)
  WHERE is_default_payment_account;

CREATE INDEX IF NOT EXISTS financial_account_org_kind_status_idx
  ON financial_account (organization_id, kind, status);

ALTER TABLE financial_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_account FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON financial_account;
CREATE POLICY organization_isolation ON financial_account
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_account TO app_user;

COMMIT;

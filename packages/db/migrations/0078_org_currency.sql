-- 0078_org_currency.sql
--
-- org_currency — which ISO 4217 currencies an organization has ENABLED for use
-- (on bank/cash accounts, documents, transfers) BEYOND its functional currency.
-- Pure enablement: a present row = enabled, delete = disable. This is NOT the
-- source of the org's functional / accounting currency (měna účetnictví) — that
-- is per-period on accounting_period.accounting_currency (§4/12), always available
-- regardless of any org_currency row. So `enabled` (org_currency present) and
-- `functional` (a period's accounting_currency) are independent facts; disabling a
-- functional currency here is harmless (the books never depend on this table).
--
-- Org-scoped (FORCE RLS + organization_isolation, NULLIF guard — ADR-0010).
-- currency_code -> currency (shared, no RLS) and enabled_by_user_id -> app_user
-- (global, no RLS) are single-col FKs. Composite UNIQUE (id, organization_id) is
-- the composite-FK target for future refs; UNIQUE (organization_id, currency_code)
-- makes enablement idempotent (one row per currency per org). ADD-only, idempotent
-- (re-runnable). One whole-file transaction. Handwritten SQL (ADR-0009).

BEGIN;

CREATE TABLE IF NOT EXISTS org_currency (
  id                 uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id    uuid        NOT NULL REFERENCES organization (id),
  currency_code      char(3)     NOT NULL REFERENCES currency (code),
  enabled_at         timestamptz NOT NULL DEFAULT now(),
  enabled_by_user_id uuid        REFERENCES app_user (id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_currency_id_org_unique       UNIQUE (id, organization_id),
  CONSTRAINT org_currency_org_currency_unique UNIQUE (organization_id, currency_code)
);

CREATE INDEX IF NOT EXISTS org_currency_org_idx ON org_currency (organization_id);

ALTER TABLE org_currency ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_currency FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON org_currency;
CREATE POLICY organization_isolation ON org_currency
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON org_currency TO app_user;

COMMIT;

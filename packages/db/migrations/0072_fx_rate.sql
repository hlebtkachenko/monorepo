-- 0072_fx_rate.sql
--
-- fx_rate + fx_rate_override — the multi-currency exchange-rate store for the
-- Finance module, the deferred follow-up named in ADR-0013. Two tables that
-- encode the precedence "org override -> ČNB daily fix -> error":
--
--   fx_rate           — shared reference (law-like) table: the ČNB daily-fix (and
--                       other platform-sourced) rates, identical for every tenant.
--                       No RLS (Case B, like currency). One row per
--                       (from, to, rate_date, rate_kind, source).
--   fx_rate_override  — org-scoped manual rate a tenant declares for a specific
--                       date (e.g. a forward-contract closing rate). FORCE RLS +
--                       organization_isolation. Beats the shared fx_rate at the
--                       same (from, to, date, kind). Frozen once used (is_locked)
--                       so a booked rate is never silently rewritten (ADR-0013).
--
-- ČNB publishes "kurz" per "množství" units (e.g. 100 JPY), so both tables carry
-- unit_amount: CZK per (unit_amount × from-currency). rate is numeric(18,6) —
-- coherent with the frozen per-transaction rate columns partial_record.fx_rate /
-- open_item_settlement.settlement_fx_rate. rate_kind reuses the existing
-- fx_rate_kind enum (DAILY | REAL | FIXED). Never auto-inverted, never
-- neighbour-date substituted — those are enforced by the resolver
-- (FxRate.convert, a later PR), not the schema (ADR-0013).
--
-- currency codes are single-col FKs to currency (shared, no RLS). The org-scoped
-- table carries composite UNIQUE (id, organization_id) as the composite-FK target
-- for future references (postgres-fk-bypasses-rls), and created_by_user_id ->
-- app_user (global, no RLS). ADD-only, idempotent (re-runnable). One whole-file
-- transaction. Handwritten SQL (ADR-0009).

BEGIN;

-- Shared reference rates (Case B — no RLS, like currency). app_user reads; the
-- ČNB ingest job / migrations write.
CREATE TABLE IF NOT EXISTS fx_rate (
  id          uuid          PRIMARY KEY DEFAULT uuidv7(),
  from_code   char(3)       NOT NULL REFERENCES currency (code),
  to_code     char(3)       NOT NULL REFERENCES currency (code),
  rate_date   date          NOT NULL,
  rate_kind   fx_rate_kind  NOT NULL DEFAULT 'DAILY',
  unit_amount integer       NOT NULL DEFAULT 1,     -- množství: CZK per (unit_amount × from)
  rate        numeric(18,6) NOT NULL,               -- kurz
  source      text          NOT NULL DEFAULT 'CNB',
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT fx_rate_natural_unique UNIQUE (from_code, to_code, rate_date, rate_kind, source),
  CONSTRAINT fx_rate_unit_positive_chk CHECK (unit_amount > 0),
  CONSTRAINT fx_rate_positive_chk CHECK (rate > 0),
  CONSTRAINT fx_rate_distinct_currencies_chk CHECK (from_code <> to_code)
);

CREATE INDEX IF NOT EXISTS fx_rate_lookup_idx
  ON fx_rate (from_code, to_code, rate_date, rate_kind);

GRANT SELECT ON fx_rate TO app_user;

-- Org-scoped manual overrides (Case A — FORCE RLS + organization_isolation).
CREATE TABLE IF NOT EXISTS fx_rate_override (
  id                 uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id    uuid          NOT NULL REFERENCES organization (id),
  from_code          char(3)       NOT NULL REFERENCES currency (code),
  to_code            char(3)       NOT NULL REFERENCES currency (code),
  rate_date          date          NOT NULL,
  rate_kind          fx_rate_kind  NOT NULL DEFAULT 'DAILY',
  unit_amount        integer       NOT NULL DEFAULT 1,
  rate               numeric(18,6) NOT NULL,
  reason             text          NOT NULL,               -- why the tenant overrides the ČNB rate
  is_locked          boolean       NOT NULL DEFAULT false, -- frozen once a posting has used it
  created_by_user_id uuid          REFERENCES app_user (id),
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT fx_rate_override_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT fx_rate_override_natural_unique
    UNIQUE (organization_id, from_code, to_code, rate_date, rate_kind),
  CONSTRAINT fx_rate_override_unit_positive_chk CHECK (unit_amount > 0),
  CONSTRAINT fx_rate_override_positive_chk CHECK (rate > 0),
  CONSTRAINT fx_rate_override_distinct_currencies_chk CHECK (from_code <> to_code)
);

ALTER TABLE fx_rate_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rate_override FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON fx_rate_override;
CREATE POLICY organization_isolation ON fx_rate_override
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON fx_rate_override TO app_user;

COMMIT;

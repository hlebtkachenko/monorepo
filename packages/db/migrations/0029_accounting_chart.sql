-- 0029_accounting_chart.sql
--
-- v2 accounting — chart of accounts (per-period rozvrh + account)
--
-- Source: docs/specs/accounting-schema.sql (PG18-validated v2 design, #395 tip 0ea2bf31).
-- §14 + Decree 500/2002. account_group/directive_account already created in 0024.
-- Handwritten SQL (ADR-0009). One whole-file transaction; runs through the safe runner path.

BEGIN;

-- chart_of_accounts — one účtový rozvrh per účetní období (§14/3). Fork2=B: a service
-- copies accounts forward at period open. D5 regime gate: regime_code is a generated
-- constant, so the composite FK to the period's 3-col unique proves this org's
-- DOUBLE_ENTRY period — unbypassable, no separate CHECK. No status column (open/closed
-- tracks the period; the closed-period freeze is a migration trigger per V2-DEFERRED).
CREATE TABLE chart_of_accounts (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid        NOT NULL,
  period_id       uuid        NOT NULL,
  regime_code     text        NOT NULL GENERATED ALWAYS AS ('DOUBLE_ENTRY') STORED,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chart_period_regime_fk FOREIGN KEY (period_id, organization_id, regime_code)
    REFERENCES accounting_period (id, organization_id, regime_code),
  CONSTRAINT chart_one_per_period UNIQUE (period_id),
  CONSTRAINT chart_id_org_unique  UNIQUE (id, organization_id),
  CONSTRAINT chart_id_period_unique UNIQUE (id, period_id)   -- B1: account.(chart_id, period_id) -> here, pins account to its chart's period
);

-- account — a tenant účet in one chart. The 4 structural levels are GENERATED from
-- `number` (zero drift): class / group_code / synthetic_code / is_synthetic. nature
-- fuses Money's Druh+Typ; the only user-chosen stored flag is tracks_open_items
-- (saldokonto, §16 párování). 2-digit number allowed (§13a simplified scope).
-- Derived in views (NOT stored): Druh (nature filter), Aktivní/Pasivní (normal_balance),
-- Vnitropodnikový (class IN 8,9), Oprávkový (account_group.is_valuation_adjustment).
-- §16 Σ(analytical)=synthetic reconcile = service+test in the posting layer, NOT DDL.
CREATE TABLE account (
  id                uuid           PRIMARY KEY DEFAULT uuidv7(),
  organization_id   uuid           NOT NULL,
  chart_id          uuid           NOT NULL,
  period_id         uuid           NOT NULL,                     -- B1: = the chart's period; FK below pins them equal (closes cross-period posting hole)
  parent_id         uuid,                                        -- analytical -> synthetic (§16, ČÚS 001 §2.2.1); same chart
  number            text           NOT NULL,                     -- '31','311','311.001'
  name              text           NOT NULL,
  nature            account_nature NOT NULL,
  normal_balance    debit_credit,                                -- NULL where sign-flips (431,481,FX)
  tracks_open_items boolean        NOT NULL DEFAULT false,       -- saldokonto — the ONE stored flag (user-chosen)
  -- structural levels: GENERATED from `number` only (a gen col may not read another gen col)
  class          smallint GENERATED ALWAYS AS (left(number,1)::int) STORED,
  group_code     char(2)  GENERATED ALWAYS AS (CASE WHEN left(number,1) IN ('8','9') THEN NULL ELSE left(replace(number,'.',''),2)::char(2) END) STORED,
  synthetic_code text     GENERATED ALWAYS AS (left(replace(number,'.',''),3)) STORED,
  is_synthetic   boolean  GENERATED ALWAYS AS (parent_id IS NULL) STORED,
  specializes_directive_code char(3),                            -- nullable soft link to the 3-digit catalogue; when NULL the statement line falls back to account_group (decision 3)
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT account_id_org_unique        UNIQUE (id, organization_id),   -- posting line -> account target (tenancy)
  CONSTRAINT account_id_chart_unique      UNIQUE (id, chart_id),          -- parent-same-chart target
  CONSTRAINT account_id_period_unique     UNIQUE (id, period_id),         -- B1: line/balance -> account-in-period target
  CONSTRAINT account_chart_number_unique  UNIQUE (chart_id, number),
  CONSTRAINT account_chart_fk     FOREIGN KEY (chart_id, organization_id) REFERENCES chart_of_accounts (id, organization_id),
  CONSTRAINT account_chart_period_fk FOREIGN KEY (chart_id, period_id)    REFERENCES chart_of_accounts (id, period_id),  -- B1: account.period == chart.period
  CONSTRAINT account_parent_fk    FOREIGN KEY (parent_id, chart_id)       REFERENCES account (id, chart_id),
  CONSTRAINT account_group_fk     FOREIGN KEY (group_code)                REFERENCES account_group (code),
  CONSTRAINT account_directive_fk FOREIGN KEY (specializes_directive_code) REFERENCES directive_account (code),
  CONSTRAINT account_not_self_parent_chk CHECK (parent_id <> id),
  CONSTRAINT account_number_shape_chk    CHECK (number ~ '^[0-9]{2,}(\.[0-9A-Za-z]+)*$')
);

COMMIT;

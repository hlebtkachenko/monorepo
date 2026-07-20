-- 0080_asset_type.sql
--
-- asset_type — Typy majetku: org-defined fixed-asset type templates (majetek §6).
-- Each type fixes the accounting family + depreciability + the předkontace (5 GL
-- account NUMBERS, D8 by-number convention) an asset of that type defaults to.
-- Org-scoped config (org creates its own types; `name` is org-entered text, NOT
-- reference-i18n). This slice also extends `asset` with the additive
-- classification columns holding_intent (záměr držby) + valuation_method (způsob
-- ocenění §25) + asset_type_id (the type link).
--
-- Org-scoped (FORCE RLS + organization_isolation, NULLIF guard — ADR-0010).
-- Composite UNIQUE (id, organization_id) is the composite-FK target; asset's
-- asset_type_id -> asset_type is a composite (id, organization_id) FK because a
-- postgres FK check bypasses RLS (postgres-fk-bypasses-rls). All asset columns
-- added nullable/additive — existing rows untouched. ADD-only, idempotent
-- (re-runnable). One whole-file transaction. Handwritten SQL (ADR-0009).

BEGIN;

DO $$ BEGIN
  CREATE TYPE holding_intent AS ENUM ('OWN_USE', 'LONG_TERM_RENTAL', 'SALE', 'MIXED', 'UNDECIDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE valuation_method AS ENUM ('ACQUISITION_PRICE', 'OWN_COST', 'REPRODUCTION_PRICE', 'NOMINAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS asset_type (
  id                         uuid           PRIMARY KEY DEFAULT uuidv7(),
  organization_id            uuid           NOT NULL REFERENCES organization (id),
  code                       text           NOT NULL,
  name                       text           NOT NULL,
  family                     asset_category NOT NULL,
  is_depreciated             boolean        NOT NULL,
  -- předkontace: 5-GL posting profile (account NUMBERS, D8 by-number); NULL where n/a
  asset_account_number       text,
  acquisition_account_number text,
  accumulated_account_number text,
  expense_account_number     text,
  disposal_account_number    text,
  valid_from                 date,
  valid_to                   date,
  active                     boolean        NOT NULL DEFAULT true,
  created_at                 timestamptz    NOT NULL DEFAULT now(),
  updated_at                 timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT asset_type_id_org_unique   UNIQUE (id, organization_id),
  CONSTRAINT asset_type_org_code_unique UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS asset_type_org_active_idx
  ON asset_type (organization_id, active);

ALTER TABLE asset_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_type FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON asset_type;
CREATE POLICY organization_isolation ON asset_type
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON asset_type TO app_user;

-- Extend the asset register card with additive classification (all nullable).
ALTER TABLE asset ADD COLUMN IF NOT EXISTS holding_intent   holding_intent;
ALTER TABLE asset ADD COLUMN IF NOT EXISTS valuation_method valuation_method;
ALTER TABLE asset ADD COLUMN IF NOT EXISTS asset_type_id    uuid;

DO $$ BEGIN
  ALTER TABLE asset ADD CONSTRAINT asset_asset_type_fk
    FOREIGN KEY (asset_type_id, organization_id)
    REFERENCES asset_type (id, organization_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

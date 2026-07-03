-- 0042_org_config.sql
--
-- Organization configuration expansion — full účetní-jednotka identity beyond
-- the scaffolding minimum (Money S3 / Abra parity): data box, contact, sídlo
-- split + region, delivery address, tax office, OR file mark, archive flag,
-- plus three org-scoped satellite tables (authorized person, tax representative,
-- OSS registration).
--
-- Placement rationale (advisor gate): mutable-lifetime identity → columns on
-- `organization`; multi-row / time-versioned facts → their own org-scoped tables.
-- DIČ stays on the self-counterparty (0039/0040), NOT duplicated here. FX source
-- is already period-versioned on accounting_period.fx_rate_policy (0036).
--
-- ADD-only, idempotent (re-runnable). One whole-file transaction. Handwritten SQL
-- (ADR-0009). btree_gist enabled in 0001.

BEGIN;

-- ---------------------------------------------------------------------------
-- organization — config columns (mutable identity)
-- ---------------------------------------------------------------------------
ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS data_box_id                   varchar(7),
  ADD COLUMN IF NOT EXISTS contact_email                 text,
  ADD COLUMN IF NOT EXISTS contact_phone                 varchar(32),
  ADD COLUMN IF NOT EXISTS website                       text,
  ADD COLUMN IF NOT EXISTS registered_house_number       varchar(16),
  ADD COLUMN IF NOT EXISTS registered_orientation_number varchar(16),
  ADD COLUMN IF NOT EXISTS registered_region             text,
  ADD COLUMN IF NOT EXISTS delivery_address_line1        text,
  ADD COLUMN IF NOT EXISTS delivery_address_line2        text,
  ADD COLUMN IF NOT EXISTS delivery_address_line3        text,
  ADD COLUMN IF NOT EXISTS tax_office_code               varchar(4),
  ADD COLUMN IF NOT EXISTS tax_office_workplace_code     varchar(4),
  ADD COLUMN IF NOT EXISTS registry_file_number          text,
  ADD COLUMN IF NOT EXISTS archived_at                   timestamptz;

-- datová schránka = 7-char lowercase alphanumeric (ISDS ID).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_data_box_format_chk'
  ) THEN
    ALTER TABLE organization
      ADD CONSTRAINT organization_data_box_format_chk
      CHECK (data_box_id IS NULL OR data_box_id ~ '^[a-z0-9]{7}$');
  END IF;
END $$;

-- The manage-orgs hub lists active orgs; index the common filter.
CREATE INDEX IF NOT EXISTS organization_workspace_active_idx
  ON organization (workspace_id) WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- organization_authorized_person — statutory signer(s) (jméno/příjmení/postavení
-- on přiznání + podpisový záznam). Multiple possible → table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_authorized_person (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid        NOT NULL REFERENCES organization (id),
  given_name      text        NOT NULL,
  family_name     text        NOT NULL,
  position        text,
  is_primary      boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_authorized_person_one_primary
  ON organization_authorized_person (organization_id) WHERE is_primary;

-- ---------------------------------------------------------------------------
-- organization_tax_representative — zástupce (DŘ §25-§30). The accountant files
-- on the client's behalf; carries the representative's own identifiers.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_tax_representative (
  id                          uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id             uuid        NOT NULL REFERENCES organization (id),
  representative_type         text,
  legal_name                  text,
  given_name                  text,
  family_name                 text,
  ico                         varchar(8),
  dic                         varchar(14),
  advisor_registration_number text,
  is_primary                  boolean     NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_tax_representative_one_primary
  ON organization_tax_representative (organization_id) WHERE is_primary;

-- ---------------------------------------------------------------------------
-- organization_oss_registration — EU One-Stop-Shop (§110k+ ZDPH). Time-versioned,
-- no overlap per scheme (mirror vat_status gist EXCLUDE). MOSS excluded (dead
-- since 2021-07-01). Only a plátce / identifikovaná osoba may register — enforced
-- by the scaffolding orchestrator (cross-table rule, not a DB CHECK).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_oss_registration (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid        NOT NULL REFERENCES organization (id),
  scheme          text        NOT NULL CHECK (scheme IN ('UNION', 'IMPORT')),
  valid_from      date        NOT NULL,
  valid_to        date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_oss_dates_chk CHECK (valid_to IS NULL OR valid_from <= valid_to),
  CONSTRAINT organization_oss_no_overlap EXCLUDE USING gist (
    organization_id WITH =,
    scheme WITH =,
    daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') WITH &&
  )
);

-- ---------------------------------------------------------------------------
-- RLS — org-scoped isolation on the 3 satellites (mutable class, mirror 0034).
-- Registered in ORGANIZATION_SCOPED_TABLES (packages/db/src/policies/rls.ts).
-- ---------------------------------------------------------------------------
ALTER TABLE organization_authorized_person ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_authorized_person FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON organization_authorized_person;
CREATE POLICY organization_isolation ON organization_authorized_person
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON organization_authorized_person TO app_user;

ALTER TABLE organization_tax_representative ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_tax_representative FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON organization_tax_representative;
CREATE POLICY organization_isolation ON organization_tax_representative
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON organization_tax_representative TO app_user;

ALTER TABLE organization_oss_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_oss_registration FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON organization_oss_registration;
CREATE POLICY organization_isolation ON organization_oss_registration
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON organization_oss_registration TO app_user;

COMMIT;

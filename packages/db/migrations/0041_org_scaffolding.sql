-- 0041_org_scaffolding.sql
--
-- Organization creation-scaffolding protocol — identity + idempotency layer.
--
-- ADD-only reshape of the platform organization + counterparty, plus a new
-- workspace-tier organization_provisioning idempotency/provenance table. Nothing
-- here is org-scoped yet; the scaffolding orchestrator (@workspace/org-provisioning)
-- writes these inside the same withWorkspace/withOrganization transaction that
-- mints the org.
--
-- Why these columns live on `organization` (advisor gate, answer 7): legal_form
-- drives domain logic (regime derivation, period rules) so it must sit where the
-- domain reads org identity; `ico` is the stable natural business key (dedup,
-- ARES re-lookup, document/výkaz headers); the structured sídlo goes on přiznání
-- headers. The self-counterparty stays the KH/SH projection (name, DIČ, country) —
-- IČO/sídlo are NOT moved onto it. `counterparty.ico` is added in the same pass
-- because third-party counterparties need it imminently (§435 NOZ, ARES supplier
-- prefill) and it is one column while the area is open.
--
-- Handwritten SQL (ADR-0009). One whole-file transaction. Idempotent (re-runnable).

BEGIN;

-- ---------------------------------------------------------------------------
-- organization — identity columns for scaffolding
-- ---------------------------------------------------------------------------
ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS legal_form_code text REFERENCES legal_form (code),
  ADD COLUMN IF NOT EXISTS ico varchar(8),
  ADD COLUMN IF NOT EXISTS registered_street text,
  ADD COLUMN IF NOT EXISTS registered_city text,
  ADD COLUMN IF NOT EXISTS registered_postal_code varchar(10),
  ADD COLUMN IF NOT EXISTS registered_country_code char(2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_ico_format_chk'
  ) THEN
    ALTER TABLE organization
      ADD CONSTRAINT organization_ico_format_chk
      CHECK (ico IS NULL OR ico ~ '^[0-9]{8}$');
  END IF;
END $$;

-- IČO is the ARES re-lookup / dedup key; index it for the soft duplicate check.
CREATE INDEX IF NOT EXISTS organization_workspace_ico_idx
  ON organization (workspace_id, ico) WHERE ico IS NOT NULL;

-- ---------------------------------------------------------------------------
-- counterparty — IČO for third-party partners (self row keeps name/DIČ/country)
-- ---------------------------------------------------------------------------
ALTER TABLE counterparty
  ADD COLUMN IF NOT EXISTS ico varchar(8);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'counterparty_ico_format_chk'
  ) THEN
    ALTER TABLE counterparty
      ADD CONSTRAINT counterparty_ico_format_chk
      CHECK (ico IS NULL OR ico ~ '^[0-9]{8}$');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- organization_provisioning — workspace-tier idempotency + registry provenance
--
-- One row per scaffolding attempt, keyed on (workspace_id, idempotency_key). A
-- retry of a committed-but-response-lost scaffold replays the recorded org_id
-- instead of creating a second org (the old (workspace_id, slug) approach would
-- have auto-suffixed the slug and duplicated the entity — advisor change 5).
--
-- Workspace-scoped RLS: the replay lookup happens BEFORE any app.organization_id
-- GUC exists, so it must key on app.workspace_id (like counterparty). It also
-- carries the ARES/DPH snapshots (folds the separate registry_snapshot concept
-- in) — never logged, PII behind RLS.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_provisioning (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  workspace_id    uuid        NOT NULL REFERENCES workspace (id),
  idempotency_key text        NOT NULL,
  input           jsonb       NOT NULL,
  ares_snapshot   jsonb,
  dph_snapshot    jsonb,
  organization_id uuid        REFERENCES organization (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_provisioning_key_unique UNIQUE (workspace_id, idempotency_key)
);

ALTER TABLE organization_provisioning ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_provisioning FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_provisioning_select ON organization_provisioning;
CREATE POLICY organization_provisioning_select ON organization_provisioning FOR SELECT
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

DROP POLICY IF EXISTS organization_provisioning_insert ON organization_provisioning;
CREATE POLICY organization_provisioning_insert ON organization_provisioning FOR INSERT
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

DROP POLICY IF EXISTS organization_provisioning_update ON organization_provisioning;
CREATE POLICY organization_provisioning_update ON organization_provisioning FOR UPDATE
  USING      (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON organization_provisioning TO app_user;

COMMIT;

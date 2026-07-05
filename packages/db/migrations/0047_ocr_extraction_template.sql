-- 0047_ocr_extraction_template.sql
--
-- Brain OCR template library — the tenancy foundation.
--
-- When the Brain learns a supplier's invoice layout (which region of the page
-- carries each field), that knowledge is a WORKSPACE fact, not an organization
-- fact: a supplier's document layout does not change per client book, so one
-- learned template is shared across every organization in the accountant's
-- office. This mirrors `counterparty` exactly (0027 CREATE, 0035 §2 RLS):
-- workspace-scoped, FORCE RLS, four command-specific policies keyed on
-- `app.workspace_id`, and the composite UNIQUE(id, workspace_id) that closes the
-- cross-workspace FK-bypass hole for any org-tier table that later references a
-- template via (ocr_extraction_template_id, workspace_id).
--
-- See ADR-0029 "Brain learned state is workspace-scoped". Handwritten SQL
-- (ADR-0009). One whole-file transaction; runs through the safe runner path.

BEGIN;

-- =============================================================================
-- 1. Table
-- =============================================================================
CREATE TABLE ocr_extraction_template (
  id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
  workspace_id        uuid        NOT NULL REFERENCES workspace (id),
  supplier_key        text        NOT NULL,   -- IČO or normalized supplier name
  doc_kind            text        NOT NULL,
  locators            jsonb       NOT NULL,    -- field -> region map
  layout_fingerprint  text,                    -- hash of field-region geometry (drift re-detection)
  human_confirmed_at  timestamptz,             -- NULL = unconfirmed
  held_count          integer     NOT NULL DEFAULT 0,
  last_reject_at      timestamptz,
  version             integer     NOT NULL DEFAULT 1,
  learned_at          timestamptz NOT NULL DEFAULT now(),
  provenance          jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- UNIQUE(id, workspace_id) = composite-FK target for org-tier tables that will
  -- reference a template, closing the cross-workspace FK-bypass hole via
  -- (ocr_extraction_template_id, workspace_id). Mirrors counterparty.
  CONSTRAINT ocr_extraction_template_id_workspace_unique UNIQUE (id, workspace_id)
);

-- =============================================================================
-- 2. RLS — workspace-scoped, 4 command-specific policies (mirror counterparty)
-- =============================================================================
-- Shared read across the office; a template is isolated to its workspace on
-- every command. FORCE so even the table owner is subject to the policy.
ALTER TABLE ocr_extraction_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_extraction_template FORCE  ROW LEVEL SECURITY;

CREATE POLICY ocr_extraction_template_select ON ocr_extraction_template FOR SELECT
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY ocr_extraction_template_insert ON ocr_extraction_template FOR INSERT
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY ocr_extraction_template_update ON ocr_extraction_template FOR UPDATE
  USING      (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY ocr_extraction_template_delete ON ocr_extraction_template FOR DELETE
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- =============================================================================
-- 3. app_user grant — mutable (full DML), same tier as counterparty (0035 §4)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ocr_extraction_template TO app_user;
  END IF;
END
$$;

COMMIT;

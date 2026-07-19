-- 0067_demo_debug_tables.sql
--
-- demo_debug_normal_table_record + demo_debug_pivot_table_record — purpose-built
-- demo data for the Debug → Archetype Table reference pages in the /o tree
-- (Normal Table + Pivot Table). They exist ONLY to feed dev/allowlist-gated
-- reference pages: the seed is localhost-only so PROD stays empty (never real
-- product data), and a page cloning them as a template needs no demo-stripping.
-- Naming: demo_<module>_<type>_record — all demo tables cluster by the demo_
-- prefix.
--
-- Org-scoped (FORCE RLS + organization_isolation, NULLIF guard — ADR-0010).
-- Single-col FK organization_id → organization (tenant root; the INSERT WITH
-- CHECK blocks cross-org writes). ADD-only, idempotent (re-runnable). One
-- whole-file transaction. Handwritten SQL (ADR-0009).

BEGIN;

CREATE TABLE IF NOT EXISTS demo_debug_normal_table_record (
  id              uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid          NOT NULL REFERENCES organization (id),
  document        text          NOT NULL,
  partner         text          NOT NULL,
  status          text          NOT NULL,
  amount          numeric(19,4) NOT NULL,
  issued_on       date          NOT NULL,
  note            text          NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_debug_normal_table_record_org_issued_idx
  ON demo_debug_normal_table_record (organization_id, issued_on);

ALTER TABLE demo_debug_normal_table_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_debug_normal_table_record FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON demo_debug_normal_table_record;
CREATE POLICY organization_isolation ON demo_debug_normal_table_record
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON demo_debug_normal_table_record TO app_user;

CREATE TABLE IF NOT EXISTS demo_debug_pivot_table_record (
  id              uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid          NOT NULL REFERENCES organization (id),
  category        text          NOT NULL,
  month           text          NOT NULL,
  status          text          NOT NULL,
  amount          numeric(19,4) NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demo_debug_pivot_table_record_org_category_idx
  ON demo_debug_pivot_table_record (organization_id, category);

ALTER TABLE demo_debug_pivot_table_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_debug_pivot_table_record FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON demo_debug_pivot_table_record;
CREATE POLICY organization_isolation ON demo_debug_pivot_table_record
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON demo_debug_pivot_table_record TO app_user;

COMMIT;

-- 0048_organization_tax_profile.sql
--
-- organization_tax_profile — time-versioned operational tax attributes the
-- statutory obligation engine needs but cannot derive from the books. Today
-- that is has_employees (drives whether payroll obligations exist for a
-- period). Like vat_status this is versioned by [valid_from, valid_to] and is
-- independent of účetní období, so a historical accounting period reports the
-- attribute effective THEN — no retroactive payroll obligations for a period
-- in which the org had no employees.
--
-- Org-scoped (FORCE RLS + organization_isolation, NULLIF guard — ADR-0010).
-- ADD-only, idempotent (re-runnable). One whole-file transaction. Handwritten
-- SQL (ADR-0009). btree_gist enabled in 0001.

BEGIN;

CREATE TABLE IF NOT EXISTS organization_tax_profile (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid        NOT NULL REFERENCES organization (id),
  valid_from      date        NOT NULL,
  valid_to        date,       -- null = current
  has_employees   boolean     NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_tax_profile_dates_chk
    CHECK (valid_to IS NULL OR valid_from <= valid_to),
  CONSTRAINT organization_tax_profile_no_overlap EXCLUDE USING gist (
    organization_id WITH =,
    daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') WITH &&
  )
);

ALTER TABLE organization_tax_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_tax_profile FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON organization_tax_profile;
CREATE POLICY organization_isolation ON organization_tax_profile
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON organization_tax_profile TO app_user;

COMMIT;

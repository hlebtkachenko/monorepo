-- 0064_favorite_page.sql
--
-- favorite_page — a user's starred pages within an org. The star is a personal
-- action (per user), scoped to one org (per organization_id): a favorite added
-- in org A never surfaces in org B. page_route stores the org-relative orgHref
-- path (e.g. 'records/invoices-received'), never a full URL, so favorites
-- survive an org switch and the /o → / flip. module_key is the rail module the
-- page belongs to (e.g. 'records'), used to group favorites in a module
-- overview; label is the ContentHeader title snapshot.
--
-- Org-scoped (FORCE RLS + organization_isolation, NULLIF guard — ADR-0010).
-- Single-col FKs are correct: organization_id → organization (tenant root, the
-- INSERT WITH CHECK blocks cross-org writes) and user_id → app_user (global, no
-- RLS). ADD-only, idempotent (re-runnable). One whole-file transaction.
-- Handwritten SQL (ADR-0009).

BEGIN;

CREATE TABLE IF NOT EXISTS favorite_page (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid        NOT NULL REFERENCES organization (id),
  user_id         uuid        NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  page_route      text        NOT NULL,
  module_key      text        NOT NULL,
  label           text        NOT NULL,
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT favorite_page_org_user_route_unique UNIQUE (organization_id, user_id, page_route)
);

CREATE INDEX IF NOT EXISTS favorite_page_org_user_module_idx
  ON favorite_page (organization_id, user_id, module_key, sort_order);

ALTER TABLE favorite_page ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_page FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON favorite_page;
CREATE POLICY organization_isolation ON favorite_page
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON favorite_page TO app_user;

COMMIT;

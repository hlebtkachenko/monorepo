-- Migration 0003: ENABLE + FORCE Row Level Security on organization-scoped
-- tables + app_admin BYPASSRLS role grants + default privileges.
--
-- Tables that get organization_isolation policy at this stage:
--   organization      (root tenant; self-referential organization_id)
--   tool_call_log     (central audit; created in 0004_audit.sql -- policy
--                      applied via the DO loop here; CREATE is in 0004)
--
-- The DO loop is intentionally forward-looking: any table listed that does
-- not yet exist is skipped gracefully. Policies for workspace-scoped tables
-- (workspace, workspace_membership, audit_event) are applied in 0005_workspace.sql.
--
-- app_admin DML grants + ALTER DEFAULT PRIVILEGES ensure every table created
-- in subsequent migrations automatically inherits the grant without an
-- explicit GRANT per migration.

BEGIN;

-- 1. organization table -------------------------------------------------------

CREATE TABLE organization (
  id                       uuid         PRIMARY KEY DEFAULT uuidv7(),
  organization_id          uuid         NOT NULL,   -- always equals id; enforced by trigger
  workspace_id             uuid         NOT NULL,   -- set at creation; immutable (enforced by trigger)
  slug                     varchar(64)  NOT NULL,
  legal_name               text         NOT NULL,
  person_kind              text         NOT NULL CHECK (person_kind IN ('natural_person', 'legal_entity')),
  legal_subject_kind       text         CHECK (legal_subject_kind IN ('for_profit', 'non_profit')),
  fiscal_year_start_month  smallint     NOT NULL DEFAULT 1,
  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT organization_person_subject_consistency CHECK (
    (person_kind = 'natural_person' AND legal_subject_kind IS NULL)
    OR (person_kind = 'legal_entity' AND legal_subject_kind IS NOT NULL)
  ),
  CONSTRAINT organization_slug_format CHECK (
    slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
    AND slug !~ '--'
    AND length(slug) BETWEEN 2 AND 63
  )
);

CREATE UNIQUE INDEX organization_workspace_slug_unique
  ON organization (workspace_id, slug);
CREATE INDEX organization_workspace_idx ON organization (workspace_id);
CREATE INDEX organization_self_idx      ON organization (organization_id, id);

-- 2. Reserved organization slug list -----------------------------------------

CREATE OR REPLACE FUNCTION app_is_reserved_org_slug(p_slug text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_catalog
AS $$
  SELECT p_slug = ANY(ARRAY[
    'admin', 'api', 'app', 'auth', 'dashboard', 'docs',
    'internal', 'system', 'workspace'
  ]);
$$;

ALTER FUNCTION app_is_reserved_org_slug(text) OWNER TO app_owner;
REVOKE EXECUTE ON FUNCTION app_is_reserved_org_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_is_reserved_org_slug(text) TO app_user;
GRANT EXECUTE ON FUNCTION app_is_reserved_org_slug(text) TO app_admin;

ALTER TABLE organization
  ADD CONSTRAINT organization_slug_not_reserved
  CHECK (NOT app_is_reserved_org_slug(slug))
  NOT VALID;

-- 3. ENABLE + FORCE RLS on organization-scoped tables ------------------------

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'organization'
    -- tool_call_log is added in 0004_audit.sql; the DO loop is safe to re-run
    -- because ENABLE/FORCE on a non-existent table would raise, but we only
    -- list tables that exist at this point.
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', tbl);
    EXECUTE format($p$
      CREATE POLICY organization_isolation ON %I
        USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
        WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
    $p$, tbl);
  END LOOP;
END
$$;

-- 4. Organization self-id sync trigger ----------------------------------------
-- organization.organization_id is always equal to organization.id so RLS
-- policies can use a uniform `organization_id = current_setting(...)` predicate.

CREATE OR REPLACE FUNCTION app_organization_self_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM NEW.id THEN
    NEW.organization_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_organization_self_id() OWNER TO app_owner;

CREATE TRIGGER organization_self_id_sync
  BEFORE INSERT OR UPDATE ON organization
  FOR EACH ROW EXECUTE FUNCTION app_organization_self_id();

-- 5. Organization workspace_id immutability trigger ---------------------------

CREATE OR REPLACE FUNCTION app_organization_workspace_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.workspace_id IS NOT NULL
     AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION
      'organization.workspace_id is immutable once set (organization=%, old=%, new=%)',
      OLD.id, OLD.workspace_id, NEW.workspace_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION app_organization_workspace_immutable() OWNER TO app_owner;

CREATE TRIGGER organization_workspace_immutable
  BEFORE UPDATE ON organization
  FOR EACH ROW EXECUTE FUNCTION app_organization_workspace_immutable();

-- 6. app_admin DML grants + default privileges --------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_admin;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_admin;

-- 7. organization GRANTs to app_user -----------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON organization TO app_user;
  END IF;
END
$$;

COMMIT;

-- Migration 0026: Accounting Records System — FORCE RLS + app_user grants.
--
-- Every accounting table is organization-scoped: ENABLE + FORCE ROW LEVEL
-- SECURITY with the standard `organization_isolation` policy (NULLIF guard,
-- ADR-0010). app_admin DML is already covered by ALTER DEFAULT PRIVILEGES
-- (0003); app_user needs explicit grants. Posted tables (ucetni_zapis,
-- zapis_radek, penezni_denik_radek) get SELECT+INSERT only — they are
-- append-only (R8), enforced AUTHORITATIVELY by the BEFORE triggers in 0027
-- (they fire regardless of role). The withheld UPDATE/DELETE grant is
-- defense-in-depth only and is currently inert: app_user inherits app_admin's
-- DML via GRANT app_admin TO app_user (0002_auth.sql), so the REVOKE has no
-- effect until that inheritance is severed. The triggers are the real defense.
--
-- Keep ACCOUNTING_ORG_SCOPED_TABLES in sync with
-- packages/db/src/policies/rls.ts (ORGANIZATION_SCOPED_TABLES).

BEGIN;

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'ucetni_jednotka', 'protistrana', 'majetek', 'kategorie',
    'ucetni_obdobi', 'ucetni_pripad', 'ucetni_doklad', 'doklad_radek',
    'dilci_zaznam', 'uctovy_rozvrh', 'ucet', 'odpisovy_plan',
    'inventurni_soupis', 'ucetni_zapis', 'zapis_radek',
    'penezni_denik_radek', 'vystup', 'podpis'
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

-- app_user grants -------------------------------------------------------------

DO $$
DECLARE
  tbl text;
  mutable text[] := ARRAY[
    'ucetni_jednotka', 'protistrana', 'majetek', 'kategorie',
    'ucetni_obdobi', 'ucetni_pripad', 'ucetni_doklad', 'doklad_radek',
    'dilci_zaznam', 'uctovy_rozvrh', 'ucet', 'odpisovy_plan',
    'inventurni_soupis', 'vystup', 'podpis'
  ];
  append_only text[] := ARRAY[
    'ucetni_zapis', 'zapis_radek', 'penezni_denik_radek'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    FOREACH tbl IN ARRAY mutable LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', tbl);
    END LOOP;
    FOREACH tbl IN ARRAY append_only LOOP
      EXECUTE format('GRANT SELECT, INSERT ON %I TO app_user', tbl);
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM app_user', tbl);
    END LOOP;
  END IF;
END
$$;

COMMIT;

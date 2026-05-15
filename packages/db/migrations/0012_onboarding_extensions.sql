-- Migration 0012: Onboarding extension columns.
--
-- Adds the four columns the auth & onboarding wizard collects but the
-- foundation schema did not yet have:
--
--   app_user.experience          ENUM ('new','some','bookkeeper','accountant')
--   workspace.use_case           ENUM ('firm','biz')
--   workspace.team_size          ENUM ('solo','sm','md','lg','xl')
--   workspace_billing.plan       ENUM ('starter','growth','scale') NOT NULL DEFAULT 'starter'
--
-- Notes:
--   - workspace.step_1_completed_at .. step_5_completed_at + onboarding_completed_at
--     are already present from 0011_onboarding.sql; not re-added here.
--   - app_user.profile_completed_at is already present from 0002_auth.sql.
--   - All four columns added with IF NOT EXISTS so re-running on a partially
--     migrated dev DB is safe. Enum types use CREATE TYPE IF NOT EXISTS via
--     DO-blocks because Postgres lacks native IF NOT EXISTS on CREATE TYPE.
--   - workspace_billing.plan is the only NOT NULL addition; safe because
--     PG 11+ stores the DEFAULT in pg_attribute without table rewrite.
--   - No RLS changes needed: existing policies filter rows, not columns.

BEGIN;

-- 1. Enum types ---------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE app_user_experience AS ENUM ('new', 'some', 'bookkeeper', 'accountant');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE workspace_use_case AS ENUM ('firm', 'biz');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE workspace_team_size AS ENUM ('solo', 'sm', 'md', 'lg', 'xl');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE billing_plan AS ENUM ('starter', 'growth', 'scale');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. app_user.experience ------------------------------------------------------

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS experience app_user_experience;

-- 3. workspace.use_case + team_size -------------------------------------------

ALTER TABLE workspace
  ADD COLUMN IF NOT EXISTS use_case  workspace_use_case,
  ADD COLUMN IF NOT EXISTS team_size workspace_team_size;

-- 4. workspace_billing.plan ---------------------------------------------------

ALTER TABLE workspace_billing
  ADD COLUMN IF NOT EXISTS plan billing_plan NOT NULL DEFAULT 'starter';

COMMIT;

-- Migration 0011: Onboarding step tracking columns.
--
-- Adds:
--   workspace.step_1_completed_at .. step_5_completed_at + onboarding_completed_at
--   workspace.beta_plan_acknowledged_at
--   workspace_membership.mfa_grace_until
--
-- Note: workspace.display_name, purpose, contact_email, contact_phone, website
-- are already present from 0005_workspace.sql (initial workspace DDL).
-- workspace_billing is already present from 0005_workspace.sql.
-- app_user onboarding columns are already present from 0002_auth.sql.
-- This migration only adds the product-specific onboarding step tracking columns.

BEGIN;

-- 1. workspace onboarding step columns ----------------------------------------

ALTER TABLE workspace
  ADD COLUMN IF NOT EXISTS beta_plan_acknowledged_at  timestamptz,
  ADD COLUMN IF NOT EXISTS step_1_completed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS step_2_completed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS step_3_completed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS step_4_completed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS step_5_completed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at    timestamptz;

-- 2. workspace_membership.mfa_grace_until -------------------------------------

ALTER TABLE workspace_membership
  ADD COLUMN IF NOT EXISTS mfa_grace_until timestamptz;

COMMIT;

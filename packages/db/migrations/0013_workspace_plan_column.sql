-- Migration 0013: move billing plan from workspace_billing to workspace.
--
-- The onboarding plan picker (step 5) writes the chosen plan immediately,
-- before the operator completes billing setup. workspace_billing has many
-- NOT NULL columns (legal_name, address_*, country) that the onboarding
-- wizard does not collect, so the plan cannot live there yet.
--
-- Solution: keep workspace_billing for the billing-setup row that comes
-- later, and store the plan choice directly on the parent workspace.
-- workspace.plan is the single source of truth from onboarding onward;
-- workspace_billing.plan is dropped (was only added in 0012).
--
-- No RLS policy changes needed (existing policies filter rows, not columns).

BEGIN;

ALTER TABLE workspace
  ADD COLUMN IF NOT EXISTS plan billing_plan NOT NULL DEFAULT 'starter';

ALTER TABLE workspace_billing
  DROP COLUMN IF EXISTS plan;

COMMIT;

-- 0065_organization_support_access.sql
--
-- organization.support_access_expires_at — per-org consent gate for admin
-- support login (F11). NULL (the default, absence of a row value) means no
-- consent: an operator cannot start an impersonation session targeting this
-- org. A non-NULL future timestamp is an active grant — the org owner/admin
-- toggled "Support access" on, opening a 7-day window (set to now() + 7 days)
-- during which admin impersonation into the org is permitted. Toggling off
-- writes NULL and force-ends any live impersonation row for the org.
--
-- Two expiry layers: this 7-day consent window is the OUTER bound; each
-- impersonation session still carries its own 30-minute TTL (expected_end_at).
-- The column is only ever read for a known org id (header state + the
-- impersonation precondition), never queried BY value, so no index is needed.
--
-- Nullable, no default (absence = no consent). ADD-only, idempotent
-- (re-runnable). One whole-file transaction. Handwritten SQL (ADR-0009).
BEGIN;
ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS support_access_expires_at timestamptz;
COMMIT;

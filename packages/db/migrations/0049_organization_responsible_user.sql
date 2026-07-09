-- 0049_organization_responsible_user.sql
--
-- organization.responsible_user_id — the workspace staff member (accountant)
-- responsible for this client book. Nullable (unassigned). References the
-- global app_user; the assignment server action validates the target is an
-- active member of the org's workspace. ADD-only, idempotent. Handwritten SQL
-- (ADR-0009).
BEGIN;
ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS responsible_user_id uuid REFERENCES app_user (id);
CREATE INDEX IF NOT EXISTS organization_responsible_user_idx
  ON organization (responsible_user_id) WHERE responsible_user_id IS NOT NULL;
COMMIT;

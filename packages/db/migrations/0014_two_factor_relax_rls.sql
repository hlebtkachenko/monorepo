-- Migration 0014: drop FORCE RLS on two_factor.
--
-- 0002_auth.sql special-cased two_factor with FORCE RLS + self-access
-- policies keyed on `current_setting('app.user_id')`. The matching GUC
-- was never wired into the Better Auth request path: BA's drizzleAdapter
-- runs on the app_user Postgres role with no per-request `app.user_id`,
-- so `POST /api/auth/two-factor/enable` fails with 42501 (new row
-- violates row-level security policy for table "two_factor").
--
-- Sibling BA-managed tables (app_user, auth_account, auth_session,
-- auth_verification) intentionally don't have RLS — BA owns access via
-- its signed session cookie and the only paths that touch them go
-- through endpoints BA controls. two_factor is in the same bucket and
-- should match. The self-row check is redundant: every BA TOTP endpoint
-- already scopes its query to `session.user.id`, and that session
-- cookie is HS256-signed with BETTER_AUTH_SECRET.
--
-- Reversal: re-enable RLS + recreate the two policies if a future
-- request-level GUC layer materializes; nothing in the codebase relies
-- on these policies today.

BEGIN;

DROP POLICY IF EXISTS two_factor_self_read  ON two_factor;
DROP POLICY IF EXISTS two_factor_self_write ON two_factor;

ALTER TABLE two_factor NO FORCE ROW LEVEL SECURITY;
ALTER TABLE two_factor DISABLE ROW LEVEL SECURITY;

COMMIT;

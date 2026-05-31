-- Migration 0020: drop the auth_invite table (ADR-0022 / AFF-198 E1).
--
-- Migration 0018 backfilled every pending row into auth_token (kind='inv').
-- The web + admin apps have since cut over to read invite state from
-- auth_token directly; auth_invite is no longer referenced by any code
-- path. Drop it.
--
-- CASCADE: auth_invite carried FK references to app_user via
-- issued_by_user_id and accepted_by_user_id (both ON DELETE no-action).
-- No other table FK's INTO auth_invite — auth_token.issued_to_user_id
-- references app_user, not auth_invite. DROP TABLE ... CASCADE removes
-- the table + its triggers + its indexes; nothing else depends on it.
--
-- IRREVERSIBLE: the row data is destroyed. The backfill in migration
-- 0018 already copied every PENDING row into auth_token, and the
-- terminal-state rows (accepted / revoked / expired) were not migrated
-- because they would never be redeemed anyway. Treat this DROP as the
-- final step in the lifecycle.

BEGIN;

DROP TABLE IF EXISTS auth_invite CASCADE;

-- DROP TABLE ... CASCADE removes the BEFORE-INSERT/UPDATE trigger
-- attached to the table, but the trigger FUNCTION itself is an
-- independent object — it survives the drop as an orphan. Remove it
-- too so the schema-snapshot stays clean.
DROP FUNCTION IF EXISTS app_auth_invite_email_normalize() CASCADE;

COMMIT;

-- 0044_api_key_actor_kind.sql
--
-- [#517] Server-side key CAPABILITY: mark each api_key as a `human` or `agent`
-- actor so the held-write RESOLVE endpoint can DENY agent-actor keys entirely.
--
-- Background: the Afframe Brain client sandbox denies `resolve_accounting_held_write`
-- client-side (WP-B), and WP-D added a server-side author!=approver rider
-- (held-writes.controller.ts). But the Brain's user-bound key stays
-- server-authorized on POST /v1/accounting/held-writes/:id/resolve, and
-- author!=approver only blocks self-approval — a second agent identity (or a
-- leaked human-bound key) could cross-approve a vetoed HELD write. This column
-- is the durable fix: an `agent` key can propose gated writes but can NEVER
-- resolve one; only a `human` key may approve/reject. Defense-in-depth on top of
-- the author!=approver rider, not a replacement.
--
-- NOT NULL DEFAULT 'human' — every pre-existing key stays fully capable (a
-- constant default is a fast metadata-only add in PG 11+, no table rewrite). A
-- Brain key is provisioned explicitly as 'agent'. A CHECK constrains the domain;
-- a text column (not a pgEnum) keeps the migration additive + lock-light (no
-- ALTER TYPE), mirroring partial_record.supply_kind (0043).
--
-- The write lane ships OFF (BRAIN_RUNTIME_ACTIVE fail-closed), so this is not
-- live pre-launch; it lands the backstop before the deliberate turn-on.
-- Idempotent. Handwritten SQL (ADR-0009); one whole-file transaction.

BEGIN;

ALTER TABLE api_key
  ADD COLUMN IF NOT EXISTS actor_kind text NOT NULL DEFAULT 'human';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'api_key_actor_kind_chk'
  ) THEN
    ALTER TABLE api_key
      ADD CONSTRAINT api_key_actor_kind_chk
      CHECK (actor_kind IN ('human', 'agent'));
  END IF;
END$$;

COMMENT ON COLUMN api_key.actor_kind IS
  'Actor capability of the key: human (person via API) or agent (autonomous Brain client). Agent keys are DENIED on the held-write resolve endpoint server-side (propose, never approve). Default human = full capability; #517.';

COMMIT;

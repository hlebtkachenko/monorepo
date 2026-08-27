-- Migration 0021: the activity log names a human on EVERY row, and a human who
-- is named there can no longer be deleted out from under it.
--
-- THE DECISION THIS FILE ENCODES: ANONYMIZE, NEVER DELETE. Erasing a person from
-- this deployment scrubs their PII in place (`anonymizeAppUser`,
-- `lib/data/office/anonymize.ts`); it never removes the `app_user` row. Czech
-- accounting retention obliges the office to keep the record of who booked what
-- for years after the person leaves, and GDPR Art. 17(3)(b) is the carve-out
-- that makes keeping it lawful — so the audit trail is the thing that survives
-- and the identity is the thing that goes. Everything below follows from that
-- one choice.
--
-- WHY THE PREVIOUS SHAPE WAS A LIE WAITING TO HAPPEN. Migration 0011 gave
-- `activity_log.actor_user_id` `ON DELETE SET NULL`, and gave the coherence
-- CHECK two arms of unequal strength:
--
--   WHEN 'user'  THEN agent_key_id IS NULL AND actor_user_id IS NOT NULL
--   WHEN 'agent' THEN agent_key_id IS NOT NULL
--
-- Two things were wrong with that pair, in opposite directions:
--
--   1. THE 'user' ARM AND THE FK CONTRADICTED EACH OTHER. Deleting an account
--      that had ever acted made the FK try to write NULL into a column the CHECK
--      forbids to be NULL, so the delete failed — with a check_violation naming
--      a constraint the operator never touched. The refusal was RIGHT; the way
--      it arrived was an accident. It now arrives as what it actually is: a
--      foreign key that says no.
--
--   2. THE 'agent' ARM WAS SILENTLY WEAKER. It never required a human at all, so
--      `SET NULL` on an agent row SUCCEEDED and quietly erased the accountant
--      whose authority the key had used. That is the exact lie `activity_log`
--      exists to make impossible — "an agent did this, and nobody is answerable"
--      — and it was reachable by deleting one account. `recordAgentActivity` has
--      always written the key's `acting_user_id`, so the column was never
--      actually null in practice; the CHECK simply did not say so.
--
-- PREMISE FOR THE TIGHTENING: FRESH DATABASES ONLY. There is no live beta
-- database at the time of this migration — every database this file will ever be
-- applied to is either empty or built by this same migration ladder. So no
-- backfill is needed and none is written: an `agent` row with a NULL
-- `actor_user_id` cannot exist, because the only writer of agent rows
-- (`recordAgentActivity`) has always supplied one and the only path that could
-- have nulled one after the fact (`ON DELETE SET NULL` + a deleted account) is
-- the very thing this file removes. If that premise is ever false — a database
-- restored from somewhere else — the `ALTER TABLE ... ADD CONSTRAINT` below
-- fails loudly on the offending rows rather than accepting them, which is the
-- correct failure: a log row with no answerable human is not data to be
-- migrated, it is evidence to be investigated.
--
-- WHAT THIS FILE CHANGES
--
--   1. `activity_log_actor_coherence` — `actor_user_id IS NOT NULL` for BOTH
--      actor kinds, and an `ELSE false` so an unknown third kind is refused
--      outright rather than escaping the key pairing. The kinds still differ on
--      the KEY (`agent` names one, `user` must not), which is the distinction
--      the constraint was built for.
--   2. `activity_log_actor_user_id_fkey` — `ON DELETE SET NULL` becomes
--      `ON DELETE RESTRICT`. An account that has acted in a book cannot be
--      deleted; it is anonymized in place instead.
--   3. `app_user_tombstone_guard` — no row may claim ANOTHER row's tombstone
--      address, so the erasure of one account cannot be blocked by another.

-- 1. Both arms name a human ---------------------------------------------------
--
-- Rewritten rather than added-alongside: two overlapping coherence constraints
-- would mean two error messages for one rule, and the next person to relax one
-- of them would have no way to tell which was authoritative.
ALTER TABLE activity_log DROP CONSTRAINT activity_log_actor_coherence;

ALTER TABLE activity_log
  ADD CONSTRAINT activity_log_actor_coherence CHECK (
    -- Unconditional, ahead of the CASE: whichever kind wrote the row, "who is
    -- answerable for this" has an answer. Stated once rather than repeated in
    -- both arms so a future third actor kind inherits THIS HALF automatically.
    actor_user_id IS NOT NULL
    AND CASE actor_kind
      -- An agent act always names its key; a user act never does.
      WHEN 'user'  THEN agent_key_id IS NULL
      WHEN 'agent' THEN agent_key_id IS NOT NULL
      -- FAIL CLOSED ON AN UNKNOWN KIND. The hoist above closes only the HUMAN
      -- half; the key pairing is still decided here, and a CASE with no matching
      -- WHEN and no ELSE evaluates to NULL — which a CHECK accepts. So adding a
      -- third label to `beta_actor_kind` without deciding its key rule would
      -- silently let those rows carry a key or omit one at will, which is the
      -- quiet way a constraint like this stops applying. `false` forces the
      -- decision to be made in the migration that adds the label.
      ELSE false
    END
  );

-- 2. A named actor cannot be deleted ------------------------------------------
--
-- RESTRICT, not NO ACTION, and the difference matters here in the opposite
-- direction from `agent_key_id` one line up in 0011. That column takes NO ACTION
-- precisely so an ORGANIZATION delete can cascade through `activity_log` and
-- `agent_key` in one statement without the check firing mid-flight. This column
-- has no such cascade to accommodate: nothing deletes an `app_user` as a side
-- effect of deleting something else, so the immediate check is free, and an
-- immediate refusal points at the actual offending statement instead of at the
-- end of a transaction.
--
-- `agent_key.acting_user_id` (0011) already carries `ON DELETE RESTRICT` for the
-- same reason — a credential must not outlive the identity it acts as — so this
-- makes the two columns that name the answerable human agree.
--
-- The organization-delete path is unaffected: `activity_log.organization_id` is
-- still `ON DELETE CASCADE`, so deleting a book still removes its log rows, and
-- with them the references that would otherwise pin its people.
ALTER TABLE activity_log
  DROP CONSTRAINT activity_log_actor_user_id_fkey;

ALTER TABLE activity_log
  ADD CONSTRAINT activity_log_actor_user_id_fkey
  FOREIGN KEY (actor_user_id) REFERENCES app_user(id) ON DELETE RESTRICT;

-- The FK's own index. Postgres indexes the REFERENCED side automatically (it is
-- the primary key) but never the REFERENCING one, and RESTRICT makes that gap
-- expensive in a way SET NULL did not: every `DELETE FROM app_user` and every
-- organization cascade now has to prove no row here points at the doomed id,
-- which without this index is a sequential scan of the whole log.
CREATE INDEX IF NOT EXISTS activity_log_actor_user_idx
  ON activity_log (actor_user_id);

-- 3. Nobody may squat another account's tombstone -----------------------------
--
-- THE DENIAL OF SERVICE THIS CLOSES. Anonymization rewrites `app_user.email` to
-- `anonymized-<that row's own id>@anonymized.invalid`. The column is UNIQUE, so
-- if ANY other row already holds that exact address the erasure fails on 23505 —
-- and a GDPR Art. 17 request that cannot be executed is the one failure mode
-- this whole feature exists to prevent. Office staff can create accounts at an
-- address of their choosing, so before this trigger a single provisioned account
-- named after a victim's uuid was enough to make that victim un-erasable, with
-- the refusal surfacing as an opaque "the database refused it".
--
-- WHY A TRIGGER RATHER THAN ONLY AN APPLICATION CHECK. The application refuses
-- it too (`createOfficeUser`, `normalizeEmail` in `lib/auth/setup-token.ts`),
-- with a named error the operator can act on — that is the good message. This is
-- the floor under it: the rule is "no row may hold a tombstone that is not its
-- own", which is a property of the TABLE, and a future write path, a fixture or
-- an operator with psql must not be able to break an erasure by accident.
--
-- A plain CHECK cannot express it: the legal case depends on comparing `email`
-- against `id` in the same row, which a CHECK can do — but only a trigger can
-- also let the anonymizing UPDATE through while refusing every other spelling,
-- because the id is a default-generated value not yet visible to a CHECK on
-- INSERT. Written as BEFORE INSERT OR UPDATE so it runs after
-- `app_user_lowercase_email` ('t' sorts after 'l', and same-timing triggers fire
-- in name order), and therefore judges the address as it will actually be stored.
CREATE OR REPLACE FUNCTION beta_app_user_tombstone_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email ~ '^anonymized-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@anonymized\.invalid$'
     AND NEW.email <> 'anonymized-' || NEW.id || '@anonymized.invalid' THEN
    RAISE EXCEPTION
      'app_user % may not claim another account''s anonymized address', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_user_tombstone_guard
  BEFORE INSERT OR UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION beta_app_user_tombstone_guard();

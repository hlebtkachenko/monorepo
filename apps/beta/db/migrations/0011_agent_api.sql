-- Migration 0011: the agent ingestion API — office agent keys, the activity log,
-- and the external reference that makes an ingestion upsert idempotent.
--
-- Scope (spec `.context/beta-afframe/40-beta-structure.md` §3.2 "Agent
-- ingestion API", §4 data model):
--
--   agent_key     one credential the office's own agent authenticates with;
--                 sha256 at rest, org-scoped or office-global, revocable
--   activity_log  who did what in a book — actor kind user|agent, the key id,
--                 the action, the entity it touched, a payload summary
--   external_ref  the source system's own id, added to filing / liability /
--                 asset so a re-sent row updates instead of duplicating
--
-- WHAT AN AGENT KEY IS, EXACTLY. It is the NON-INTERACTIVE FORM OF ONE OFFICE
-- USER'S OWN AUTHORITY, and that is the whole security model of this file.
-- `acting_user_id` names the účetní the key acts as; the API resolves the same
-- `organization_membership` row that user's browser session would resolve, and
-- refuses everything that resolution refuses. So a key can never reach a book
-- its human cannot, `app_user.disabled_at` kills it the moment the account is
-- offboarded, and removing the owner membership removes the key's reach into
-- that one book. There is no second authority path and no staff bypass — which
-- is the property `lib/data/scope.ts` was built around and this migration must
-- not weaken.
--
-- WHAT THE TABLE CANNOT DO, BY CONSTRUCTION: show a key. Only `sha256(secret)`
-- is stored, exactly as `user_setup_token.token_hash` is, so the /admin registry
-- has no query that reconstructs a usable credential. A lost key is REISSUED,
-- never re-read.
--
-- THE ACTIVITY LOG IS APPEND-ONLY AND CARRIES THE IDEMPOTENCY KEY. One row per
-- API CALL, written inside the same transaction as the mutation it describes —
-- so a rolled-back write leaves no log row, and a log row is proof the write
-- committed. The partial unique index on (agent_key_id, request_id) is what
-- makes a retried request a no-op instead of a second import: the second attempt
-- raises 23505, its transaction rolls back whole, and the API replays the first
-- call's recorded summary.
--
-- Requires PostgreSQL 18+: `uuidv7()`.
--
-- NO `BEGIN;` / `COMMIT;` in this file — see the header of 0000_init.sql.

-- 1. Enum ----------------------------------------------------------------------

-- Spec §4 activity_log: "actor kind user|agent". Two values and no third: a
-- system/cron actor would be a third authority nobody granted, and the retention
-- jobs of PR 37 act on nobody's behalf and write no accounting fact.
CREATE TYPE beta_actor_kind AS ENUM ('user', 'agent');

-- 2. agent_key -----------------------------------------------------------------

CREATE TABLE agent_key (
  id                 uuid        PRIMARY KEY DEFAULT uuidv7(),
  -- Spec §3.2: "org-scoped or office-global". NULL is office-global — the key
  -- may write to every book its `acting_user_id` is účetní of. A non-null value
  -- narrows it to that one book and nothing widens it again (the identity
  -- freeze trigger below).
  organization_id    uuid        REFERENCES organization(id) ON DELETE CASCADE,
  -- What the office calls this key in /admin ("Money S3 export, notebook").
  label              text        NOT NULL,
  -- sha256 of the secret, hex. The secret itself exists once, in the response to
  -- the issue action, and nowhere else — same contract as user_setup_token.
  key_hash           char(64)    NOT NULL,
  -- The office account this key acts as. RESTRICT rather than CASCADE: deleting
  -- the human out from under a live credential would leave a key whose authority
  -- nobody can trace. Accounts are deactivated (`disabled_at`), not deleted, and
  -- a deactivated account's keys stop authenticating on the next request.
  acting_user_id     uuid        NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  -- Who issued it. Forensics only; SET NULL keeps an offboarding from being
  -- blocked by an audit column.
  created_by_user_id uuid        REFERENCES app_user(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Coarse "is this key still in use" signal for the registry. Written on a
  -- successful authentication only, and deliberately not per-request precise:
  -- it is a UPDATE on the hot path, so the auth layer writes it at most once a
  -- minute per key.
  last_used_at       timestamptz,
  revoked_at         timestamptz,
  revoked_by_user_id uuid        REFERENCES app_user(id) ON DELETE SET NULL,

  CONSTRAINT agent_key_hash_hex
    CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT agent_key_label_present
    CHECK (length(btrim(label)) BETWEEN 1 AND 120)
);

-- One secret, one row. A collision here is a CSPRNG failure, not a user error;
-- stating it means a duplicate can never make the lookup ambiguous.
CREATE UNIQUE INDEX agent_key_hash_idx ON agent_key (key_hash);

-- The /admin registry's listing order, and the live-key lookup per book.
CREATE INDEX agent_key_organization_idx ON agent_key (organization_id, created_at DESC);
CREATE INDEX agent_key_acting_user_idx  ON agent_key (acting_user_id);

CREATE TRIGGER agent_key_touch_updated_at
  BEFORE UPDATE ON agent_key
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- Only office staff may be acted as.
--
-- The same shape as `beta_membership_owner_requires_staff` (0000 §; owner-ness
-- can only originate from the office) and for the same reason: an agent key is
-- an owner-level write handle, so its human has to be one. This is a
-- POINT-IN-TIME check — `is_staff` can be revoked afterwards — and the live gate
-- is the auth path, which re-reads `is_staff` and `disabled_at` on every
-- request. Both exist: this one stops a bad key from being created, that one
-- stops an existing key from outliving its human's access.
--
-- INSERT ONLY. `acting_user_id` is frozen by the next trigger, so there is
-- nothing for an UPDATE to re-check — and firing on UPDATE would make the
-- offboarding revoke below impossible: revoking the keys of a just-disabled
-- account is an UPDATE whose acting user is, by then, deliberately not live.
CREATE OR REPLACE FUNCTION beta_agent_key_acting_user_is_staff()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app_user u
     WHERE u.id = NEW.acting_user_id
       AND u.is_staff
       AND u.disabled_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'agent_key.acting_user_id must be a live office account (user %)',
      NEW.acting_user_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_key_acting_user_is_staff
  BEFORE INSERT ON agent_key
  FOR EACH ROW EXECUTE FUNCTION beta_agent_key_acting_user_is_staff();

-- A key's identity is frozen and its revocation is final.
--
-- Without the freeze, an UPDATE could re-point a live secret at another
-- organization or at another accountant — a privilege escalation performed with
-- no new credential and no trace in the log. Without the revocation half, the
-- /admin kill switch would be reversible by the same UPDATE that pressed it,
-- and "this key was revoked at 14:02" would stop being a fact.
CREATE OR REPLACE FUNCTION beta_agent_key_freeze_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.key_hash <> OLD.key_hash
     OR NEW.acting_user_id <> OLD.acting_user_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION
      'agent_key identity (hash, acting user, organization) is immutable (key %)',
      OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'agent_key revocation is final (key %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_key_freeze_identity
  BEFORE UPDATE ON agent_key
  FOR EACH ROW EXECUTE FUNCTION beta_agent_key_freeze_identity();

-- Deactivating an account kills its keys, in the same transaction.
--
-- `beta_revoke_live_setup_tokens` (0003) does exactly this for outstanding
-- invites; an agent key is a longer-lived credential held by the same human, so
-- leaving it alive through an offboarding would be the larger hole of the two.
-- The auth path already refuses a disabled account on every request — this makes
-- the refusal VISIBLE in the registry instead of leaving a key that reads as
-- live and silently is not.
CREATE OR REPLACE FUNCTION beta_revoke_agent_keys_of_disabled_user()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.disabled_at IS NOT NULL AND OLD.disabled_at IS NULL THEN
    UPDATE agent_key
       SET revoked_at = now()
     WHERE acting_user_id = NEW.id
       AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_user_disable_revokes_agent_keys
  AFTER UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION beta_revoke_agent_keys_of_disabled_user();

-- 3. activity_log --------------------------------------------------------------
--
-- Spec §4: "activity_log". Org-scoped, actor kind user|agent, actor id / key id,
-- action, entity ref, payload summary jsonb.
--
-- ONE ROW PER API CALL, not per row written. A publish of a 300-line předvaha is
-- one act the office can point at, undo and explain; 300 rows would bury it. The
-- summary names the entities the call touched.
--
-- THE SUMMARY IS A SUMMARY. It carries counts, external refs and ids — never the
-- accounting payload itself, which is already stored in its own table, and never
-- a credential. `lib/data/activity-log.ts` builds it by explicit pick, the same
-- discipline `lib/data/projections.ts` applies to client-visible rows.

CREATE TABLE activity_log (
  id              uuid            PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  actor_kind      beta_actor_kind NOT NULL,
  -- The human. For an agent act this is the key's `acting_user_id` — the
  -- accountant whose authority was used — so "who is answerable for this row"
  -- has an answer whichever actor kind wrote it.
  actor_user_id   uuid            REFERENCES app_user(id) ON DELETE SET NULL,
  -- NO `ON DELETE` ACTION on purpose, for the reason spelled out on
  -- `import_batch_supersession_fk` (0007): RESTRICT is checked immediately and
  -- would refuse the cascading delete of an organization, while the default NO
  -- ACTION is checked at the end of the statement, by which time both rows are
  -- gone. SET NULL would violate the actor coherence CHECK below.
  agent_key_id    uuid            REFERENCES agent_key(id),
  -- `<entity>.<verb>`, e.g. `filing.upsert`, `statements.publish`.
  action          text            NOT NULL,
  entity_kind     text            NOT NULL,
  -- The single row the act touched, when there was exactly one. NULL for a
  -- multi-row upsert — the summary lists those.
  entity_id       uuid,
  -- The caller's `Idempotency-Key`. See the unique index below.
  request_id      text,
  summary         jsonb           NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT activity_log_action_shape
    CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
  CONSTRAINT activity_log_entity_kind_shape
    CHECK (entity_kind ~ '^[a-z_]+$'),
  CONSTRAINT activity_log_request_id_shape
    CHECK (request_id IS NULL OR length(request_id) BETWEEN 1 AND 200),
  -- An agent act always names its key; a user act never does. Without this an
  -- agent write could be logged as if a human had performed it, which is the one
  -- lie this table exists to make impossible.
  CONSTRAINT activity_log_actor_coherence CHECK (
    CASE actor_kind
      WHEN 'user'  THEN agent_key_id IS NULL AND actor_user_id IS NOT NULL
      WHEN 'agent' THEN agent_key_id IS NOT NULL
    END
  ),
  CONSTRAINT activity_log_summary_is_object
    CHECK (jsonb_typeof(summary) = 'object')
);

-- The office's reading order (spec §3.2 batch history / §5 internal layer).
CREATE INDEX activity_log_organization_idx
  ON activity_log (organization_id, created_at DESC);

-- IDEMPOTENCY, ENFORCED BY THE DATABASE. A retried call carries the same
-- `Idempotency-Key`; its INSERT here raises 23505, which rolls back the whole
-- transaction INCLUDING the mutation, and the API then replays the first call's
-- summary. Keyed on the KEY rather than on the organization: one credential must
-- not be able to spend one request id twice, even against two different books.
CREATE UNIQUE INDEX activity_log_agent_request_idx
  ON activity_log (agent_key_id, request_id)
  WHERE request_id IS NOT NULL;

-- Append-only. A log that can be edited after the fact is not evidence of
-- anything; DELETE stays available because an organization delete has to cascade
-- (spec §2.10 danger zone).
CREATE OR REPLACE FUNCTION beta_activity_log_is_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only (row %)', OLD.id
    USING ERRCODE = 'check_violation';
  RETURN NULL;
END;
$$;

CREATE TRIGGER activity_log_is_append_only
  BEFORE UPDATE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION beta_activity_log_is_append_only();

-- 4. external_ref --------------------------------------------------------------
--
-- The source system's own id for a row, carried on the three registries the
-- ingestion API upserts into.
--
-- WHY AN UPSERT NEEDS ONE. `filing`, `liability` and `asset` are office-typed
-- registries with no natural key: two identical-looking DPH advances CAN both be
-- real. Matching an incoming row on its content would silently merge two of
-- them; matching on nothing would duplicate the whole registry on every agent
-- run. So the agent states the id its own source holds, and that id — scoped to
-- the organization — is the match key. Rows the office typed by hand keep
-- `external_ref IS NULL` and are never touched by an upsert, which is why the
-- unique index is partial.
--
-- It is NOT a client-facing field: `external_ref` is on
-- CLIENT_FORBIDDEN_COLUMNS (lib/data/projections.ts) so no projection can start
-- publishing the office's internal system ids.

ALTER TABLE filing      ADD COLUMN external_ref text;
ALTER TABLE liability   ADD COLUMN external_ref text;
ALTER TABLE asset       ADD COLUMN external_ref text;
ALTER TABLE client_task ADD COLUMN external_ref text;

ALTER TABLE filing
  ADD CONSTRAINT filing_external_ref_shape
  CHECK (external_ref IS NULL OR length(btrim(external_ref)) BETWEEN 1 AND 200);
ALTER TABLE liability
  ADD CONSTRAINT liability_external_ref_shape
  CHECK (external_ref IS NULL OR length(btrim(external_ref)) BETWEEN 1 AND 200);
ALTER TABLE asset
  ADD CONSTRAINT asset_external_ref_shape
  CHECK (external_ref IS NULL OR length(btrim(external_ref)) BETWEEN 1 AND 200);
ALTER TABLE client_task
  ADD CONSTRAINT client_task_external_ref_shape
  CHECK (external_ref IS NULL OR length(btrim(external_ref)) BETWEEN 1 AND 200);

CREATE UNIQUE INDEX filing_external_ref_idx
  ON filing (organization_id, external_ref)
  WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX liability_external_ref_idx
  ON liability (organization_id, external_ref)
  WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX asset_external_ref_idx
  ON asset (organization_id, external_ref)
  WHERE external_ref IS NOT NULL;
-- Templates and instantiated tasks share the table, so the key has to include
-- `is_template`: an agent-fed template and the March task it produced are two
-- rows the source system may legitimately give the same id.
CREATE UNIQUE INDEX client_task_external_ref_idx
  ON client_task (organization_id, is_template, external_ref)
  WHERE external_ref IS NOT NULL;

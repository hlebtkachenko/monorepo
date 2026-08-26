-- Migration 0018: Asistent — chats, their transcripts, and the budget ledger.
--
-- Scope (spec `.context/beta-afframe/40-beta-structure.md` §2.8 Asistent, F31).
-- Depth map: "SHALLOW (table + stamp suffices) ... Asistent features (guardrails
-- deep)". The tables are therefore small and the INVARIANTS are where the work
-- is: a transcript nobody can rewrite, a ledger that cannot be raced past its
-- ceiling, and a chat that can never change books or owners.
--
--   chat          one conversation (spec: sidebar chat list — Nový chat,
--                 rename, delete)
--   chat_message  its transcript, append-only
--   chat_usage    the per-day, per-user ledger the five budget controls read
--
-- WHAT THIS FILE DOES NOT DO. It stores no organization FACTS for the model to
-- read. Spec §2.8 allows exactly two injected facts — the organization's name
-- and its `vat_regime` — and both already live on `organization`. There is no
-- context table, no retrieval index, and no place a document, an amount or a
-- filing could be staged on its way into a prompt; `lib/assistant/system-
-- prompt.cs.ts` builds the prompt from those two columns and nothing else, and
-- `lib/assistant/system-prompt.test.ts` asserts it.
--
-- WHY THE TRANSCRIPT IS APPEND-ONLY. The Hleb gate on client exposure is
-- discharged by reviewing a real adversarial transcript (spec §2.8, PR 38). A
-- transcript that can be UPDATEd after the fact is not evidence of anything —
-- the same reasoning `activity_log_is_append_only` states in 0011, and it
-- reuses that migration's shape. DELETE stays available: deleting a chat, and
-- the organization delete of spec §2.10, both have to cascade.
--
-- Money precision is not a consideration here: no column in this migration
-- holds money. Token counts are `bigint` COUNTS.
--
-- NO `BEGIN;` / `COMMIT;` in this file — see the header of 0000_init.sql.

-- 1. Enums ---------------------------------------------------------------------

-- The two authors a transcript can have. There is deliberately no `system`
-- value: the system prompt is not a message the client wrote or the model
-- returned, it is a VERSIONED FILE in the source tree
-- (`lib/assistant/system-prompt.cs.ts`, stamped on the chat row below). Storing
-- it per row would make the effective prompt a database value nobody reviews,
-- and would put an un-diffable copy of it in every book.
CREATE TYPE beta_chat_role AS ENUM (
  'user',
  'assistant'
);

-- 2. chat ----------------------------------------------------------------------

CREATE TABLE chat (
  id               uuid         PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid         NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- The ONE person who can read this conversation. A chat is not org-shared:
  -- an admin and a member in the same book each see only their own list, and
  -- `lib/data/assistant.ts` filters on BOTH columns on every read. The column
  -- is here rather than only in the query because a conversation is a private
  -- artefact of one person's questions — an org-wide chat list would publish
  -- "what is the owner unsure about" to every colleague.
  user_id          uuid         NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  -- NULL until the client renames it. Deliberately NOT defaulted to "Nový chat":
  -- Czech UI strings live in `messages/cs.json`, never in a database column, and
  -- a NULL here is the honest "this one has no name yet" the list renders as the
  -- localized placeholder.
  title            text,
  -- The system-prompt file version in force when the conversation started
  -- (`ASSISTANT_SYSTEM_PROMPT_VERSION`). Recorded so a transcript reviewed at
  -- the exposure gate can be tied to the exact prompt text that produced it —
  -- a transcript whose prompt has since been edited proves nothing about the
  -- prompt shipping today.
  prompt_version   text         NOT NULL,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  -- The retention key (spec §2.8: "chats >12 months purged"). Bumped by the
  -- message-append path in the SAME transaction as the insert, and by a rename,
  -- so "last touched" is the fact the purge acts on rather than "first created"
  -- — a two-year-old conversation still in daily use is not stale.
  updated_at       timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT chat_title_shape
    CHECK (title IS NULL OR length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT chat_prompt_version_present
    CHECK (length(btrim(prompt_version)) BETWEEN 1 AND 64),
  -- The target of chat_message's composite tenancy-carrying FK below — same
  -- shape as asset_id_organization_unique in 0008.
  CONSTRAINT chat_id_organization_unique
    UNIQUE (id, organization_id)
);

-- The chat list: one person's conversations in one book, newest first.
CREATE INDEX chat_organization_user_idx
  ON chat (organization_id, user_id, updated_at DESC);
-- The retention sweep's own access path — it scans by age across all books.
CREATE INDEX chat_updated_at_idx ON chat (updated_at);

CREATE TRIGGER chat_touch_updated_at
  BEFORE UPDATE ON chat
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- A chat must never change books OR owners. `beta_freeze_organization_id`
-- (0005) covers only the first half, and the second half is the one that
-- matters here: re-pointing `user_id` would hand one person's private
-- conversation to another inside the same organization, which no scope check
-- above this table would ever see.
CREATE OR REPLACE FUNCTION beta_chat_freeze_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'chat.organization_id is immutable (row %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'chat.user_id is immutable (row %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_freeze_identity
  BEFORE UPDATE ON chat
  FOR EACH ROW EXECUTE FUNCTION beta_chat_freeze_identity();

-- 3. chat_message --------------------------------------------------------------

CREATE TABLE chat_message (
  id               uuid            PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  chat_id          uuid            NOT NULL,
  role             beta_chat_role  NOT NULL,
  content          text            NOT NULL,
  created_at       timestamptz     NOT NULL DEFAULT now(),

  -- A cap generous enough for a long answer and small enough that a single row
  -- cannot be used as a blob store. The INPUT side is capped far lower, in the
  -- route (`BETA_ASSISTANT_MAX_INPUT_CHARS`) — this is the floor under both.
  CONSTRAINT chat_message_content_shape
    CHECK (length(btrim(content)) BETWEEN 1 AND 100000),
  -- COMPOSITE, tenancy-carrying, CASCADE — the same shape as
  -- asset_event_asset_fk in 0008. A plain `REFERENCES chat(id)` would let a row
  -- name a chat in another book, and no RLS exists behind this seam to catch it.
  CONSTRAINT chat_message_chat_fk
    FOREIGN KEY (chat_id, organization_id)
    REFERENCES chat (id, organization_id)
    ON DELETE CASCADE
);

-- The transcript, in the order it was written. `id` is uuidv7, so the primary
-- key is already time-ordered and this index carries the chat partition.
CREATE INDEX chat_message_chat_idx ON chat_message (chat_id, id);
CREATE INDEX chat_message_organization_idx ON chat_message (organization_id);

-- Append-only, exactly as activity_log is (0011) and for the same reason: the
-- adversarial transcript reviewed at the exposure gate has to be the transcript
-- that happened. DELETE stays available so a deleted chat and a deleted
-- organization both cascade.
CREATE OR REPLACE FUNCTION beta_chat_message_is_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'chat_message is append-only (row %)', OLD.id
    USING ERRCODE = 'check_violation';
  RETURN NULL;
END;
$$;

CREATE TRIGGER chat_message_is_append_only
  BEFORE UPDATE ON chat_message
  FOR EACH ROW EXECUTE FUNCTION beta_chat_message_is_append_only();

-- 4. chat_usage ----------------------------------------------------------------
--
-- The ledger behind spec §2.8's budget controls (1), (2) and (3). ONE grain —
-- (organization, user, day) — serves all three, because the two questions the
-- guard asks are both derivable from it:
--
--   "has this person sent 50 messages today?"  -> the row for CURRENT_DATE
--   "has the install burned its monthly token
--    budget?"                                  -> SUM over date_trunc('month')
--
-- A second table at month grain would be a denormalization of this one that can
-- disagree with it, and the month sum is over a handful of rows per user in a
-- beta with a handful of clients.
--
-- WHY THE MONTHLY BUDGET IS INSTALL-WIDE AND NOT PER-ORG. The env control is a
-- single number (`BETA_ASSISTANT_MONTHLY_TOKEN_BUDGET`) and the thing it
-- protects is a single bill. Per-org ceilings would need per-org configuration
-- that spec §2.8 does not define, and would still not bound the total. The
-- consequence is stated honestly rather than hidden: one talkative book can
-- exhaust the month for the others, and the refusal message says the budget is
-- spent, not that the client did anything wrong.

CREATE TABLE chat_usage (
  organization_id  uuid     NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id          uuid     NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  -- Prague-local calendar day, computed by the application (`lib/assistant/
  -- config.ts`) rather than by `CURRENT_DATE`: the container runs in UTC, and a
  -- daily allowance that resets at 01:00 or 02:00 local time is a bug the office
  -- would report as "it forgot my limit an hour early".
  usage_date       date     NOT NULL,
  -- Counted PREFLIGHT, before the provider call — see `reserveAssistantTurn`.
  message_count    integer  NOT NULL DEFAULT 0,
  -- Counted POSTFLIGHT, from the provider's own usage report. Both stay 0 for a
  -- turn that was refused before it reached the provider, which is what makes
  -- "messages sent" and "tokens burned" independently readable.
  input_tokens     bigint   NOT NULL DEFAULT 0,
  output_tokens    bigint   NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- The ON CONFLICT target of both the preflight reservation and the postflight
  -- record. It is the PRIMARY KEY rather than a unique index so there is exactly
  -- one row per grain and no id column for a second row to hide behind.
  CONSTRAINT chat_usage_pkey PRIMARY KEY (organization_id, user_id, usage_date),
  CONSTRAINT chat_usage_counts_nonnegative
    CHECK (message_count >= 0 AND input_tokens >= 0 AND output_tokens >= 0)
);

-- The monthly SUM's access path. `usage_date` leads because the sum spans every
-- organization and every user for one month — the opposite of the chat list's
-- tenant-first shape.
CREATE INDEX chat_usage_date_idx ON chat_usage (usage_date);

CREATE TRIGGER chat_usage_touch_updated_at
  BEFORE UPDATE ON chat_usage
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- The ledger must never be re-attributed to another book. There is no
-- `chat_usage.id`, so the generic freeze trigger's message would name nothing
-- useful; the identity here IS the primary key, and Postgres will not let an
-- UPDATE move a row onto an occupied key anyway — this refuses the move
-- outright rather than letting it succeed onto a free one.
CREATE OR REPLACE FUNCTION beta_chat_usage_freeze_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.usage_date IS DISTINCT FROM OLD.usage_date THEN
    RAISE EXCEPTION 'chat_usage identity is immutable (% / % / %)',
      OLD.organization_id, OLD.user_id, OLD.usage_date
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_usage_freeze_identity
  BEFORE UPDATE ON chat_usage
  FOR EACH ROW EXECUTE FUNCTION beta_chat_usage_freeze_identity();

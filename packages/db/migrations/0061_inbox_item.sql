-- 0061_inbox_item.sql
--
-- inbox_item + inbox_id provenance — "Created by Agent" across the whole domain.
--
-- WHAT: a new WORKSPACE-scoped `inbox_item` table (one row per APPROVED gated
-- write) plus a bare `inbox_id` column on every domain table an approved write
-- lands into. Together they answer "which accounting rows did the agent
-- originate", filterable system-wide via `inbox_id IS NOT NULL`.
--
-- WHY workspace-scoped (mirrors inbox_attachment 0057 / ocr_extraction_template
-- 0047 / counterparty): an inbox item is pre-org intake context (kind, source,
-- counterparty, the agent's reasoning) that can be re-filed between the office's
-- companies; ADR-0029 "Brain learned state is workspace-scoped". FORCE RLS, four
-- command-specific policies keyed on `app.workspace_id`, plus UNIQUE(id,
-- workspace_id) so the org-tier tables that DO carry workspace_id can reference
-- it via a composite FK that is RLS-safe.
--
-- FK RULE (the cardinal constraint — see memory `postgres-fk-bypasses-rls`):
-- a Postgres FK check runs internal and SKIPS RLS, so a single-column FK from an
-- ORG-only table to this workspace-scoped table is a cross-workspace bypass hole.
-- Therefore:
--   * org-only landed tables (posting, individual_record, partial_record,
--     posting_double_entry_line, posting_monetary_line) get a BARE `inbox_id
--     uuid` with NO FK — the same precedent as
--     brain_confident_wrong.last_incident_tool_call_log_id.
--   * workspace-carrying landed tables (summary_record, accounting_event,
--     open_item) get `inbox_id uuid` + a COMPOSITE (inbox_id, workspace_id) FK to
--     inbox_item(id, workspace_id). MATCH SIMPLE: a human row (inbox_id NULL) is
--     not checked; an agent row is bound to the same workspace at the DB.
--
-- tool_call_log_id is a BARE uuid (NO FK): tool_call_log is org-scoped, so a
-- workspace->org FK would itself bypass RLS. inbox_attachment_id is a COMPOSITE
-- FK (both tables workspace-scoped, RLS-safe).
--
-- APPEND-ONLY: the landed tables are append-only (0035), so `inbox_id` is
-- stamped at INSERT inside the approve transaction — legacy rows stay NULL
-- (documented legacy-null policy), never backfilled via UPDATE.
--
-- Handwritten SQL (ADR-0009). One whole-file transaction; safe runner path.

BEGIN;

-- =============================================================================
-- 1. inbox_item
-- =============================================================================
CREATE TABLE inbox_item (
  id                   uuid        PRIMARY KEY DEFAULT uuidv7(),
  workspace_id         uuid        NOT NULL REFERENCES workspace (id),
  -- The gated write (tool_call_log row) this landed from. BARE uuid, NO FK:
  -- tool_call_log is org-scoped; a workspace->org FK would bypass RLS.
  tool_call_log_id     uuid        NOT NULL,
  -- Optional source blob (composite FK — both tables workspace-scoped, RLS-safe).
  inbox_attachment_id  uuid,
  -- The gated operation the write targeted (createAccountingEvent, …).
  kind                 text        NOT NULL,
  -- How it was received (e.g. 'agent'); free-form provenance note.
  source               text,
  -- Denormalized counterparty label for the inbox list (nullable).
  counterparty_name    text,
  -- The agent's rationale for the write, surfaced in the inbox inspector.
  reasoning            text,
  -- Actor that authored the underlying write (from tool_call_log.actor_kind).
  created_by           text        NOT NULL,
  -- Landed-fact lifecycle (NOT proposal lifecycle: rejected/pending never mint a
  -- row). APPLIED at mint; SUPERSEDED/REVERSED/CORRECTED reserved for a later
  -- storno/correction of a stamped fact.
  status               text        NOT NULL DEFAULT 'APPLIED',
  created_at           timestamptz NOT NULL DEFAULT now(),

  -- Composite-FK target for the workspace-carrying landed tables.
  CONSTRAINT inbox_item_id_workspace_unique UNIQUE (id, workspace_id),
  -- One inbox_item per approved held write (belt-and-suspenders against any
  -- future unguarded mint path; the approve tx already FOR UPDATE-locks the row).
  CONSTRAINT inbox_item_workspace_tool_call_unique UNIQUE (workspace_id, tool_call_log_id),
  CONSTRAINT inbox_item_status_valid
    CHECK (status IN ('APPLIED', 'SUPERSEDED', 'REVERSED', 'CORRECTED')),
  -- RLS-safe reference to the source blob (both workspace-scoped).
  CONSTRAINT inbox_item_attachment_fk
    FOREIGN KEY (inbox_attachment_id, workspace_id)
    REFERENCES inbox_attachment (id, workspace_id)
);

CREATE INDEX inbox_item_workspace_created_idx
  ON inbox_item (workspace_id, created_at DESC);

-- =============================================================================
-- 2. RLS — workspace-scoped, 4 command-specific policies (mirror 0057)
-- =============================================================================
ALTER TABLE inbox_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_item FORCE  ROW LEVEL SECURITY;

CREATE POLICY inbox_item_select ON inbox_item FOR SELECT
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY inbox_item_insert ON inbox_item FOR INSERT
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY inbox_item_update ON inbox_item FOR UPDATE
  USING      (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY inbox_item_delete ON inbox_item FOR DELETE
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON inbox_item TO app_user;
  END IF;
END
$$;

-- =============================================================================
-- 3. inbox_id on the org-only landed tables — BARE uuid, NO FK
-- =============================================================================
ALTER TABLE posting                   ADD COLUMN inbox_id uuid;
ALTER TABLE individual_record         ADD COLUMN inbox_id uuid;
ALTER TABLE partial_record            ADD COLUMN inbox_id uuid;
ALTER TABLE posting_double_entry_line ADD COLUMN inbox_id uuid;
ALTER TABLE posting_monetary_line     ADD COLUMN inbox_id uuid;

-- =============================================================================
-- 4. inbox_id on the workspace-carrying landed tables — COMPOSITE FK (RLS-safe)
-- =============================================================================
ALTER TABLE summary_record   ADD COLUMN inbox_id uuid;
ALTER TABLE accounting_event ADD COLUMN inbox_id uuid;
ALTER TABLE open_item        ADD COLUMN inbox_id uuid;

ALTER TABLE summary_record
  ADD CONSTRAINT summary_record_inbox_fk
  FOREIGN KEY (inbox_id, workspace_id)
  REFERENCES inbox_item (id, workspace_id);

ALTER TABLE accounting_event
  ADD CONSTRAINT accounting_event_inbox_fk
  FOREIGN KEY (inbox_id, workspace_id)
  REFERENCES inbox_item (id, workspace_id);

ALTER TABLE open_item
  ADD CONSTRAINT open_item_inbox_fk
  FOREIGN KEY (inbox_id, workspace_id)
  REFERENCES inbox_item (id, workspace_id);

COMMIT;

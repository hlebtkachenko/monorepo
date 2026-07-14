-- 0057_inbox_attachment.sql
--
-- inbox_attachment — the durable owner of an uploaded source-document blob.
--
-- The S3 document store (issue #518) owns the bucket + object tags + reaper;
-- this table owns the DB identity of a confirmed upload. It is deliberately
-- WORKSPACE-scoped, NOT organization-scoped: a received file precedes org
-- filing, and the same invoice blob can be re-filed between companies (orgs)
-- in the office WITHOUT re-uploading — the org-tier record (invoice) just
-- references this attachment; moving it between orgs never touches the blob.
-- This mirrors ocr_extraction_template (0047) / counterparty (0026/0035):
-- workspace-scoped, FORCE RLS, four command-specific policies keyed on
-- `app.workspace_id`, plus the composite UNIQUE(id, workspace_id) so an
-- org-tier table may later reference an attachment via
-- (inbox_attachment_id, workspace_id) and close the cross-workspace FK-bypass
-- hole (a plain single-column FK check skips RLS).
--
-- SAFETY CONTRACT (S3 reaper invariant, PLAN §3 / EXECUTE.md): a row here is
-- created ONLY after confirm has done `tagConfirmed` and gotten S3 200 — never
-- DB-first — so the reaper's "untagged > 24h → purge" branch can never reap a
-- blob that already has a DB row. `confirmed_at` is therefore NOT NULL. Soft
-- delete sets `deleted_at` (and the caller calls setDeletedTag); undo clears it
-- (clearDeletedTag). The reaper purges the S3 bytes 60 days after `deleted-at`.
--
-- See ADR-0029 "Brain learned state is workspace-scoped" and
-- .context/s3-document-store/PLAN.md §2, §7. Handwritten SQL (ADR-0009). One
-- whole-file transaction; runs through the safe runner path.

BEGIN;

-- =============================================================================
-- 1. Table
-- =============================================================================
CREATE TABLE inbox_attachment (
  id            uuid        PRIMARY KEY DEFAULT uuidv7(),
  workspace_id  uuid        NOT NULL REFERENCES workspace (id),
  -- Content-addressed S3 object key: documents/{workspace_id}/{sha256}.{ext}.
  storage_key   text        NOT NULL,
  -- Lowercase hex sha256 of the bytes — the content address, matches the key.
  sha256        text        NOT NULL,
  content_type  text        NOT NULL,
  size          bigint      NOT NULL,
  filename      text        NOT NULL,
  -- Set at row creation (confirm already succeeded). Never NULL — a row only
  -- exists for a confirmed, live-tagged blob.
  confirmed_at  timestamptz NOT NULL DEFAULT now(),
  -- Soft delete: reaper purges the S3 bytes 60 days later unless undone.
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Content-addressed dedup within a workspace: identical bytes = one
  -- attachment, referenced by many org records. Idempotent confirm/retry.
  CONSTRAINT inbox_attachment_workspace_sha256_unique UNIQUE (workspace_id, sha256),
  -- Composite-FK target for org-tier tables that reference an attachment via
  -- (inbox_attachment_id, workspace_id). Mirrors ocr_extraction_template.
  CONSTRAINT inbox_attachment_id_workspace_unique UNIQUE (id, workspace_id),
  -- sha256 is the content address — enforce its shape at the boundary.
  CONSTRAINT inbox_attachment_sha256_hex CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT inbox_attachment_size_positive CHECK (size > 0)
);

-- =============================================================================
-- 2. RLS — workspace-scoped, 4 command-specific policies (mirror 0047)
-- =============================================================================
-- Isolated to its workspace on every command. FORCE so even the table owner is
-- subject to the policy.
ALTER TABLE inbox_attachment ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_attachment FORCE  ROW LEVEL SECURITY;

CREATE POLICY inbox_attachment_select ON inbox_attachment FOR SELECT
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY inbox_attachment_insert ON inbox_attachment FOR INSERT
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY inbox_attachment_update ON inbox_attachment FOR UPDATE
  USING      (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY inbox_attachment_delete ON inbox_attachment FOR DELETE
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- =============================================================================
-- 3. app_user grant — mutable (full DML), same tier as ocr_extraction_template
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON inbox_attachment TO app_user;
  END IF;
END
$$;

COMMIT;

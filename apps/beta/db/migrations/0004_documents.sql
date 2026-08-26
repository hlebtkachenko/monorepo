-- Migration 0004: the document table (spec §2.2 Dokumenty, §4 data model).
--
-- The schema half of PR 10. Its other halves are `apps/beta/lib/storage/`
-- (the S3 seam: magic-byte sniffing, the 25 MiB stream cap, opaque keys) and
-- `apps/beta/app/api/orgs/[orgSlug]/documents/**` (the streamed routes).
--
-- WHAT LIVES IN A ROW AND WHAT LIVES IN S3. The bytes are in S3 under an
-- OPAQUE key; everything a human recognises — the original filename above all —
-- is in this table and nowhere else. That split is the point: an S3 key is
-- visible in a bucket listing, in a CloudTrail event and in an access log, so a
-- key derived from `Faktura Novák 03-2026.pdf` would leak a client's business
-- into three systems that have no business knowing it. `document_storage_key_shape`
-- below is the DB-level floor under that rule.
--
-- LOCK CLASS 4 (extends the total order declared in migration 0003).
--
--       1. app_user   2. organization   3. user_setup_token   4. document
--
-- The upload transaction (`lib/data/documents.ts`) takes `organization` with
-- `FOR NO KEY UPDATE` and then inserts into `document`, i.e. 2 → 4, which is
-- forward in that order. `FOR NO KEY UPDATE` rather than `FOR UPDATE` because
-- the lock exists to serialise the quota arithmetic, not to block the FK
-- references that other tables take on the same row.
--
-- Money: `numeric(14,2)` per spec §0.7 — beta's own precision, deliberately not
-- the monorepo's `numeric(19,4)`. Beta never computes; it displays what the
-- office typed. Do not "fix" this into a widening migration.

-- 1. Enums ---------------------------------------------------------------------

-- Spec §2.2: Přijato / Zpracovává se / Zpracováno / Vráceno. `returned` is
-- deliberately not called "rejected" — the document comes back for a fix, and
-- the label the client reads has to say that. A returned row must carry an
-- office_message (CHECK below): "vráceno" with no reason is a dead end for the
-- client.
CREATE TYPE beta_document_status AS ENUM (
  'received',
  'in_processing',
  'processed',
  'returned'
);

-- Spec §2.2 doc_type list, verbatim and in the spec's order.
--
-- `payslip` is in the enum from day one on purpose. Výplatnice (PR 31) stores
-- payslip PDFs as documents, and spec §2.2 requires that those rows be excluded
-- from EVERY Dokumenty view SERVER-SIDE — they are reachable only through Mzdy
-- under the payroll scope. Shipping the value now means PR 31 adds payroll
-- logic, not an ALTER TYPE plus a backfill of rows that were never labelled.
CREATE TYPE beta_document_type AS ENUM (
  'invoice_in',
  'invoice_out',
  'receipt',
  'bank_statement',
  'contract',
  'payroll',
  'attendance',
  'hr',
  'payslip',
  'other'
);

-- 2. Table ---------------------------------------------------------------------

CREATE TABLE document (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL
    REFERENCES organization (id) ON DELETE CASCADE,

  doc_type beta_document_type NOT NULL DEFAULT 'other',
  status beta_document_status NOT NULL DEFAULT 'received',

  -- As the uploader's filesystem spelled it, Czech diacritics included. Read
  -- back verbatim by the download route through RFC 5987 encoding, and never
  -- used to build a storage key, a path, or a shell argument.
  original_filename text NOT NULL,

  -- `org/<organization uuid>/<object uuid>.<ext>`. Both segments are UUIDs; the
  -- extension comes from the SNIFFED content type, never from the filename.
  storage_key text NOT NULL,

  -- Sniffed from the leading bytes at upload. The client's declared
  -- Content-Type is not stored and not consulted (`lib/storage/content-type.ts`).
  content_type text NOT NULL,
  extension varchar(8) NOT NULL,

  byte_size bigint NOT NULL,
  -- Hex sha256 of the stored bytes, computed while streaming. Feeds the
  -- duplicate soft-detect of spec §2.2.
  sha256 char(64) NOT NULL,

  -- Office-typed fields of the Dokumenty table (spec §2.2). Editing lives in
  -- Pro účetní › Zpracování (PR 14); nothing writes them in this PR.
  -- `partner_id` (protistrana) is deliberately absent: spec §4 assigns it to the
  -- partner PR (27), which introduces the table it references.
  document_date date,
  amount numeric(14, 2),
  -- Stavby grouping (spec §2.2). Free text until it earns a table.
  site_ref text,

  -- The two-layer note model of spec §4. `office_message` is written BY the
  -- office FOR the client and is part of every client projection;
  -- `internal_note` is the office's own layer and is never serialised to any
  -- tier below owner (`lib/data/projections.ts` forbids the column name).
  office_message text,
  internal_note text,

  -- The hidden class. An office-uploaded working file can exist on a client's
  -- book without being part of what the client sees; every read below owner
  -- filters on this.
  visible_to_client boolean NOT NULL DEFAULT true,

  -- Payslip groundwork (spec §4). Deliberately FK-less for now: the tables they
  -- point at do not exist yet — `payroll_employee` lands with PR 29 and
  -- `reporting_period` with PR 16, and each of those PRs adds its own
  -- `ALTER TABLE document ADD CONSTRAINT ... FOREIGN KEY`. The columns ship now
  -- so that PR 31's payslip exclusion is a WHERE clause rather than a migration
  -- over rows that were already uploaded.
  payslip_employee_id uuid,
  payslip_period_id uuid,

  -- SET NULL, not CASCADE: deleting the person who uploaded a document must not
  -- delete the document. Accounts are deactivated rather than deleted in this
  -- product, so this is the floor under an operator mistake.
  uploaded_by_user_id uuid REFERENCES app_user (id) ON DELETE SET NULL,

  -- Soft delete. A soft-deleted row is never listed, never served and never
  -- counted against the quota; the S3 object behind it is purged by the
  -- retention job of PR 37, not here.
  deleted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT document_filename_present
    CHECK (length(btrim(original_filename)) BETWEEN 1 AND 255),

  -- Both segments are UUIDs and the first one IS the owning organization. Two
  -- properties in one CHECK, both load-bearing:
  --
  --   * opacity — a key cannot carry a filename, a date or a partner name,
  --     because the only shapes that satisfy the regex are UUIDs;
  --   * containment — a row can never point at another organization's prefix,
  --     so the store's own prefix guard and this constraint would both have to
  --     be wrong for a cross-tenant read to be constructible.
  CONSTRAINT document_storage_key_shape CHECK (
    storage_key ~ '^org/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,8}$'
    AND storage_key LIKE 'org/' || organization_id::text || '/%'
  ),

  -- The allowlist, at the last possible layer. The route rejects anything else
  -- long before this fires; the constraint is what makes "only these four types
  -- are in the bucket" a property of the database rather than a property of the
  -- current version of one TypeScript module.
  CONSTRAINT document_content_type_allowed
    CHECK (content_type IN ('application/pdf', 'image/png', 'image/jpeg', 'image/heic')),
  CONSTRAINT document_extension_allowed
    CHECK (extension IN ('pdf', 'png', 'jpg', 'heic')),

  -- 25 MiB, the same number the upload stream aborts at.
  CONSTRAINT document_byte_size_range
    CHECK (byte_size > 0 AND byte_size <= 26214400),
  CONSTRAINT document_sha256_hex
    CHECK (sha256 ~ '^[0-9a-f]{64}$'),

  -- Spec §2.2: "Returned requires office_message."
  CONSTRAINT document_returned_requires_message
    CHECK (status <> 'returned' OR length(btrim(coalesce(office_message, ''))) > 0)
);

-- 3. Indexes -------------------------------------------------------------------

-- One object, one row. Also the floor under a compensating-delete bug: the same
-- key can never be claimed twice.
CREATE UNIQUE INDEX document_storage_key_unique ON document (storage_key);

-- Duplicate soft-detect (spec §2.2). PARTIAL on live rows: the office deleting a
-- document must not permanently blacklist those bytes for that client. Two
-- concurrent uploads of the same file are serialised by the organization row
-- lock the upload path takes, and this index is the floor under that.
CREATE UNIQUE INDEX document_organization_sha256_unique
  ON document (organization_id, sha256)
  WHERE deleted_at IS NULL;

-- The Dokumenty list, and the quota SUM.
CREATE INDEX document_organization_created_idx
  ON document (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- 4. Triggers ------------------------------------------------------------------

CREATE TRIGGER document_touch_updated_at
  BEFORE UPDATE ON document
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- Identity of a stored object is immutable.
--
-- The office edits a document's fields (status, office_message, amount, ...)
-- from Pro účetní, and that surface posts a row. If such a write could also
-- move `organization_id`, it would be a cross-tenant transfer expressed as a
-- typo; if it could move `storage_key` or `sha256`, the row would start
-- describing bytes it does not own and the duplicate index would be guarding a
-- value nobody can verify. None of the three has a legitimate UPDATE.
CREATE OR REPLACE FUNCTION beta_document_identity_is_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'document % cannot change organization', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.storage_key <> OLD.storage_key OR NEW.sha256 <> OLD.sha256 THEN
    RAISE EXCEPTION 'document % cannot change its stored object', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER document_identity_is_immutable
  BEFORE UPDATE ON document
  FOR EACH ROW EXECUTE FUNCTION beta_document_identity_is_immutable();

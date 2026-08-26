-- Migration 0010: the HEIC preview derivative (spec §2.2 / §0.4 fix F22).
--
-- WHY A DERIVATIVE EXISTS AT ALL. An iPhone photographs in HEIC, and HEIC is
-- the one type on beta's allowlist that NO non-Apple browser renders. Before
-- this migration the row sheet answered a HEIC upload with a sentence ("stáhněte
-- si ho") — correct, and useless to a client on Android who wants to check the
-- účtenka they photographed on site. So the server decodes the HEIC once, at
-- upload, and stores a downscaled JPEG NEXT TO the original. The original is
-- never touched: it is what the office downloads and what the archive keeps.
--
-- TWO COLUMNS, NOT A TABLE. A derivative is not an entity — it has no lifecycle
-- of its own, no independent visibility, no separate audit story. It is born
-- with its row, dies with its row, and is served only through the route that
-- already resolved that row's membership. A `document_derivative` table would
-- add a join and a second place to get the tenancy filter wrong.
--
-- WHY NOT DERIVE THE KEY FROM `storage_key` INSTEAD OF STORING ONE. A convention
-- (`<uuid>.heic` → `<uuid>.preview.jpg`) needs no column, and it costs an S3
-- round trip on every preview to answer a question the row could have answered:
-- "is there one?". A HEAD that 404s is also indistinguishable from a HEAD that
-- failed, so the UI could never decide between rendering an <img> and rendering
-- the download sentence. The column IS the answer.
--
-- LOCK CLASS: unchanged. This migration adds columns and rewrites one trigger
-- function; it takes no new locks and introduces no new ordering.

ALTER TABLE document
  -- `org/<organization uuid>/<object uuid>.jpg` — its own object, with its own
  -- randomly minted uuid. Deliberately NOT derived from `storage_key`: keys stay
  -- opaque (migration 0004), and a derived key would make one object's name a
  -- function of another's.
  ADD COLUMN preview_storage_key text,
  -- The derivative's own size, for the `content-length` of the response that
  -- serves it. Without it the file route would have to either omit the header or
  -- send the ORIGINAL's size next to the derivative's bytes, which is a lie a
  -- browser acts on.
  ADD COLUMN preview_byte_size bigint;

-- Both or neither. A key with no size would produce that lie; a size with no key
-- would describe an object nobody can open.
ALTER TABLE document
  ADD CONSTRAINT document_preview_pair_complete CHECK (
    (preview_storage_key IS NULL) = (preview_byte_size IS NULL)
  );

-- The same two properties migration 0004 enforces on `storage_key` — opacity
-- (only UUIDs satisfy the regex, so a filename cannot be smuggled into a key)
-- and containment (the first segment IS this row's own organization) — plus the
-- fixed `.jpg` extension: a derivative is a JPEG or it is not a derivative.
ALTER TABLE document
  ADD CONSTRAINT document_preview_storage_key_shape CHECK (
    preview_storage_key IS NULL
    OR (
      preview_storage_key ~ '^org/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
      AND preview_storage_key LIKE 'org/' || organization_id::text || '/%'
    )
  );

-- 25 MiB, the same ceiling `byte_size` carries. A derivative is downscaled and
-- will be orders of magnitude smaller; the constraint is the floor under a
-- generator that ever stops downscaling.
ALTER TABLE document
  ADD CONSTRAINT document_preview_byte_size_range CHECK (
    preview_byte_size IS NULL
    OR (preview_byte_size > 0 AND preview_byte_size <= 26214400)
  );

-- A derivative exists for exactly one reason: the stored type is one no browser
-- renders. Pinning the column to `image/heic` keeps "preview" from quietly
-- becoming "thumbnail for everything" — a PDF or a PNG that grew a second object
-- would double this book's storage for no surface that asked for it. A later
-- feature that wants thumbnails drops this constraint deliberately.
ALTER TABLE document
  ADD CONSTRAINT document_preview_only_for_heic CHECK (
    preview_storage_key IS NULL OR content_type = 'image/heic'
  );

-- The derivative is WRITE-ONCE, and clearable.
--
-- `storage_key` and `sha256` are immutable outright (migration 0004) because the
-- row is inserted already knowing them. The derivative is not: it is generated
-- after the transaction that inserted the row commits, so NULL → key must be a
-- legal UPDATE. What must never be legal is key → a DIFFERENT key: that would
-- orphan an object in the bucket with no row pointing at it, silently, on a
-- bucket nothing else sweeps until PR 37's retention job exists.
--
-- key → NULL stays legal, and is the one shape a purge needs: the retention job
-- deletes the object and clears the pointer in the same breath.
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

  IF OLD.preview_storage_key IS NOT NULL
     AND NEW.preview_storage_key IS NOT NULL
     AND NEW.preview_storage_key <> OLD.preview_storage_key THEN
    RAISE EXCEPTION 'document % cannot replace its preview derivative', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

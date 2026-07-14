-- 0057_open_item_origin_posting_unique.sql
--
-- Guard the saldokonto: one posting opens at most ONE open_item (obligation). The
-- booker now opens the pohledávka/závazek (openObligation) in the same tx that
-- posts the 311/321 counterparty leg — one event = one supply direction = one saldo
-- account = one obligation. A replayed approve or a duplicate open would otherwise
-- add a second row that can NEVER be cleaned up (open_item is append-only: UPDATE /
-- DELETE are revoked from app_user, migration 0035). This UNIQUE makes the invariant
-- structural at the DB, backing the booker's idempotency guard belt-and-suspenders.
--
-- Composite (origin_posting_id, organization_id): origin_posting_id already FK's to
-- posting (id, organization_id), so the org column is present and the pair is the
-- natural tenant-safe key. open_item currently has NO production writer (openItem had
-- zero callers before this change), so the table is empty in every environment — the
-- constraint adds cleanly with no backfill and no lock contention.
--
-- Mirrors: packages/db/src/schema/open_item.ts (open_item_origin_posting_unique).
-- Additive; idempotent via DROP CONSTRAINT IF EXISTS; one whole-file transaction.

BEGIN;

ALTER TABLE open_item
  DROP CONSTRAINT IF EXISTS open_item_origin_posting_unique;

ALTER TABLE open_item
  ADD CONSTRAINT open_item_origin_posting_unique
  UNIQUE (origin_posting_id, organization_id);

COMMIT;

-- 0058_counterparty_identity_unique.sql
--
-- Race-safe dedup for supplier→counterparty resolution. The derive booker now
-- resolves an invoice's supplier to a workspace-shared counterparty row
-- (resolveCounterparty, find-or-create by IČO → DIČ → name) so booking can open the
-- saldokonto obligation against the right partner. counterparty has NO uniqueness on
-- ico/tax_id today (only UNIQUE(id, workspace_id)), so two events for the SAME new
-- supplier resolved concurrently would both "miss → insert" → duplicate rows →
-- saldoPerPartner (GROUP BY counterparty_id) splits one vendor into two partners = a
-- statutory saldokonto error.
--
-- Partial unique indexes make dedup DB-authoritative (the resolver upserts with
-- ON CONFLICT against them). Mirrors the organization (workspace_id, ico) partial
-- unique from 0041. Scoped per workspace (counterparty is workspace-shared, ADR-0029).
--
--   (workspace_id, ico)     WHERE ico IS NOT NULL      -- CZ registration number (8 digits)
--   (workspace_id, tax_id)  WHERE tax_id IS NOT NULL    -- DIČ / EU VAT id (incl. country prefix)
--
-- IČO and DIČ are INDEPENDENT keys (an individual's DIČ is CZ+rodné číslo, not an
-- IČO), so both are constrained separately; a row may carry one, both, or neither
-- (a name-only foreign/individual party — those never conflict here).
--
-- Mirrors: packages/db/src/schema/counterparty.ts. Additive; idempotent via
-- CREATE UNIQUE INDEX IF NOT EXISTS; one whole-file transaction.

BEGIN;

-- Exclude the self-org identity row (self_of_organization_id) from the uniqueness:
-- it is OUR identity, never a supplier/customer, and resolveCounterparty already
-- excludes it from matching — so a supplier that happens to share the org's own IČO
-- must still be insertable (the index must not collide with the self row).
CREATE UNIQUE INDEX IF NOT EXISTS counterparty_workspace_ico_unique
  ON counterparty (workspace_id, ico)
  WHERE ico IS NOT NULL AND self_of_organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS counterparty_workspace_tax_id_unique
  ON counterparty (workspace_id, tax_id)
  WHERE tax_id IS NOT NULL AND self_of_organization_id IS NULL;

COMMIT;

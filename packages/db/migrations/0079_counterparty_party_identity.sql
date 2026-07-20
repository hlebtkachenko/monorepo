-- 0079_counterparty_party_identity.sql
--
-- adresar (Directories) M1 PR 1a — grow the workspace-shared counterparty from a
-- bare tax-identity row into a full PARTY IDENTITY record. The counterparty table
-- is the master data every module points a partner at; Directories owns its
-- identity surface (taxonomy, official + display names, legal form, data box,
-- registry-verification provenance, archive state). Roles (supplier/customer/…)
-- are derived elsewhere; only identity lives here.
--
-- Columns (all additive + nullable; existing rows keep working):
--   party_kind_code     — FK party_kind(code): LEGAL_ENTITY / SOLE_TRADER /
--                         NATURAL_PERSON / PUBLIC_AUTHORITY / NON_PROFIT (0078).
--   legal_name          — official registered name (obchodní firma / plné jméno).
--   display_name        — short UI label; falls back to name/legal_name.
--   legal_form_code     — FK legal_form(code) (s.r.o., a.s., OSVČ, spolek, …).
--   data_box_id         — ISDS datová schránka id (7 lowercase alphanumeric);
--                         NULL for parties without one (most foreign orgs /
--                         individuals). See identifier boundary below.
--   registration_status — ARES lifecycle label (active / dissolved / …); free
--                         text — it mirrors an external ARES vocabulary we do not
--                         control, so no enum. Populated by the M3 ARES PR.
--   verification_source — provenance of the last registry check; a small closed
--                         set guarded by CHECK (MANUAL / ARES / CRPDPH).
--   last_verified_at    — timestamp of the last successful registry verification.
--   archived_at         — soft-archive marker (NULL = active). Single lifecycle
--                         source of truth; "active" is derived (archived_at IS
--                         NULL) in the app, not a second stored column. Statutory
--                         history is preserved — archive/anonymise is never a hard
--                         delete.
--
-- DEDUP INVARIANT (decision B): `name` stays the resolveCounterparty dedup /
-- back-fill key. Every column here is a Directories OVERLAY that never feeds dedup
-- and is never back-filled by the booker — resolveCounterparty is untouched. Dedup
-- deliberately IGNORES lifecycle (identity is permanent; an archived party is still
-- matched by IČO/DIČ so a re-seen supplier never splits the saldokonto). The 0058
-- (workspace_id, ico) / (workspace_id, tax_id) partial-unique predicates must NEVER
-- be narrowed by archived_at/active — that would reopen the duplicate-IČO hole 0058
-- closed.
--
-- IDENTIFIER BOUNDARY (for 1b's party_identifier): the PRIMARY Czech identifiers —
-- IČO, DIČ, data_box_id — stay SCALAR on counterparty (IČO/DIČ must: they are the
-- indexed dedup keys). The later party_identifier child table holds only
-- SECONDARY / foreign identifiers (other-state VAT ids, foreign company numbers,
-- LEI). data_box_id does not move there.
--
-- Tenancy: counterparty is WORKSPACE-scoped (FORCE RLS, 4 command policies on
-- workspace_id — migration 0035). These are COLUMN additions; the row-level
-- policies already cover them, so no policy change and no RLS-bucket change. Both
-- FKs target no-RLS reference tables (party_kind, legal_form), so neither carries a
-- cross-tenant bypass hazard (the composite-FK rule is only for cross-TENANT FKs).
--
-- GDPR: 1a stores NO contact PII. party_kind_code='NATURAL_PERSON' + legal_name /
-- display_name (and a data_box_id for an OSVČ) are the SAME category and purpose as
-- the counterparty.name that 0040 already lawfully processes (Art. 6(1)(c) —
-- statutory accounting/tax record-keeping; not Art. 9 special category). The
-- natural-person PII gate binds before 1b (party_contact), not 1a.
--
-- Additive columns only; no backfill. Idempotent (re-runnable). Handwritten SQL
-- (ADR-0009); one whole-file transaction.

BEGIN;

ALTER TABLE counterparty
  ADD COLUMN IF NOT EXISTS party_kind_code     text REFERENCES party_kind (code),
  ADD COLUMN IF NOT EXISTS legal_name          text,
  ADD COLUMN IF NOT EXISTS display_name        text,
  ADD COLUMN IF NOT EXISTS legal_form_code     text REFERENCES legal_form (code),
  ADD COLUMN IF NOT EXISTS data_box_id         varchar(7),
  ADD COLUMN IF NOT EXISTS registration_status text,
  ADD COLUMN IF NOT EXISTS verification_source text,
  ADD COLUMN IF NOT EXISTS last_verified_at    timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at         timestamptz;

-- data_box_id is a 7-char ISDS id (canonical lowercase) when present; allow NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'counterparty_data_box_id_format'
  ) THEN
    ALTER TABLE counterparty
      ADD CONSTRAINT counterparty_data_box_id_format
      CHECK (data_box_id IS NULL OR data_box_id ~ '^[a-z0-9]{7}$');
  END IF;
END$$;

-- verification_source is a small closed set; a light CHECK keeps it clean.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'counterparty_verification_source_chk'
  ) THEN
    ALTER TABLE counterparty
      ADD CONSTRAINT counterparty_verification_source_chk
      CHECK (verification_source IS NULL
             OR verification_source IN ('MANUAL', 'ARES', 'CRPDPH'));
  END IF;
END$$;

COMMENT ON COLUMN counterparty.party_kind_code IS
  'FK party_kind(code): LEGAL_ENTITY/SOLE_TRADER/NATURAL_PERSON/PUBLIC_AUTHORITY/NON_PROFIT. Nullable overlay; not read by resolveCounterparty dedup.';
COMMENT ON COLUMN counterparty.legal_name IS
  'Official registered name (obchodní firma / plné jméno). Directories overlay; name stays the dedup key.';
COMMENT ON COLUMN counterparty.display_name IS
  'Short UI label; falls back to name/legal_name when NULL.';
COMMENT ON COLUMN counterparty.legal_form_code IS
  'FK legal_form(code): s.r.o. / a.s. / OSVČ / spolek / …';
COMMENT ON COLUMN counterparty.data_box_id IS
  'ISDS datová schránka id (7 lowercase alphanumeric); NULL when the party has none.';
COMMENT ON COLUMN counterparty.registration_status IS
  'ARES lifecycle label (active/dissolved/…). Free text (external ARES vocabulary). Populated by the M3 ARES PR.';
COMMENT ON COLUMN counterparty.verification_source IS
  'Provenance of the last registry check: MANUAL / ARES / CRPDPH (CHECK-constrained).';
COMMENT ON COLUMN counterparty.last_verified_at IS
  'Timestamp of the last successful registry (ARES/CRPDPH) verification.';
COMMENT ON COLUMN counterparty.archived_at IS
  'Soft-archive marker (NULL = active). Single lifecycle source of truth; statutory history preserved, never a hard delete.';

COMMIT;

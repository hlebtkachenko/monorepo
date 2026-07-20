-- 0084_party_kind.sql
--
-- party_kind — Directories party taxonomy (Adresář). What KIND of subject a
-- counterparty is: a company, an OSVČ, a private individual, a public authority,
-- or a non-profit. Modeled as a reference TABLE (not a pg enum) on purpose, per
-- the 2nd-Advisor review: the taxonomy is expected to grow (branch / organizační
-- složka, svěřenský fond, …) and a pg enum can only ever gain values, never
-- reorder or remove without a type swap + table rewrite. A seeded reference table
-- matches the repo's own precedent for this class of law-adjacent taxonomy
-- (legal_form, 0025) and lets the set be revised as data, not schema.
--
-- RESIDENCY is deliberately NOT a party_kind axis — foreign vs domestic is derived
-- from counterparty.country_code, so a "foreign public authority" keeps its
-- public-authority signal (which drives §108 reverse-charge / jurisdiction) instead
-- of collapsing into a single foreign_* value.
--
-- person_type ties each kind to the existing NATURAL / LEGAL enum (person_type,
-- 0025) so downstream VAT / reporting logic reads the FO/PO split off the taxonomy
-- rather than re-deriving it. Display names are NOT stored here — they are
-- localized via next-intl messages in the web layer (the reference-name i18n
-- mechanism, matching country / chart), so this table stays language-neutral.
--
-- Reference (system/law) table — shared across all tenants, NOT tenant-scoped, no
-- RLS (registered in the reference doc-list in rls.ts). Conventions (ADR-0009):
-- handwritten SQL, snake_case, full words only. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS party_kind (
  code        text        PRIMARY KEY,
  person_type person_type NOT NULL,
  CONSTRAINT party_kind_code_format CHECK (code ~ '^[A-Z_]+$')
);

INSERT INTO party_kind (code, person_type) VALUES
  ('LEGAL_ENTITY',     'LEGAL'),   -- právnická osoba (s.r.o., a.s., …)
  ('SOLE_TRADER',      'NATURAL'), -- fyzická osoba podnikatel (OSVČ)
  ('NATURAL_PERSON',   'NATURAL'), -- fyzická osoba (nepodnikající)
  ('PUBLIC_AUTHORITY', 'LEGAL'),   -- orgán veřejné moci
  ('NON_PROFIT',       'LEGAL')    -- nezisková organizace (spolek, nadace, ústav)
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- 0076_document_type.sql
--
-- Typy dokladů (document_type) — the org-scoped config taxonomy that every future
-- Doklady page and table reads: a doklad's Druh/type carries its default číselná
-- řada, default účtování, DPH routing, and payment defaults. Layers OVER the booked
-- summary_record_type enum (does NOT replace it): summary_record_type stays the
-- posting-lane discriminant, document_category is the config-facing bucket a type/
-- série lives under (a superset — CASH/BANK/SET_OFF/OTHER_*/TAX_APPLICATION have no
-- posting-lane twin).
--
-- Also tags number_series with its document_category so Dokladové řady can list
-- séries per category (nullable — EVENT / ASSET / INVENTORY_COUNT séries stay NULL).
--
-- Org-scoped (FORCE RLS + organization_isolation). Composite (fk, organization_id)
-- FKs — FK bypasses RLS (postgres-fk-bypasses-rls). Handwritten SQL (ADR-0009).
-- ADD-only + idempotent (re-runnable). One whole-file transaction.

BEGIN;

-- 1. Enums ---------------------------------------------------------------------
-- document_category: the 9 config-facing buckets a doklad type / série lives under.
DO $$ BEGIN
  CREATE TYPE document_category AS ENUM (
    'RECEIVED_INVOICE',   -- přijaté faktury
    'ISSUED_INVOICE',     -- vydané faktury
    'CASH',               -- pokladní doklady
    'BANK',               -- bankovní doklady
    'INTERNAL',           -- interní doklady
    'SET_OFF',            -- zápočty
    'OTHER_RECEIVABLE',   -- ostatní pohledávky
    'OTHER_PAYABLE',      -- ostatní závazky
    'TAX_APPLICATION'     -- uplatnění daně - závazky
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- document_kind: the per-category Druh. One flat enum; which kinds are valid for a
-- given category is enforced in the app (DOCUMENT_KINDS_BY_CATEGORY), not the DB —
-- new categories gain their kinds as their page lands without an ALTER TYPE.
DO $$ BEGIN
  CREATE TYPE document_kind AS ENUM (
    'STANDARD',           -- řádný daňový doklad
    'CREDIT_NOTE',        -- dobropis / opravný daňový doklad
    'ADVANCE',            -- záloha (zálohová faktura)
    'ADVANCE_TAX_DOC',    -- daňový doklad k přijaté platbě (§37a)
    'DELIVERY_NOTE',      -- dodací list
    'PROFORMA',           -- proforma
    'GENERAL',            -- obecný interní doklad
    'FX_GAIN',            -- kurzový zisk
    'FX_LOSS',            -- kurzová ztráta
    'REMAINDER_COST',     -- zaokrouhlení náklad
    'REMAINDER_REVENUE'   -- zaokrouhlení výnos
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. number_series gains its config-facing category + Dokladová-řada metadata ----
-- category buckets a DOCUMENT série under a config category; name/note/description
-- + valid-year range are the Dokladová řada editor's Identity + Platnost fields
-- (all NULL for EVENT / ASSET / INVENTORY_COUNT séries, which have no editor).
ALTER TABLE number_series
  ADD COLUMN IF NOT EXISTS category        document_category,  -- NULL for non-DOCUMENT séries
  ADD COLUMN IF NOT EXISTS name            text,               -- Název
  ADD COLUMN IF NOT EXISTS note            text,               -- Poznámka
  ADD COLUMN IF NOT EXISTS description     text,               -- Popis
  ADD COLUMN IF NOT EXISTS valid_from_year integer,            -- Platí od roku
  ADD COLUMN IF NOT EXISTS valid_to_year   integer;            -- Platí do roku

ALTER TABLE number_series
  DROP CONSTRAINT IF EXISTS number_series_valid_year_range_chk;
ALTER TABLE number_series
  ADD  CONSTRAINT number_series_valid_year_range_chk CHECK (
    valid_from_year IS NULL OR valid_to_year IS NULL OR valid_to_year >= valid_from_year
  );

-- The config category is a DOCUMENT-série concept: an EVENT / ASSET /
-- INVENTORY_COUNT série must never carry one (it has no Dokladová řada editor).
ALTER TABLE number_series
  DROP CONSTRAINT IF EXISTS number_series_category_document_chk;
ALTER TABLE number_series
  ADD  CONSTRAINT number_series_category_document_chk CHECK (
    category IS NULL OR entity_type = 'DOCUMENT'
  );

-- Backfill the category onto the canonical default DOCUMENT séries that predate
-- this migration (mirrors DEFAULT_NUMBER_SERIES in @workspace/accounting; a série
-- with a custom code stays NULL and is categorized later via the Dokladové řady
-- editor). Idempotent: the `category IS NULL` guard makes a re-run a no-op.
UPDATE number_series
   SET category = CASE code
                    WHEN 'FV' THEN 'ISSUED_INVOICE'
                    WHEN 'FP' THEN 'RECEIVED_INVOICE'
                    WHEN 'PD' THEN 'CASH'
                    WHEN 'BV' THEN 'BANK'
                    WHEN 'ID' THEN 'INTERNAL'
                  END::document_category
 WHERE entity_type = 'DOCUMENT'
   AND category IS NULL
   AND code IN ('FV', 'FP', 'PD', 'BV', 'ID');

-- 3. document_type -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_type (
  id                   uuid              PRIMARY KEY DEFAULT uuidv7(),
  organization_id      uuid              NOT NULL,
  category             document_category NOT NULL,             -- config bucket
  code                 text              NOT NULL,             -- Zkratka (e.g. 'FAKTURA')
  name                 text              NOT NULL,             -- Název
  kind                 document_kind,                          -- Druh (validated per category in app)
  default_series_id    uuid,                                   -- default Dokladová řada
  is_primary           boolean           NOT NULL DEFAULT false, -- Primární typ dokladu (≤1 per category, app-enforced)
  is_active            boolean           NOT NULL DEFAULT true,   -- Aktivní
  -- Účtování defaults
  default_account      text,             -- default účet (e.g. '321001')
  posting_prescription text,             -- předpis zaúčtování (reference)
  cost_centre          text,             -- středisko
  activity             text,             -- činnost
  -- Úhrada defaults
  bank_account         text,             -- bankovní účet
  payment_form         text,             -- forma úhrady
  due_days             integer,          -- splatnost [dny]
  -- DPH routing
  vat_country          text,             -- stát DPH (ISO 3166-1 alpha-2)
  kh_section           text,             -- řádek kontrolního hlášení
  description          text,             -- Popis
  -- Platnost (Účetní rok range)
  valid_from_year      integer,          -- Platí od roku
  valid_to_year        integer,          -- Platí do roku
  external_source_id   text,             -- import provenance (e.g. ABRA id)
  created_at           timestamptz       NOT NULL DEFAULT now(),
  updated_at           timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT document_type_series_fk FOREIGN KEY (default_series_id, organization_id)
    REFERENCES number_series (id, organization_id),
  CONSTRAINT document_type_id_org_unique       UNIQUE (id, organization_id),
  CONSTRAINT document_type_org_cat_code_unique UNIQUE (organization_id, category, code),
  CONSTRAINT document_type_due_days_chk        CHECK (due_days IS NULL OR due_days >= 0),
  CONSTRAINT document_type_year_range_chk      CHECK (
    valid_from_year IS NULL OR valid_to_year IS NULL OR valid_to_year >= valid_from_year
  )
);

ALTER TABLE document_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_type FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_isolation ON document_type;
CREATE POLICY organization_isolation ON document_type
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON document_type TO app_user;

-- No separate (organization_id, category) index: the document_type_org_cat_code_unique
-- constraint's backing btree already serves the per-category list read as a
-- leading-column prefix.

COMMIT;

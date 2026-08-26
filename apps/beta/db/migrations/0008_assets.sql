-- Migration 0008: Majetek — the asset register and its event history.
--
-- Scope (spec `.context/beta-afframe/40-beta-structure.md` §2.7 Majetek, §4
-- data model). Depth map: "SHALLOW (table + stamp suffices)" — this migration
-- is deliberately smaller than 0004/0005: two tables, no read-model tables, no
-- period linkage (an asset is not stamped to a reporting_period; its own
-- freshness stamp is `depreciation_as_of`, office-typed and column-local).
--
--   asset        one row per fixed asset the office tracks (Přehled majetku)
--   asset_event  its Zařazení / TZ / Vyřazení history (Karta majetku)
--
-- WHAT THIS FILE DOES NOT DO. It stores no COMPUTED depreciation number.
-- `accumulated_depreciation` is office-typed (or agent-fed later), never
-- derived from a depreciation schedule, and it always travels with
-- `depreciation_as_of` — the office's own as-of date, never "today" (spec
-- §0.4 / Advisor F15: no interpolation). The one arithmetic this product
-- performs on these two numbers — zůstatková cena = acquisition_cost −
-- accumulated_depreciation — is presentation-level SQL over already-provided
-- rows, explicitly allowed by spec §0.2 ("cost − oprávky ... allowed"), and it
-- lives in `lib/data/assets.ts` at read time. No column here stores it.
--
-- Money precision is `numeric(14,2)` (spec §0.7), same as every other beta
-- table. Do not "fix" it to the main app's `numeric(19,4)`.
--
-- NO `BEGIN;` / `COMMIT;` in this file — see the header of 0000_init.sql.

-- 1. Enums ---------------------------------------------------------------------

-- Spec §2.7 Přehled majetku column, spelled in English like `beta_document_type`
-- — a classification this application invented, not a legal document name.
-- Czech display labels live in `messages/cs.json`.
CREATE TYPE beta_asset_category AS ENUM (
  'machine',
  'vehicle',
  'tool',
  'real_estate',
  'other'
);

-- Spec §2.7, verbatim: "status in_use|disposed".
CREATE TYPE beta_asset_status AS ENUM (
  'in_use',
  'disposed'
);

-- Spec §2.7 Karta majetku event history: "Zařazení/TZ/Vyřazení: datum, částka,
-- poznámka".
CREATE TYPE beta_asset_event_kind AS ENUM (
  'put_into_service',
  'improvement',
  'disposal'
);

-- 2. asset -----------------------------------------------------------------

CREATE TABLE asset (
  id               uuid                 PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid                 NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name             text                 NOT NULL,
  category         beta_asset_category  NOT NULL,
  -- Drobný majetek. Spec §2.7: "is_minor rows without depreciation fields
  -- (40k účetní policy vs 80k daňový threshold never conflated)" — enforced by
  -- asset_minor_has_no_depreciation below, not left to the UI to honour.
  is_minor         boolean              NOT NULL DEFAULT false,
  -- Pořizovací cena. numeric(14,2) per spec §0.7, read as a string.
  acquisition_cost numeric(14,2)        NOT NULL,
  -- Datum pořízení. Distinct from placed_in_service_on: an asset can be bought
  -- before it is put into service.
  acquired_on           date,
  -- Zařazeno — the Přehled majetku column of the same name.
  placed_in_service_on  date,
  -- Office-provided oprávky. NEVER computed here — see the file header.
  accumulated_depreciation numeric(14,2),
  -- The office's own as-of date for accumulated_depreciation. Paired with it by
  -- asset_depreciation_stamp_coherence below: one without the other is a number
  -- nobody can date, which is the exact "k dnešnímu dni" trap spec §0.4 forbids.
  depreciation_as_of       date,
  -- Daňová zůstatková, shown collapsed on the Karta (spec §2.7). A second,
  -- independent office-typed figure — not derived from acquisition_cost or
  -- accumulated_depreciation.
  tax_residual_value       numeric(14,2),
  -- Stavby grouping (spec §2.2 pattern, mirrored on document.site_ref). Free
  -- text until it earns a table.
  site_ref         text,
  status           beta_asset_status    NOT NULL DEFAULT 'in_use',
  disposed_on      date,
  -- Client-visible note. Rendered on the Karta.
  note_client      text,
  -- Office-internal note, mirrored from filing.note_internal / document's
  -- internal_note. NEVER serialized to a client — `note_internal` is already on
  -- `CLIENT_FORBIDDEN_COLUMNS` (lib/data/projections.ts), so this spelling is
  -- caught by the same check without a new entry.
  note_internal    text,
  created_at       timestamptz          NOT NULL DEFAULT now(),
  -- The freshness stamp of the ROW itself (office's last edit) — distinct from
  -- depreciation_as_of, which stamps only the oprávky figure.
  updated_at       timestamptz          NOT NULL DEFAULT now(),

  CONSTRAINT asset_name_present
    CHECK (length(btrim(name)) BETWEEN 1 AND 255),
  CONSTRAINT asset_acquisition_cost_nonnegative
    CHECK (acquisition_cost >= 0),
  -- `disposed` means a disposal date is on record, and no other status carries
  -- one — the same coherence shape as filing_filed_coherence in 0005.
  CONSTRAINT asset_dispose_coherence
    CHECK ((status = 'disposed') = (disposed_on IS NOT NULL)),
  -- Both-or-neither: an oprávky figure with no date it is AS OF is not a fact
  -- anyone can check, and a date with no figure is noise.
  CONSTRAINT asset_depreciation_stamp_coherence
    CHECK ((accumulated_depreciation IS NULL) = (depreciation_as_of IS NULL)),
  -- Spec §2.7: drobný majetek carries no depreciation fields at all.
  CONSTRAINT asset_minor_has_no_depreciation
    CHECK (
      NOT is_minor
      OR (accumulated_depreciation IS NULL AND depreciation_as_of IS NULL)
    ),
  -- The target of asset_event's composite tenancy-carrying FK below — same
  -- shape as reporting_period_id_organization_unique /
  -- document_id_organization_unique in 0005 / 0004.
  CONSTRAINT asset_id_organization_unique
    UNIQUE (id, organization_id)
);

CREATE INDEX asset_organization_status_idx ON asset (organization_id, status);
-- The Přehled majetku default listing order.
CREATE INDEX asset_organization_name_idx   ON asset (organization_id, name);

CREATE TRIGGER asset_touch_updated_at
  BEFORE UPDATE ON asset
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- Reuses the generic guard 0005 defined for filing — an asset must never
-- change books, and there is no RLS behind this seam to catch it otherwise.
CREATE TRIGGER asset_freeze_organization_id
  BEFORE UPDATE ON asset
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();

-- 3. asset_event -------------------------------------------------------------
--
-- The Karta majetku event history (spec §2.7: "Zařazení/TZ/Vyřazení: datum,
-- částka, poznámka"). One row per event; no coherence with `asset.status` /
-- `asset.disposed_on` is enforced here — spec §0.2 keeps every write a plain
-- office-typed fact, and the two are entered independently through their own
-- forms, exactly as filing.status and filing.filed_on are.

CREATE TABLE asset_event (
  id               uuid                    PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid                    NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  asset_id         uuid                    NOT NULL,
  kind             beta_asset_event_kind   NOT NULL,
  event_date       date                    NOT NULL,
  -- Office-typed, nullable: not every event carries an amount the office has
  -- stated yet (spec §0.4 — NULL is "not stated", never zero).
  amount           numeric(14,2),
  note             text,
  created_at       timestamptz             NOT NULL DEFAULT now(),
  updated_at       timestamptz             NOT NULL DEFAULT now(),

  -- COMPOSITE, tenancy-carrying, CASCADE — the same shape as filing_period_fk
  -- in 0005, with CASCADE rather than RESTRICT because an event's only reason
  -- to exist is the asset it belongs to (unlike a filing's attachment, which is
  -- a reference to something with its own independent lifecycle).
  CONSTRAINT asset_event_asset_fk
    FOREIGN KEY (asset_id, organization_id)
    REFERENCES asset (id, organization_id)
    ON DELETE CASCADE
);

CREATE INDEX asset_event_asset_idx         ON asset_event (asset_id, event_date DESC);
CREATE INDEX asset_event_organization_idx  ON asset_event (organization_id);

CREATE TRIGGER asset_event_touch_updated_at
  BEFORE UPDATE ON asset_event
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

CREATE TRIGGER asset_event_freeze_organization_id
  BEFORE UPDATE ON asset_event
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();

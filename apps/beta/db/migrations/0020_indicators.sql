-- Migration 0020: organization_indicator — the office-stated figures that are
-- not a line of any statement, and today that is exactly one: obrat.
--
-- WHY THIS TABLE EXISTS AT ALL. Přehled's Obrat watch (spec §2.1 item 4) is the
-- one surface in beta that is DISPLAYED with no feeder behind it: `lib/turnover.ts`
-- names two possible sources and marks both unconnected, and `load-prehled.ts`
-- returns `turnover: null` with a comment predicting that "exactly this line
-- changes" when one lands. This migration is that feeder.
--
-- Obrat for DPH purposes is 12 consecutive months of taxable supplies with place
-- of plnění in tuzemsko. It is NOT derivable from any row this database holds
-- (§0.2: "the portal never derives an accounting fact"), and it is the worst
-- possible figure to approximate, because it decides whether a company has a
-- registration duty. So it is STATED — by the office, by hand or through the
-- agent API — and it is stated WITH the date it is as of (§0.4).
--
-- NARROW ON PURPOSE. Spec §4 sketches an `indicator_definition` +
-- `indicator_value` pair — a general indicator system. Exactly one indicator is
-- displayed anywhere in beta, and a definitions table holding one definition is
-- the placeholder §0.3 forbids. One table, one enum, one live value; widening
-- later costs a migration, and so would the definitions pair.
--
-- WHAT THIS FILE DOES NOT DO. It computes nothing and rolls nothing forward. A
-- reading is true as of `as_of` and stays that way; the office restates it with
-- a new `as_of` when the rolling window moves. There is no "current obrat"
-- column anywhere, because that would be the "k dnešnímu dni" trap §0.4 forbids
-- — the same rule `loan.balance_as_of` and `asset.depreciation_as_of` follow.
--
-- Money precision is `numeric(14,2)` (spec §0.7), same as every other beta
-- table. Do not "fix" it to the main app's `numeric(19,4)`.
--
-- NO `BEGIN;` / `COMMIT;` in this file — see the header of 0000_init.sql.

-- 1. Enum ----------------------------------------------------------------------

-- ONE VALUE, and that is a fact about the product rather than a stub. `obrat`
-- is the only figure §2.1 asks the office to state outside a statement or an
-- import; a second value is added the day a second such figure is displayed,
-- and not before (§0.3).
--
-- Spelled in English like `beta_asset_category` and `beta_loan_kind` — the
-- Czech display label lives in `messages/cs.json`.
CREATE TYPE beta_indicator_kind AS ENUM (
  'annual_turnover'
);

-- 2. organization_indicator ----------------------------------------------------

CREATE TABLE organization_indicator (
  id              uuid                PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid                NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind            beta_indicator_kind NOT NULL,
  -- NOT NULL: an indicator row exists to state a figure. A row with no figure
  -- is not "the office has not told us yet" — that state is the ABSENCE of a
  -- row, which is what Obrat watch already renders honestly today.
  amount          numeric(14,2)       NOT NULL,
  -- The date the figure is stated as of, NOT NULL for the reason the file
  -- header gives: an obrat with no date is not a fact anyone can check, and the
  -- card prints the date next to the money.
  as_of           date                NOT NULL,
  -- Office-internal note (which 12 months the window covers, which export it
  -- came off). NEVER serialized to a client — `note_internal` is already on
  -- `CLIENT_FORBIDDEN_COLUMNS` (lib/data/projections.ts), so this spelling is
  -- caught by the same check without a new entry.
  note_internal   text,
  created_at      timestamptz         NOT NULL DEFAULT now(),
  updated_at      timestamptz         NOT NULL DEFAULT now(),

  -- Obrat is a sum of taxable supplies and cannot be negative. The constraint is
  -- stated for the kinds this enum has TODAY; a future kind that can legitimately
  -- go negative arrives with the migration that adds it.
  CONSTRAINT organization_indicator_amount_nonnegative
    CHECK (amount >= 0)
);

-- ONE READING PER KIND PER DATE, and it is also the upsert key both writers
-- match on: the office re-stating 30. 6. 2026 corrects that reading rather than
-- adding a second, contradictory one next to it. Without this, two figures for
-- one date would both be "the latest" depending on insertion order, and the
-- card would show whichever won a race.
--
-- Doubles as the index behind `latestIndicator` — (organization_id, kind, as_of)
-- is exactly the prefix that read scans backwards.
CREATE UNIQUE INDEX organization_indicator_kind_as_of_idx
  ON organization_indicator (organization_id, kind, as_of);

CREATE TRIGGER organization_indicator_touch_updated_at
  BEFORE UPDATE ON organization_indicator
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- Reuses the generic guard 0005 defined for filing — a stated figure must never
-- change books, and there is no RLS behind this seam to catch it otherwise.
CREATE TRIGGER organization_indicator_freeze_organization_id
  BEFORE UPDATE ON organization_indicator
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();

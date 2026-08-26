-- Migration 0017: Úvěry a leasingy — the loan register behind Finance's fifth
-- sidebar leaf.
--
-- Scope (spec `.context/beta-afframe/40-beta-structure.md` §2.4 "Úvěry a
-- leasingy — manual, rarely changes: instituce, typ (úvěr/leasing/kontokorent),
-- jistina, zůstatek k datu, splátka + frekvence, úrok, konec", §4 data model
-- `loan`). Depth map: "SHALLOW (table + stamp suffices)" — ONE table, no event
-- history, no period linkage, no read-model table.
--
--   loan  one row per credit facility the office tracks for a book
--
-- MANUAL, NOT IMPORTED. Every other Finance leaf is fed by the office agent's
-- dataset publish (§3.2 lists filings, liabilities, client tasks, assets,
-- account_balance_map, partners, indicators — loans are deliberately NOT among
-- them). A loan schedule lives in a contract, not in Money S3, so there is no
-- `import_batch_id` here and no `external_ref` upsert key either: an unwritable
-- column is a promise this product has not made.
--
-- WHAT THIS FILE DOES NOT DO. It stores no amortization schedule and computes
-- no remaining balance. `balance` is office-typed and it ALWAYS travels with
-- `balance_as_of` (`loan_balance_stamp_coherence` below) — the spec's own words
-- are "zůstatek k datu", and a zůstatek with no date it is AS OF is the exact
-- "k dnešnímu dni" trap §0.4 forbids, the same one `asset.depreciation_as_of`
-- exists to prevent in 0008. This database never rolls a balance forward by the
-- installments that have fallen due since; the office restates it.
--
-- Money precision is `numeric(14,2)` (spec §0.7), same as every other beta
-- table. Do not "fix" it to the main app's `numeric(19,4)`. `interest_rate_pct`
-- is NOT money and is not stored as such — it is a rate in percent, kept at
-- `numeric(6,3)` so 4,125 % survives verbatim.
--
-- NO `BEGIN;` / `COMMIT;` in this file — see the header of 0000_init.sql.

-- 1. Enums ---------------------------------------------------------------------

-- Spec §2.4, verbatim: "typ (úvěr/leasing/kontokorent)". Spelled in English
-- like `beta_asset_category` — these are ordinary product categories, not named
-- legal instruments the way `beta_payroll_contract_type`'s hpp/dpc/dpp are.
-- Czech display labels live in `messages/cs.json`.
CREATE TYPE beta_loan_kind AS ENUM (
  'loan',
  'lease',
  'overdraft'
);

-- Spec §2.4: "splátka + frekvence". A CLOSED list of the four frequencies a
-- Czech splátkový kalendář actually uses; anything else the office meets is
-- recorded as the installment it really pays on the period it really pays it,
-- never approximated into a neighbouring frequency.
CREATE TYPE beta_loan_installment_period AS ENUM (
  'monthly',
  'quarterly',
  'semiannual',
  'annual'
);

-- 2. loan ----------------------------------------------------------------------

CREATE TABLE loan (
  id                 uuid            PRIMARY KEY DEFAULT uuidv7(),
  organization_id    uuid            NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  -- Instituce — the bank or leasing company. Free text: a registry of Czech
  -- lenders is a table nobody asked for, and the office types what the contract
  -- says.
  institution        text            NOT NULL,
  loan_kind          beta_loan_kind  NOT NULL,
  -- Jistina — the contracted principal. NOT NULL: a credit facility whose
  -- amount nobody has stated is not a fact worth a row.
  principal          numeric(14,2)   NOT NULL,
  -- Zůstatek. Office-typed, NEVER derived — see the file header. Paired with
  -- `balance_as_of` by loan_balance_stamp_coherence below.
  balance            numeric(14,2),
  -- The office's own as-of date for `balance`. Never "today" (spec §0.4).
  balance_as_of      date,
  -- Splátka. NULL is "not stated", never zero (§0.4) — and a kontokorent
  -- genuinely has no fixed installment, which is why this is nullable rather
  -- than defaulted.
  installment        numeric(14,2),
  installment_period beta_loan_installment_period,
  -- Úrok, in percent (4.125 means 4,125 %). Nullable: a leasing contract is
  -- often quoted as a total overpayment rather than a rate, and inventing one
  -- would be arithmetic this product does not do.
  interest_rate_pct  numeric(6,3),
  -- Konec. Nullable — a kontokorent is typically open-ended.
  ends_on            date,
  -- Client-visible note, rendered in the portal.
  note_client        text,
  -- Office-internal note. NEVER serialized to a client — `note_internal` is
  -- already on `CLIENT_FORBIDDEN_COLUMNS` (lib/data/projections.ts), so this
  -- spelling is caught by the same check without a new entry.
  note_internal      text,
  created_at         timestamptz     NOT NULL DEFAULT now(),
  -- The freshness stamp of the ROW itself (the office's last edit) — distinct
  -- from `balance_as_of`, which stamps only the zůstatek figure.
  updated_at         timestamptz     NOT NULL DEFAULT now(),

  CONSTRAINT loan_institution_present
    CHECK (length(btrim(institution)) BETWEEN 1 AND 255),
  CONSTRAINT loan_principal_nonnegative
    CHECK (principal >= 0),
  CONSTRAINT loan_balance_nonnegative
    CHECK (balance IS NULL OR balance >= 0),
  -- Both-or-neither: a zůstatek with no date it is AS OF is not a fact anyone
  -- can check, and a date with no figure is noise. The twin of
  -- `asset_depreciation_stamp_coherence` in 0008.
  CONSTRAINT loan_balance_stamp_coherence
    CHECK ((balance IS NULL) = (balance_as_of IS NULL)),
  -- Both-or-neither again, for the same reason spec §2.4 names the pair in one
  -- breath ("splátka + frekvence"): an amount with no frequency cannot be read,
  -- and a frequency with no amount says nothing.
  CONSTRAINT loan_installment_coherence
    CHECK ((installment IS NULL) = (installment_period IS NULL)),
  CONSTRAINT loan_installment_positive
    CHECK (installment IS NULL OR installment > 0),
  -- A percent, not a fraction: 4.125 is 4,125 %, and 0.04 would be four
  -- thousandths of a percent. The upper bound is the guard that catches a
  -- fraction typed as a rate only when it is absurd; the real defence is the
  -- label on the form.
  CONSTRAINT loan_interest_rate_range
    CHECK (
      interest_rate_pct IS NULL
      OR (interest_rate_pct >= 0 AND interest_rate_pct <= 100)
    )
);

-- The Úvěry a leasingy default listing order.
CREATE INDEX loan_organization_institution_idx
  ON loan (organization_id, institution);

CREATE TRIGGER loan_touch_updated_at
  BEFORE UPDATE ON loan
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- Reuses the generic guard 0005 defined for filing — a loan must never change
-- books, and there is no RLS behind this seam to catch it otherwise.
CREATE TRIGGER loan_freeze_organization_id
  BEFORE UPDATE ON loan
  FOR EACH ROW EXECUTE FUNCTION beta_freeze_organization_id();

-- 0025_accounting_enums_reference.sql
--
-- v2 accounting — all enums + reference/law table structure (no rows)
--
-- Source: docs/specs/accounting-schema.sql (PG18-validated v2 design, #395 tip 0ea2bf31).
-- All enum types hoisted here. Reference tables hold the law (regime/legal_form/size/vat/currency/NACE/account_group/directive_account/depreciation_group); structure only — seeds land in 0025.
-- Handwritten SQL (ADR-0009). One whole-file transaction; runs through the safe runner path.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;  -- vat_status EXCLUDE (also loaded in 0001; idempotent)

-- ENUMS (all of them — kept in this first file so later migrations never ALTER TYPE ADD VALUE)
CREATE TYPE person_type       AS ENUM ('NATURAL', 'LEGAL');     -- FO / PO
CREATE TYPE period_status     AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE vat_filing_period AS ENUM ('MONTHLY', 'QUARTERLY');
CREATE TYPE book_kind         AS ENUM ('LEDGER', 'MONETARY_JOURNAL');
CREATE TYPE number_series_entity AS ENUM ('EVENT', 'DOCUMENT', 'ASSET', 'INVENTORY_COUNT');
CREATE TYPE summary_record_type  AS ENUM ('RECEIVED_INVOICE', 'ISSUED_INVOICE', 'BANK_STATEMENT', 'INTERNAL', 'CASH_DOCUMENT', 'BATCH');
CREATE TYPE vat_mode             AS ENUM ('STANDARD', 'REVERSE_CHARGE', 'EXEMPT', 'OUTSIDE_VAT', 'IMPORT');
CREATE TYPE fx_rate_kind         AS ENUM ('DAILY', 'REAL', 'FIXED');
CREATE TYPE signature_role       AS ENUM ('FOR_EVENT', 'FOR_POSTING');
CREATE TYPE account_nature AS ENUM ('ASSET','LIABILITY','EQUITY','EXPENSE','REVENUE','CLOSING','OFF_BALANCE');
CREATE TYPE debit_credit   AS ENUM ('DEBIT','CREDIT');  -- shared: account.normal_balance + posting line side
CREATE TYPE posting_kind    AS ENUM ('SIMPLE','COMPOUND');        -- druh (§5.2)
CREATE TYPE correction_type AS ENUM ('REVERSAL','SUPPLEMENTARY'); -- oprava_typ (§5.2; R8/§35/ČÚS 001)
CREATE TYPE monetary_location   AS ENUM ('CASH','BANK');             -- misto (§5.4)
CREATE TYPE monetary_direction  AS ENUM ('INFLOW','OUTFLOW');        -- smer (§5.4)
CREATE TYPE category_type   AS ENUM ('INCOME','EXPENSE');        -- kategorie typ (§5.7/§9)
CREATE TYPE asset_category          AS ENUM ('INTANGIBLE', 'TANGIBLE_DEPRECIABLE', 'TANGIBLE_NON_DEPRECIABLE');
CREATE TYPE depreciation_method     AS ENUM ('STRAIGHT_LINE', 'PERFORMANCE', 'DECLINING');     -- účetní
CREATE TYPE tax_depreciation_method AS ENUM ('STRAIGHT_LINE', 'ACCELERATED', 'EXTRAORDINARY'); -- daňové §31/§32/§30a
CREATE TYPE asset_disposal_method   AS ENUM ('SALE', 'LIQUIDATION', 'THEFT', 'NATURAL_DISASTER', 'DONATION', 'CONTRIBUTION');
CREATE TYPE depreciation_plan_status AS ENUM ('ACTIVE', 'SUPERSEDED', 'FULLY_DEPRECIATED', 'DISPOSED');
CREATE TYPE inventory_difference    AS ENUM ('MATCH', 'SHORTAGE', 'SURPLUS');
CREATE TYPE open_item_direction AS ENUM ('RECEIVABLE', 'PAYABLE');  -- pohledávka / závazek
CREATE TYPE period_output_type AS ENUM ('FINANCIAL_STATEMENTS', 'OVERVIEWS', 'PERSONAL_INCOME_TAX');

-- REFERENCE TABLES (the law — shared, not tenant-scoped)
-- regime — the 3 bookkeeping regimes + their effects (§13, §13b, §7b ZDP).
CREATE TABLE regime (
  code                       text      PRIMARY KEY,  -- DOUBLE_ENTRY | SINGLE_ENTRY | TAX_RECORDS
  name                       text      NOT NULL,
  requires_chart_of_accounts boolean   NOT NULL,
  book_kind                  book_kind NOT NULL
);

-- legal_form — entity legal forms (s.r.o., a.s., spolek, nadace, OSVČ, …).
CREATE TABLE legal_form (
  code                   text        PRIMARY KEY,
  name                   text        NOT NULL,
  person_type            person_type NOT NULL,
  mandatory_double_entry boolean     NOT NULL DEFAULT false,
  audit_possible         boolean     NOT NULL DEFAULT true
);

-- legal_form_allowed_regime — which regimes each legal form may use (§4 matrix).
CREATE TABLE legal_form_allowed_regime (
  legal_form_code text NOT NULL REFERENCES legal_form (code),
  regime_code     text NOT NULL REFERENCES regime (code),
  PRIMARY KEY (legal_form_code, regime_code)
);

-- accounting_size — size categories + the 2-of-3 thresholds (§1b).
CREATE TABLE accounting_size (
  code                  text          PRIMARY KEY,  -- MICRO | SMALL | MEDIUM | LARGE
  name                  text          NOT NULL,
  max_assets            numeric(19,4),
  max_net_turnover      numeric(19,4),
  max_average_employees integer
);

-- vat_regime — possible VAT statuses + how they work (neplátce / plátce / IO).
CREATE TABLE vat_regime (
  code text PRIMARY KEY,  -- NON_PAYER | PAYER | IDENTIFIED_PERSON
  name text NOT NULL
);

-- currency — ISO 4217 currencies offered in accounting settings. The org's own
-- accounting currency (měna účetnictví, §4/12) is pinned per účetní období on
-- accounting_period.accounting_currency; a document's transaction currency rides
-- on the capture layer (partial_record.currency_code).
CREATE TABLE currency (
  code        char(3)  PRIMARY KEY,             -- ISO 4217: CZK, EUR, USD, …
  name        text     NOT NULL,
  minor_units smallint NOT NULL DEFAULT 2       -- fractional digits
);

-- business_activity — předmět podnikání = CZ-NACE 2025 (5-level hierarchy).
-- Seeded from the ČSÚ systematická část (~1763 rows): A -> 01 -> 01.1 -> 01.11 -> 01.11.0.
CREATE TABLE business_activity (
  code        text     PRIMARY KEY,                       -- 'A', '01', '01.1', '01.11', '01.11.0'
  level       smallint NOT NULL,                          -- 1..5
  parent_code text     REFERENCES business_activity (code),
  name_cs     text     NOT NULL,
  name_en     text,
  CONSTRAINT business_activity_level_range CHECK (level BETWEEN 1 AND 5)
);
-- account_group (BINDING level, Decree 500/2002 Příloha 4) — seeded in 0025
CREATE TABLE account_group (
  code                    char(2)  PRIMARY KEY,                  -- '01','31','70','71'
  class                   smallint NOT NULL,                     -- left digit
  name_cs                 text     NOT NULL,
  name_en                 text,
  nature                  account_nature,                        -- hint; NULL where group mixes (cl. 3,4,7)
  is_internal             boolean  NOT NULL DEFAULT false,       -- classes 8–9, entity-free
  is_valuation_adjustment boolean  NOT NULL DEFAULT false,       -- oprávky/opravné položky groups -> rozvaha KOREKCE col (§4/4)
  -- Statement-line mapping FALLBACK (decision 3, law-grounded: §14 ZoÚ + Vyhláška 500/2002 Příloha 4).
  -- The směrná účtová osnova binds at the 2-digit skupina, so the GROUP is the legally-guaranteed rozvaha/VZZ
  -- anchor. A tenant account with no directive link resolves HERE — closes the "custom synthetic invisible on
  -- závěrka" hole. Cascade: account.specializes_directive_code -> directive_account -> account_group.
  -- Seeded onto the ~80 immutable group rows. NULL for classes 8–9 (is_internal, off-statement); mixed groups
  -- (34, 48) use the sign-split pair below.
  balance_sheet_line             text,                           -- Příloha 1 default line for the whole skupina
  balance_sheet_line_when_debit  text,                           -- sign-split: group 34/48 with a DEBIT net balance -> asset row
  balance_sheet_line_when_credit text,                           -- sign-split: group 34/48 with a CREDIT net balance -> liability row
  income_statement_line          text,                           -- Příloha 2 default line for cost/revenue groups (5x/6x)
  CONSTRAINT account_group_class_chk CHECK (class BETWEEN 0 AND 9)
  -- Review fix (MAJOR / decision 3): the "every on-statement account resolves to a line" guarantee is enforced
  -- not as a per-row CHECK (would fire on minimal test fixtures) but by app_assert_account_groups_mapped() below,
  -- which the migration seed step + a seed test MUST call after loading account_group — it raises if any
  -- on-statement group (not internal 8–9, not OFF_BALANCE/CLOSING) is left without a statement line.
);
-- directive_account (recommendation catalogue, seeded from coa.json) — seeded in 0025
CREATE TABLE directive_account (
  code                  char(3) PRIMARY KEY,                     -- '311','518','701'
  group_code            char(2) NOT NULL REFERENCES account_group (code),
  name_cs               text    NOT NULL,
  name_en               text,
  nature                account_nature NOT NULL,
  normal_balance        debit_credit,                            -- NULL where genuinely mixed/technical
  balance_sheet_line    text,                                    -- Příloha 1, e.g. 'B.II.4' (default / single-side accounts)
  balance_sheet_line_when_debit  text,                           -- sign-split: 481/341-345 with a DEBIT balance -> asset row
  balance_sheet_line_when_credit text,                           -- sign-split: 481/341-345 with a CREDIT balance -> liability row
  income_statement_line text,                                    -- Příloha 2
  deprecated            boolean NOT NULL DEFAULT false
  -- rozvaha builder cascade (decision 3): per account, resolve the statement line in order —
  --   (1) account.specializes_directive_code -> THIS row's mapping (exact synthetic sub-row),
  --   (2) else account_group's mapping (legally-guaranteed group fallback),
  --   (3) else (classes 8–9 / OFF_BALANCE / CLOSING) -> no statement line.
  -- At each level: if the *_when_debit/_when_credit pair is set, pick the row by sign(closing_balance); else balance_sheet_line.
);
-- depreciation_group (odpisová skupina 1–6, ZDP §30 Příloha 1) — seeded in 0025
CREATE TABLE depreciation_group (
  code                    smallint PRIMARY KEY,         -- 1..6
  period_years            smallint NOT NULL,            -- 3/5/10/20/30/50
  linear_rate_first       numeric(6,3),                 -- sazba 1. rok (§31)
  linear_rate_subsequent  numeric(6,3),                 -- sazba další roky
  linear_rate_improvement numeric(6,3),                 -- sazba pro zvýšenou vstupní cenu
  accel_coeff_first       smallint,                     -- koeficient 1. rok (§32)
  accel_coeff_subsequent  smallint,                     -- koeficient další roky
  accel_coeff_improvement smallint,                     -- koeficient pro zvýšenou ZC
  name                    text,
  CONSTRAINT depreciation_group_code_chk CHECK (code BETWEEN 1 AND 6)
);

COMMIT;

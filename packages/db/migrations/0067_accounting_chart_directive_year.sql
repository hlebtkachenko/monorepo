-- 0067_accounting_chart_directive_year.sql
--
-- Year-based Účetní osnova (account directive) overlay + prebuilt house Účtový rozvrh
-- templates + account.tax_relevant (Daňový). Handwritten SQL (ADR-0009). One whole-file
-- transaction; runs through the safe runner path.
--
-- These are reference / config tables — shared across all tenants, NO RLS (mirror
-- directive_account / account_group). directive_account is NOT restructured: it stays the
-- stable statutory statement-mapping catalogue the close engine joins by code. The year
-- dimension is added as a thin overlay so the závěrka cascade + the account/asset FKs are
-- untouched.

BEGIN;

-- directive_account_year — per-YEAR membership + user-facing flags OVERLAY on the stable
-- directive_account catalogue. THIS is the year-based Účetní osnova (account directive): the
-- framework a user browses and seeds a chart from. Synthetic-only — it references
-- directive_account.code and NEVER holds analytic účty (§14; osnova ≠ rozvrh). A new year is
-- added by inserting a fresh (year, code) set; codes/flags may diverge year to year.
CREATE TABLE directive_account_year (
  year              smallint NOT NULL,
  code              char(3)  NOT NULL REFERENCES directive_account (code),
  name_cs           text,                            -- year-specific name override; NULL = inherit directive_account.name_cs
  tracks_open_items boolean  NOT NULL DEFAULT false, -- saldokonto default for this year's osnova (§16)
  tax_relevant      boolean,                         -- Daňový (ovlivňuje daň z příjmů); NULL for balance/closing accounts
  deprecated        boolean  NOT NULL DEFAULT false, -- retired for this year (e.g. 011 Zřizovací výdaje post-2016)
  PRIMARY KEY (year, code)
);

-- chart_template — a prebuilt Účtový rozvrh (our house default; the 2026 variant is a Money S3
-- export) per year + variant. Built on top of the osnova + our system accounts; a user forks it
-- to start their entity chart. SEPARATE store from directive_account_year: a template MAY carry
-- extra columns (oprávky flag, transfer/statement behaviour, and — for future variants —
-- analytic účty) that an osnova must never hold.
CREATE TABLE chart_template (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  year        smallint    NOT NULL,
  code        text        NOT NULL,                  -- 'MONEY_2026' | 'AFFRAME_STANDARD'
  name        text        NOT NULL,
  source      text,                                  -- provenance note (import origin)
  is_default  boolean     NOT NULL DEFAULT false,    -- the offered default for its year
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, code)
);

-- chart_template_account — the účty of a prebuilt rozvrh template. number is the synthetic code
-- ('311'); analytics ('311.001') are allowed for future house variants via parent_number.
-- specializes_directive_code back-links to the stable catalogue for statement mapping (NULL ->
-- account_group fallback once seeded into a tenant chart).
CREATE TABLE chart_template_account (
  id                         uuid    PRIMARY KEY DEFAULT uuidv7(),
  template_id                uuid    NOT NULL REFERENCES chart_template (id) ON DELETE CASCADE,
  number                     text    NOT NULL,       -- '311' | '311.001'
  name                       text    NOT NULL,
  nature                     account_nature NOT NULL,
  normal_balance             debit_credit,           -- NULL for sign-split / closing
  tracks_open_items          boolean NOT NULL DEFAULT false,
  tax_relevant               boolean,                -- Daňový; NULL for balance/closing
  is_allowance               boolean NOT NULL DEFAULT false, -- Oprávkový (07x/08x/09x contra)
  parent_number              text,                   -- analytic -> synthetic parent; NULL for synthetic
  specializes_directive_code char(3) REFERENCES directive_account (code),
  UNIQUE (template_id, number)
);

-- account.tax_relevant — Daňový on the tenant account. Seeded from the chosen osnova/template row,
-- editable, carried forward by copyChartForward. NULL for balance/closing accounts. account stays
-- FORCE-RLS org-scoped; a nullable column add does not affect the policy.
ALTER TABLE account ADD COLUMN tax_relevant boolean;

COMMIT;

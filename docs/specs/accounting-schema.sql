-- =============================================================================
-- Accounting Records System — v2 GROUND LAYER (ERD DDL)
-- =============================================================================
-- STATUS: design/eval only. NOT migrated. Live schema is the Czech v1
-- (packages/db/migrations/0024-0028). Open in DBeaver / pgAdmin / dbdiagram.io.
--
-- SCOPE: this file is ONLY the organized ground layer — platform anchor, the
-- law reference tables, the period/regime/size/VAT links, business activity
-- (CZ-NACE), and the workspace-shared counterparty. The capture / chart of
-- accounts / posting / output layers are intentionally NOT here yet; we design
-- them table by table and append as we go.
--
-- KEY DECISIONS (with Hleb, law-grounded, verified against real schema):
--   * English-only. organization IS the účetní jednotka (no separate unit table).
--   * organization is thin: workspace_id, slug, person_type. Identity (legal_name,
--     ico, dic, address, právní forma) lives on the org's own counterparty.
--   * person_type (NATURAL | LEGAL) on organization, IMMUTABLE (trigger) — a FO
--     can't become a PO without becoming a new entity; it gates legal_form+regime.
--   * "Law as reference, org as time-bound link": regime / legal_form /
--     accounting_size / vat_regime / business_activity are reference tables; the
--     org links to them (per účetní období, or a valid_from/to range).
--   * fiscal_year_start_month already encodes calendar vs hospodářský rok (§3/1)
--     — no období "type" enum.
--   * Předmět podnikání = CZ-NACE 2025 (Klasifikace ekonomických činností),
--     5-level hierarchy; org links M:N.
--   * counterparty is WORKSPACE-SHARED across all orgs in the office. An org's own
--     identity is one counterparty row marked self_of_organization_id; that row is
--     immune to edits by other orgs and undeletable while the org exists (RLS).
--
-- TENANCY: org-scoped tables carry organization_id -> organization(id);
-- counterparty is workspace-scoped (workspace_id). RLS keys on app.organization_id
-- / app.workspace_id; withOrganization sets BOTH GUCs (tenancy.ts:222,245), so an
-- org session can read the workspace-shared counterparty. RLS policies + the
-- composite-FK hardening land in the migration; the ERD shows tables + FKs.
-- workspace / organization / app_user are PLATFORM tables, shown as faithful stubs.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;  -- M8: gist EXCLUDE on (org =, daterange &&) for vat_status non-overlap

-- =============================================================================
-- ENUMS (ground layer only)
-- =============================================================================
CREATE TYPE person_type       AS ENUM ('NATURAL', 'LEGAL');     -- FO / PO
CREATE TYPE period_status     AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE vat_filing_period AS ENUM ('MONTHLY', 'QUARTERLY');
CREATE TYPE book_kind         AS ENUM ('LEDGER', 'MONETARY_JOURNAL');

-- =============================================================================
-- PLATFORM TABLES (pre-existing; faithful stubs of the real columns)
-- =============================================================================

CREATE TABLE app_user (
  id    uuid PRIMARY KEY,
  email text
);

-- workspace — the accounting office (parent tenant). Subset of the real table
-- (also: purpose, contact_*, website, use_case, team_size, onboarding step_*_at).
CREATE TABLE workspace (
  id                 uuid        PRIMARY KEY,
  created_by_user_id uuid        NOT NULL REFERENCES app_user (id),
  display_name       text        NOT NULL,
  plan               text        NOT NULL DEFAULT 'starter',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- REFERENCE TABLES (the law — shared, not tenant-scoped)
-- =============================================================================

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

-- =============================================================================
-- ORGANIZATION (= účetní jednotka; platform-owned, TARGET shape)
-- =============================================================================
-- Live platform table currently also has: organization_id (= id, uniform-RLS
-- convention), legal_name, person_kind (text -> renamed person_type),
-- legal_subject_kind, fiscal_year_start_month. Reshaping to this target is a
-- platform migration (RLS predicate uses organization_id; onboarding writes
-- legal_name). person_type is IMMUTABLE (trigger, same pattern as workspace_id).
CREATE TABLE organization (
  id           uuid        PRIMARY KEY,
  workspace_id uuid        NOT NULL REFERENCES workspace (id),
  slug         varchar(64) NOT NULL,
  person_type  person_type NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- composite-FK anchor for the capture layer: lets accounting_event/document
  -- prove (organization_id, workspace_id) is the org's own workspace.
  CONSTRAINT organization_id_workspace_unique UNIQUE (id, workspace_id)
);

-- organization_business_activity — org's předmět podnikání (M:N to CZ-NACE).
CREATE TABLE organization_business_activity (
  organization_id        uuid NOT NULL REFERENCES organization (id),
  business_activity_code text NOT NULL REFERENCES business_activity (code),
  PRIMARY KEY (organization_id, business_activity_code)
);

-- =============================================================================
-- ORG ↔ LAW LINKS (time-bound)
-- =============================================================================

-- accounting_period — one účetní období. regime fixed per period (immutable until
-- closed); size assessed at period_end (§1b). period_start/end cover transitions.
CREATE TABLE accounting_period (
  id                   uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id      uuid          NOT NULL REFERENCES organization (id),
  period_start         date          NOT NULL,
  period_end           date          NOT NULL,
  status               period_status NOT NULL DEFAULT 'OPEN',
  regime_code          text          NOT NULL REFERENCES regime (code),
  accounting_size_code text          REFERENCES accounting_size (code),  -- null until assessed
  accounting_currency  char(3)       NOT NULL REFERENCES currency (code),  -- měna účetnictví (§4/12), 1/org/period
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT accounting_period_dates_chk CHECK (period_start <= period_end),
  CONSTRAINT accounting_period_id_org_unique UNIQUE (id, organization_id),
  -- FK target for the future regime spine (posting layer pins entry.regime = period's):
  CONSTRAINT accounting_period_id_org_regime_unique UNIQUE (id, organization_id, regime_code)
);

-- vat_status — time-versioned VAT status link, independent of účetní období.
CREATE TABLE vat_status (
  id              uuid              PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid              NOT NULL REFERENCES organization (id),
  vat_regime_code text              NOT NULL REFERENCES vat_regime (code),
  valid_from      date              NOT NULL,
  valid_to        date,                                -- null = current
  filing_period   vat_filing_period,                   -- for PAYER
  created_at      timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT vat_status_dates_chk CHECK (valid_to IS NULL OR valid_from <= valid_to),
  -- M8: no two VAT-status ranges per org may overlap (closes the "two open rows" race).
  CONSTRAINT vat_status_no_overlap EXCLUDE USING gist (
    organization_id WITH =,
    daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]') WITH &&
  )
);

-- =============================================================================
-- COUNTERPARTY (workspace-shared across all orgs in the office)
-- =============================================================================
-- The org's OWN identity is one counterparty row with self_of_organization_id set.
-- Identity columns (legal_name, ico, dic, address, legal_form, person_type, NACE)
-- are enriched in a later session.
--
-- RLS (design; real policies land in the migration — modeled on workspace /
-- organization_membership, 0005_workspace.sql):
--   SELECT  workspace_id = app.workspace_id                         (shared read, all orgs)
--   INSERT  workspace_id = app.workspace_id
--   UPDATE  workspace_id = app.workspace_id
--           AND (self_of_organization_id IS NULL
--                OR self_of_organization_id = app.organization_id)  (no cross-org edit of a self)
--   DELETE  self_of_organization_id IS NULL                         (self undeletable while org exists)
CREATE TABLE counterparty (
  id                      uuid        PRIMARY KEY DEFAULT uuidv7(),
  workspace_id            uuid        NOT NULL REFERENCES workspace (id),
  self_of_organization_id uuid        UNIQUE REFERENCES organization (id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  -- UNIQUE(id, workspace_id) = composite-FK target for org-tier tables that will
  -- reference a counterparty (accounting_document / accounting_event), closing the
  -- cross-workspace FK-bypass hole via (counterparty_id, workspace_id).
  CONSTRAINT counterparty_id_workspace_unique UNIQUE (id, workspace_id)
);

-- =============================================================================
-- CAPTURE CORE (§33 + §6/1 + §11) — fact -> voucher -> line -> dílčí (money)
-- =============================================================================
-- Money lives at partial_record (the dílčí). Posting (a later layer) reads it and
-- EXPANDS one row into N MD/D lines. Composite (fk, organization_id) FKs enforce
-- tenant consistency across the FK chain (FK checks bypass RLS); the counterparty
-- is workspace-shared, so events reference it via (counterparty_id, workspace_id).

CREATE TYPE number_series_entity AS ENUM ('EVENT', 'DOCUMENT', 'ASSET', 'INVENTORY_COUNT');
CREATE TYPE summary_record_type  AS ENUM ('RECEIVED_INVOICE', 'ISSUED_INVOICE', 'BANK_STATEMENT', 'INTERNAL', 'CASH_DOCUMENT', 'BATCH');
CREATE TYPE vat_mode             AS ENUM ('STANDARD', 'REVERSE_CHARGE', 'EXEMPT', 'OUTSIDE_VAT', 'IMPORT');
CREATE TYPE fx_rate_kind         AS ENUM ('DAILY', 'REAL', 'FIXED');
CREATE TYPE signature_role       AS ENUM ('FOR_EVENT', 'FOR_POSTING');

-- number_series — company-defined číselné řady per entity_type. Gapless counter.
CREATE TABLE number_series (
  id              uuid                 PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid                 NOT NULL REFERENCES organization (id),
  entity_type     number_series_entity NOT NULL,           -- EVENT | DOCUMENT (extensible)
  code            text                 NOT NULL,           -- company's série label
  pattern         text                 NOT NULL,           -- company-defined format, e.g. 'FP{YYYY}{NNNN}'
  next_number     bigint               NOT NULL DEFAULT 1, -- gapless: SELECT...FOR UPDATE, never a SEQUENCE
  created_at      timestamptz          NOT NULL DEFAULT now(),
  updated_at      timestamptz          NOT NULL DEFAULT now(),
  CONSTRAINT number_series_id_org_unique          UNIQUE (id, organization_id),
  CONSTRAINT number_series_org_entity_code_unique UNIQUE (organization_id, entity_type, code)
);

-- accounting_event — the economic fact / účetní případ (§6/1). Both parties.
-- party_id = us (self / employee / sub-org), counterparty_id = them. workspace_id
-- is the composite-FK key to the workspace-shared counterparty (FK bypasses RLS).
CREATE TABLE accounting_event (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid        NOT NULL,
  workspace_id     uuid        NOT NULL,
  period_id        uuid        NOT NULL,                  -- M2 fix (decision 2): the case's účetní období (occurred_at ∈ period); gives R6 "all cases of period P" a real denominator; period guard below
  number_series_id uuid        NOT NULL,                  -- Označení series (entity_type = EVENT)
  sequence_number  bigint      NOT NULL,                  -- gapless position in the série
  designation      text        NOT NULL,                  -- FROZEN Označení string (gov/audit id; immune to later pattern edits)
  party_id         uuid,                                  -- OUR side (counterparty)
  counterparty_id  uuid,                                  -- THEIR side (counterparty)
  description      text        NOT NULL,                  -- obsah úč. případu (§11/1b)
  content          text,                                  -- optional longer detail
  occurred_at      timestamptz NOT NULL,                  -- okamžik uskutečnění (§11/1e)
  responsible_user_id uuid     NOT NULL REFERENCES app_user (id),  -- osoba odp. za případ (§11/1f, R10) — za-zaúčtování is on posting
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_event_org_fk          FOREIGN KEY (organization_id, workspace_id) REFERENCES organization (id, workspace_id),
  CONSTRAINT accounting_event_period_fk       FOREIGN KEY (period_id, organization_id)    REFERENCES accounting_period (id, organization_id),
  CONSTRAINT accounting_event_party_fk        FOREIGN KEY (party_id, workspace_id)        REFERENCES counterparty (id, workspace_id),
  CONSTRAINT accounting_event_counterparty_fk FOREIGN KEY (counterparty_id, workspace_id) REFERENCES counterparty (id, workspace_id),
  CONSTRAINT accounting_event_series_fk       FOREIGN KEY (number_series_id, organization_id) REFERENCES number_series (id, organization_id),
  CONSTRAINT accounting_event_id_org_unique   UNIQUE (id, organization_id),
  CONSTRAINT accounting_event_oznaceni_unique UNIQUE (number_series_id, sequence_number)
);

-- signature — podpisový záznam (§33a + §11/1f). Append-only (triggers at migration).
CREATE TABLE signature (
  id              uuid           PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid           NOT NULL REFERENCES organization (id),
  role            signature_role NOT NULL,                  -- FOR_EVENT (za případ) | FOR_POSTING (za zaúčtování)
  signer_id       uuid           NOT NULL REFERENCES app_user (id),
  signed_at       timestamptz    NOT NULL,                  -- okamžik podpisového záznamu (§33a)
  event_id        uuid,                                     -- set when role = FOR_EVENT
  created_at      timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT signature_event_fk      FOREIGN KEY (event_id, organization_id) REFERENCES accounting_event (id, organization_id),
  CONSTRAINT signature_id_org_unique UNIQUE (id, organization_id)
);

-- summary_record — souhrnný úč. záznam = voucher/doklad header (§11). Numbered.
CREATE TABLE summary_record (
  id               uuid                PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid                NOT NULL,
  workspace_id     uuid                NOT NULL,
  period_id        uuid                NOT NULL,            -- the účetní období this voucher books into
  number_series_id uuid                NOT NULL,            -- číselná řada (entity_type = DOCUMENT)
  sequence_number  bigint              NOT NULL,            -- gapless position in the série
  designation      text                NOT NULL,            -- FROZEN Označení string (gov/audit id; immune to later pattern edits)
  type             summary_record_type NOT NULL,
  issued_at        timestamptz         NOT NULL,            -- okamžik vyhotovení (§11/1d)
  rounding_amount  numeric(19,4)       NOT NULL DEFAULT 0,  -- §37 doc-total rounding -> 548/648 at posting
  created_at       timestamptz         NOT NULL DEFAULT now(),
  updated_at       timestamptz         NOT NULL DEFAULT now(),
  CONSTRAINT summary_record_org_fk              FOREIGN KEY (organization_id, workspace_id)     REFERENCES organization (id, workspace_id),
  CONSTRAINT summary_record_period_fk           FOREIGN KEY (period_id, organization_id)        REFERENCES accounting_period (id, organization_id),
  CONSTRAINT summary_record_series_fk           FOREIGN KEY (number_series_id, organization_id) REFERENCES number_series (id, organization_id),
  CONSTRAINT summary_record_cislena_rada_unique UNIQUE (number_series_id, sequence_number),
  CONSTRAINT summary_record_id_org_unique       UNIQUE (id, organization_id),
  -- M7 (§11/1a): Označení unique per (org, period, type) — a series alone isn't enough
  CONSTRAINT summary_record_oznaceni_unique     UNIQUE (organization_id, period_id, type, designation)
);

-- individual_record — jednotlivý úč. záznam; one line, links event<->voucher.
CREATE TABLE individual_record (
  id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id     uuid        NOT NULL REFERENCES organization (id),
  summary_record_id   uuid        NOT NULL,                -- which voucher
  accounting_event_id uuid        NOT NULL,                -- which fact
  description         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT individual_record_doc_fk        FOREIGN KEY (summary_record_id, organization_id)   REFERENCES summary_record (id, organization_id),
  CONSTRAINT individual_record_event_fk      FOREIGN KEY (accounting_event_id, organization_id) REFERENCES accounting_event (id, organization_id),
  CONSTRAINT individual_record_id_org_unique UNIQUE (id, organization_id)
);

-- partial_record — dílčí úč. záznam = THE money level (taxable supplies only).
-- §11/1c captured once; posting EXPANDS one row into N MD/D lines. Rounding lives
-- on summary_record.rounding_amount. ξ (koeficient) injected at posting time.
CREATE TABLE partial_record (
  id                   uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id      uuid          NOT NULL REFERENCES organization (id),
  individual_record_id uuid          NOT NULL,
  quantity             numeric(19,4),                       -- Množství
  measure_unit         text,                                -- m.j.
  unit_price           numeric(19,4),                       -- cena za m.j.
  base_amount          numeric(19,4) NOT NULL,              -- základ daně (Suma celkem)
  vat_rate             numeric(5,2),                        -- 0/12/21…; null for OUTSIDE_VAT
  vat_mode             vat_mode      NOT NULL,              -- DRIVES posting
  vat_deductible       boolean       NOT NULL DEFAULT true, -- false -> VAT folds into cost
  advance_settlement   boolean       NOT NULL DEFAULT false,-- daňový doklad k záloze (§37a)
  vat_amount           numeric(19,4) NOT NULL DEFAULT 0,    -- daň; 0 on reverse-charge/exempt docs
  currency_code        char(3)       NOT NULL REFERENCES currency (code),
  fx_rate_kind         fx_rate_kind,                        -- DAILY | REAL | FIXED (priority REAL>FIXED>DAILY)
  fx_rate              numeric(18,6),                       -- to accounting currency; null when same
  vat_fx_rate          numeric(18,6),                       -- §4/5 ČNB rate for the VAT base when <> fx_rate
  base_in_accounting_currency numeric(19,4) NOT NULL,       -- frozen (target = period.accounting_currency)
  vat_in_accounting_currency  numeric(19,4) NOT NULL DEFAULT 0,  -- frozen
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT partial_record_line_fk       FOREIGN KEY (individual_record_id, organization_id) REFERENCES individual_record (id, organization_id),
  CONSTRAINT partial_record_id_org_unique UNIQUE (id, organization_id),
  -- M4: REVERSE_CHARGE doc carries no output VAT (supplier charges none; self-assessment is posting-time) -> vat_amount must be 0
  CONSTRAINT partial_record_vat_zero_chk  CHECK (vat_mode NOT IN ('EXEMPT', 'OUTSIDE_VAT', 'REVERSE_CHARGE') OR vat_amount = 0),
  CONSTRAINT partial_record_qty_price_chk CHECK (quantity IS NULL OR unit_price IS NULL OR base_amount = round(quantity * unit_price, 4)),
  -- M4: compare at haléř precision (round to 2 dp, tolerance 0.50) — the old round-to-0 false-rejected haléř-rounded large invoices (§37)
  CONSTRAINT partial_record_vat_tol_chk   CHECK (vat_mode <> 'STANDARD' OR vat_rate IS NULL OR abs(vat_amount - round(base_amount * vat_rate / 100, 2)) <= 0.50)
);

-- =============================================================================
-- CHART OF ACCOUNTS (§14 účtový rozvrh, §16 §16 reconcile, Decree 500/2002)
-- =============================================================================
-- DOUBLE_ENTRY regime only (the regime redirect: single-entry / tax-records use the
-- cash-book branch, no chart). Fork1=A (account_group binding + directive_account
-- catalogue), Fork2=B (per-period chart header + copy-forward), D3 (nature +
-- normal_balance stored, not derived), D4 (§16 tree integrity in DDL; Σ-reconcile =
-- service+test in the posting layer), D5 (regime gate via generated regime_code +
-- composite FK to the period regime spine — unbypassable, no separate CHECK).

CREATE TYPE account_nature AS ENUM ('ASSET','LIABILITY','EQUITY','EXPENSE','REVENUE','CLOSING','OFF_BALANCE');
CREATE TYPE debit_credit   AS ENUM ('DEBIT','CREDIT');  -- shared: account.normal_balance + posting line side

-- account_group — BINDING level for podnikatelé (§14/1 + Decree 500/2002 Příloha 4).
-- ~80 immutable seeded rows. class is a column (no standalone account_class table).
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

-- directive_account — NON-BINDING recommendation catalogue (3-digit synthetic),
-- seeded from coa.json. Tenants may invent synthetics within a group (legal), so the
-- link from account is nullable. Carries the PRECISE synthetic-level statement-line mapping
-- (the exact rozvaha sub-row); the GROUP-level fallback for tenant-invented synthetics is on
-- account_group (decision 3). Resolve via cascade: account directive link -> directive_account -> account_group.
-- Seed-time fixes (migration): 710 belongs to group 71 (coa.json files it under 70);
-- resolve normal_balance "mixed"/"technical"/None -> enum + NULL.
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

-- chart_of_accounts — one účtový rozvrh per účetní období (§14/3). Fork2=B: a service
-- copies accounts forward at period open. D5 regime gate: regime_code is a generated
-- constant, so the composite FK to the period's 3-col unique proves this org's
-- DOUBLE_ENTRY period — unbypassable, no separate CHECK. No status column (open/closed
-- tracks the period; the closed-period freeze is a migration trigger per V2-DEFERRED).
CREATE TABLE chart_of_accounts (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid        NOT NULL,
  period_id       uuid        NOT NULL,
  regime_code     text        NOT NULL GENERATED ALWAYS AS ('DOUBLE_ENTRY') STORED,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chart_period_regime_fk FOREIGN KEY (period_id, organization_id, regime_code)
    REFERENCES accounting_period (id, organization_id, regime_code),
  CONSTRAINT chart_one_per_period UNIQUE (period_id),
  CONSTRAINT chart_id_org_unique  UNIQUE (id, organization_id),
  CONSTRAINT chart_id_period_unique UNIQUE (id, period_id)   -- B1: account.(chart_id, period_id) -> here, pins account to its chart's period
);

-- account — a tenant účet in one chart. The 4 structural levels are GENERATED from
-- `number` (zero drift): class / group_code / synthetic_code / is_synthetic. nature
-- fuses Money's Druh+Typ; the only user-chosen stored flag is tracks_open_items
-- (saldokonto, §16 párování). 2-digit number allowed (§13a simplified scope).
-- Derived in views (NOT stored): Druh (nature filter), Aktivní/Pasivní (normal_balance),
-- Vnitropodnikový (class IN 8,9), Oprávkový (account_group.is_valuation_adjustment).
-- §16 Σ(analytical)=synthetic reconcile = service+test in the posting layer, NOT DDL.
CREATE TABLE account (
  id                uuid           PRIMARY KEY DEFAULT uuidv7(),
  organization_id   uuid           NOT NULL,
  chart_id          uuid           NOT NULL,
  period_id         uuid           NOT NULL,                     -- B1: = the chart's period; FK below pins them equal (closes cross-period posting hole)
  parent_id         uuid,                                        -- analytical -> synthetic (§16, ČÚS 001 §2.2.1); same chart
  number            text           NOT NULL,                     -- '31','311','311.001'
  name              text           NOT NULL,
  nature            account_nature NOT NULL,
  normal_balance    debit_credit,                                -- NULL where sign-flips (431,481,FX)
  tracks_open_items boolean        NOT NULL DEFAULT false,       -- saldokonto — the ONE stored flag (user-chosen)
  -- structural levels: GENERATED from `number` only (a gen col may not read another gen col)
  class          smallint GENERATED ALWAYS AS (left(number,1)::int) STORED,
  group_code     char(2)  GENERATED ALWAYS AS (CASE WHEN left(number,1) IN ('8','9') THEN NULL ELSE left(replace(number,'.',''),2)::char(2) END) STORED,
  synthetic_code text     GENERATED ALWAYS AS (left(replace(number,'.',''),3)) STORED,
  is_synthetic   boolean  GENERATED ALWAYS AS (parent_id IS NULL) STORED,
  specializes_directive_code char(3),                            -- nullable soft link to the 3-digit catalogue; when NULL the statement line falls back to account_group (decision 3)
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT account_id_org_unique        UNIQUE (id, organization_id),   -- posting line -> account target (tenancy)
  CONSTRAINT account_id_chart_unique      UNIQUE (id, chart_id),          -- parent-same-chart target
  CONSTRAINT account_id_period_unique     UNIQUE (id, period_id),         -- B1: line/balance -> account-in-period target
  CONSTRAINT account_chart_number_unique  UNIQUE (chart_id, number),
  CONSTRAINT account_chart_fk     FOREIGN KEY (chart_id, organization_id) REFERENCES chart_of_accounts (id, organization_id),
  CONSTRAINT account_chart_period_fk FOREIGN KEY (chart_id, period_id)    REFERENCES chart_of_accounts (id, period_id),  -- B1: account.period == chart.period
  CONSTRAINT account_parent_fk    FOREIGN KEY (parent_id, chart_id)       REFERENCES account (id, chart_id),
  CONSTRAINT account_group_fk     FOREIGN KEY (group_code)                REFERENCES account_group (code),
  CONSTRAINT account_directive_fk FOREIGN KEY (specializes_directive_code) REFERENCES directive_account (code),
  CONSTRAINT account_not_self_parent_chk CHECK (parent_id <> id),
  CONSTRAINT account_number_shape_chk    CHECK (number ~ '^[0-9]{2,}(\.[0-9A-Za-z]+)*$')
);

-- =============================================================================
-- POSTING (ZAÚČTOVÁNÍ §6/2) — shared header + 2 regime-specific line shapes
-- =============================================================================
-- Faithful v2 English rename of v1 ucetni_zapis / zapis_radek / penezni_denik_radek
-- (TECH-SPEC §5.2–5.4, §6, §7, §9) + the documented v2 decisions only. The header is
-- shared across all 3 regimes (carries regime_code); PODVOJNÉ branches to the
-- double-entry line, JEDNODUCHÉ / DAŇOVÁ EVIDENCE share the cash line. Books
-- (deník / hlavní kniha / peněžní deník) are VIEWS over these, never tables. MVP: no FX.

CREATE TYPE posting_kind    AS ENUM ('SIMPLE','COMPOUND');        -- druh (§5.2)
CREATE TYPE correction_type AS ENUM ('REVERSAL','SUPPLEMENTARY'); -- oprava_typ (§5.2; R8/§35/ČÚS 001)
CREATE TYPE monetary_location   AS ENUM ('CASH','BANK');             -- misto (§5.4)
CREATE TYPE monetary_direction  AS ENUM ('INFLOW','OUTFLOW');        -- smer (§5.4)
CREATE TYPE category_type   AS ENUM ('INCOME','EXPENSE');        -- kategorie typ (§5.7/§9)

-- category (= kategorie) — peněžní-deník income/expense category (§5.7, §9).
CREATE TABLE category (
  id              uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid          NOT NULL REFERENCES organization (id),
  type            category_type NOT NULL,
  name            text          NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT category_id_org_unique UNIQUE (id, organization_id)
);

-- posting (= ucetni_zapis) — the shared posting header (§12), made on the basis of a
-- doklad (§6/2). §5.2. For DAŇOVÁ EVIDENCE a TECHNICAL CONTAINER (§7b ZDP): the table
-- is reused as-is, columns stay NOT NULL. Append-only (R8; no updated_at).
CREATE TABLE posting (
  id                   uuid            PRIMARY KEY DEFAULT uuidv7(),
  organization_id      uuid            NOT NULL,
  period_id            uuid            NOT NULL,                  -- obdobi_id (§5.2); regime spine. A correction may post into a different OPEN period (R8/R12)
  regime_code          text            NOT NULL,                 -- pinned == accounting_period.regime_code via composite FK; lines need it for their FK
  summary_record_id    uuid            NOT NULL,                 -- doklad_id (§5.2, R2) — posting on the basis of a doklad (§6/2)
  accounting_event_id  uuid            NOT NULL,                 -- pripad_id (§5.2, R2) — which case is booked; one doklad may cover many cases (§11/1)
  depreciation_plan_id uuid,                                     -- odpisovy_plan_id (§5.2/§6) — set if generated by depreciation (UC-4)
  inventory_count_id   uuid,                                     -- inventura_id (§5.2/§6) — set if generated by inventory manko/přebytek (UC-4)
  posting_date         date            NOT NULL,                 -- datum (§5.2) — deník order + period membership; CHECK ∈ period (trigger)
  posting_kind         posting_kind    NOT NULL,                 -- druh (§5.2): SIMPLE | COMPOUND
  responsible_user_id  uuid            NOT NULL REFERENCES app_user (id),  -- odpovedna_osoba (§5.2, R10); MVP e-signature simplification
  posted_at            timestamptz     NOT NULL,                 -- okamzik_zauctovani (§5.2)
  corrects_posting_id  uuid,                                     -- opravuje_zapis_id (R8/§35) — self-FK; correction posts into an OPEN period
  correction_type      correction_type,                          -- set iff corrects_posting_id set
  is_opening           boolean         NOT NULL DEFAULT false,   -- B2: 701 počáteční-stav opening posting; read-model trigger EXCLUDES from turnover (sets opening_balance), still in deník
  created_at           timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT posting_id_org_unique        UNIQUE (id, organization_id),
  CONSTRAINT posting_id_period_unique     UNIQUE (id, period_id),                      -- B1: line.(posting_id, period_id) -> here, pins line.period == posting.period
  CONSTRAINT posting_id_org_regime_unique UNIQUE (id, organization_id, regime_code),  -- line-FK target (R7 spine)
  CONSTRAINT posting_period_regime_fk FOREIGN KEY (period_id, organization_id, regime_code)
    REFERENCES accounting_period (id, organization_id, regime_code),                  -- REGIME SPINE
  CONSTRAINT posting_summary_fk FOREIGN KEY (summary_record_id, organization_id)
    REFERENCES summary_record (id, organization_id),                                  -- R2
  CONSTRAINT posting_event_fk FOREIGN KEY (accounting_event_id, organization_id)
    REFERENCES accounting_event (id, organization_id),                               -- R2
  CONSTRAINT posting_correction_fk FOREIGN KEY (corrects_posting_id, organization_id, regime_code)
    REFERENCES posting (id, organization_id, regime_code),
  CONSTRAINT posting_correction_pair_chk CHECK ((corrects_posting_id IS NULL) = (correction_type IS NULL))
  -- depreciation_plan_id / inventory_count_id FKs are ACTIVATED via ALTER after the
  -- supporting tables are created (see "Activate deferred posting FKs" below).
  -- TRIGGERS (migration): append-only block; closed-period + posting_date ∈ [period_start, period_end] (R12, V2-DEFERRED).
);

-- posting_double_entry_line (= zapis_radek) — one Má dáti / Dal side (§13/2). §5.3.
-- The posted form of a partial_record (dílčí). PODVOJNÉ only (R7).
CREATE TABLE posting_double_entry_line (
  id                uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id   uuid          NOT NULL,
  posting_id        uuid          NOT NULL,                      -- zapis_id (§5.3)
  period_id         uuid          NOT NULL,                      -- B1: = posting's period; pins the account to the posting's period chart
  regime_code       text          NOT NULL,                     -- CHECK = 'DOUBLE_ENTRY' (R7); composite FK carries tenancy+regime
  account_id        uuid          NOT NULL,                      -- ucet_id (§5.3, R1) — valid account from the org chart
  partial_record_id uuid,                                        -- dilci_id (§5.3) "Zaúčtování" §6/2; nullable for generated postings (701, depreciation, storno)
  side              debit_credit  NOT NULL,                      -- strana (§5.3): MD | Dal
  amount            numeric(19,4) NOT NULL,                      -- castka (§5.3, R13); may be negative (storno)
  created_at        timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT posting_de_line_regime_chk CHECK (regime_code = 'DOUBLE_ENTRY'),
  CONSTRAINT posting_de_line_posting_fk FOREIGN KEY (posting_id, organization_id, regime_code)
    REFERENCES posting (id, organization_id, regime_code),
  CONSTRAINT posting_de_line_posting_period_fk FOREIGN KEY (posting_id, period_id)
    REFERENCES posting (id, period_id),                                              -- B1: line.period == posting.period
  CONSTRAINT posting_de_line_account_fk FOREIGN KEY (account_id, organization_id)
    REFERENCES account (id, organization_id),                                        -- R1 (tenancy)
  CONSTRAINT posting_de_line_account_period_fk FOREIGN KEY (account_id, period_id)
    REFERENCES account (id, period_id),                                             -- B1: account is in THIS period's chart (closes cross-period hole)
  CONSTRAINT posting_de_line_partial_fk FOREIGN KEY (partial_record_id, organization_id)
    REFERENCES partial_record (id, organization_id)                                  -- §6/2; NOT unique (1 dílčí -> many lines)
  -- TRIGGERS (migration): append-only; closed-period+date via parent; R4 balance =
  --   CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED, per posting:
  --   count(*) >= 2 AND SUM(amount) FILTER(side=DEBIT) = SUM(amount) FILTER(side=CREDIT)
  --   [>= 2 closes the v1 empty-entry hole]. Never fires for cash postings.
);

-- posting_monetary_line (= penezni_denik_radek) — one classified peněžní-deník row
-- (§13b / §7b). §5.4 + §9. The posted form of a partial_record in cash-book format.
-- JEDNODUCHÉ / DAŇOVÁ EVIDENCE only (R7). A single cash movement may need several rows (§9).
CREATE TABLE posting_monetary_line (
  id                uuid           PRIMARY KEY DEFAULT uuidv7(),
  organization_id   uuid           NOT NULL,
  posting_id        uuid           NOT NULL,                     -- zapis_id (§5.4)
  regime_code       text           NOT NULL,                     -- CHECK IN ('SINGLE_ENTRY','TAX_RECORDS') (R7)
  partial_record_id uuid,                                        -- dilci_id (§5.4) "Zaúčtování" §6/2; nullable
  category_id       uuid,                                        -- kategorie_id (§5.4, §9); nullable (generated postings)
  location          monetary_location  NOT NULL,                     -- misto (§5.4): CASH | BANK
  direction         monetary_direction NOT NULL,                     -- smer (§5.4): INFLOW | OUTFLOW
  is_tax_relevant   boolean        NOT NULL,                     -- danovy (§5.4, §9)
  is_clearing       boolean        NOT NULL DEFAULT false,       -- prubezny (§5.4, §9): průběžná položka
  tax_base          numeric(19,4),                               -- zaklad_dane (§5.4, §9); nullable
  amount            numeric(19,4)  NOT NULL,                      -- castka (§5.4, R13)
  created_at        timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT posting_monetary_line_regime_chk CHECK (regime_code IN ('SINGLE_ENTRY','TAX_RECORDS')),
  CONSTRAINT posting_monetary_line_posting_fk FOREIGN KEY (posting_id, organization_id, regime_code)
    REFERENCES posting (id, organization_id, regime_code),
  CONSTRAINT posting_monetary_line_partial_fk FOREIGN KEY (partial_record_id, organization_id)
    REFERENCES partial_record (id, organization_id),
  CONSTRAINT posting_monetary_line_category_fk FOREIGN KEY (category_id, organization_id)
    REFERENCES category (id, organization_id)                                        -- §5.4
  -- TRIGGERS (migration): append-only; closed-period+date via parent.
);

-- signature.posting_id amendment — the FOR_POSTING role link (= v1 podpis.zapis_id,
-- §5.6 / §33a/4). Added here because it FKs the posting table defined above. The CHECK
-- enforces exactly-one-of (event_id, posting_id), keyed on role.
ALTER TABLE signature
  ADD COLUMN posting_id uuid,
  ADD CONSTRAINT signature_posting_fk FOREIGN KEY (posting_id, organization_id)
    REFERENCES posting (id, organization_id),
  ADD CONSTRAINT signature_role_target_chk CHECK (
    (role = 'FOR_EVENT'   AND event_id IS NOT NULL AND posting_id IS NULL) OR
    (role = 'FOR_POSTING' AND posting_id IS NOT NULL AND event_id IS NULL)
  );

-- =============================================================================
-- SUPPORTING (asset · depreciation · inventory) — §5.6 / §5.7
-- =============================================================================
-- Full fixed-asset register (KB + law grounded: ČÚS 013, ZoÚ §25–31, Vyhláška
-- 500/2002 §47/§55–56, ZDP §26–33). Dual-track depreciation: účetní (posts MD 551 /
-- D 08x via depreciation_plan) + daňové (tax_depreciation, NOT posted; DPPO + odložená
-- daň). oprávky/ZC NOT stored — DERIVED from the 08x ledger (D3). COA links by NUMBER
-- (D8, advisor-confirmed): assets/plans are perennial, account rows are per-period; the
-- posting generator resolves number -> the period's account_id (same as 701 carry).
-- directive_code = the renumbering-survival anchor (NOT the posting key).

CREATE TYPE asset_category          AS ENUM ('INTANGIBLE', 'TANGIBLE_DEPRECIABLE', 'TANGIBLE_NON_DEPRECIABLE');
CREATE TYPE depreciation_method     AS ENUM ('STRAIGHT_LINE', 'PERFORMANCE', 'DECLINING');     -- účetní
CREATE TYPE tax_depreciation_method AS ENUM ('STRAIGHT_LINE', 'ACCELERATED', 'EXTRAORDINARY'); -- daňové §31/§32/§30a
CREATE TYPE asset_disposal_method   AS ENUM ('SALE', 'LIQUIDATION', 'THEFT', 'NATURAL_DISASTER', 'DONATION', 'CONTRIBUTION');
CREATE TYPE depreciation_plan_status AS ENUM ('ACTIVE', 'SUPERSEDED', 'FULLY_DEPRECIATED', 'DISPOSED');
CREATE TYPE inventory_difference    AS ENUM ('MATCH', 'SHORTAGE', 'SURPLUS');

-- depreciation_group — odpisová skupina 1–6 (ZDP §30 Příloha 1 + §31/§32). Law
-- reference, seeded, global (no tenant scope), like regime / legal_form.
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

-- asset — fixed-asset register card (majetek §5.7, ČÚS 013). DFM excluded (D1).
-- oprávky/ZC derived not stored (D3). account_number by NUMBER (D8) + directive anchor.
CREATE TABLE asset (
  id                  uuid           PRIMARY KEY DEFAULT uuidv7(),
  organization_id     uuid           NOT NULL REFERENCES organization (id),
  number_series_id    uuid           NOT NULL,                  -- Označení series (entity_type = ASSET)
  sequence_number     bigint         NOT NULL,
  designation         text           NOT NULL,                  -- FROZEN inventární číslo
  name                text           NOT NULL,
  category            asset_category NOT NULL,
  account_number      text           NOT NULL,                  -- D8: balance-sheet majetkový účet number (02x/01x/03x)
  directive_code      char(3),                                  -- D8 anchor: renumber survival + závěrka classifier (NOT the posting key)
  acquisition_date    date,                                     -- datum pořízení
  commissioning_date  date           NOT NULL,                  -- datum zařazení do užívání — depreciation START
  disposal_date       date,                                     -- datum vyřazení
  disposal_method     asset_disposal_method,
  acquisition_cost    numeric(19,4)  NOT NULL,                  -- pořizovací cena účetní (§47)
  improvement_total   numeric(19,4)  NOT NULL DEFAULT 0,        -- technické zhodnocení účetní (§33)
  location            text,                                     -- umístění
  responsible_user_id uuid           REFERENCES app_user (id),
  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_at          timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT asset_id_org_unique      UNIQUE (id, organization_id),
  CONSTRAINT asset_oznaceni_unique    UNIQUE (number_series_id, sequence_number),
  CONSTRAINT asset_series_fk          FOREIGN KEY (number_series_id, organization_id) REFERENCES number_series (id, organization_id),
  CONSTRAINT asset_directive_fk       FOREIGN KEY (directive_code) REFERENCES directive_account (code),
  CONSTRAINT asset_account_number_chk CHECK (account_number ~ '^[0-9]{2,}(\.[0-9A-Za-z]+)*$')
);

-- depreciation_plan — ÚČETNÍ odpisový plán; drives MD 551 / D 08x monthly (ČÚS 013,
-- Vyhláška §56). Revision history (D4). Closes posting.depreciation_plan_id.
CREATE TABLE depreciation_plan (
  id                 uuid                     PRIMARY KEY DEFAULT uuidv7(),
  organization_id    uuid                     NOT NULL REFERENCES organization (id),
  asset_id           uuid                     NOT NULL,
  supersedes_plan_id uuid,                                       -- D4: prior plan this revises (self-FK); history kept
  method             depreciation_method      NOT NULL,          -- účetní; MVP STRAIGHT_LINE
  start_date         date                     NOT NULL,          -- = commissioning_date (or revision date)
  useful_life_months smallint,                                   -- doba odpisování (STRAIGHT_LINE)
  residual_value     numeric(19,4)            NOT NULL DEFAULT 0, -- zbytková hodnota (§56/3)
  monthly_amount     numeric(19,4)            NOT NULL,          -- měsíční účetní odpis
  expense_account_number     text             NOT NULL,          -- D8: účet 551 number
  accumulated_account_number text             NOT NULL,          -- D8: účet 08x/07x number
  status             depreciation_plan_status NOT NULL DEFAULT 'ACTIVE',
  created_at         timestamptz              NOT NULL DEFAULT now(),
  updated_at         timestamptz              NOT NULL DEFAULT now(),
  CONSTRAINT depreciation_plan_id_org_unique  UNIQUE (id, organization_id),
  CONSTRAINT depreciation_plan_asset_fk       FOREIGN KEY (asset_id, organization_id)           REFERENCES asset (id, organization_id),
  CONSTRAINT depreciation_plan_supersedes_fk  FOREIGN KEY (supersedes_plan_id, organization_id) REFERENCES depreciation_plan (id, organization_id),
  CONSTRAINT depreciation_plan_expense_chk     CHECK (expense_account_number     ~ '^[0-9]{2,}(\.[0-9A-Za-z]+)*$'),
  CONSTRAINT depreciation_plan_accumulated_chk CHECK (accumulated_account_number ~ '^[0-9]{2,}(\.[0-9A-Za-z]+)*$')
  -- account-pairing (02x↔08x / 01x↔07x) + resolver fail-loud + copy-forward pre-flight = service/migration (V2-DEFERRED).
);

-- tax_depreciation — DAŇOVÉ odpisy per asset (1:1); NOT posted. Feeds DPPO + odložená
-- daň (ČÚS 003). accumulated_amount STORED (annual, can be suspended — not derivable).
CREATE TABLE tax_depreciation (
  id                      uuid                    PRIMARY KEY DEFAULT uuidv7(),
  organization_id         uuid                    NOT NULL REFERENCES organization (id),
  asset_id                uuid                    NOT NULL,
  depreciation_group_code smallint               NOT NULL REFERENCES depreciation_group (code),
  method                  tax_depreciation_method NOT NULL,        -- irrevocable (§30/2)
  tax_base                numeric(19,4)           NOT NULL,        -- vstupní cena daňová (§29)
  tax_improvement_total   numeric(19,4)           NOT NULL DEFAULT 0, -- TZ daňové (§33)
  accumulated_amount      numeric(19,4)           NOT NULL DEFAULT 0, -- claimed cumulative — STORED
  start_year              smallint                NOT NULL,        -- rok zahájení (§26/5)
  is_suspended            boolean                 NOT NULL DEFAULT false, -- přerušení (§26/8)
  created_at              timestamptz             NOT NULL DEFAULT now(),
  updated_at              timestamptz             NOT NULL DEFAULT now(),
  CONSTRAINT tax_depreciation_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT tax_depreciation_asset_unique  UNIQUE (asset_id, organization_id),   -- 1:1
  CONSTRAINT tax_depreciation_asset_fk      FOREIGN KEY (asset_id, organization_id) REFERENCES asset (id, organization_id)
);

-- inventory_count — inventurní soupis (ZoÚ §29–30). Below books; differences generate
-- postings. Append-only at migration. Označení (D6).
CREATE TABLE inventory_count (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid        NOT NULL REFERENCES organization (id),
  number_series_id uuid        NOT NULL,                  -- Označení series (entity_type = INVENTORY_COUNT)
  sequence_number  bigint      NOT NULL,
  designation      text        NOT NULL,                  -- FROZEN soupis č.
  count_date       date        NOT NULL,                  -- datum inventury (§30/2)
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_count_id_org_unique   UNIQUE (id, organization_id),
  CONSTRAINT inventory_count_oznaceni_unique UNIQUE (number_series_id, sequence_number),
  CONSTRAINT inventory_count_series_fk       FOREIGN KEY (number_series_id, organization_id) REFERENCES number_series (id, organization_id)
);

-- inventory_count_line — položka soupisu (D7): one counted item, book vs actual.
CREATE TABLE inventory_count_line (
  id                 uuid                 PRIMARY KEY DEFAULT uuidv7(),
  organization_id    uuid                 NOT NULL REFERENCES organization (id),
  inventory_count_id uuid                 NOT NULL,
  asset_id           uuid,                                -- counted asset; NULL for stock/cash (zásoby deferred)
  description        text                 NOT NULL,
  book_value         numeric(19,4)        NOT NULL,       -- účetní stav
  actual_value       numeric(19,4)        NOT NULL,       -- skutečný stav
  difference_kind    inventory_difference NOT NULL,       -- sign(actual − book)
  created_at         timestamptz          NOT NULL DEFAULT now(),
  updated_at         timestamptz          NOT NULL DEFAULT now(),
  CONSTRAINT inventory_count_line_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT inventory_count_line_count_fk FOREIGN KEY (inventory_count_id, organization_id) REFERENCES inventory_count (id, organization_id),
  CONSTRAINT inventory_count_line_asset_fk FOREIGN KEY (asset_id, organization_id)           REFERENCES asset (id, organization_id),
  CONSTRAINT inventory_count_line_diff_chk CHECK (
    (difference_kind = 'MATCH'    AND actual_value = book_value) OR
    (difference_kind = 'SHORTAGE' AND actual_value < book_value) OR
    (difference_kind = 'SURPLUS'  AND actual_value > book_value)
  )
);

-- Activate the deferred posting FKs (the supporting tables now exist).
ALTER TABLE posting
  ADD CONSTRAINT posting_depreciation_plan_fk FOREIGN KEY (depreciation_plan_id, organization_id)
    REFERENCES depreciation_plan (id, organization_id),
  ADD CONSTRAINT posting_inventory_count_fk FOREIGN KEY (inventory_count_id, organization_id)
    REFERENCES inventory_count (id, organization_id);

-- =============================================================================
-- SALDOKONTO (open items) — párování pohledávek a závazků (§16, ČÚS 001)
-- =============================================================================
-- Decision 1 (Hleb 2026-06-30): track each unpaid receivable/payable and its
-- settlement matching. PERENNIAL (not period-scoped): an invoice issued in one
-- period is paid in another, so open_item references the saldokonto account BY
-- NUMBER (D8, like asset/depreciation), resolved per-period by the books layer,
-- NOT the per-period account_id. Counterparty denormalized (composite FK, the
-- accounting_event pattern) so "all unpaid items for X" is one indexed read. Only
-- accounts flagged account.tracks_open_items participate; population is a posting-
-- time service step. Enforcement (RLS / append-only / maintenance) is wired in the
-- enforcement layer below (see "SALDOKONTO enforcement").
CREATE TYPE open_item_direction AS ENUM ('RECEIVABLE', 'PAYABLE');  -- pohledávka / závazek

-- open_item — one open obligation. settled_amount maintained by the settlement
-- trigger; remaining_amount / is_settled GENERATED. Mutable (settled_amount moves).
CREATE TABLE open_item (
  id                 uuid                PRIMARY KEY DEFAULT uuidv7(),
  organization_id    uuid                NOT NULL,
  workspace_id       uuid                NOT NULL,
  counterparty_id    uuid                NOT NULL,                 -- protistrana (workspace-shared)
  origin_posting_id  uuid                NOT NULL,                 -- the invoice posting that opened the obligation
  account_number     text                NOT NULL,                 -- saldokonto účet (311/321/…) BY NUMBER (D8, perennial)
  direction          open_item_direction NOT NULL,                 -- RECEIVABLE | PAYABLE (pohledávka / závazek)
  variable_symbol    text,                                         -- VS / párovací symbol
  original_amount    numeric(19,4)       NOT NULL,                 -- full obligation (účetní měna)
  currency_code      char(3)             NOT NULL REFERENCES currency (code),
  issue_date         date                NOT NULL,                 -- datum vystavení
  due_date           date,                                         -- splatnost
  settled_amount     numeric(19,4)       NOT NULL DEFAULT 0,       -- maintained by the settlement trigger (may exceed original = přeplatek)
  remaining_amount   numeric(19,4)       GENERATED ALWAYS AS (original_amount - settled_amount) STORED,
  is_settled         boolean             GENERATED ALWAYS AS (settled_amount >= original_amount) STORED,
  created_at         timestamptz         NOT NULL DEFAULT now(),
  updated_at         timestamptz         NOT NULL DEFAULT now(),
  CONSTRAINT open_item_id_org_unique     UNIQUE (id, organization_id),
  CONSTRAINT open_item_org_fk            FOREIGN KEY (organization_id, workspace_id) REFERENCES organization (id, workspace_id),
  CONSTRAINT open_item_counterparty_fk   FOREIGN KEY (counterparty_id, workspace_id) REFERENCES counterparty (id, workspace_id),
  CONSTRAINT open_item_posting_fk        FOREIGN KEY (origin_posting_id, organization_id) REFERENCES posting (id, organization_id),
  CONSTRAINT open_item_amount_chk        CHECK (original_amount > 0 AND settled_amount >= 0),
  CONSTRAINT open_item_account_shape_chk CHECK (account_number ~ '^[0-9]{2,}(\.[0-9A-Za-z]+)*$')
);

-- open_item_settlement — one payment->obligation match (párování). M:N: a payment
-- clears many items, an item takes many partial payments. Append-only (a match is
-- corrected by a NEW match, never edited); negative amount = rozpárování / correction.
CREATE TABLE open_item_settlement (
  id                  uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id     uuid          NOT NULL,
  open_item_id        uuid          NOT NULL,                      -- the obligation being settled
  settling_posting_id uuid          NOT NULL,                      -- the payment posting (bank/cash, §13b)
  amount              numeric(19,4) NOT NULL,                      -- applied amount; negative = rozpárování
  settlement_date     date          NOT NULL,                      -- datum úhrady
  created_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT open_item_settlement_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT open_item_settlement_item_fk    FOREIGN KEY (open_item_id, organization_id)        REFERENCES open_item (id, organization_id),
  CONSTRAINT open_item_settlement_posting_fk FOREIGN KEY (settling_posting_id, organization_id) REFERENCES posting (id, organization_id),
  CONSTRAINT open_item_settlement_amount_chk CHECK (amount <> 0)
);
CREATE INDEX open_item_counterparty_idx       ON open_item (counterparty_id);
CREATE INDEX open_item_account_idx            ON open_item (organization_id, account_number);
CREATE INDEX open_item_unsettled_idx          ON open_item (organization_id, due_date) WHERE is_settled = false;
CREATE INDEX open_item_origin_posting_idx     ON open_item (origin_posting_id);
CREATE INDEX open_item_settlement_item_idx    ON open_item_settlement (open_item_id);
CREATE INDEX open_item_settlement_posting_idx ON open_item_settlement (settling_posting_id);

-- =============================================================================
-- READ-MODEL (books/reports materialization) — maintained turnover tables
-- =============================================================================
-- Books are NOT views (read-heavy SaaS = recompute-on-read compute bomb): maintained by
-- AFTER INSERT triggers on the posting lines, SAME transaction. Research-settled
-- (wf_7e287416-1ac + wf_84900453-894) + advisor-verified. Cumulative MD/Dal columns
-- (TigerBeetle shape); matviews + pg_ivm rejected. Triggers land in the migration (NOTE).

-- account_period_balance — double-entry obraty per (org, period, account).
-- Feeds obratová předvaha / hlavní kniha (summary) / rozvaha / výkaz zisku a ztráty.
CREATE TABLE account_period_balance (
  organization_id uuid          NOT NULL,
  period_id       uuid          NOT NULL,
  account_id      uuid          NOT NULL,                  -- the PERIOD chart account; cross-period joins use account.number/synthetic_code
  opening_balance numeric(19,4) NOT NULL DEFAULT 0,        -- počáteční stav (carried from prior closing; 0 for P&L 5xx/6xx)
  turnover_debit  numeric(19,4) NOT NULL DEFAULT 0,        -- obrat MD (signed-accumulating; storno may decrease, ČÚS 001)
  turnover_credit numeric(19,4) NOT NULL DEFAULT 0,        -- obrat Dal
  closing_balance numeric(19,4) GENERATED ALWAYS AS (opening_balance + turnover_debit - turnover_credit) STORED,  -- konečný stav
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, period_id, account_id),
  CONSTRAINT account_period_balance_period_fk   FOREIGN KEY (period_id, organization_id)  REFERENCES accounting_period (id, organization_id),
  CONSTRAINT account_period_balance_account_fk  FOREIGN KEY (account_id, organization_id) REFERENCES account (id, organization_id),
  CONSTRAINT account_period_balance_acct_period_fk FOREIGN KEY (account_id, period_id)    REFERENCES account (id, period_id)  -- B1: the balance's account belongs to THIS period's chart
);
CREATE INDEX account_period_balance_updated_idx ON account_period_balance (organization_id, period_id, updated_at);  -- cache token = max(updated_at), no hot counter
-- TRIGGER (migration): AFTER INSERT on posting_double_entry_line, SECURITY DEFINER owner app_owner, sets org+period from
--   the parent posting: INSERT … ON CONFLICT (org,period_id,account_id) DO UPDATE SET turnover_x = turnover_x + EXCLUDED.
--   GRANT SELECT,INSERT,UPDATE (NOT append-only; no R8 mutation block). 701 opening postings are tagged is_opening and
--   EXCLUDED from turnover (they set opening_balance) but still appear in the deník. Drift job: Σ(all lines)=closing_balance.
--   §16 reconcile: Σ analytical closing_balance GROUP BY synthetic_code = synthetic closing_balance.

-- monetary_period_summary — cash-regime (peněžní deník) totals.
-- Feeds peněžní deník totals / přehled o příjmech a výdajích (§13b/3) / DPFO (§7b).
CREATE TABLE monetary_period_summary (
  id              uuid               PRIMARY KEY DEFAULT uuidv7(),  -- surrogate: a nullable category_id can't sit in a PRIMARY KEY
  organization_id uuid               NOT NULL,
  period_id       uuid               NOT NULL,
  category_id     uuid,                                            -- nullable (uncategorized); folds via NULLS NOT DISTINCT
  direction       monetary_direction NOT NULL,                     -- INFLOW / OUTFLOW (příjem/výdaj)
  is_tax_relevant boolean            NOT NULL,                     -- daňový vs nedaňový (§9)
  is_clearing     boolean            NOT NULL,                     -- průběžná položka; tax/přehled views WHERE is_clearing=false
  location        monetary_location  NOT NULL,                     -- CASH (hotovost) / BANK (banka) — money position
  total_amount    numeric(19,4)      NOT NULL DEFAULT 0,
  total_tax_base  numeric(19,4)      NOT NULL DEFAULT 0,           -- Σ zaklad_dane (the §7b daňový základ)
  updated_at      timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT monetary_period_summary_period_fk   FOREIGN KEY (period_id, organization_id)   REFERENCES accounting_period (id, organization_id),
  CONSTRAINT monetary_period_summary_category_fk FOREIGN KEY (category_id, organization_id) REFERENCES category (id, organization_id),
  CONSTRAINT monetary_period_summary_grain_unique UNIQUE NULLS NOT DISTINCT
    (organization_id, period_id, category_id, direction, is_tax_relevant, is_clearing, location),  -- ON CONFLICT target; folds uncategorized
  -- minor: průběžná položka (bank<->till transfer) is neither příjem nor výdaj -> carries no tax base (§7b/§9)
  CONSTRAINT monetary_period_summary_clearing_chk CHECK (is_clearing = false OR total_tax_base = 0)
);
-- TRIGGER (migration): AFTER INSERT on posting_monetary_line, same SECURITY DEFINER upsert pattern.

-- =============================================================================
-- OUTPUT (period_output = vystup §5.5) — R9-derived marker, append-only
-- =============================================================================
-- The period deliverable marker. R9-DERIVED (no stored numbers — figures recomputed from
-- the read-model: rozvaha/VZZ from account_period_balance closing via the directive_account
-- statement-line mapping; přehledy/DPFO from monetary_period_summary). R6-gated, append-only.
CREATE TYPE period_output_type AS ENUM ('FINANCIAL_STATEMENTS', 'OVERVIEWS', 'PERSONAL_INCOME_TAX');

CREATE TABLE period_output (
  id              uuid               PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid               NOT NULL REFERENCES organization (id),
  period_id       uuid               NOT NULL,                  -- obdobi_id (§5.5)
  type            period_output_type NOT NULL,                  -- FINANCIAL_STATEMENTS (PU) / OVERVIEWS (JU §13b/3) / PERSONAL_INCOME_TAX (DE §7b)
  generated_at    timestamptz        NOT NULL DEFAULT now(),    -- okamžik sestavení — append-only finalization marker
  generated_by    uuid               NOT NULL REFERENCES app_user (id),  -- R10 attributable
  CONSTRAINT period_output_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT period_output_period_fk     FOREIGN KEY (period_id, organization_id) REFERENCES accounting_period (id, organization_id)
  -- R6-gated (service: every účetní případ of the period posted before output, §8/3). R9-DERIVED (no number column).
  -- Append-only (no updated_at; migration trigger blocks UPDATE/DELETE — a closing marker can't be deleted to reopen, V2-DEFERRED).
  -- NOT unique (period_id, type): append-only re-issues (opravná / mimořádná / mezitímní závěrka). R11 trace via the read-model.
);
CREATE INDEX period_output_period_idx ON period_output (period_id, organization_id);

-- =============================================================================
-- READ SURFACE — org -> its self-counterparty (access pattern, NOT new state)
-- =============================================================================
-- The org<->self-counterparty link is the single UNIQUE FK
-- counterparty.self_of_organization_id. We expose the reverse (org -> its
-- counterparty) WITHOUT a column on the thin platform organization table and
-- WITHOUT a junction table (the relationship is a static 1:1; a junction only
-- earns its keep at M:N or when temporal history of the link is needed).
--
-- Two ergonomic surfaces, layered on the one source of truth:
--   FK (truth) -> VIEW A (DB read shape) -> accessor B (targeted app fetch on A).
--
-- VIEW A — organization_identity:
--   org row + its self-counterparty id (and, once identity columns land on
--   counterparty, legal_name / ico / dic / address). LEFT JOIN, so an org with no
--   self row yet yields NULLs. Use for set reads / reporting / any non-TS client.
--
--   security_invoker = true (PG15+) is MANDATORY. Without it the view runs with
--   the OWNER's rights and BYPASSES the caller's RLS, leaking counterparty rows
--   across tenants. With it, the underlying organization + counterparty RLS apply
--   to the querying role.
CREATE VIEW organization_identity
  WITH (security_invoker = true) AS
SELECT
  o.id           AS id,
  o.workspace_id AS workspace_id,
  o.slug         AS slug,
  o.person_type  AS person_type,
  c.id           AS self_counterparty_id   -- + legal_name/ico/dic/address once on counterparty
FROM organization o
LEFT JOIN counterparty c ON c.self_of_organization_id = o.id;

-- ACCESSOR B — getSelfCounterparty(orgId) (app/domain layer):
--   targeted single-org lookup that reads VIEW A, e.g. to fill an issued
--   invoice's supplier block from the org's own identity. NOT YET EXECUTABLE: no
--   v2 domain package exists; the live @workspace/accounting is the Czech v1.
--   The real accessor is written with the v2 domain build (handoff plan). Contract:
--
--     function getSelfCounterparty(orgId: string) {
--       return db.select().from(organizationIdentity)
--         .where(eq(organizationIdentity.id, orgId)).limit(1);
--     }
--
--   Batch in loops to avoid N+1: ... where(inArray(organizationIdentity.id, ids)).

-- =============================================================================
-- FK / JOIN INDEXES (M3) — every FK leading edge that a book query or the
-- read-model trigger joins on; PKs/UNIQUEs already cover the *_id_org targets.
-- =============================================================================
CREATE INDEX posting_de_line_posting_idx   ON posting_double_entry_line (posting_id);
CREATE INDEX posting_de_line_account_idx   ON posting_double_entry_line (account_id);
CREATE INDEX posting_de_line_partial_idx   ON posting_double_entry_line (partial_record_id);
CREATE INDEX posting_mon_line_posting_idx  ON posting_monetary_line (posting_id);
CREATE INDEX posting_mon_line_category_idx ON posting_monetary_line (category_id);
CREATE INDEX posting_mon_line_partial_idx  ON posting_monetary_line (partial_record_id);
CREATE INDEX posting_period_idx            ON posting (period_id);
CREATE INDEX posting_summary_idx           ON posting (summary_record_id);
CREATE INDEX posting_event_idx             ON posting (accounting_event_id);
CREATE INDEX posting_corrects_idx          ON posting (corrects_posting_id);
CREATE INDEX summary_record_period_idx     ON summary_record (period_id);
CREATE INDEX accounting_event_period_idx   ON accounting_event (period_id);
CREATE INDEX individual_record_doc_idx     ON individual_record (summary_record_id);
CREATE INDEX individual_record_event_idx   ON individual_record (accounting_event_id);
CREATE INDEX partial_record_line_idx       ON partial_record (individual_record_id);
CREATE INDEX account_parent_idx            ON account (parent_id);
CREATE INDEX account_chart_idx             ON account (chart_id);
CREATE INDEX account_group_code_idx        ON account (group_code);
CREATE INDEX account_synthetic_code_idx    ON account (synthetic_code);
CREATE INDEX account_period_balance_acct_idx ON account_period_balance (account_id);
CREATE INDEX signature_event_idx           ON signature (event_id);
CREATE INDEX signature_posting_idx         ON signature (posting_id);
CREATE INDEX depreciation_plan_asset_idx   ON depreciation_plan (asset_id);
CREATE INDEX tax_depreciation_group_idx    ON tax_depreciation (depreciation_group_code);
CREATE INDEX inventory_count_line_count_idx ON inventory_count_line (inventory_count_id);
CREATE INDEX inventory_count_line_asset_idx ON inventory_count_line (asset_id);

-- #############################################################################
-- ENFORCEMENT LAYER — the guard-rails (RLS · append-only · period · R4 · books)
-- #############################################################################
-- Written in full per "nothing deferred". Modeled on v1 migrations 0003/0026/0027.
-- ROLES: assumes the platform roles app_owner (schema owner), app_admin (BYPASSRLS),
-- app_user (the app's runtime role) created by migrations 0002/0003. On a scratch
-- validation DB these already exist; app_user grants are guarded with IF EXISTS so
-- the file still applies where app_user is absent.
--
-- TENANCY TIERS (ADR-0010 / CLAUDE.md "Multi-tenant Isolation"):
--   * org-scoped      -> organization_isolation policy on app.organization_id (FORCE RLS)
--   * workspace-scoped -> counterparty: 4 command-specific policies on app.workspace_id
--   * read-model       -> ENABLE (not FORCE) RLS so the app_owner-owned maintenance
--                         trigger writes freely; app_user gets isolated SELECT only
--   * reference (the law) -> no RLS (holds no tenant data); GRANT SELECT to all
--   * platform stubs (app_user/workspace/organization) -> RLS lives in 0002/0003, skip

-- =============================================================================
-- 1. FORCE RLS + organization_isolation on every org-scoped accounting table
-- =============================================================================
DO $$
DECLARE
  tbl text;
  org_scoped text[] := ARRAY[
    'organization_business_activity', 'accounting_period', 'vat_status',
    'number_series', 'accounting_event', 'signature', 'summary_record',
    'individual_record', 'partial_record', 'chart_of_accounts', 'account',
    'category', 'posting', 'posting_double_entry_line', 'posting_monetary_line',
    'asset', 'depreciation_plan', 'tax_depreciation', 'inventory_count',
    'inventory_count_line', 'period_output',
    'open_item', 'open_item_settlement'
  ];
BEGIN
  FOREACH tbl IN ARRAY org_scoped LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', tbl);
    EXECUTE format($p$
      CREATE POLICY organization_isolation ON %I
        USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
        WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
    $p$, tbl);
  END LOOP;
END
$$;

-- =============================================================================
-- 2. counterparty — workspace-scoped, 4 command-specific policies
-- =============================================================================
-- Shared read across the office; a self-of-org row is immune to other orgs' edits
-- and undeletable while its org exists (the design-comment policy block, made real).
ALTER TABLE counterparty ENABLE ROW LEVEL SECURITY;
ALTER TABLE counterparty FORCE  ROW LEVEL SECURITY;

CREATE POLICY counterparty_select ON counterparty FOR SELECT
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY counterparty_insert ON counterparty FOR INSERT
  -- self-restriction: org B must not be able to FORGE org A's self-identity row (squat
  -- the UNIQUE self_of_organization_id, lock A out, then make it undeletable). You may
  -- only insert a shared row (self NULL) or your OWN self row.
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
              AND (self_of_organization_id IS NULL
                   OR self_of_organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid));

CREATE POLICY counterparty_update ON counterparty FOR UPDATE
  -- USING also carries the self-restriction: you may only TARGET a shared row or your
  -- own self row — else org B could grab org A's self-identity row (workspace matches).
  USING      (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
              AND (self_of_organization_id IS NULL
                   OR self_of_organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid))
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
              AND (self_of_organization_id IS NULL
                   OR self_of_organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid));

CREATE POLICY counterparty_delete ON counterparty FOR DELETE
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
         AND self_of_organization_id IS NULL);

-- =============================================================================
-- 3. Read-model tables — ENABLE (not FORCE) RLS so the app_owner maintenance
--    trigger writes through; app_user reads its own org only (M5)
-- =============================================================================
DO $$
DECLARE
  tbl text;
  read_model text[] := ARRAY['account_period_balance', 'monetary_period_summary'];
BEGIN
  FOREACH tbl IN ARRAY read_model LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);   -- NOT forced: owner-run trigger bypasses
    EXECUTE format($p$
      CREATE POLICY organization_isolation ON %I
        USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
        WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
    $p$, tbl);
  END LOOP;
END
$$;

-- =============================================================================
-- 4. app_user grants — mutable (full DML) vs append-only (SELECT+INSERT) vs
--    read-model (SELECT only) vs reference (SELECT only). app_admin DML +
--    default privileges come from 0003. The REVOKE on append-only tables is
--    defense-in-depth: the BEFORE triggers below are the AUTHORITATIVE block
--    (they fire regardless of role, even when app_user inherits app_admin DML).
-- =============================================================================
DO $$
DECLARE
  tbl text;
  mutable text[] := ARRAY[
    'organization_business_activity', 'accounting_period', 'vat_status',
    'number_series', 'accounting_event', 'summary_record', 'individual_record',
    'partial_record', 'chart_of_accounts', 'account', 'category',
    'asset', 'depreciation_plan', 'tax_depreciation', 'inventory_count',
    'inventory_count_line', 'counterparty'
  ];
  append_only text[] := ARRAY[
    'posting', 'posting_double_entry_line', 'posting_monetary_line',
    'signature', 'period_output', 'open_item_settlement'
  ];
  read_model text[] := ARRAY['account_period_balance', 'monetary_period_summary'];
  reference text[] := ARRAY[
    'regime', 'legal_form', 'legal_form_allowed_regime', 'accounting_size',
    'vat_regime', 'currency', 'business_activity', 'account_group',
    'directive_account', 'depreciation_group'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    FOREACH tbl IN ARRAY mutable LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', tbl);
    END LOOP;
    FOREACH tbl IN ARRAY append_only LOOP
      EXECUTE format('GRANT SELECT, INSERT ON %I TO app_user', tbl);
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM app_user', tbl);
    END LOOP;
    FOREACH tbl IN ARRAY read_model LOOP
      EXECUTE format('GRANT SELECT ON %I TO app_user', tbl);            -- maintained by the trigger, not the app
    END LOOP;
    FOREACH tbl IN ARRAY reference LOOP
      EXECUTE format('GRANT SELECT ON %I TO app_user', tbl);            -- the law: read-only to tenants
    END LOOP;
  END IF;
END
$$;

-- =============================================================================
-- 5. Append-only (R8 §35) — posted records are corrected, never edited/deleted
-- =============================================================================
-- A change to a posted record is a NEW posting (corrects_posting_id, ČÚS 001 §35).
-- Blocks UPDATE/DELETE/TRUNCATE on posting + both line shapes + signature +
-- period_output (v1 left podpis/vystup mutable — closed here, per V2-DEFERRED).
CREATE OR REPLACE FUNCTION app_block_mutation_accounting()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only (R8 §35): % blocked. Correct via a new posting (corrects_posting_id) / new record, never an edit.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;
ALTER FUNCTION app_block_mutation_accounting() OWNER TO app_owner;

CREATE OR REPLACE FUNCTION app_block_truncate_accounting()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (R8 §35); TRUNCATE is blocked.', TG_TABLE_NAME
    USING ERRCODE = 'feature_not_supported';
END;
$$;
ALTER FUNCTION app_block_truncate_accounting() OWNER TO app_owner;

DO $$
DECLARE
  tbl text;
  append_only text[] := ARRAY[
    'posting', 'posting_double_entry_line', 'posting_monetary_line',
    'signature', 'period_output', 'open_item_settlement'
  ];
BEGIN
  FOREACH tbl IN ARRAY append_only LOOP
    EXECUTE format('CREATE TRIGGER %I_block_update    BEFORE UPDATE    ON %I FOR EACH ROW       EXECUTE FUNCTION app_block_mutation_accounting()', tbl, tbl);
    EXECUTE format('CREATE TRIGGER %I_block_delete    BEFORE DELETE    ON %I FOR EACH ROW       EXECUTE FUNCTION app_block_mutation_accounting()', tbl, tbl);
    EXECUTE format('CREATE TRIGGER %I_block_truncate  BEFORE TRUNCATE  ON %I FOR EACH STATEMENT EXECUTE FUNCTION app_block_truncate_accounting()', tbl, tbl);
  END LOOP;
END
$$;

-- SALDOKONTO enforcement (maintenance · tamper-lock · period guard).
-- Review fix (MAJOR): settled_amount is moved ONLY by this maintenance trigger, never by the
-- app. The trigger is SECURITY DEFINER (owner app_owner) and app_user gets SELECT+INSERT only on
-- open_item (UPDATE/DELETE revoked below), so settled_amount cannot diverge from
-- Σ(open_item_settlement.amount) out of band — drift is structural, not policed. The owner write
-- resolves under FORCE RLS because the session GUC (app.organization_id) is still set and the
-- row's org matches (composite FK). settled_amount may exceed original_amount (přeplatek) ->
-- remaining_amount goes negative (allowed). Append-only above covers open_item_settlement (a match
-- is reversed by a new negative-amount match, never edited).
CREATE OR REPLACE FUNCTION app_maintain_open_item_settled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
BEGIN
  UPDATE open_item
     SET settled_amount = settled_amount + NEW.amount,
         updated_at = now()
   WHERE id = NEW.open_item_id;
  RETURN NULL;
END;
$$;
ALTER FUNCTION app_maintain_open_item_settled() OWNER TO app_owner;
CREATE TRIGGER open_item_settlement_maintain
  AFTER INSERT ON open_item_settlement
  FOR EACH ROW EXECUTE FUNCTION app_maintain_open_item_settled();

-- Review fix (BLOCKER): a settlement must not post into a CLOSED period (every sibling write-path
-- is period-guarded; this one was not). Period resolved from the settling payment posting;
-- settlement_date (datum úhrady) must fall within it. Append-only prevents editing a settlement
-- after its period closes.
CREATE OR REPLACE FUNCTION app_open_item_settlement_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_period uuid;
BEGIN
  SELECT period_id INTO v_period FROM posting WHERE id = NEW.settling_posting_id;
  PERFORM app_assert_period_writable(v_period, 'open_item_settlement', NEW.settlement_date);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_open_item_settlement_period_guard() OWNER TO app_owner;
CREATE TRIGGER open_item_settlement_period_guard BEFORE INSERT ON open_item_settlement
  FOR EACH ROW EXECUTE FUNCTION app_open_item_settlement_period_guard();

-- Review fix (MAJOR): lock settled_amount — app_user may create/read open_items but never
-- UPDATE/DELETE (the SECURITY DEFINER trigger above is the sole writer of settled_amount).
-- open_item is NOT in the bulk grant arrays; this is its only grant.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT ON open_item TO app_user;
    REVOKE UPDATE, DELETE ON open_item FROM app_user;
  END IF;
END
$$;

-- =============================================================================
-- 6. Closed-period + date∈period guard (R12 §17 + datum membership)
-- =============================================================================
-- Covers HEADERS (posting, summary_record) AND the line/capture tables (M6 +
-- V2-DEFERRED: v1 guarded headers only, so a line could be appended into a
-- now-closed period). Each guard reads the CURRENT period status, so a close
-- between header-insert and line-insert is caught. SECURITY INVOKER: runs in the
-- writer's RLS context (app.organization_id set), so the period read resolves.

CREATE OR REPLACE FUNCTION app_assert_period_writable(p_period_id uuid, p_what text, p_date date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_status period_status; v_start date; v_end date;
BEGIN
  SELECT status, period_start, period_end INTO v_status, v_start, v_end
    FROM accounting_period WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accounting_period % not visible for this tenant (% blocked)', p_period_id, p_what
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_status = 'CLOSED' THEN
    RAISE EXCEPTION 'accounting_period % is CLOSED (uzavřeno): no new % (R12 §17). Post into an open period.', p_period_id, p_what
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_date IS NOT NULL AND (p_date < v_start OR p_date > v_end) THEN
    RAISE EXCEPTION '% date % is outside its period % [% .. %] (datum ∈ období)', p_what, p_date, p_period_id, v_start, v_end
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
ALTER FUNCTION app_assert_period_writable(uuid, text, date) OWNER TO app_owner;

-- header: posting — period open + posting_date ∈ period
CREATE OR REPLACE FUNCTION app_posting_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM app_assert_period_writable(NEW.period_id, 'posting', NEW.posting_date);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_posting_period_guard() OWNER TO app_owner;
CREATE TRIGGER posting_period_guard BEFORE INSERT ON posting
  FOR EACH ROW EXECUTE FUNCTION app_posting_period_guard();

-- header: summary_record — period must be OPEN. NO issued_at ∈ period check: a doklad's
-- okamžik vyhotovení (§11/1d) is NOT a period-boundary fact — a received invoice issued in
-- January for a December supply legitimately books into the still-open prior period. Period
-- membership is governed by the case's occurred_at / DUZP (guarded on accounting_event, §3/1).
CREATE OR REPLACE FUNCTION app_summary_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM app_assert_period_writable(NEW.period_id, 'summary_record', NULL);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_summary_period_guard() OWNER TO app_owner;
CREATE TRIGGER summary_record_period_guard BEFORE INSERT ON summary_record
  FOR EACH ROW EXECUTE FUNCTION app_summary_period_guard();

-- line: posting_double_entry_line — own period_id (B1) must still be OPEN (M6)
CREATE OR REPLACE FUNCTION app_de_line_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM app_assert_period_writable(NEW.period_id, 'posting_double_entry_line', NULL);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_de_line_period_guard() OWNER TO app_owner;
CREATE TRIGGER posting_de_line_period_guard BEFORE INSERT ON posting_double_entry_line
  FOR EACH ROW EXECUTE FUNCTION app_de_line_period_guard();

-- line: posting_monetary_line — period via parent posting must still be OPEN (M6)
CREATE OR REPLACE FUNCTION app_mon_line_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_period uuid;
BEGIN
  SELECT period_id INTO v_period FROM posting WHERE id = NEW.posting_id;
  PERFORM app_assert_period_writable(v_period, 'posting_monetary_line', NULL);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_mon_line_period_guard() OWNER TO app_owner;
CREATE TRIGGER posting_mon_line_period_guard BEFORE INSERT ON posting_monetary_line
  FOR EACH ROW EXECUTE FUNCTION app_mon_line_period_guard();

-- capture: individual_record — period via its summary_record must still be OPEN
CREATE OR REPLACE FUNCTION app_individual_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_period uuid;
BEGIN
  SELECT period_id INTO v_period FROM summary_record WHERE id = NEW.summary_record_id;
  PERFORM app_assert_period_writable(v_period, 'individual_record', NULL);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_individual_period_guard() OWNER TO app_owner;
CREATE TRIGGER individual_record_period_guard BEFORE INSERT ON individual_record
  FOR EACH ROW EXECUTE FUNCTION app_individual_period_guard();

-- capture: partial_record — period via individual_record -> summary_record (M6 deepest)
CREATE OR REPLACE FUNCTION app_partial_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_period uuid;
BEGIN
  SELECT s.period_id INTO v_period
    FROM individual_record i JOIN summary_record s ON s.id = i.summary_record_id
   WHERE i.id = NEW.individual_record_id;
  PERFORM app_assert_period_writable(v_period, 'partial_record', NULL);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_partial_period_guard() OWNER TO app_owner;
CREATE TRIGGER partial_record_period_guard BEFORE INSERT ON partial_record
  FOR EACH ROW EXECUTE FUNCTION app_partial_period_guard();

-- capture: accounting_event — the case's own period (M2 / decision 2) must be OPEN + occurred_at ∈ period
CREATE OR REPLACE FUNCTION app_event_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM app_assert_period_writable(NEW.period_id, 'accounting_event', NEW.occurred_at::date);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_event_period_guard() OWNER TO app_owner;
CREATE TRIGGER accounting_event_period_guard BEFORE INSERT ON accounting_event
  FOR EACH ROW EXECUTE FUNCTION app_event_period_guard();

-- reopen gate — a CLOSED period must not be silently reopened by the runtime role, which
-- would let new postings mutate a sealed period's balances. Closing (OPEN->CLOSED) is always
-- allowed. Reopening (CLOSED->OPEN) is a controlled cascade (storno the old 701, re-close,
-- recompute next period's opening — READ-MODEL-DESIGN §5) and is restricted to the elevated
-- service path (app_admin / app_owner), never plain app_user.
CREATE OR REPLACE FUNCTION app_block_period_reopen()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'CLOSED' AND NEW.status = 'OPEN'
     AND current_user NOT IN ('app_owner', 'app_admin') THEN
    RAISE EXCEPTION
      'accounting_period % cannot be reopened by % (R12 §17): reopen is a controlled, privileged cascade.', OLD.id, current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_block_period_reopen() OWNER TO app_owner;
CREATE TRIGGER accounting_period_reopen_gate BEFORE UPDATE ON accounting_period
  FOR EACH ROW EXECUTE FUNCTION app_block_period_reopen();

-- =============================================================================
-- 7. R4 — double entry balances (Σ MD = Σ Dal, ≥2 on-balance lines) with the
--    OFF_BALANCE exemption (M1: podrozvahové post single-sided)
-- =============================================================================
-- DEFERRABLE INITIALLY DEFERRED constraint trigger (fires at COMMIT) so a
-- multi-line posting is legal mid-transaction. Fires from BOTH posting (catches
-- an empty posting) and the line (catches lines added later). Pure numeric(19,4).
-- Cash-regime postings have no double_entry_line and skip.
-- SECURITY DEFINER (owner app_owner = BYPASSRLS): the nature / line lookups must NOT
-- be blindable. A SECURITY INVOKER version let a caller clear app.organization_id just
-- before COMMIT so the RLS-filtered `account` JOIN returned 0 rows -> v_onbal=0 -> the
-- whole Σ(MD)=Σ(Dal) check was skipped and an unbalanced posting committed. As DEFINER
-- the balance check sees every line of the posting regardless of session GUC. Read-only.
CREATE OR REPLACE FUNCTION app_assert_posting_balanced(p_posting_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_regime     text;
  v_is_opening boolean;
  v_total      integer;
  v_onbal      integer;
  v_debit_n    integer;
  v_credit_n   integer;
  v_pl_n       integer;
  v_md         numeric(19,4);
  v_d          numeric(19,4);
BEGIN
  SELECT regime_code, is_opening INTO v_regime, v_is_opening FROM posting WHERE id = p_posting_id;
  IF NOT FOUND THEN RETURN; END IF;                 -- posting gone (delete is blocked anyway)
  IF v_regime <> 'DOUBLE_ENTRY' THEN RETURN; END IF;

  SELECT count(*) INTO v_total
    FROM posting_double_entry_line WHERE posting_id = p_posting_id;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'posting % (DOUBLE_ENTRY) has no lines (R3/R4 §13/2)', p_posting_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- on-balance lines only: OFF_BALANCE (podrozvaha) lines post single-sided (M1)
  SELECT count(*),
         count(*) FILTER (WHERE l.side = 'DEBIT'),
         count(*) FILTER (WHERE l.side = 'CREDIT'),
         count(*) FILTER (WHERE a.nature IN ('EXPENSE','REVENUE')),
         COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'DEBIT'),  0),
         COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'CREDIT'), 0)
    INTO v_onbal, v_debit_n, v_credit_n, v_pl_n, v_md, v_d
    FROM posting_double_entry_line l
    JOIN account a ON a.id = l.account_id
   WHERE l.posting_id = p_posting_id
     AND a.nature <> 'OFF_BALANCE';

  IF v_onbal > 0 THEN
    IF v_onbal < 2 THEN
      RAISE EXCEPTION 'posting % has single-sided on-balance lines (need >=2 for a double entry; R4 §13/2)', p_posting_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- §13/2: a posting books on the Má dáti side of one account AND the Dal side of another
    -- (closes the same-side-netting-to-zero degenerate: 211 +1000 / 211 -1000).
    IF v_debit_n = 0 OR v_credit_n = 0 THEN
      RAISE EXCEPTION 'posting % must touch both a Má dáti and a Dal side (§13/2)', p_posting_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_md <> v_d THEN
      RAISE EXCEPTION 'posting % is unbalanced: Σ(MD)=% Σ(Dal)=% (R4 §13/2)', p_posting_id, v_md, v_d
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- an opening posting (701) sets počáteční stavy of balance-sheet accounts only; P&L
  -- accounts (5xx/6xx) start each period at zero and never carry an opening balance (ČÚS 002).
  IF v_is_opening AND v_pl_n > 0 THEN
    RAISE EXCEPTION 'opening posting % touches a P&L (5xx/6xx) account: opening balances are balance-sheet only (ČÚS 002)', p_posting_id
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
ALTER FUNCTION app_assert_posting_balanced(uuid) OWNER TO app_owner;

-- wrappers are SECURITY DEFINER so the (revoked-from-PUBLIC) assert helper is reachable
-- only through these triggers, never as a direct app_user oracle.
CREATE OR REPLACE FUNCTION app_posting_balance_from_posting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN PERFORM app_assert_posting_balanced(NEW.id); RETURN NULL; END;
$$;
ALTER FUNCTION app_posting_balance_from_posting() OWNER TO app_owner;

CREATE OR REPLACE FUNCTION app_posting_balance_from_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN PERFORM app_assert_posting_balanced(NEW.posting_id); RETURN NULL; END;
$$;
ALTER FUNCTION app_posting_balance_from_line() OWNER TO app_owner;
REVOKE EXECUTE ON FUNCTION app_assert_posting_balanced(uuid) FROM PUBLIC;

CREATE CONSTRAINT TRIGGER posting_balanced
  AFTER INSERT ON posting
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app_posting_balance_from_posting();

CREATE CONSTRAINT TRIGGER posting_de_line_balanced
  AFTER INSERT ON posting_double_entry_line
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app_posting_balance_from_line();

-- =============================================================================
-- 8. Read-model maintenance — balances auto-update when you post (same tx)
-- =============================================================================
-- AFTER INSERT on the posting lines upserts the turnover/summary tables. SECURITY
-- DEFINER owner app_owner: the read-model tables are ENABLE-not-FORCE RLS, so the
-- owner write bypasses RLS (the row's org/period come from the line + parent, never
-- a session GUC). 701 opening postings (is_opening) feed opening_balance and are
-- EXCLUDED from turnover (else they double-count). closing_balance is GENERATED.
CREATE OR REPLACE FUNCTION app_maintain_account_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_is_opening boolean;
  v_debit  numeric(19,4) := CASE WHEN NEW.side = 'DEBIT'  THEN NEW.amount ELSE 0 END;
  v_credit numeric(19,4) := CASE WHEN NEW.side = 'CREDIT' THEN NEW.amount ELSE 0 END;
BEGIN
  SELECT is_opening INTO v_is_opening FROM posting WHERE id = NEW.posting_id;

  IF v_is_opening THEN
    -- opening posting (701): sets opening_balance (debit-positive), not turnover; stays in deník
    INSERT INTO account_period_balance (organization_id, period_id, account_id, opening_balance)
    VALUES (NEW.organization_id, NEW.period_id, NEW.account_id, v_debit - v_credit)
    ON CONFLICT (organization_id, period_id, account_id) DO UPDATE
      SET opening_balance = account_period_balance.opening_balance + EXCLUDED.opening_balance,
          updated_at = now();
  ELSE
    INSERT INTO account_period_balance (organization_id, period_id, account_id, turnover_debit, turnover_credit)
    VALUES (NEW.organization_id, NEW.period_id, NEW.account_id, v_debit, v_credit)
    ON CONFLICT (organization_id, period_id, account_id) DO UPDATE
      SET turnover_debit  = account_period_balance.turnover_debit  + EXCLUDED.turnover_debit,
          turnover_credit = account_period_balance.turnover_credit + EXCLUDED.turnover_credit,
          updated_at = now();
  END IF;
  RETURN NULL;
END;
$$;
ALTER FUNCTION app_maintain_account_balance() OWNER TO app_owner;
CREATE TRIGGER posting_de_line_maintain_balance
  AFTER INSERT ON posting_double_entry_line
  FOR EACH ROW EXECUTE FUNCTION app_maintain_account_balance();

CREATE OR REPLACE FUNCTION app_maintain_monetary_summary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE v_period uuid;
BEGIN
  SELECT period_id INTO v_period FROM posting WHERE id = NEW.posting_id;

  INSERT INTO monetary_period_summary
    (organization_id, period_id, category_id, direction, is_tax_relevant, is_clearing, location, total_amount, total_tax_base)
  VALUES
    (NEW.organization_id, v_period, NEW.category_id, NEW.direction, NEW.is_tax_relevant, NEW.is_clearing, NEW.location,
     NEW.amount, COALESCE(NEW.tax_base, 0))
  ON CONFLICT (organization_id, period_id, category_id, direction, is_tax_relevant, is_clearing, location) DO UPDATE
    SET total_amount   = monetary_period_summary.total_amount   + EXCLUDED.total_amount,
        total_tax_base = monetary_period_summary.total_tax_base + EXCLUDED.total_tax_base,
        updated_at = now();
  RETURN NULL;
END;
$$;
ALTER FUNCTION app_maintain_monetary_summary() OWNER TO app_owner;
CREATE TRIGGER posting_mon_line_maintain_summary
  AFTER INSERT ON posting_monetary_line
  FOR EACH ROW EXECUTE FUNCTION app_maintain_monetary_summary();

-- =============================================================================
-- 9. §16 analytical evidence + R6 output-completeness + R5 reconcile
-- =============================================================================
-- §16 structural invariant (the enforceable half of R5): a synthetic that HAS
-- analytical children receives NO direct posting — you post to the analytics.
-- (The full Σ(analytical)=synthetic equality is a period aggregate -> the
-- reconcile FUNCTION below, run by the drift job; it cannot be a per-row trigger.)
CREATE OR REPLACE FUNCTION app_block_post_to_parent_account()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM account c WHERE c.parent_id = NEW.account_id) THEN
    RAISE EXCEPTION
      'account % has analytical children: post to an analytical account, not the synthetic (§16 ČÚS 001)', NEW.account_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_block_post_to_parent_account() OWNER TO app_owner;
CREATE TRIGGER posting_de_line_no_parent_post BEFORE INSERT ON posting_double_entry_line
  FOR EACH ROW EXECUTE FUNCTION app_block_post_to_parent_account();

-- R6 — a period deliverable (period_output) may be finalized only when every
-- účetní případ of the period is posted (§8/3). Completeness on the case->posting
-- link (not per-dílčí — the v1 cash-path hole). An individual_record (a case on a
-- doklad) in the period must have a matching posting (same event + same doklad).
CREATE OR REPLACE FUNCTION app_assert_period_complete()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_unposted integer;
BEGIN
  SELECT count(*) INTO v_unposted
    FROM individual_record i
    JOIN summary_record  s ON s.id = i.summary_record_id
   WHERE s.period_id = NEW.period_id
     AND NOT EXISTS (
       SELECT 1 FROM posting p
        WHERE p.accounting_event_id = i.accounting_event_id
          AND p.summary_record_id  = i.summary_record_id
          AND p.period_id          = NEW.period_id);   -- the satisfying posting must be IN this period
  IF v_unposted > 0 THEN
    RAISE EXCEPTION
      'period % has % unposted case(s): cannot finalize output before every účetní případ is posted (R6 §8/3)', NEW.period_id, v_unposted
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_assert_period_complete() OWNER TO app_owner;
CREATE TRIGGER period_output_completeness_gate BEFORE INSERT ON period_output
  FOR EACH ROW EXECUTE FUNCTION app_assert_period_complete();

-- Materialization drift reconcile — CALLABLE (the scheduled drift job runs it; not a
-- per-row trigger because it is a period-level aggregate). The safety net from the
-- read-model design §5: the read-model's closing_balance MUST equal Σ(all DE lines,
-- signed) for that account+period. Σ over ALL lines (incl. the 701 opening lines)
-- reconciles to closing_balance because closing_balance = opening + turnover and
-- opening = Σ(opening lines) — so no is_opening filter, no false positives. Returns
-- one row per drifting account; empty result = read-model agrees with the journal.
-- (The §16 Σ(analytical)=synthetic equality is a READ-TIME rollup — a synthetic with
-- children takes no direct posting (trigger above), so it has no stored balance row;
-- the hlavní-kniha view sums the analytics under the synthetic at read time.)
CREATE OR REPLACE FUNCTION app_reconcile_account_period(p_period_id uuid)
RETURNS TABLE (account_id uuid, read_model_closing numeric, journal_sum numeric)
LANGUAGE sql STABLE AS $$
  SELECT b.account_id, b.closing_balance,
         COALESCE((SELECT SUM(CASE WHEN l.side = 'DEBIT' THEN l.amount ELSE -l.amount END)
                     FROM posting_double_entry_line l
                    WHERE l.account_id = b.account_id AND l.period_id = b.period_id), 0)
    FROM account_period_balance b
   WHERE b.period_id = p_period_id
     AND b.closing_balance <> COALESCE((SELECT SUM(CASE WHEN l.side = 'DEBIT' THEN l.amount ELSE -l.amount END)
                     FROM posting_double_entry_line l
                    WHERE l.account_id = b.account_id AND l.period_id = b.period_id), 0);
$$;
ALTER FUNCTION app_reconcile_account_period(uuid) OWNER TO app_owner;

-- Defense-in-depth companion: surface any committed DOUBLE_ENTRY posting whose on-balance
-- lines do not balance (should be impossible given app_assert_posting_balanced, but the
-- drift job checks regardless so a slipped imbalance is detectable). Empty = all balance.
CREATE OR REPLACE FUNCTION app_find_unbalanced_postings(p_period_id uuid)
RETURNS TABLE (posting_id uuid, sum_debit numeric, sum_credit numeric)
LANGUAGE sql STABLE AS $$
  SELECT p.id,
         COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'DEBIT'),  0),
         COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'CREDIT'), 0)
    FROM posting p
    JOIN posting_double_entry_line l ON l.posting_id = p.id
    JOIN account a ON a.id = l.account_id AND a.nature <> 'OFF_BALANCE'
   WHERE p.period_id = p_period_id
   GROUP BY p.id
  HAVING COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'DEBIT'),  0)
       <> COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'CREDIT'), 0);
$$;
ALTER FUNCTION app_find_unbalanced_postings(uuid) OWNER TO app_owner;

-- Seed-validation (review fix, MAJOR / decision 3): the migration's account_group seed step + a
-- seed test MUST call this after loading the directive chart and assert it returns NO rows. It
-- lists every on-statement group (not internal 8–9, not OFF_BALANCE/CLOSING) left without a
-- rozvaha/VZZ line — empty = the cascade's group fallback is total, so no tenant synthetic can
-- fall off the závěrka via a null group. (Enforced here, not as a per-row CHECK, so minimal test
-- fixtures that seed a bare account_group are unaffected.)
CREATE OR REPLACE FUNCTION app_unmapped_account_groups()
RETURNS TABLE (code char(2), class smallint, name_cs text)
LANGUAGE sql STABLE AS $$
  SELECT g.code, g.class, g.name_cs
    FROM account_group g
   WHERE NOT g.is_internal
     AND (g.nature IS NULL OR g.nature NOT IN ('OFF_BALANCE', 'CLOSING'))
     AND g.balance_sheet_line    IS NULL
     AND g.income_statement_line IS NULL
     AND NOT (g.balance_sheet_line_when_debit IS NOT NULL AND g.balance_sheet_line_when_credit IS NOT NULL);
$$;
ALTER FUNCTION app_unmapped_account_groups() OWNER TO app_owner;

-- =============================================================================
-- 10. Cash-posting minimum-line invariant + clearing-item line CHECK
-- =============================================================================
-- Symmetric with R4: a cash-regime posting (peněžní deník) must record at least one
-- money movement. Without it an empty SINGLE_ENTRY/TAX_RECORDS header counts as "posted"
-- and lets R6 finalize output with a case carrying no zaúčtování. DEFERRABLE so a posting
-- + its lines insert in any order within the transaction. SECURITY DEFINER (read-only).
CREATE OR REPLACE FUNCTION app_assert_cash_posting_has_lines(p_posting_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE v_regime text; v_n integer;
BEGIN
  SELECT regime_code INTO v_regime FROM posting WHERE id = p_posting_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_regime NOT IN ('SINGLE_ENTRY', 'TAX_RECORDS') THEN RETURN; END IF;
  SELECT count(*) INTO v_n FROM posting_monetary_line WHERE posting_id = p_posting_id;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'cash posting % has no peněžní-deník line (a zaúčtování must record the money movement)', p_posting_id
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
ALTER FUNCTION app_assert_cash_posting_has_lines(uuid) OWNER TO app_owner;

CREATE OR REPLACE FUNCTION app_cash_posting_lines_from_posting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN PERFORM app_assert_cash_posting_has_lines(NEW.id); RETURN NULL; END;
$$;
ALTER FUNCTION app_cash_posting_lines_from_posting() OWNER TO app_owner;
REVOKE EXECUTE ON FUNCTION app_assert_cash_posting_has_lines(uuid) FROM PUBLIC;

CREATE CONSTRAINT TRIGGER posting_cash_has_lines
  AFTER INSERT ON posting
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app_cash_posting_lines_from_posting();

-- a průběžná položka (bank<->till transfer) is neither příjem nor výdaj -> no tax base
-- (§7b/§9). Enforced at the source line (fails fast) as well as on the read-model summary.
ALTER TABLE posting_monetary_line
  ADD CONSTRAINT posting_monetary_line_clearing_chk
  CHECK (is_clearing = false OR COALESCE(tax_base, 0) = 0);

COMMIT;

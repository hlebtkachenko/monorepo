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
  CONSTRAINT vat_status_dates_chk CHECK (valid_to IS NULL OR valid_from <= valid_to)
  -- non-overlap per org enforced at the service layer.
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
  number_series_id uuid        NOT NULL,                  -- Označení series (entity_type = EVENT)
  sequence_number  bigint      NOT NULL,                  -- gapless position in the série
  designation      text        NOT NULL,                  -- FROZEN Označení string (gov/audit id; immune to later pattern edits)
  party_id         uuid,                                  -- OUR side (counterparty)
  counterparty_id  uuid,                                  -- THEIR side (counterparty)
  description      text        NOT NULL,                  -- obsah úč. případu (§11/1b)
  content          text,                                  -- optional longer detail
  occurred_at      timestamptz NOT NULL,                  -- okamžik uskutečnění (§11/1e)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounting_event_org_fk          FOREIGN KEY (organization_id, workspace_id) REFERENCES organization (id, workspace_id),
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
  CONSTRAINT summary_record_id_org_unique       UNIQUE (id, organization_id)
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
  CONSTRAINT partial_record_vat_zero_chk  CHECK (vat_mode NOT IN ('EXEMPT', 'OUTSIDE_VAT') OR vat_amount = 0),
  CONSTRAINT partial_record_qty_price_chk CHECK (quantity IS NULL OR unit_price IS NULL OR base_amount = round(quantity * unit_price, 4)),
  CONSTRAINT partial_record_vat_tol_chk   CHECK (vat_mode <> 'STANDARD' OR vat_rate IS NULL OR abs(vat_amount - round(base_amount * vat_rate / 100, 0)) <= 1)
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
  CONSTRAINT account_group_class_chk CHECK (class BETWEEN 0 AND 9)
);

-- directive_account — NON-BINDING recommendation catalogue (3-digit synthetic),
-- seeded from coa.json. Tenants may invent synthetics within a group (legal), so the
-- link from account is nullable. Carries the závěrka statement-line mapping.
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
  -- rozvaha builder: if the *_when_debit/_when_credit pair is set, pick the row by sign(closing_balance); else use balance_sheet_line.
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
  CONSTRAINT chart_id_org_unique  UNIQUE (id, organization_id)
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
  specializes_directive_code char(3),                            -- nullable soft link to the 3-digit catalogue
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT account_id_org_unique        UNIQUE (id, organization_id),   -- posting line -> account target
  CONSTRAINT account_id_chart_unique      UNIQUE (id, chart_id),          -- parent-same-chart target
  CONSTRAINT account_chart_number_unique  UNIQUE (chart_id, number),
  CONSTRAINT account_chart_fk     FOREIGN KEY (chart_id, organization_id) REFERENCES chart_of_accounts (id, organization_id),
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
  created_at           timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT posting_id_org_unique        UNIQUE (id, organization_id),
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
  regime_code       text          NOT NULL,                     -- CHECK = 'DOUBLE_ENTRY' (R7); composite FK carries tenancy+regime
  account_id        uuid          NOT NULL,                      -- ucet_id (§5.3, R1) — valid account from the org chart
  partial_record_id uuid,                                        -- dilci_id (§5.3) "Zaúčtování" §6/2; nullable for generated postings (701, depreciation, storno)
  side              debit_credit  NOT NULL,                      -- strana (§5.3): MD | Dal
  amount            numeric(19,4) NOT NULL,                      -- castka (§5.3, R13); may be negative (storno)
  created_at        timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT posting_de_line_regime_chk CHECK (regime_code = 'DOUBLE_ENTRY'),
  CONSTRAINT posting_de_line_posting_fk FOREIGN KEY (posting_id, organization_id, regime_code)
    REFERENCES posting (id, organization_id, regime_code),
  CONSTRAINT posting_de_line_account_fk FOREIGN KEY (account_id, organization_id)
    REFERENCES account (id, organization_id),                                        -- R1
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
  CONSTRAINT account_period_balance_period_fk  FOREIGN KEY (period_id, organization_id)  REFERENCES accounting_period (id, organization_id),
  CONSTRAINT account_period_balance_account_fk FOREIGN KEY (account_id, organization_id) REFERENCES account (id, organization_id)
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
    (organization_id, period_id, category_id, direction, is_tax_relevant, is_clearing, location)  -- ON CONFLICT target; folds uncategorized
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

COMMIT;

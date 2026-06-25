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
CREATE TYPE book_kind         AS ENUM ('LEDGER', 'CASH_JOURNAL');

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

CREATE TYPE number_series_entity AS ENUM ('EVENT', 'DOCUMENT');
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
  sequence_number  bigint      NOT NULL,                  -- gapless Označení
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
  sequence_number  bigint              NOT NULL,            -- gapless Označení
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

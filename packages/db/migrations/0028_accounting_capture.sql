-- 0028_accounting_capture.sql
--
-- v2 accounting — capture core (number_series · event · signature · doklad · dílčí)
--
-- Source: docs/specs/accounting-schema.sql (PG18-validated v2 design, #395 tip 0ea2bf31).
-- §33 + §6/1 + §11. Composite (fk, organization_id) FKs; signature.posting_id added in 0029.
-- Handwritten SQL (ADR-0009). One whole-file transaction; runs through the safe runner path.

BEGIN;

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

COMMIT;

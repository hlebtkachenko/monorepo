-- 0031_accounting_saldokonto.sql
--
-- v2 accounting — saldokonto open items (open_item + open_item_settlement)
--
-- Source: docs/specs/accounting-schema.sql (PG18-validated v2 design, #395 tip 0ea2bf31).
-- Enforcement (RLS / append-only / maintenance / period guard / tamper-lock) lands in 0034.
-- Handwritten SQL (ADR-0009). One whole-file transaction; runs through the safe runner path.

BEGIN;

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

COMMIT;

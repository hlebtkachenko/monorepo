-- 0031_accounting_supporting.sql
--
-- v2 accounting — supporting (asset · depreciation · tax depreciation · inventory)
--
-- Source: docs/specs/accounting-schema.sql (PG18-validated v2 design, #395 tip 0ea2bf31).
-- depreciation_group already in 0024. Activates the two deferred posting FKs at the end.
-- Handwritten SQL (ADR-0009). One whole-file transaction; runs through the safe runner path.

BEGIN;

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

COMMIT;

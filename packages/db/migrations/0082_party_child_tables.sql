-- 0082_party_child_tables.sql
--
-- adresar (Directories) M1 PR 1b — the counterparty's child detail tables:
-- addresses, contacts, bank accounts, extra identifiers. All WORKSPACE-scoped
-- (like their parent counterparty), so a party's details are shared across every
-- org book in the office and never duplicated per client.
--
-- Each child carries `workspace_id` and a COMPOSITE FK
-- (counterparty_id, workspace_id) -> counterparty(id, workspace_id): the parent's
-- UNIQUE(id, workspace_id) is the target, closing the cross-workspace FK-bypass
-- hole (a plain single-column FK check runs internal and skips RLS). Each gets
-- FORCE RLS + the four command-specific policies keyed on `app.workspace_id`,
-- mirroring counterparty (0035) / inbox_attachment (0057).
--
-- GDPR: party_contact and party_address may hold NATURAL-PERSON personal data
-- (a contact's name / e-mail / phone; an OSVČ's residence). Lawful basis is the
-- same as the counterparty.name already processed — Art. 6(1)(c), statutory
-- accounting/tax record-keeping (ZoÚ 563/1991, §31–32 archival periods), not
-- Art. 9 special category. Retention follows the statutory archival period;
-- erasure is archival/anonymisation, NEVER a hard delete of booked history.
-- `valid_to` retires a detail without destroying it.
--
-- party_bank_account.published / blocked / verified are security-sensitive (they
-- feed CRPDPH "zveřejněný účet" trust): all default FALSE, so an unverified,
-- unpublished account is never implicitly trusted.
--
-- Empty tables, no seed. Handwritten SQL (ADR-0009); one whole-file transaction.

BEGIN;

-- =============================================================================
-- 1. party_address — postal addresses (sídlo / korespondenční / …)
-- =============================================================================
CREATE TABLE party_address (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  workspace_id    uuid        NOT NULL REFERENCES workspace (id),
  counterparty_id uuid        NOT NULL,
  purpose         text        NOT NULL DEFAULT 'REGISTERED',
  country_code    char(2),
  region          text,
  municipality    text,       -- obec (free text; RUIAN register deferred)
  street          text,
  house_no        text,       -- číslo popisné
  orientation_no  text,       -- číslo orientační
  unit            text,       -- patro / byt
  postal_code     text,       -- PSČ (free text; postal_code register is M4)
  valid_from      date,
  valid_to        date,
  verified        boolean     NOT NULL DEFAULT false,
  source          text,       -- MANUAL / ARES / …
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT party_address_counterparty_fk
    FOREIGN KEY (counterparty_id, workspace_id)
    REFERENCES counterparty (id, workspace_id),
  CONSTRAINT party_address_purpose_chk
    CHECK (purpose IN ('REGISTERED', 'MAILING', 'DELIVERY', 'BILLING', 'OTHER')),
  CONSTRAINT party_address_country_chk
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')
);

-- =============================================================================
-- 2. party_contact — named people (jméno / funkce / e-mail / telefon)
-- =============================================================================
CREATE TABLE party_contact (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  workspace_id    uuid        NOT NULL REFERENCES workspace (id),
  counterparty_id uuid        NOT NULL,
  first_name      text,
  last_name       text,
  position        text,       -- funkce
  purpose         text        NOT NULL DEFAULT 'GENERAL',
  email           text,
  phone           text,
  valid_from      date,
  valid_to        date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT party_contact_counterparty_fk
    FOREIGN KEY (counterparty_id, workspace_id)
    REFERENCES counterparty (id, workspace_id),
  CONSTRAINT party_contact_purpose_chk
    CHECK (purpose IN ('GENERAL', 'BILLING', 'TECHNICAL', 'STATUTORY', 'SALES', 'OTHER'))
);

-- =============================================================================
-- 3. party_bank_account — účty (published/blocked/verified security-sensitive)
-- =============================================================================
CREATE TABLE party_bank_account (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  workspace_id    uuid        NOT NULL REFERENCES workspace (id),
  counterparty_id uuid        NOT NULL,
  holder          text,       -- majitel účtu
  account_number  text,       -- číslo účtu (předčíslí-číslo)
  bank_code       text,       -- kód banky (4 digits CZ)
  iban            text,
  bic             text,       -- SWIFT
  currency_code   char(3),
  purpose         text        NOT NULL DEFAULT 'GENERAL',
  is_primary      boolean     NOT NULL DEFAULT false,
  published       boolean     NOT NULL DEFAULT false,  -- CRPDPH zveřejněný účet
  blocked         boolean     NOT NULL DEFAULT false,
  verified        boolean     NOT NULL DEFAULT false,
  valid_from      date,
  valid_to        date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Composite-FK target for party_relationship.default_bank_account_id.
  CONSTRAINT party_bank_account_id_workspace_unique UNIQUE (id, workspace_id),
  CONSTRAINT party_bank_account_counterparty_fk
    FOREIGN KEY (counterparty_id, workspace_id)
    REFERENCES counterparty (id, workspace_id),
  CONSTRAINT party_bank_account_purpose_chk
    CHECK (purpose IN ('GENERAL', 'INCOMING', 'OUTGOING', 'OTHER')),
  CONSTRAINT party_bank_account_currency_chk
    CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$')
);

-- =============================================================================
-- 4. party_identifier — SECONDARY / foreign identifiers only (IČO/DIČ stay on
--    the party as scalar dedup keys; this holds LEI / EORI / foreign reg / …)
-- =============================================================================
CREATE TABLE party_identifier (
  id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
  workspace_id        uuid        NOT NULL REFERENCES workspace (id),
  counterparty_id     uuid        NOT NULL,
  identifier_type     text        NOT NULL,
  value               text        NOT NULL,
  normalized          text,
  issuer              text,
  valid_from          date,
  valid_to            date,
  verified            boolean     NOT NULL DEFAULT false,
  verification_source text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT party_identifier_counterparty_fk
    FOREIGN KEY (counterparty_id, workspace_id)
    REFERENCES counterparty (id, workspace_id),
  CONSTRAINT party_identifier_type_chk
    CHECK (identifier_type IN ('LEI', 'EORI', 'FOREIGN_REG', 'VAT_OTHER', 'OTHER'))
);

-- =============================================================================
-- 5. RLS — every child is workspace-scoped, 4 command-specific policies each
-- =============================================================================
DO $$
DECLARE
  tbl text;
  party_child text[] := ARRAY[
    'party_address', 'party_contact', 'party_bank_account', 'party_identifier'
  ];
BEGIN
  FOREACH tbl IN ARRAY party_child LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', tbl);
    EXECUTE format($p$
      CREATE POLICY %1$I_select ON %1$I FOR SELECT
        USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
    $p$, tbl);
    EXECUTE format($p$
      CREATE POLICY %1$I_insert ON %1$I FOR INSERT
        WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
    $p$, tbl);
    EXECUTE format($p$
      CREATE POLICY %1$I_update ON %1$I FOR UPDATE
        USING      (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
        WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
    $p$, tbl);
    EXECUTE format($p$
      CREATE POLICY %1$I_delete ON %1$I FOR DELETE
        USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
    $p$, tbl);
  END LOOP;
END
$$;

-- =============================================================================
-- 6. app_user grant — full DML on every child (same tier as counterparty)
-- =============================================================================
DO $$
DECLARE
  tbl text;
  party_child text[] := ARRAY[
    'party_address', 'party_contact', 'party_bank_account', 'party_identifier'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    FOREACH tbl IN ARRAY party_child LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', tbl);
    END LOOP;
  END IF;
END
$$;

COMMIT;

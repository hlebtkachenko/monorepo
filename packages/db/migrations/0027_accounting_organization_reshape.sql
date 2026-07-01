-- 0027_accounting_organization_reshape.sql
--
-- v2 accounting — organization reshape (ADD-only) + org↔law links + counterparty
--
-- Source: docs/specs/accounting-schema.sql (PG18-validated v2 design, #395 tip 0ea2bf31).
-- ALTERs the live platform organization (no CREATE). Adds accounting_period / vat_status / counterparty / org-NACE link.
-- Handwritten SQL (ADR-0009). One whole-file transaction; runs through the safe runner path.

BEGIN;

-- organization is a PRE-EXISTING platform table (created 0003_rls_force.sql); this is an
-- ADD-ONLY reshape, never a fresh CREATE (Open Decision 4 — coordinate with onboarding).
--   * UNIQUE(id, workspace_id): the composite-FK target the capture layer references (REQUIRED).
--   * person_type: the typed projection of the existing person_kind text column. GENERATED so
--     onboarding needs NO change (it keeps writing person_kind) and the two can never diverge.
ALTER TABLE organization
  ADD COLUMN person_type person_type
    GENERATED ALWAYS AS (
      CASE person_kind
        WHEN 'natural_person' THEN 'NATURAL'::person_type
        WHEN 'legal_entity'   THEN 'LEGAL'::person_type
      END
    ) STORED;

ALTER TABLE organization
  ADD CONSTRAINT organization_id_workspace_unique UNIQUE (id, workspace_id);

-- organization_business_activity — org's předmět podnikání (M:N to CZ-NACE).
CREATE TABLE organization_business_activity (
  organization_id        uuid NOT NULL REFERENCES organization (id),
  business_activity_code text NOT NULL REFERENCES business_activity (code),
  PRIMARY KEY (organization_id, business_activity_code)
);
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
-- counterparty (workspace-shared; self-of-org identity row). RLS policies land in 0034.
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

COMMIT;

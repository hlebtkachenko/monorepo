-- 0089_party_relationship.sql
--
-- adresar (Directories) M1 PR 1c — the ORG↔PARTY relationship. A counterparty is
-- workspace-shared identity; how a SINGLE org book relates to it (its per-org
-- defaults + classification) is org-scoped and lives here. Roles like
-- supplier/customer stay DERIVED from open_item.direction — this table stores only
-- what the org explicitly curates: a coarse relationship_type, posting defaults,
-- risk/blocked flags, an accounting profile.
--
-- CROSS-TIER FK HAZARD (the reason this table is careful): it is org-scoped
-- (organization_isolation on organization_id) yet must reference the
-- workspace-tier counterparty. A naive single-column FK counterparty_id ->
-- counterparty(id) runs internal to Postgres and SKIPS RLS, so org X could point a
-- relationship at org Y's party. Closed the same way accounting_event / open_item
-- do: carry workspace_id and use TWO composite FKs sharing it —
--   (organization_id, workspace_id) -> organization(id, workspace_id)
--   (counterparty_id,  workspace_id) -> counterparty(id, workspace_id)
-- so the org and the party are provably in the SAME workspace; a forged
-- workspace_id fails one of the two composite targets. default_bank_account_id
-- uses the same trick against party_bank_account(id, workspace_id).
--
-- Org-scoped (FORCE RLS + organization_isolation, NULLIF guard — ADR-0010).
-- Empty table, no seed. Handwritten SQL (ADR-0009); one whole-file transaction.

BEGIN;

CREATE TABLE party_relationship (
  id                      uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id         uuid        NOT NULL,
  workspace_id            uuid        NOT NULL,
  counterparty_id         uuid        NOT NULL,
  relationship_type       text,
  valid_from              date,
  valid_to                date,
  active                  boolean     NOT NULL DEFAULT true,
  source                  text        NOT NULL DEFAULT 'MANUAL',
  default_currency        char(3),
  default_payment_terms   integer,    -- net days
  default_bank_account_id uuid,
  accounting_profile      jsonb,
  risk_status             text,
  blocked                 boolean     NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- Deliberate SINGLETON: one relationship row per (org, party). valid_from/valid_to
  -- are "since-when this classification applies", NOT bitemporal history — a future
  -- relationship-history feature would drop this constraint.
  CONSTRAINT party_relationship_org_counterparty_unique
    UNIQUE (organization_id, counterparty_id),
  -- Two composite FKs sharing workspace_id — the cross-tier isolation lock.
  CONSTRAINT party_relationship_org_fk
    FOREIGN KEY (organization_id, workspace_id)
    REFERENCES organization (id, workspace_id),
  CONSTRAINT party_relationship_counterparty_fk
    FOREIGN KEY (counterparty_id, workspace_id)
    REFERENCES counterparty (id, workspace_id),
  -- The default bank account must belong to THIS relationship's counterparty (not
  -- just the same workspace) — pins it to (id, counterparty_id), so a default can
  -- never be another party's account. NULL default stays allowed (MATCH SIMPLE).
  CONSTRAINT party_relationship_bank_account_fk
    FOREIGN KEY (default_bank_account_id, counterparty_id)
    REFERENCES party_bank_account (id, counterparty_id),
  CONSTRAINT party_relationship_type_chk
    CHECK (relationship_type IS NULL
           OR relationship_type IN ('CUSTOMER', 'SUPPLIER', 'OWNER', 'PARTNER', 'OTHER')),
  CONSTRAINT party_relationship_source_chk
    CHECK (source IN ('MANUAL', 'DERIVED')),
  CONSTRAINT party_relationship_currency_chk
    CHECK (default_currency IS NULL OR default_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT party_relationship_payment_terms_chk
    CHECK (default_payment_terms IS NULL OR default_payment_terms >= 0)
);

-- Serve the default-bank-account FK check (the org UNIQUE already leads with
-- organization_id, so the counterparty join is covered).
CREATE INDEX party_relationship_bank_account_idx
  ON party_relationship (default_bank_account_id);

-- Org-scoped RLS: FORCE + the standard organization_isolation policy (NULLIF guard).
ALTER TABLE party_relationship ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_relationship FORCE  ROW LEVEL SECURITY;

CREATE POLICY organization_isolation ON party_relationship
  USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON party_relationship TO app_user;
  END IF;
END
$$;

COMMIT;

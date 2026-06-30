-- 0033_accounting_output_read_surface.sql
--
-- v2 accounting — period_output marker + organization_identity view + FK/JOIN indexes
--
-- Source: docs/specs/accounting-schema.sql (PG18-validated v2 design, #395 tip 0ea2bf31).
-- R9-derived output marker; security_invoker view; the M3 index block.
-- Handwritten SQL (ADR-0009). One whole-file transaction; runs through the safe runner path.

BEGIN;

-- period_output (vystup §5.5) — R9-derived marker, append-only (trigger in 0034)
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

COMMIT;

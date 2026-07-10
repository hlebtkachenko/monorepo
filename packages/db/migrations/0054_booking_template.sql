-- 0054_booking_template.sql
--
-- Brain booking-template library — M2.1 (amends constitution §I9).
--
-- A booking_template is a REVIEWABLE record of a recurring transaction's
-- CONFIRMED accounting treatment: given a signature (counterparty + direction
-- + supply kind + VAT jurisdiction), it stores the předkontace scenario a
-- human already confirmed for that exact recurring case, so the Brain can
-- recognise "this is the same rent invoice as last month" and skip
-- re-reasoning it from scratch. It is NOT a write-template in the §I9 sense:
-- it renders nothing and posts nothing. A match only supplies the SAME
-- typed-function call the Brain would otherwise construct after full
-- reasoning (`create_accounting_event` / `create_accounting_posting`), which
-- still runs through the unchanged server-side gate (`runGatedWrite`) and is
-- still HELD at cold start. See `packages/brain/.brain/constitution.md` §I9
-- and `packages/brain/src/no-write-templates.boundary.test.ts` for the
-- narrow, explicit carve-out this amendment adds to the tripwire.
--
-- WORKSPACE-scoped (mirrors `counterparty` / `ocr_extraction_template`, ADR-0029):
-- a recurring counterparty relationship is a workspace fact, not an
-- organization fact — shared across every client book in the office. FORCE
-- RLS, four command-specific policies keyed on `app.workspace_id`, and the
-- composite UNIQUE(id, workspace_id) that closes the cross-workspace FK-bypass
-- hole for any org-tier table that later references a template.
--
-- Trust gate mirrors `ocr_extraction_template` exactly: a template starts
-- UNCONFIRMED (`human_confirmed_at IS NULL`) and is NEVER matchable until a
-- human confirms it (enforced at the API layer — the match query filters on
-- `human_confirmed_at IS NOT NULL`; the confirm endpoint is
-- `@RequireHumanActor()`-gated, an agent-actor key is rejected). Handwritten
-- SQL (ADR-0009). One whole-file transaction; runs through the safe runner path.

BEGIN;

-- =============================================================================
-- 1. Table
-- =============================================================================
CREATE TABLE booking_template (
  id                    uuid        PRIMARY KEY DEFAULT uuidv7(),
  workspace_id          uuid        NOT NULL REFERENCES workspace (id),

  -- The recurring-case SIGNATURE this template matches. Deliberately narrow and
  -- deterministic (no fuzzy matching). NOTE: this is a COARSE signature, NOT the
  -- full set of facts `classifyEvent` (packages/accounting/src/classify.ts) keys
  -- on — that decision takes NO counterparty and additionally keys on vatRate,
  -- isCreditNote, the §92 commodityCode, and serviceWindow/periodEnd/durable
  -- (none of which are here). A signature match identifies the recurring
  -- RELATIONSHIP; the rate/sign/commodity/deferral must be re-derived from the
  -- actual document at match-integration time, never frozen from confirmed_decision.
  counterparty_key      text        NOT NULL,   -- IČO or normalized counterparty name
  direction             text        NOT NULL CHECK (direction IN ('RECEIVED', 'ISSUED')),
  supply_kind           text        NOT NULL CHECK (supply_kind IN (
                          'GOODS', 'MATERIAL', 'SERVICES', 'UTILITY', 'RENT',
                          'INSURANCE', 'ASSET', 'ADVANCE', 'CREDIT_NOTE', 'OTHER'
                        )),
  jurisdiction          text        NOT NULL CHECK (jurisdiction IN (
                          'DOMESTIC', 'REVERSE_CHARGE', 'EU', 'IMPORT', 'EXEMPT', 'OUTSIDE_VAT'
                        )),
  -- Optional broader fingerprint (amount band / description keywords) for
  -- future drift-aware matching — unused by the M2.1 exact-signature matcher,
  -- reserved the same way ocr_extraction_template.layout_fingerprint is.
  signature_fingerprint text,

  -- The CONFIRMED accounting treatment SCAFFOLD to reapply on a match: a
  -- serialized `PostingDecision`-shaped object (scenario id, VAT mode/
  -- jurisdiction/rate, account overrides, saldo account, capitalise/deferral,
  -- §92 commodity code). Opaque Brain-owned JSON, never interpreted by SQL.
  -- ⚠ A scaffold, NOT a frozen payload: the amount/document-driven fields
  -- (rate, credit-note sign, §92 commodity, deferral) must be re-derived from
  -- the actual document at match-integration time — see the accounting domain
  -- module packages/accounting/src/booking-template.ts.
  confirmed_decision    jsonb       NOT NULL,

  human_confirmed_at    timestamptz,             -- NULL = unconfirmed (never matchable)
  match_count           integer     NOT NULL DEFAULT 0,   -- how many times reused
  held_count            integer     NOT NULL DEFAULT 0,   -- templated proposals HELD for review
  last_reject_at        timestamptz,
  version               integer     NOT NULL DEFAULT 1,
  learned_at            timestamptz NOT NULL DEFAULT now(),
  -- Provenance pointer (e.g. { toolCallLogId, conversationId }) — which
  -- human-approved booking this template was learned from. NO FK: tool_call_log
  -- is organization-scoped; a workspace→org FK would bypass RLS (mirrors
  -- brain_confident_wrong.last_incident_tool_call_log_id).
  provenance            jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT booking_template_id_workspace_unique UNIQUE (id, workspace_id)
);

-- One CONFIRMED template per signature per workspace. Partial (only applies
-- once human_confirmed_at is set) so multiple unconfirmed drafts for the same
-- signature can coexist while under review.
CREATE UNIQUE INDEX booking_template_confirmed_signature_unique
  ON booking_template (workspace_id, counterparty_key, direction, supply_kind, jurisdiction)
  WHERE human_confirmed_at IS NOT NULL;

-- =============================================================================
-- 2. RLS — workspace-scoped, 4 command-specific policies (mirror ocr_extraction_template)
-- =============================================================================
ALTER TABLE booking_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_template FORCE  ROW LEVEL SECURITY;

CREATE POLICY booking_template_select ON booking_template FOR SELECT
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY booking_template_insert ON booking_template FOR INSERT
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY booking_template_update ON booking_template FOR UPDATE
  USING      (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY booking_template_delete ON booking_template FOR DELETE
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

-- =============================================================================
-- 3. app_user grant — mutable (full DML), same tier as ocr_extraction_template
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON booking_template TO app_user;
  END IF;
END
$$;

COMMIT;

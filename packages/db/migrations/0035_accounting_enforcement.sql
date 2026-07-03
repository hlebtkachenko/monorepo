-- 0035_accounting_enforcement.sql
--
-- v2 accounting — enforcement layer (RLS · append-only · period · R4 · read-model · §16/R6/R5 · cash)
--
-- Source: docs/specs/accounting-schema.sql (PG18-validated v2 design, #395 tip 0ea2bf31).
-- Verbatim copy of the spec enforcement section. Assumes platform roles app_owner/app_admin/app_user (0002/0003); app_user grants guarded with IF EXISTS.
-- Handwritten SQL (ADR-0009). One whole-file transaction; runs through the safe runner path.

BEGIN;

-- =============================================================================
-- 1. FORCE RLS + organization_isolation on every org-scoped accounting table
-- =============================================================================
DO $$
DECLARE
  tbl text;
  org_scoped text[] := ARRAY[
    'organization_business_activity', 'accounting_period', 'vat_status',
    'number_series', 'accounting_event', 'signature', 'summary_record',
    'individual_record', 'partial_record', 'chart_of_accounts', 'account',
    'category', 'posting', 'posting_double_entry_line', 'posting_monetary_line',
    'asset', 'depreciation_plan', 'tax_depreciation', 'inventory_count',
    'inventory_count_line', 'period_output',
    'open_item', 'open_item_settlement'
  ];
BEGIN
  FOREACH tbl IN ARRAY org_scoped LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', tbl);
    EXECUTE format($p$
      CREATE POLICY organization_isolation ON %I
        USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
        WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
    $p$, tbl);
  END LOOP;
END
$$;

-- =============================================================================
-- 2. counterparty — workspace-scoped, 4 command-specific policies
-- =============================================================================
-- Shared read across the office; a self-of-org row is immune to other orgs' edits
-- and undeletable while its org exists (the design-comment policy block, made real).
ALTER TABLE counterparty ENABLE ROW LEVEL SECURITY;
ALTER TABLE counterparty FORCE  ROW LEVEL SECURITY;

CREATE POLICY counterparty_select ON counterparty FOR SELECT
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY counterparty_insert ON counterparty FOR INSERT
  -- self-restriction: org B must not be able to FORGE org A's self-identity row (squat
  -- the UNIQUE self_of_organization_id, lock A out, then make it undeletable). You may
  -- only insert a shared row (self NULL) or your OWN self row.
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
              AND (self_of_organization_id IS NULL
                   OR self_of_organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid));

CREATE POLICY counterparty_update ON counterparty FOR UPDATE
  -- USING also carries the self-restriction: you may only TARGET a shared row or your
  -- own self row — else org B could grab org A's self-identity row (workspace matches).
  USING      (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
              AND (self_of_organization_id IS NULL
                   OR self_of_organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid))
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
              AND (self_of_organization_id IS NULL
                   OR self_of_organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid));

CREATE POLICY counterparty_delete ON counterparty FOR DELETE
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
         AND self_of_organization_id IS NULL);

-- =============================================================================
-- 3. Read-model tables — ENABLE (not FORCE) RLS so the app_owner maintenance
--    trigger writes through; app_user reads its own org only (M5)
-- =============================================================================
DO $$
DECLARE
  tbl text;
  read_model text[] := ARRAY['account_period_balance', 'monetary_period_summary'];
BEGIN
  FOREACH tbl IN ARRAY read_model LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);   -- NOT forced: owner-run trigger bypasses
    -- Distinct policy name: these ENABLE-not-FORCE read-model tables isolate by
    -- org for defense-in-depth but are NOT part of the FORCE-RLS
    -- ORGANIZATION_SCOPED_TABLES set, so they must not carry the
    -- `organization_isolation` sentinel the drift detector keys on.
    EXECUTE format($p$
      CREATE POLICY read_model_isolation ON %I
        USING      (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
        WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
    $p$, tbl);
  END LOOP;
END
$$;

-- =============================================================================
-- 4. app_user grants — mutable (full DML) vs append-only (SELECT+INSERT) vs
--    read-model (SELECT only) vs reference (SELECT only). app_admin DML +
--    default privileges come from 0003. The REVOKE on append-only tables is
--    defense-in-depth: the BEFORE triggers below are the AUTHORITATIVE block
--    (they fire regardless of role, even when app_user inherits app_admin DML).
-- =============================================================================
DO $$
DECLARE
  tbl text;
  mutable text[] := ARRAY[
    'organization_business_activity', 'accounting_period', 'vat_status',
    'number_series', 'accounting_event', 'summary_record', 'individual_record',
    'partial_record', 'chart_of_accounts', 'account', 'category',
    'asset', 'depreciation_plan', 'tax_depreciation', 'inventory_count',
    'inventory_count_line', 'counterparty'
  ];
  append_only text[] := ARRAY[
    'posting', 'posting_double_entry_line', 'posting_monetary_line',
    'signature', 'period_output', 'open_item_settlement'
  ];
  read_model text[] := ARRAY['account_period_balance', 'monetary_period_summary'];
  reference text[] := ARRAY[
    'regime', 'legal_form', 'legal_form_allowed_regime', 'accounting_size',
    'vat_regime', 'currency', 'business_activity', 'account_group',
    'directive_account', 'depreciation_group'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    FOREACH tbl IN ARRAY mutable LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', tbl);
    END LOOP;
    FOREACH tbl IN ARRAY append_only LOOP
      EXECUTE format('GRANT SELECT, INSERT ON %I TO app_user', tbl);
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM app_user', tbl);
    END LOOP;
    FOREACH tbl IN ARRAY read_model LOOP
      EXECUTE format('GRANT SELECT ON %I TO app_user', tbl);            -- maintained by the trigger, not the app
    END LOOP;
    FOREACH tbl IN ARRAY reference LOOP
      EXECUTE format('GRANT SELECT ON %I TO app_user', tbl);            -- the law: read-only to tenants
    END LOOP;
  END IF;
END
$$;

-- =============================================================================
-- 5. Append-only (R8 §35) — posted records are corrected, never edited/deleted
-- =============================================================================
-- A change to a posted record is a NEW posting (corrects_posting_id, ČÚS 001 §35).
-- Blocks UPDATE/DELETE/TRUNCATE on posting + both line shapes + signature +
-- period_output (v1 left podpis/vystup mutable — closed here, per V2-DEFERRED).
CREATE OR REPLACE FUNCTION app_block_mutation_accounting()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only (R8 §35): % blocked. Correct via a new posting (corrects_posting_id) / new record, never an edit.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;
ALTER FUNCTION app_block_mutation_accounting() OWNER TO app_owner;

CREATE OR REPLACE FUNCTION app_block_truncate_accounting()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (R8 §35); TRUNCATE is blocked.', TG_TABLE_NAME
    USING ERRCODE = 'feature_not_supported';
END;
$$;
ALTER FUNCTION app_block_truncate_accounting() OWNER TO app_owner;

DO $$
DECLARE
  tbl text;
  append_only text[] := ARRAY[
    'posting', 'posting_double_entry_line', 'posting_monetary_line',
    'signature', 'period_output', 'open_item_settlement'
  ];
BEGIN
  FOREACH tbl IN ARRAY append_only LOOP
    EXECUTE format('CREATE TRIGGER %I_block_update    BEFORE UPDATE    ON %I FOR EACH ROW       EXECUTE FUNCTION app_block_mutation_accounting()', tbl, tbl);
    EXECUTE format('CREATE TRIGGER %I_block_delete    BEFORE DELETE    ON %I FOR EACH ROW       EXECUTE FUNCTION app_block_mutation_accounting()', tbl, tbl);
    EXECUTE format('CREATE TRIGGER %I_block_truncate  BEFORE TRUNCATE  ON %I FOR EACH STATEMENT EXECUTE FUNCTION app_block_truncate_accounting()', tbl, tbl);
  END LOOP;
END
$$;

-- SALDOKONTO enforcement (maintenance · tamper-lock · period guard).
-- Review fix (MAJOR): settled_amount is moved ONLY by this maintenance trigger, never by the
-- app. The trigger is SECURITY DEFINER (owner app_owner) and app_user gets SELECT+INSERT only on
-- open_item (UPDATE/DELETE revoked below), so settled_amount cannot diverge from
-- Σ(open_item_settlement.amount) out of band — drift is structural, not policed. The owner write
-- resolves under FORCE RLS because the session GUC (app.organization_id) is still set and the
-- row's org matches (composite FK). settled_amount may exceed original_amount (přeplatek) ->
-- remaining_amount goes negative (allowed). Append-only above covers open_item_settlement (a match
-- is reversed by a new negative-amount match, never edited).
CREATE OR REPLACE FUNCTION app_maintain_open_item_settled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
BEGIN
  UPDATE open_item
     SET settled_amount = settled_amount + NEW.amount,
         updated_at = now()
   WHERE id = NEW.open_item_id;
  RETURN NULL;
END;
$$;
ALTER FUNCTION app_maintain_open_item_settled() OWNER TO app_owner;
CREATE TRIGGER open_item_settlement_maintain
  AFTER INSERT ON open_item_settlement
  FOR EACH ROW EXECUTE FUNCTION app_maintain_open_item_settled();

-- Review fix (BLOCKER): a settlement must not post into a CLOSED period (every sibling write-path
-- is period-guarded; this one was not). Period resolved from the settling payment posting;
-- settlement_date (datum úhrady) must fall within it. Append-only prevents editing a settlement
-- after its period closes.
CREATE OR REPLACE FUNCTION app_open_item_settlement_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_period uuid;
BEGIN
  SELECT period_id INTO v_period FROM posting WHERE id = NEW.settling_posting_id;
  PERFORM app_assert_period_writable(v_period, 'open_item_settlement', NEW.settlement_date);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_open_item_settlement_period_guard() OWNER TO app_owner;
CREATE TRIGGER open_item_settlement_period_guard BEFORE INSERT ON open_item_settlement
  FOR EACH ROW EXECUTE FUNCTION app_open_item_settlement_period_guard();

-- Review fix (MAJOR): lock settled_amount — app_user may create/read open_items but never
-- UPDATE/DELETE (the SECURITY DEFINER trigger above is the sole writer of settled_amount).
-- open_item is NOT in the bulk grant arrays; this is its only grant.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT ON open_item TO app_user;
    REVOKE UPDATE, DELETE ON open_item FROM app_user;
  END IF;
END
$$;

-- Review fix v2 (MAJOR, found by the behavioral suite): the REVOKE above is NOT sufficient —
-- app_user INHERITS app_admin's table DML (0002 GRANTs app_admin TO app_user for the elevation
-- path), so has_table_privilege('app_user','open_item','UPDATE') stays true and a same-org
-- app_user could UPDATE settled_amount directly, bypassing the settlement ledger. Unlike the
-- append-only tables (whose BEFORE trigger is the authoritative block), open_item is mutable, so
-- it needs its OWN authoritative block. This BEFORE trigger rejects any direct UPDATE/DELETE by
-- the runtime role; the SECURITY DEFINER maintenance trigger passes because under it current_user
-- is app_owner (the function owner), the same privileged-role test the reopen gate uses.
CREATE OR REPLACE FUNCTION app_block_open_item_direct_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('app_owner', 'app_admin') THEN
    RAISE EXCEPTION
      'open_item is maintained by the settlement ledger: % blocked. settled_amount moves only via open_item_settlement (the SECURITY DEFINER maintenance trigger).', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
ALTER FUNCTION app_block_open_item_direct_write() OWNER TO app_owner;
CREATE TRIGGER open_item_block_direct_update BEFORE UPDATE ON open_item
  FOR EACH ROW EXECUTE FUNCTION app_block_open_item_direct_write();
CREATE TRIGGER open_item_block_direct_delete BEFORE DELETE ON open_item
  FOR EACH ROW EXECUTE FUNCTION app_block_open_item_direct_write();

-- =============================================================================
-- 6. Closed-period + date∈period guard (R12 §17 + datum membership)
-- =============================================================================
-- Covers HEADERS (posting, summary_record) AND the line/capture tables (M6 +
-- V2-DEFERRED: v1 guarded headers only, so a line could be appended into a
-- now-closed period). Each guard reads the CURRENT period status, so a close
-- between header-insert and line-insert is caught. SECURITY INVOKER: runs in the
-- writer's RLS context (app.organization_id set), so the period read resolves.

CREATE OR REPLACE FUNCTION app_assert_period_writable(p_period_id uuid, p_what text, p_date date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_status period_status; v_start date; v_end date;
BEGIN
  SELECT status, period_start, period_end INTO v_status, v_start, v_end
    FROM accounting_period WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accounting_period % not visible for this tenant (% blocked)', p_period_id, p_what
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_status = 'CLOSED' THEN
    RAISE EXCEPTION 'accounting_period % is CLOSED (uzavřeno): no new % (R12 §17). Post into an open period.', p_period_id, p_what
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_date IS NOT NULL AND (p_date < v_start OR p_date > v_end) THEN
    RAISE EXCEPTION '% date % is outside its period % [% .. %] (datum ∈ období)', p_what, p_date, p_period_id, v_start, v_end
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
ALTER FUNCTION app_assert_period_writable(uuid, text, date) OWNER TO app_owner;

-- header: posting — period open + posting_date ∈ period
CREATE OR REPLACE FUNCTION app_posting_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM app_assert_period_writable(NEW.period_id, 'posting', NEW.posting_date);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_posting_period_guard() OWNER TO app_owner;
CREATE TRIGGER posting_period_guard BEFORE INSERT ON posting
  FOR EACH ROW EXECUTE FUNCTION app_posting_period_guard();

-- header: summary_record — period must be OPEN. NO issued_at ∈ period check: a doklad's
-- okamžik vyhotovení (§11/1d) is NOT a period-boundary fact — a received invoice issued in
-- January for a December supply legitimately books into the still-open prior period. Period
-- membership is governed by the case's occurred_at / DUZP (guarded on accounting_event, §3/1).
CREATE OR REPLACE FUNCTION app_summary_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM app_assert_period_writable(NEW.period_id, 'summary_record', NULL);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_summary_period_guard() OWNER TO app_owner;
CREATE TRIGGER summary_record_period_guard BEFORE INSERT ON summary_record
  FOR EACH ROW EXECUTE FUNCTION app_summary_period_guard();

-- line: posting_double_entry_line — own period_id (B1) must still be OPEN (M6)
CREATE OR REPLACE FUNCTION app_de_line_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM app_assert_period_writable(NEW.period_id, 'posting_double_entry_line', NULL);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_de_line_period_guard() OWNER TO app_owner;
CREATE TRIGGER posting_de_line_period_guard BEFORE INSERT ON posting_double_entry_line
  FOR EACH ROW EXECUTE FUNCTION app_de_line_period_guard();

-- line: posting_monetary_line — period via parent posting must still be OPEN (M6)
CREATE OR REPLACE FUNCTION app_mon_line_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_period uuid;
BEGIN
  SELECT period_id INTO v_period FROM posting WHERE id = NEW.posting_id;
  PERFORM app_assert_period_writable(v_period, 'posting_monetary_line', NULL);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_mon_line_period_guard() OWNER TO app_owner;
CREATE TRIGGER posting_mon_line_period_guard BEFORE INSERT ON posting_monetary_line
  FOR EACH ROW EXECUTE FUNCTION app_mon_line_period_guard();

-- capture: individual_record — period via its summary_record must still be OPEN
CREATE OR REPLACE FUNCTION app_individual_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_period uuid;
BEGIN
  SELECT period_id INTO v_period FROM summary_record WHERE id = NEW.summary_record_id;
  PERFORM app_assert_period_writable(v_period, 'individual_record', NULL);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_individual_period_guard() OWNER TO app_owner;
CREATE TRIGGER individual_record_period_guard BEFORE INSERT ON individual_record
  FOR EACH ROW EXECUTE FUNCTION app_individual_period_guard();

-- capture: partial_record — period via individual_record -> summary_record (M6 deepest)
CREATE OR REPLACE FUNCTION app_partial_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_period uuid;
BEGIN
  SELECT s.period_id INTO v_period
    FROM individual_record i JOIN summary_record s ON s.id = i.summary_record_id
   WHERE i.id = NEW.individual_record_id;
  PERFORM app_assert_period_writable(v_period, 'partial_record', NULL);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_partial_period_guard() OWNER TO app_owner;
CREATE TRIGGER partial_record_period_guard BEFORE INSERT ON partial_record
  FOR EACH ROW EXECUTE FUNCTION app_partial_period_guard();

-- capture: accounting_event — the case's own period (M2 / decision 2) must be OPEN + occurred_at ∈ period
CREATE OR REPLACE FUNCTION app_event_period_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM app_assert_period_writable(NEW.period_id, 'accounting_event', NEW.occurred_at::date);
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_event_period_guard() OWNER TO app_owner;
CREATE TRIGGER accounting_event_period_guard BEFORE INSERT ON accounting_event
  FOR EACH ROW EXECUTE FUNCTION app_event_period_guard();

-- reopen gate — a CLOSED period must not be silently reopened by the runtime role, which
-- would let new postings mutate a sealed period's balances. Closing (OPEN->CLOSED) is always
-- allowed. Reopening (CLOSED->OPEN) is a controlled cascade (storno the old 701, re-close,
-- recompute next period's opening — READ-MODEL-DESIGN §5) and is restricted to the elevated
-- service path (app_admin / app_owner), never plain app_user.
CREATE OR REPLACE FUNCTION app_block_period_reopen()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'CLOSED' AND NEW.status = 'OPEN'
     AND current_user NOT IN ('app_owner', 'app_admin') THEN
    RAISE EXCEPTION
      'accounting_period % cannot be reopened by % (R12 §17): reopen is a controlled, privileged cascade.', OLD.id, current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_block_period_reopen() OWNER TO app_owner;
CREATE TRIGGER accounting_period_reopen_gate BEFORE UPDATE ON accounting_period
  FOR EACH ROW EXECUTE FUNCTION app_block_period_reopen();

-- =============================================================================
-- 7. R4 — double entry balances (Σ MD = Σ Dal, ≥2 on-balance lines) with the
--    OFF_BALANCE exemption (M1: podrozvahové post single-sided)
-- =============================================================================
-- DEFERRABLE INITIALLY DEFERRED constraint trigger (fires at COMMIT) so a
-- multi-line posting is legal mid-transaction. Fires from BOTH posting (catches
-- an empty posting) and the line (catches lines added later). Pure numeric(19,4).
-- Cash-regime postings have no double_entry_line and skip.
-- SECURITY DEFINER (owner app_owner = BYPASSRLS): the nature / line lookups must NOT
-- be blindable. A SECURITY INVOKER version let a caller clear app.organization_id just
-- before COMMIT so the RLS-filtered `account` JOIN returned 0 rows -> v_onbal=0 -> the
-- whole Σ(MD)=Σ(Dal) check was skipped and an unbalanced posting committed. As DEFINER
-- the balance check sees every line of the posting regardless of session GUC. Read-only.
CREATE OR REPLACE FUNCTION app_assert_posting_balanced(p_posting_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_regime     text;
  v_is_opening boolean;
  v_total      integer;
  v_onbal      integer;
  v_debit_n    integer;
  v_credit_n   integer;
  v_pl_n       integer;
  v_md         numeric(19,4);
  v_d          numeric(19,4);
BEGIN
  SELECT regime_code, is_opening INTO v_regime, v_is_opening FROM posting WHERE id = p_posting_id;
  IF NOT FOUND THEN RETURN; END IF;                 -- posting gone (delete is blocked anyway)
  IF v_regime <> 'DOUBLE_ENTRY' THEN RETURN; END IF;

  SELECT count(*) INTO v_total
    FROM posting_double_entry_line WHERE posting_id = p_posting_id;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'posting % (DOUBLE_ENTRY) has no lines (R3/R4 §13/2)', p_posting_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- on-balance lines only: OFF_BALANCE (podrozvaha) lines post single-sided (M1)
  SELECT count(*),
         count(*) FILTER (WHERE l.side = 'DEBIT'),
         count(*) FILTER (WHERE l.side = 'CREDIT'),
         count(*) FILTER (WHERE a.nature IN ('EXPENSE','REVENUE')),
         COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'DEBIT'),  0),
         COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'CREDIT'), 0)
    INTO v_onbal, v_debit_n, v_credit_n, v_pl_n, v_md, v_d
    FROM posting_double_entry_line l
    JOIN account a ON a.id = l.account_id
   WHERE l.posting_id = p_posting_id
     AND a.nature <> 'OFF_BALANCE';

  IF v_onbal > 0 THEN
    IF v_onbal < 2 THEN
      RAISE EXCEPTION 'posting % has single-sided on-balance lines (need >=2 for a double entry; R4 §13/2)', p_posting_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- §13/2: a posting books on the Má dáti side of one account AND the Dal side of another
    -- (closes the same-side-netting-to-zero degenerate: 211 +1000 / 211 -1000).
    IF v_debit_n = 0 OR v_credit_n = 0 THEN
      RAISE EXCEPTION 'posting % must touch both a Má dáti and a Dal side (§13/2)', p_posting_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_md <> v_d THEN
      RAISE EXCEPTION 'posting % is unbalanced: Σ(MD)=% Σ(Dal)=% (R4 §13/2)', p_posting_id, v_md, v_d
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- an opening posting (701) sets počáteční stavy of balance-sheet accounts only; P&L
  -- accounts (5xx/6xx) start each period at zero and never carry an opening balance (ČÚS 002).
  IF v_is_opening AND v_pl_n > 0 THEN
    RAISE EXCEPTION 'opening posting % touches a P&L (5xx/6xx) account: opening balances are balance-sheet only (ČÚS 002)', p_posting_id
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
ALTER FUNCTION app_assert_posting_balanced(uuid) OWNER TO app_owner;

-- wrappers are SECURITY DEFINER so the (revoked-from-PUBLIC) assert helper is reachable
-- only through these triggers, never as a direct app_user oracle.
CREATE OR REPLACE FUNCTION app_posting_balance_from_posting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN PERFORM app_assert_posting_balanced(NEW.id); RETURN NULL; END;
$$;
ALTER FUNCTION app_posting_balance_from_posting() OWNER TO app_owner;

CREATE OR REPLACE FUNCTION app_posting_balance_from_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN PERFORM app_assert_posting_balanced(NEW.posting_id); RETURN NULL; END;
$$;
ALTER FUNCTION app_posting_balance_from_line() OWNER TO app_owner;
REVOKE EXECUTE ON FUNCTION app_assert_posting_balanced(uuid) FROM PUBLIC;

CREATE CONSTRAINT TRIGGER posting_balanced
  AFTER INSERT ON posting
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app_posting_balance_from_posting();

CREATE CONSTRAINT TRIGGER posting_de_line_balanced
  AFTER INSERT ON posting_double_entry_line
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app_posting_balance_from_line();

-- =============================================================================
-- 8. Read-model maintenance — balances auto-update when you post (same tx)
-- =============================================================================
-- AFTER INSERT on the posting lines upserts the turnover/summary tables. SECURITY
-- DEFINER owner app_owner: the read-model tables are ENABLE-not-FORCE RLS, so the
-- owner write bypasses RLS (the row's org/period come from the line + parent, never
-- a session GUC). 701 opening postings (is_opening) feed opening_balance and are
-- EXCLUDED from turnover (else they double-count). closing_balance is GENERATED.
CREATE OR REPLACE FUNCTION app_maintain_account_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_is_opening boolean;
  v_debit  numeric(19,4) := CASE WHEN NEW.side = 'DEBIT'  THEN NEW.amount ELSE 0 END;
  v_credit numeric(19,4) := CASE WHEN NEW.side = 'CREDIT' THEN NEW.amount ELSE 0 END;
BEGIN
  SELECT is_opening INTO v_is_opening FROM posting WHERE id = NEW.posting_id;

  IF v_is_opening THEN
    -- opening posting (701): sets opening_balance (debit-positive), not turnover; stays in deník
    INSERT INTO account_period_balance (organization_id, period_id, account_id, opening_balance)
    VALUES (NEW.organization_id, NEW.period_id, NEW.account_id, v_debit - v_credit)
    ON CONFLICT (organization_id, period_id, account_id) DO UPDATE
      SET opening_balance = account_period_balance.opening_balance + EXCLUDED.opening_balance,
          updated_at = now();
  ELSE
    INSERT INTO account_period_balance (organization_id, period_id, account_id, turnover_debit, turnover_credit)
    VALUES (NEW.organization_id, NEW.period_id, NEW.account_id, v_debit, v_credit)
    ON CONFLICT (organization_id, period_id, account_id) DO UPDATE
      SET turnover_debit  = account_period_balance.turnover_debit  + EXCLUDED.turnover_debit,
          turnover_credit = account_period_balance.turnover_credit + EXCLUDED.turnover_credit,
          updated_at = now();
  END IF;
  RETURN NULL;
END;
$$;
ALTER FUNCTION app_maintain_account_balance() OWNER TO app_owner;
CREATE TRIGGER posting_de_line_maintain_balance
  AFTER INSERT ON posting_double_entry_line
  FOR EACH ROW EXECUTE FUNCTION app_maintain_account_balance();

CREATE OR REPLACE FUNCTION app_maintain_monetary_summary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE v_period uuid;
BEGIN
  SELECT period_id INTO v_period FROM posting WHERE id = NEW.posting_id;

  INSERT INTO monetary_period_summary
    (organization_id, period_id, category_id, direction, is_tax_relevant, is_clearing, location, total_amount, total_tax_base)
  VALUES
    (NEW.organization_id, v_period, NEW.category_id, NEW.direction, NEW.is_tax_relevant, NEW.is_clearing, NEW.location,
     NEW.amount, COALESCE(NEW.tax_base, 0))
  ON CONFLICT (organization_id, period_id, category_id, direction, is_tax_relevant, is_clearing, location) DO UPDATE
    SET total_amount   = monetary_period_summary.total_amount   + EXCLUDED.total_amount,
        total_tax_base = monetary_period_summary.total_tax_base + EXCLUDED.total_tax_base,
        updated_at = now();
  RETURN NULL;
END;
$$;
ALTER FUNCTION app_maintain_monetary_summary() OWNER TO app_owner;
CREATE TRIGGER posting_mon_line_maintain_summary
  AFTER INSERT ON posting_monetary_line
  FOR EACH ROW EXECUTE FUNCTION app_maintain_monetary_summary();

-- =============================================================================
-- 9. §16 analytical evidence + R6 output-completeness + R5 reconcile
-- =============================================================================
-- §16 structural invariant (the enforceable half of R5): a synthetic that HAS
-- analytical children receives NO direct posting — you post to the analytics.
-- (The full Σ(analytical)=synthetic equality is a period aggregate -> the
-- reconcile FUNCTION below, run by the drift job; it cannot be a per-row trigger.)
CREATE OR REPLACE FUNCTION app_block_post_to_parent_account()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM account c WHERE c.parent_id = NEW.account_id) THEN
    RAISE EXCEPTION
      'account % has analytical children: post to an analytical account, not the synthetic (§16 ČÚS 001)', NEW.account_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_block_post_to_parent_account() OWNER TO app_owner;
CREATE TRIGGER posting_de_line_no_parent_post BEFORE INSERT ON posting_double_entry_line
  FOR EACH ROW EXECUTE FUNCTION app_block_post_to_parent_account();

-- R6 — a period deliverable (period_output) may be finalized only when every
-- účetní případ of the period is posted (§8/3). Completeness on the case->posting
-- link (not per-dílčí — the v1 cash-path hole). An individual_record (a case on a
-- doklad) in the period must have a matching posting (same event + same doklad).
CREATE OR REPLACE FUNCTION app_assert_period_complete()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_unposted integer;
BEGIN
  SELECT count(*) INTO v_unposted
    FROM individual_record i
    JOIN summary_record  s ON s.id = i.summary_record_id
   WHERE s.period_id = NEW.period_id
     AND NOT EXISTS (
       SELECT 1 FROM posting p
        WHERE p.accounting_event_id = i.accounting_event_id
          AND p.summary_record_id  = i.summary_record_id
          AND p.period_id          = NEW.period_id);   -- the satisfying posting must be IN this period
  IF v_unposted > 0 THEN
    RAISE EXCEPTION
      'period % has % unposted case(s): cannot finalize output before every účetní případ is posted (R6 §8/3)', NEW.period_id, v_unposted
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_assert_period_complete() OWNER TO app_owner;
CREATE TRIGGER period_output_completeness_gate BEFORE INSERT ON period_output
  FOR EACH ROW EXECUTE FUNCTION app_assert_period_complete();

-- Materialization drift reconcile — CALLABLE (the scheduled drift job runs it; not a
-- per-row trigger because it is a period-level aggregate). The safety net from the
-- read-model design §5: the read-model's closing_balance MUST equal Σ(all DE lines,
-- signed) for that account+period. Σ over ALL lines (incl. the 701 opening lines)
-- reconciles to closing_balance because closing_balance = opening + turnover and
-- opening = Σ(opening lines) — so no is_opening filter, no false positives. Returns
-- one row per drifting account; empty result = read-model agrees with the journal.
-- (The §16 Σ(analytical)=synthetic equality is a READ-TIME rollup — a synthetic with
-- children takes no direct posting (trigger above), so it has no stored balance row;
-- the hlavní-kniha view sums the analytics under the synthetic at read time.)
CREATE OR REPLACE FUNCTION app_reconcile_account_period(p_period_id uuid)
RETURNS TABLE (account_id uuid, read_model_closing numeric, journal_sum numeric)
LANGUAGE sql STABLE AS $$
  SELECT b.account_id, b.closing_balance,
         COALESCE((SELECT SUM(CASE WHEN l.side = 'DEBIT' THEN l.amount ELSE -l.amount END)
                     FROM posting_double_entry_line l
                    WHERE l.account_id = b.account_id AND l.period_id = b.period_id), 0)
    FROM account_period_balance b
   WHERE b.period_id = p_period_id
     AND b.closing_balance <> COALESCE((SELECT SUM(CASE WHEN l.side = 'DEBIT' THEN l.amount ELSE -l.amount END)
                     FROM posting_double_entry_line l
                    WHERE l.account_id = b.account_id AND l.period_id = b.period_id), 0);
$$;
ALTER FUNCTION app_reconcile_account_period(uuid) OWNER TO app_owner;

-- Defense-in-depth companion: surface any committed DOUBLE_ENTRY posting whose on-balance
-- lines do not balance (should be impossible given app_assert_posting_balanced, but the
-- drift job checks regardless so a slipped imbalance is detectable). Empty = all balance.
CREATE OR REPLACE FUNCTION app_find_unbalanced_postings(p_period_id uuid)
RETURNS TABLE (posting_id uuid, sum_debit numeric, sum_credit numeric)
LANGUAGE sql STABLE AS $$
  SELECT p.id,
         COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'DEBIT'),  0),
         COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'CREDIT'), 0)
    FROM posting p
    JOIN posting_double_entry_line l ON l.posting_id = p.id
    JOIN account a ON a.id = l.account_id AND a.nature <> 'OFF_BALANCE'
   WHERE p.period_id = p_period_id
   GROUP BY p.id
  HAVING COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'DEBIT'),  0)
       <> COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'CREDIT'), 0);
$$;
ALTER FUNCTION app_find_unbalanced_postings(uuid) OWNER TO app_owner;

-- Seed-validation (review fix, MAJOR / decision 3): the migration's account_group seed step + a
-- seed test MUST call this after loading the directive chart and assert it returns NO rows. It
-- lists every on-statement group (not internal 8–9, not OFF_BALANCE/CLOSING) left without a
-- rozvaha/VZZ line — empty = the cascade's group fallback is total, so no tenant synthetic can
-- fall off the závěrka via a null group. (Enforced here, not as a per-row CHECK, so minimal test
-- fixtures that seed a bare account_group are unaffected.)
CREATE OR REPLACE FUNCTION app_unmapped_account_groups()
RETURNS TABLE (code char(2), class smallint, name_cs text)
LANGUAGE sql STABLE AS $$
  SELECT g.code, g.class, g.name_cs
    FROM account_group g
   WHERE NOT g.is_internal
     AND (g.nature IS NULL OR g.nature NOT IN ('OFF_BALANCE', 'CLOSING'))
     AND g.balance_sheet_line    IS NULL
     AND g.income_statement_line IS NULL
     AND NOT (g.balance_sheet_line_when_debit IS NOT NULL AND g.balance_sheet_line_when_credit IS NOT NULL);
$$;
ALTER FUNCTION app_unmapped_account_groups() OWNER TO app_owner;

-- =============================================================================
-- 10. Cash-posting minimum-line invariant + clearing-item line CHECK
-- =============================================================================
-- Symmetric with R4: a cash-regime posting (peněžní deník) must record at least one
-- money movement. Without it an empty SINGLE_ENTRY/TAX_RECORDS header counts as "posted"
-- and lets R6 finalize output with a case carrying no zaúčtování. DEFERRABLE so a posting
-- + its lines insert in any order within the transaction. SECURITY DEFINER (read-only).
CREATE OR REPLACE FUNCTION app_assert_cash_posting_has_lines(p_posting_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE v_regime text; v_n integer;
BEGIN
  SELECT regime_code INTO v_regime FROM posting WHERE id = p_posting_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_regime NOT IN ('SINGLE_ENTRY', 'TAX_RECORDS') THEN RETURN; END IF;
  SELECT count(*) INTO v_n FROM posting_monetary_line WHERE posting_id = p_posting_id;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'cash posting % has no peněžní-deník line (a zaúčtování must record the money movement)', p_posting_id
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
ALTER FUNCTION app_assert_cash_posting_has_lines(uuid) OWNER TO app_owner;

CREATE OR REPLACE FUNCTION app_cash_posting_lines_from_posting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN PERFORM app_assert_cash_posting_has_lines(NEW.id); RETURN NULL; END;
$$;
ALTER FUNCTION app_cash_posting_lines_from_posting() OWNER TO app_owner;
REVOKE EXECUTE ON FUNCTION app_assert_cash_posting_has_lines(uuid) FROM PUBLIC;

CREATE CONSTRAINT TRIGGER posting_cash_has_lines
  AFTER INSERT ON posting
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app_cash_posting_lines_from_posting();

-- a průběžná položka (bank<->till transfer) is neither příjem nor výdaj -> no tax base
-- (§7b/§9). Enforced at the source line (fails fast) as well as on the read-model summary.
ALTER TABLE posting_monetary_line
  ADD CONSTRAINT posting_monetary_line_clearing_chk
  CHECK (is_clearing = false OR COALESCE(tax_base, 0) = 0);

COMMIT;

--
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;

--
-- Name: account_nature; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_nature AS ENUM (
    'ASSET',
    'LIABILITY',
    'EQUITY',
    'EXPENSE',
    'REVENUE',
    'CLOSING',
    'OFF_BALANCE'
);

--
-- Name: actor_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.actor_kind AS ENUM (
    'human',
    'ai',
    'ai_on_behalf',
    'system'
);

--
-- Name: app_user_experience; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_user_experience AS ENUM (
    'new',
    'some',
    'bookkeeper',
    'accountant'
);

--
-- Name: asset_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.asset_category AS ENUM (
    'INTANGIBLE',
    'TANGIBLE_DEPRECIABLE',
    'TANGIBLE_NON_DEPRECIABLE'
);

--
-- Name: asset_disposal_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.asset_disposal_method AS ENUM (
    'SALE',
    'LIQUIDATION',
    'THEFT',
    'NATURAL_DISASTER',
    'DONATION',
    'CONTRIBUTION'
);

--
-- Name: billing_plan; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.billing_plan AS ENUM (
    'starter',
    'growth',
    'scale'
);

--
-- Name: book_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.book_kind AS ENUM (
    'LEDGER',
    'MONETARY_JOURNAL'
);

--
-- Name: category_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.category_type AS ENUM (
    'INCOME',
    'EXPENSE'
);

--
-- Name: correction_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.correction_type AS ENUM (
    'REVERSAL',
    'SUPPLEMENTARY'
);

--
-- Name: debit_credit; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.debit_credit AS ENUM (
    'DEBIT',
    'CREDIT'
);

--
-- Name: depreciation_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.depreciation_method AS ENUM (
    'STRAIGHT_LINE',
    'PERFORMANCE',
    'DECLINING'
);

--
-- Name: depreciation_plan_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.depreciation_plan_status AS ENUM (
    'ACTIVE',
    'SUPERSEDED',
    'FULLY_DEPRECIATED',
    'DISPOSED'
);

--
-- Name: fx_rate_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.fx_rate_kind AS ENUM (
    'DAILY',
    'REAL',
    'FIXED'
);

--
-- Name: inventory_difference; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_difference AS ENUM (
    'MATCH',
    'SHORTAGE',
    'SURPLUS'
);

--
-- Name: invite_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invite_status AS ENUM (
    'pending',
    'accepted',
    'revoked',
    'expired'
);

--
-- Name: monetary_direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.monetary_direction AS ENUM (
    'INFLOW',
    'OUTFLOW'
);

--
-- Name: monetary_location; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.monetary_location AS ENUM (
    'CASH',
    'BANK'
);

--
-- Name: number_series_entity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.number_series_entity AS ENUM (
    'EVENT',
    'DOCUMENT',
    'ASSET',
    'INVENTORY_COUNT'
);

--
-- Name: open_item_direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.open_item_direction AS ENUM (
    'RECEIVABLE',
    'PAYABLE'
);

--
-- Name: organization_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.organization_role AS ENUM (
    'owner',
    'admin',
    'member',
    'agent',
    'guest'
);

--
-- Name: period_output_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.period_output_type AS ENUM (
    'FINANCIAL_STATEMENTS',
    'OVERVIEWS',
    'PERSONAL_INCOME_TAX'
);

--
-- Name: period_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.period_status AS ENUM (
    'OPEN',
    'CLOSED'
);

--
-- Name: person_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.person_type AS ENUM (
    'NATURAL',
    'LEGAL'
);

--
-- Name: posting_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.posting_kind AS ENUM (
    'SIMPLE',
    'COMPOUND'
);

--
-- Name: signature_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.signature_role AS ENUM (
    'FOR_EVENT',
    'FOR_POSTING'
);

--
-- Name: summary_record_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.summary_record_type AS ENUM (
    'RECEIVED_INVOICE',
    'ISSUED_INVOICE',
    'BANK_STATEMENT',
    'INTERNAL',
    'CASH_DOCUMENT',
    'BATCH'
);

--
-- Name: tax_depreciation_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tax_depreciation_method AS ENUM (
    'STRAIGHT_LINE',
    'ACCELERATED',
    'EXTRAORDINARY'
);

--
-- Name: vat_filing_period; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vat_filing_period AS ENUM (
    'MONTHLY',
    'QUARTERLY'
);

--
-- Name: vat_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vat_mode AS ENUM (
    'STANDARD',
    'REVERSE_CHARGE',
    'EXEMPT',
    'OUTSIDE_VAT',
    'IMPORT'
);

--
-- Name: workspace_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workspace_role AS ENUM (
    'owner',
    'admin',
    'member'
);

--
-- Name: workspace_team_size; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workspace_team_size AS ENUM (
    'solo',
    'sm',
    'md',
    'lg',
    'xl'
);

--
-- Name: workspace_use_case; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workspace_use_case AS ENUM (
    'firm',
    'biz'
);

--
-- Name: app_assert_cash_posting_has_lines(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_assert_cash_posting_has_lines(p_posting_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
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

--
-- Name: app_assert_period_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_assert_period_complete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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

--
-- Name: app_assert_period_writable(uuid, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_assert_period_writable(p_period_id uuid, p_what text, p_date date) RETURNS void
    LANGUAGE plpgsql
    AS $$
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

--
-- Name: app_assert_posting_balanced(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_assert_posting_balanced(p_posting_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
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

--
-- Name: app_audit_event_ws_org_consistent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_audit_event_ws_org_consistent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_org_ws uuid;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT workspace_id INTO v_org_ws FROM organization WHERE id = NEW.organization_id;
  IF v_org_ws IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION
      'audit_event organization % belongs to workspace %, event references %',
      NEW.organization_id, v_org_ws, NEW.workspace_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: app_auth_token_limited_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_auth_token_limited_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- expires_at: permit mutation only when the row is pending and the new
  -- value satisfies the bounds (now() <= new <= issued_at + 7 days). When
  -- expires_at is unchanged, no checks apply.
  IF OLD.expires_at <> NEW.expires_at THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION
        'auth_token expires_at cannot change on non-pending row (id=%, kind=%, status=%)',
        OLD.id, OLD.kind, OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.expires_at < now() THEN
      RAISE EXCEPTION
        'auth_token expires_at must be in the future (id=%, kind=%)',
        OLD.id, OLD.kind
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.expires_at > OLD.issued_at + interval '7 days' THEN
      RAISE EXCEPTION
        'auth_token expires_at exceeds 7-day hard cap (id=%, kind=%)',
        OLD.id, OLD.kind
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF (OLD.id                     <> NEW.id
      OR OLD.token_hash          <> NEW.token_hash
      OR OLD.kind                <> NEW.kind
      OR OLD.env                 <> NEW.env
      OR OLD.payload::text       <> NEW.payload::text
      OR OLD.issued_at           <> NEW.issued_at
      OR OLD.issued_to_user_id   IS DISTINCT FROM NEW.issued_to_user_id
      OR OLD.issued_to_ip        IS DISTINCT FROM NEW.issued_to_ip
      OR OLD.issued_user_agent_hash IS DISTINCT FROM NEW.issued_user_agent_hash) THEN
    RAISE EXCEPTION
      'auth_token immutable columns changed (id=%, kind=%)', OLD.id, OLD.kind
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: app_block_mutation_accounting(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_block_mutation_accounting() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only (R8 §35): % blocked. Correct via a new posting (corrects_posting_id) / new record, never an edit.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

--
-- Name: app_block_mutation_audit_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_block_mutation_audit_event() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is append-only: % blocked', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

--
-- Name: app_block_mutation_tool_call_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_block_mutation_tool_call_log() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION
    'tool_call_log is append-only (organization=%, id=%)',
    OLD.organization_id, OLD.id
    USING ERRCODE = 'check_violation';
END;
$$;

--
-- Name: app_block_open_item_direct_write(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_block_open_item_direct_write() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF current_user NOT IN ('app_owner', 'app_admin') THEN
    RAISE EXCEPTION
      'open_item is maintained by the settlement ledger: % blocked. settled_amount moves only via open_item_settlement (the SECURITY DEFINER maintenance trigger).', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

--
-- Name: app_block_period_reopen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_block_period_reopen() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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

--
-- Name: app_block_post_to_parent_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_block_post_to_parent_account() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM account c WHERE c.parent_id = NEW.account_id) THEN
    RAISE EXCEPTION
      'account % has analytical children: post to an analytical account, not the synthetic (§16 ČÚS 001)', NEW.account_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: app_block_truncate_accounting(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_block_truncate_accounting() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (R8 §35); TRUNCATE is blocked.', TG_TABLE_NAME
    USING ERRCODE = 'feature_not_supported';
END;
$$;

--
-- Name: app_block_truncate_audit_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_block_truncate_audit_event() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION
    'audit_event is append-only; TRUNCATE is blocked. Use the documented retention-purge ceremony instead.'
    USING ERRCODE = 'feature_not_supported';
END;
$$;

--
-- Name: app_block_truncate_auth_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_block_truncate_auth_token() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION
    'auth_token is append-only at table level; TRUNCATE is blocked.'
    USING ERRCODE = 'feature_not_supported';
END;
$$;

--
-- Name: app_block_truncate_tool_call_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_block_truncate_tool_call_log() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION
    'tool_call_log is append-only; TRUNCATE is blocked. Use the documented retention-purge ceremony instead.'
    USING ERRCODE = 'feature_not_supported';
END;
$$;

--
-- Name: app_cash_posting_lines_from_posting(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_cash_posting_lines_from_posting() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN PERFORM app_assert_cash_posting_has_lines(NEW.id); RETURN NULL; END;
$$;

--
-- Name: app_de_line_period_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_de_line_period_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM app_assert_period_writable(NEW.period_id, 'posting_double_entry_line', NULL);
  RETURN NEW;
END;
$$;

--
-- Name: app_event_period_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_event_period_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.occurred_on IS NULL THEN
    NEW.occurred_on := (NEW.occurred_at AT TIME ZONE 'Europe/Prague')::date;
  END IF;
  PERFORM app_assert_period_writable(NEW.period_id, 'accounting_event', NEW.occurred_on);
  RETURN NEW;
END;
$$;

--
-- Name: app_find_unbalanced_postings(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_find_unbalanced_postings(p_period_id uuid) RETURNS TABLE(posting_id uuid, sum_debit numeric, sum_credit numeric)
    LANGUAGE sql STABLE
    AS $$
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

--
-- Name: app_guard_delete_auth_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_guard_delete_auth_token() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Pending tokens cannot be deleted directly: they must transition via
  -- UPDATE to 'consumed', 'revoked', or 'expired' first, so the lifecycle
  -- audit trail is preserved. The 90-day retention worker only deletes
  -- terminal-state rows; this trigger fail-closes against a buggy caller.
  IF OLD.status = 'pending' THEN
    RAISE EXCEPTION
      'auth_token row in status=pending cannot be deleted (id=%, kind=%); revoke or expire first.',
      OLD.id, OLD.kind
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

--
-- Name: app_impersonation_ws_org_consistent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_impersonation_ws_org_consistent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  ws_org uuid;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT workspace_id INTO ws_org FROM organization WHERE id = NEW.organization_id;
  IF ws_org IS NULL OR ws_org <> NEW.workspace_id THEN
    RAISE EXCEPTION 'impersonation: organization.workspace_id (%) must equal impersonation.workspace_id (%)', ws_org, NEW.workspace_id;
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: app_individual_period_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_individual_period_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_period uuid;
BEGIN
  SELECT period_id INTO v_period FROM summary_record WHERE id = NEW.summary_record_id;
  PERFORM app_assert_period_writable(v_period, 'individual_record', NULL);
  RETURN NEW;
END;
$$;

--
-- Name: app_is_org_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_is_org_member(p_org_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_membership
    WHERE organization_id = p_org_id
      AND user_id         = p_user_id
      AND active          = true
  );
$$;

--
-- Name: app_is_reserved_org_slug(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_is_reserved_org_slug(p_slug text) RETURNS boolean
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  SELECT p_slug = ANY(ARRAY[
    'admin', 'api', 'app', 'auth', 'dashboard', 'docs',
    'internal', 'system', 'workspace'
  ]);
$$;

--
-- Name: app_is_workspace_admin(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_is_workspace_admin(p_ws_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_membership
    WHERE workspace_id = p_ws_id
      AND user_id      = p_user_id
      AND role         IN ('owner', 'admin')
      AND active       = true
  );
$$;

--
-- Name: app_is_workspace_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_is_workspace_member(p_ws_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_membership
    WHERE workspace_id = p_ws_id
      AND user_id      = p_user_id
      AND active       = true
  );
$$;

--
-- Name: app_is_workspace_owner(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_is_workspace_owner(p_ws_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_membership
    WHERE workspace_id = p_ws_id
      AND user_id      = p_user_id
      AND role         = 'owner'
      AND active       = true
  );
$$;

--
-- Name: app_lock_workspace_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_lock_workspace_member(p_workspace_id uuid, p_user_id uuid) RETURNS void
    LANGUAGE sql
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT pg_advisory_xact_lock(
    hashtextextended(p_workspace_id::text || ':' || p_user_id::text, 0)
  );
$$;

--
-- Name: app_maintain_account_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_maintain_account_balance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
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

--
-- Name: app_maintain_monetary_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_maintain_monetary_summary() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
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

--
-- Name: app_maintain_open_item_settled(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_maintain_open_item_settled() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  UPDATE open_item
     SET settled_amount = settled_amount + NEW.amount,
         updated_at = now()
   WHERE id = NEW.open_item_id;
  RETURN NULL;
END;
$$;

--
-- Name: app_mon_line_period_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_mon_line_period_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_period uuid;
BEGIN
  SELECT period_id INTO v_period FROM posting WHERE id = NEW.posting_id;
  PERFORM app_assert_period_writable(v_period, 'posting_monetary_line', NULL);
  RETURN NEW;
END;
$$;

--
-- Name: app_open_item_settlement_period_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_open_item_settlement_period_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_period uuid;
BEGIN
  SELECT period_id INTO v_period FROM posting WHERE id = NEW.settling_posting_id;
  PERFORM app_assert_period_writable(v_period, 'open_item_settlement', NEW.settlement_date);
  RETURN NEW;
END;
$$;

--
-- Name: app_organization_membership_ws_consistent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_organization_membership_ws_consistent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  ws_member uuid;
  ws_org    uuid;
BEGIN
  SELECT workspace_id INTO ws_member FROM workspace_membership WHERE id = NEW.workspace_membership_id;
  SELECT workspace_id INTO ws_org    FROM organization        WHERE id = NEW.organization_id;
  IF ws_member IS NULL OR ws_org IS NULL OR ws_member <> ws_org THEN
    RAISE EXCEPTION 'organization_membership: workspace_membership.workspace_id (%) must equal organization.workspace_id (%)', ws_member, ws_org;
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: app_organization_self_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_organization_self_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM NEW.id THEN
    NEW.organization_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: app_organization_workspace_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_organization_workspace_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.workspace_id IS NOT NULL
     AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION
      'organization.workspace_id is immutable once set (organization=%, old=%, new=%)',
      OLD.id, OLD.workspace_id, NEW.workspace_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: app_partial_period_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_partial_period_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_period uuid; v_acc_currency char(3);
BEGIN
  SELECT s.period_id, p.accounting_currency INTO v_period, v_acc_currency
    FROM individual_record i
    JOIN summary_record    s ON s.id = i.summary_record_id
    JOIN accounting_period p ON p.id = s.period_id
   WHERE i.id = NEW.individual_record_id;
  PERFORM app_assert_period_writable(v_period, 'partial_record', NULL);

  -- FX coherence (option C): the dormant FX columns must never silently desync the
  -- accounting-currency totals the read model assumes are already in měna účetnictví.
  IF NEW.currency_code = v_acc_currency THEN
    -- single-currency case: no FX may be recorded, and the frozen amounts equal the source
    IF NEW.fx_rate IS NOT NULL OR NEW.fx_rate_kind IS NOT NULL OR NEW.vat_fx_rate IS NOT NULL THEN
      RAISE EXCEPTION 'partial_record %: currency_code = accounting_currency (%) but an FX rate is set', NEW.id, v_acc_currency
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.base_in_accounting_currency <> NEW.base_amount
       OR NEW.vat_in_accounting_currency <> NEW.vat_amount THEN
      RAISE EXCEPTION 'partial_record %: in the single-currency case accounting-currency amounts must equal the source amounts', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    -- foreign-currency case: an accounting rate is mandatory (ČNB §24 / §4-12)
    IF NEW.fx_rate IS NULL THEN
      RAISE EXCEPTION 'partial_record %: foreign currency % requires an fx_rate (ČNB §24 / §4-12)', NEW.id, NEW.currency_code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

--
-- Name: app_posting_balance_from_line(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_posting_balance_from_line() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN PERFORM app_assert_posting_balanced(NEW.posting_id); RETURN NULL; END;
$$;

--
-- Name: app_posting_balance_from_posting(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_posting_balance_from_posting() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN PERFORM app_assert_posting_balanced(NEW.id); RETURN NULL; END;
$$;

--
-- Name: app_posting_period_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_posting_period_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM app_assert_period_writable(NEW.period_id, 'posting', NEW.posting_date);
  RETURN NEW;
END;
$$;

--
-- Name: app_prevent_inactive_responsible_member(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_prevent_inactive_responsible_member() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (
    OLD.active = true
    AND (
      NEW.active = false
      OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
    )
  ) THEN
    PERFORM public.app_lock_workspace_member(OLD.workspace_id, OLD.user_id);

    IF EXISTS (
       SELECT 1
         FROM organization o
        WHERE o.workspace_id = OLD.workspace_id
          AND o.responsible_user_id = OLD.user_id
    ) THEN
      RAISE EXCEPTION 'responsible user must be unassigned before workspace membership is deactivated or deleted'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

--
-- Name: app_prevent_last_owner_demotion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_prevent_last_owner_demotion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  owner_count      integer;
  v_app_user_role  text := NULLIF(current_setting('app.app_user_role_name', true), '');
BEGIN
  -- Fail-closed: every connection must have app.app_user_role_name set.
  -- An unset GUC means the init script did not run; crash loudly rather than
  -- silently falling back to a default that might not match the real role.
  IF v_app_user_role IS NULL THEN
    RAISE EXCEPTION 'app.app_user_role_name GUC must be set on every connection (see infra/compose/postgres/init.d/00-roles.sql or withAdminBypass)'
      USING ERRCODE = 'check_violation';
  END IF;

  -- INSERT arm: the application user role cannot insert owner rows directly.
  -- withAdminBypass connections run as app_admin (BYPASSRLS) and bypass the trigger.
  -- Using pg_has_role avoids hardcoding the role name inside the trigger body.
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'owner'
       AND pg_has_role(current_user, v_app_user_role, 'MEMBER') THEN
      RAISE EXCEPTION
        'app_user cannot INSERT an owner workspace_membership row; use withAdminBypass'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE arm: prevent demoting / deactivating the last active owner.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'owner' AND (NEW.role <> 'owner' OR NEW.active = false) THEN
      SELECT count(*) INTO owner_count
        FROM workspace_membership
       WHERE workspace_id = OLD.workspace_id
         AND role = 'owner'
         AND active = true
         AND id <> OLD.id;
      IF owner_count = 0 THEN
        RAISE EXCEPTION 'cannot demote or deactivate the last owner of workspace %', OLD.workspace_id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE arm: prevent deleting the last active owner.
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' AND OLD.active = true THEN
      SELECT count(*) INTO owner_count
        FROM workspace_membership
       WHERE workspace_id = OLD.workspace_id
         AND role = 'owner'
         AND active = true
         AND id <> OLD.id;
      IF owner_count = 0 THEN
        RAISE EXCEPTION 'cannot delete the last owner of workspace %', OLD.workspace_id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

--
-- Name: app_reconcile_account_period(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_reconcile_account_period(p_period_id uuid) RETURNS TABLE(account_id uuid, read_model_closing numeric, journal_sum numeric)
    LANGUAGE sql STABLE
    AS $$
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

--
-- Name: app_resource_grant_consistent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_resource_grant_consistent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_membership_ws uuid;
  v_org_ws        uuid;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT workspace_id INTO v_membership_ws
    FROM workspace_membership WHERE id = NEW.membership_id;
  SELECT workspace_id INTO v_org_ws
    FROM organization WHERE id = NEW.organization_id;
  IF v_membership_ws IS DISTINCT FROM v_org_ws THEN
    RAISE EXCEPTION
      'resource_grant organization % is in workspace %, expected % (membership=%)',
      NEW.organization_id, v_org_ws, v_membership_ws, NEW.membership_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: app_summary_legal_dates_period_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_summary_legal_dates_period_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM 1
    FROM accounting_period
   WHERE id = NEW.period_id
   FOR SHARE;
  PERFORM app_assert_period_writable(
    NEW.period_id,
    'summary_record legal-date correction',
    NULL
  );
  RETURN NEW;
END;
$$;

--
-- Name: app_summary_period_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_summary_period_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM app_assert_period_writable(NEW.period_id, 'summary_record', NULL);
  RETURN NEW;
END;
$$;

--
-- Name: app_tool_call_log_limited_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_tool_call_log_limited_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (OLD.organization_id    <> NEW.organization_id
      OR OLD.period_id       IS DISTINCT FROM NEW.period_id
      OR OLD.tool_name       <> NEW.tool_name
      OR OLD.idempotency_key <> NEW.idempotency_key
      OR OLD.actor_kind      <> NEW.actor_kind
      OR OLD.user_id         IS DISTINCT FROM NEW.user_id
      OR OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
      OR OLD.input_json::text <> NEW.input_json::text
      OR OLD.confidence      IS DISTINCT FROM NEW.confidence
      OR OLD.created_at      <> NEW.created_at) THEN
    RAISE EXCEPTION
      'tool_call_log is immutable except for output_json / auto_applied / approved_by_user_id / rationale (organization=%, id=%)',
      OLD.organization_id, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: app_two_factor_policy_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_two_factor_policy_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

--
-- Name: app_unmapped_account_groups(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_unmapped_account_groups() RETURNS TABLE(code character, class smallint, name_cs text)
    LANGUAGE sql STABLE
    AS $$
  SELECT g.code, g.class, g.name_cs
    FROM account_group g
   WHERE NOT g.is_internal
     AND (g.nature IS NULL OR g.nature NOT IN ('OFF_BALANCE', 'CLOSING'))
     AND g.balance_sheet_line    IS NULL
     AND g.income_statement_line IS NULL
     AND NOT (g.balance_sheet_line_when_debit IS NOT NULL AND g.balance_sheet_line_when_credit IS NOT NULL);
$$;

--
-- Name: app_user_email_normalize(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_user_email_normalize() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.email := lower(NEW.email);
  RETURN NEW;
END;
$$;

--
-- Name: app_validate_responsible_assignee(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_validate_responsible_assignee() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
BEGIN
  IF NEW.responsible_user_id IS NOT NULL THEN
    PERFORM public.app_lock_workspace_member(
      NEW.workspace_id,
      NEW.responsible_user_id
    );

    IF NOT EXISTS (
       SELECT 1
         FROM workspace_membership wm
        WHERE wm.workspace_id = NEW.workspace_id
          AND wm.user_id = NEW.responsible_user_id
          AND wm.active = true
    ) THEN
      RAISE EXCEPTION 'responsible user must be an active member of the organization workspace'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: app_workspace_billing_email_normalize(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_workspace_billing_email_normalize() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.billing_email IS NOT NULL THEN
    NEW.billing_email := lower(NEW.billing_email);
  END IF;
  RETURN NEW;
END;
$$;

SET default_table_access_method = heap;

--
-- Name: account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    chart_id uuid NOT NULL,
    period_id uuid NOT NULL,
    parent_id uuid,
    number text NOT NULL,
    name text NOT NULL,
    nature public.account_nature NOT NULL,
    normal_balance public.debit_credit,
    tracks_open_items boolean DEFAULT false NOT NULL,
    class smallint GENERATED ALWAYS AS (("left"(number, 1))::integer) STORED,
    group_code character(2) GENERATED ALWAYS AS (
CASE
    WHEN ("left"(number, 1) = ANY (ARRAY['8'::text, '9'::text])) THEN NULL::bpchar
    ELSE ("left"(replace(number, '.'::text, ''::text), 2))::character(2)
END) STORED,
    synthetic_code text GENERATED ALWAYS AS ("left"(replace(number, '.'::text, ''::text), 3)) STORED,
    is_synthetic boolean GENERATED ALWAYS AS ((parent_id IS NULL)) STORED,
    specializes_directive_code character(3),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_not_self_parent_chk CHECK ((parent_id <> id)),
    CONSTRAINT account_number_shape_chk CHECK ((number ~ '^[0-9]{2,}(\.[0-9A-Za-z]+)*$'::text))
);

ALTER TABLE ONLY public.account FORCE ROW LEVEL SECURITY;

--
-- Name: account_group; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_group (
    code character(2) NOT NULL,
    class smallint NOT NULL,
    name_cs text NOT NULL,
    name_en text,
    nature public.account_nature,
    is_internal boolean DEFAULT false NOT NULL,
    is_valuation_adjustment boolean DEFAULT false NOT NULL,
    balance_sheet_line text,
    balance_sheet_line_when_debit text,
    balance_sheet_line_when_credit text,
    income_statement_line text,
    CONSTRAINT account_group_class_chk CHECK (((class >= 0) AND (class <= 9)))
);

--
-- Name: account_period_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_period_balance (
    organization_id uuid NOT NULL,
    period_id uuid NOT NULL,
    account_id uuid NOT NULL,
    opening_balance numeric(19,4) DEFAULT 0 NOT NULL,
    turnover_debit numeric(19,4) DEFAULT 0 NOT NULL,
    turnover_credit numeric(19,4) DEFAULT 0 NOT NULL,
    closing_balance numeric(19,4) GENERATED ALWAYS AS (((opening_balance + turnover_debit) - turnover_credit)) STORED,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: accounting_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounting_event (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    period_id uuid NOT NULL,
    number_series_id uuid NOT NULL,
    sequence_number bigint NOT NULL,
    designation text NOT NULL,
    party_id uuid,
    counterparty_id uuid,
    description text NOT NULL,
    content text,
    occurred_at timestamp with time zone NOT NULL,
    responsible_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    occurred_on date NOT NULL,
    inbox_id uuid
);

ALTER TABLE ONLY public.accounting_event FORCE ROW LEVEL SECURITY;

--
-- Name: accounting_period; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounting_period (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status public.period_status DEFAULT 'OPEN'::public.period_status NOT NULL,
    regime_code text NOT NULL,
    accounting_size_code text,
    accounting_currency character(3) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    accounting_currency_is_functional boolean GENERATED ALWAYS AS (true) STORED NOT NULL,
    fx_rate_policy public.fx_rate_kind,
    CONSTRAINT accounting_period_dates_chk CHECK ((period_start <= period_end))
);

ALTER TABLE ONLY public.accounting_period FORCE ROW LEVEL SECURITY;

--
-- Name: accounting_size; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounting_size (
    code text NOT NULL,
    name text NOT NULL,
    max_assets numeric(19,4),
    max_net_turnover numeric(19,4),
    max_average_employees integer
);

--
-- Name: admin_staff_role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_staff_role (
    user_id uuid NOT NULL,
    role text NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    CONSTRAINT admin_staff_role_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'developer'::text, 'designer'::text, 'support'::text, 'security'::text, 'guest'::text])))
);

ALTER TABLE ONLY public.admin_staff_role FORCE ROW LEVEL SECURITY;

--
-- Name: admin_workspace_allowlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_workspace_allowlist (
    workspace_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    added_by text DEFAULT 'system'::text NOT NULL
);

ALTER TABLE ONLY public.admin_workspace_allowlist FORCE ROW LEVEL SECURITY;

--
-- Name: api_key; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_key (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    prefix character varying(20) NOT NULL,
    key_hash text NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    created_by_user_id uuid,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_kind text DEFAULT 'human'::text NOT NULL,
    CONSTRAINT api_key_actor_kind_chk CHECK ((actor_kind = ANY (ARRAY['human'::text, 'agent'::text])))
);

ALTER TABLE ONLY public.api_key FORCE ROW LEVEL SECURITY;

--
-- Name: app_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_user (
    id uuid DEFAULT uuidv7() NOT NULL,
    email character varying(320) NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    image text,
    role text DEFAULT 'user'::text NOT NULL,
    banned boolean DEFAULT false NOT NULL,
    ban_reason text,
    ban_expires timestamp with time zone,
    phone text,
    two_factor_enabled boolean DEFAULT false NOT NULL,
    display_name text,
    avatar_url text,
    locale character varying(10) DEFAULT 'en'::character varying NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    job_title text,
    profile_completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    experience public.app_user_experience,
    title_prefix text,
    given_name text,
    family_name text,
    title_suffix text,
    department text,
    theme character varying(10) DEFAULT 'system'::character varying NOT NULL,
    icon_style character varying(20) DEFAULT 'lucide'::character varying NOT NULL,
    date_format character varying(20) DEFAULT 'DD/MM/YYYY'::character varying NOT NULL,
    time_format character varying(10) DEFAULT '24-hour'::character varying NOT NULL,
    marketing_consent boolean DEFAULT false NOT NULL,
    product_updates_consent boolean DEFAULT false NOT NULL,
    signature_data text,
    deleted_at timestamp with time zone,
    CONSTRAINT app_user_date_format_valid CHECK (((date_format)::text = ANY ((ARRAY['DD/MM/YYYY'::character varying, 'MM/DD/YYYY'::character varying, 'YYYY-MM-DD'::character varying])::text[]))),
    CONSTRAINT app_user_icon_style_valid CHECK (((icon_style)::text = ANY ((ARRAY['lucide'::character varying, 'phosphor'::character varying, 'fontawesome'::character varying])::text[]))),
    CONSTRAINT app_user_phone_format CHECK (((phone IS NULL) OR (phone ~ '^\+[1-9][0-9]{7,14}$'::text))),
    CONSTRAINT app_user_system_role_valid CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text]))),
    CONSTRAINT app_user_theme_valid CHECK (((theme)::text = ANY ((ARRAY['system'::character varying, 'light'::character varying, 'dark'::character varying])::text[]))),
    CONSTRAINT app_user_time_format_valid CHECK (((time_format)::text = ANY ((ARRAY['24-hour'::character varying, '12-hour'::character varying])::text[])))
);

--
-- Name: asset; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    number_series_id uuid NOT NULL,
    sequence_number bigint NOT NULL,
    designation text NOT NULL,
    name text NOT NULL,
    category public.asset_category NOT NULL,
    account_number text NOT NULL,
    directive_code character(3),
    acquisition_date date,
    commissioning_date date NOT NULL,
    disposal_date date,
    disposal_method public.asset_disposal_method,
    acquisition_cost numeric(19,4) NOT NULL,
    improvement_total numeric(19,4) DEFAULT 0 NOT NULL,
    location text,
    responsible_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT asset_account_number_chk CHECK ((account_number ~ '^[0-9]{2,}(\.[0-9A-Za-z]+)*$'::text))
);

ALTER TABLE ONLY public.asset FORCE ROW LEVEL SECURITY;

--
-- Name: audit_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_event (
    id uuid DEFAULT uuidv7() NOT NULL,
    workspace_id uuid,
    organization_id uuid,
    actor_user_id uuid,
    action text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_event_payload_is_object CHECK ((jsonb_typeof(payload) = 'object'::text))
);

ALTER TABLE ONLY public.audit_event FORCE ROW LEVEL SECURITY;

--
-- Name: auth_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_account (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp with time zone,
    refresh_token_expires_at timestamp with time zone,
    scope text,
    password text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: auth_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_session (
    id uuid DEFAULT uuidv7() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    ip_address text,
    user_agent text,
    impersonated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: auth_token; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_token (
    id uuid DEFAULT uuidv7() NOT NULL,
    token_hash text NOT NULL,
    kind text NOT NULL,
    env text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    issued_to_user_id uuid,
    issued_to_ip text,
    issued_user_agent_hash text,
    consumed_at timestamp with time zone,
    consumed_from_ip text,
    consumed_user_agent_hash text,
    CONSTRAINT auth_token_env_valid CHECK ((env = ANY (ARRAY['dev'::text, 'stg'::text, 'prd'::text]))),
    CONSTRAINT auth_token_payload_is_object CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT auth_token_status_valid CHECK ((status = ANY (ARRAY['pending'::text, 'consumed'::text, 'revoked'::text, 'expired'::text])))
);

ALTER TABLE ONLY public.auth_token FORCE ROW LEVEL SECURITY;

--
-- Name: auth_verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_verification (
    id uuid DEFAULT uuidv7() NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    workspace_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: booking_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_template (
    id uuid DEFAULT uuidv7() NOT NULL,
    workspace_id uuid NOT NULL,
    counterparty_key text NOT NULL,
    direction text NOT NULL,
    supply_kind text NOT NULL,
    jurisdiction text NOT NULL,
    signature_fingerprint text,
    confirmed_decision jsonb NOT NULL,
    human_confirmed_at timestamp with time zone,
    match_count integer DEFAULT 0 NOT NULL,
    held_count integer DEFAULT 0 NOT NULL,
    last_reject_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    learned_at timestamp with time zone DEFAULT now() NOT NULL,
    provenance jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT booking_template_direction_check CHECK ((direction = ANY (ARRAY['RECEIVED'::text, 'ISSUED'::text]))),
    CONSTRAINT booking_template_jurisdiction_check CHECK ((jurisdiction = ANY (ARRAY['DOMESTIC'::text, 'REVERSE_CHARGE'::text, 'EU'::text, 'IMPORT'::text, 'EXEMPT'::text, 'OUTSIDE_VAT'::text]))),
    CONSTRAINT booking_template_supply_kind_check CHECK ((supply_kind = ANY (ARRAY['GOODS'::text, 'MATERIAL'::text, 'SERVICES'::text, 'UTILITY'::text, 'RENT'::text, 'INSURANCE'::text, 'ASSET'::text, 'ADVANCE'::text, 'CREDIT_NOTE'::text, 'OTHER'::text])))
);

ALTER TABLE ONLY public.booking_template FORCE ROW LEVEL SECURITY;

--
-- Name: brain_admission_slot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brain_admission_slot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope text NOT NULL,
    scope_key text NOT NULL,
    instance_id text NOT NULL,
    acquired_at timestamp with time zone DEFAULT now() NOT NULL,
    heartbeat_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT brain_admission_slot_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'org'::text])))
);

--
-- Name: brain_confident_wrong; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brain_confident_wrong (
    workspace_id uuid NOT NULL,
    confident_wrong_count integer DEFAULT 0 NOT NULL,
    last_incident_at timestamp with time zone,
    last_incident_tool_call_log_id uuid,
    last_incident_note text,
    cleared_at timestamp with time zone,
    cleared_by_user_id uuid,
    cleared_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT brain_confident_wrong_count_nonneg CHECK ((confident_wrong_count >= 0))
);

ALTER TABLE ONLY public.brain_confident_wrong FORCE ROW LEVEL SECURITY;

--
-- Name: business_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_activity (
    code text NOT NULL,
    level smallint NOT NULL,
    parent_code text,
    name_cs text NOT NULL,
    name_en text,
    CONSTRAINT business_activity_level_range CHECK (((level >= 1) AND (level <= 5)))
);

--
-- Name: category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    type public.category_type NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.category FORCE ROW LEVEL SECURITY;

--
-- Name: chart_of_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chart_of_accounts (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    period_id uuid NOT NULL,
    regime_code text GENERATED ALWAYS AS ('DOUBLE_ENTRY'::text) STORED NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.chart_of_accounts FORCE ROW LEVEL SECURITY;

--
-- Name: counterparty; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counterparty (
    id uuid DEFAULT uuidv7() NOT NULL,
    workspace_id uuid NOT NULL,
    self_of_organization_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name text,
    tax_id text,
    country_code character(2),
    ico character varying(8),
    CONSTRAINT counterparty_country_code_chk CHECK (((country_code IS NULL) OR (country_code ~ '^[A-Z]{2}$'::text))),
    CONSTRAINT counterparty_ico_format_chk CHECK (((ico IS NULL) OR ((ico)::text ~ '^[0-9]{8}$'::text)))
);

ALTER TABLE ONLY public.counterparty FORCE ROW LEVEL SECURITY;

--
-- Name: currency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currency (
    code character(3) NOT NULL,
    name text NOT NULL,
    minor_units smallint DEFAULT 2 NOT NULL,
    is_functional_currency boolean DEFAULT false NOT NULL
);

--
-- Name: depreciation_group; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.depreciation_group (
    code smallint NOT NULL,
    period_years smallint NOT NULL,
    linear_rate_first numeric(6,3),
    linear_rate_subsequent numeric(6,3),
    linear_rate_improvement numeric(6,3),
    accel_coeff_first smallint,
    accel_coeff_subsequent smallint,
    accel_coeff_improvement smallint,
    name text,
    CONSTRAINT depreciation_group_code_chk CHECK (((code >= 1) AND (code <= 6)))
);

--
-- Name: depreciation_plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.depreciation_plan (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    supersedes_plan_id uuid,
    method public.depreciation_method NOT NULL,
    start_date date NOT NULL,
    useful_life_months smallint,
    residual_value numeric(19,4) DEFAULT 0 NOT NULL,
    monthly_amount numeric(19,4) NOT NULL,
    expense_account_number text NOT NULL,
    accumulated_account_number text NOT NULL,
    status public.depreciation_plan_status DEFAULT 'ACTIVE'::public.depreciation_plan_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT depreciation_plan_accumulated_chk CHECK ((accumulated_account_number ~ '^[0-9]{2,}(\.[0-9A-Za-z]+)*$'::text)),
    CONSTRAINT depreciation_plan_expense_chk CHECK ((expense_account_number ~ '^[0-9]{2,}(\.[0-9A-Za-z]+)*$'::text))
);

ALTER TABLE ONLY public.depreciation_plan FORCE ROW LEVEL SECURITY;

--
-- Name: directive_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directive_account (
    code character(3) NOT NULL,
    group_code character(2) NOT NULL,
    name_cs text NOT NULL,
    name_en text,
    nature public.account_nature NOT NULL,
    normal_balance public.debit_credit,
    balance_sheet_line text,
    balance_sheet_line_when_debit text,
    balance_sheet_line_when_credit text,
    income_statement_line text,
    deprecated boolean DEFAULT false NOT NULL
);

--
-- Name: dppo_annual_adjustment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dppo_annual_adjustment (
    organization_id uuid NOT NULL,
    period_id uuid NOT NULL,
    adjustment_key text NOT NULL,
    amount numeric(19,4) NOT NULL,
    source text NOT NULL,
    reference text NOT NULL,
    recorded_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dppo_annual_adjustment_adjustment_key_chk CHECK ((adjustment_key = ANY (ARRAY['nonDeductibleExpenses'::text, 'exemptRevenue'::text, 'excludeLossMakingMainActivity'::text, 'lossCarryForward'::text, 'taxReliefs'::text, 'advancesPaid'::text]))),
    CONSTRAINT dppo_annual_adjustment_source_chk CHECK ((source = ANY (ARRAY['USER'::text, 'ADVISOR'::text, 'LEDGER'::text])))
);

ALTER TABLE ONLY public.dppo_annual_adjustment FORCE ROW LEVEL SECURITY;

--
-- Name: dppo_annual_taxpayer_category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dppo_annual_taxpayer_category (
    organization_id uuid NOT NULL,
    period_id uuid NOT NULL,
    taxpayer_category text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dppo_annual_taxpayer_category_chk CHECK ((taxpayer_category = ANY (ARRAY['STANDARD'::text, 'BASIC_INVESTMENT_FUND'::text, 'QUALIFYING_PENSION_INSTITUTION'::text, 'OTHER'::text])))
);

ALTER TABLE ONLY public.dppo_annual_taxpayer_category FORCE ROW LEVEL SECURITY;

--
-- Name: favorite_page; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorite_page (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    page_route text NOT NULL,
    module_key text NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.favorite_page FORCE ROW LEVEL SECURITY;

--
-- Name: feature_flag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_flag (
    key text NOT NULL,
    description text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feature_flag_key_dotted_lowercase CHECK ((key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'::text))
);

--
-- Name: impersonation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impersonation (
    id uuid DEFAULT uuidv7() NOT NULL,
    workspace_id uuid NOT NULL,
    organization_id uuid,
    actor_user_id uuid NOT NULL,
    target_user_id uuid NOT NULL,
    reason text NOT NULL,
    auth_session_id uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    expected_end_at timestamp with time zone NOT NULL,
    CONSTRAINT impersonation_actor_target_distinct CHECK ((actor_user_id <> target_user_id)),
    CONSTRAINT impersonation_envelope_ordered CHECK (((ended_at IS NULL) OR (ended_at >= started_at))),
    CONSTRAINT impersonation_expected_after_start CHECK ((expected_end_at >= started_at)),
    CONSTRAINT impersonation_reason_length CHECK (((length(reason) >= 8) AND (length(reason) <= 500)))
);

ALTER TABLE ONLY public.impersonation FORCE ROW LEVEL SECURITY;

--
-- Name: inbox_attachment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_attachment (
    id uuid DEFAULT uuidv7() NOT NULL,
    workspace_id uuid NOT NULL,
    storage_key text NOT NULL,
    sha256 text NOT NULL,
    content_type text NOT NULL,
    size bigint NOT NULL,
    filename text NOT NULL,
    confirmed_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inbox_attachment_sha256_hex CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT inbox_attachment_size_positive CHECK ((size > 0))
);

ALTER TABLE ONLY public.inbox_attachment FORCE ROW LEVEL SECURITY;

--
-- Name: inbox_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_item (
    id uuid DEFAULT uuidv7() NOT NULL,
    workspace_id uuid NOT NULL,
    tool_call_log_id uuid NOT NULL,
    inbox_attachment_id uuid,
    kind text NOT NULL,
    source text,
    counterparty_name text,
    reasoning text,
    created_by text NOT NULL,
    status text DEFAULT 'APPLIED'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inbox_item_status_valid CHECK ((status = ANY (ARRAY['APPLIED'::text, 'SUPERSEDED'::text, 'REVERSED'::text, 'CORRECTED'::text])))
);

ALTER TABLE ONLY public.inbox_item FORCE ROW LEVEL SECURITY;

--
-- Name: individual_record; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.individual_record (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    summary_record_id uuid NOT NULL,
    accounting_event_id uuid NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    inbox_id uuid
);

ALTER TABLE ONLY public.individual_record FORCE ROW LEVEL SECURITY;

--
-- Name: inventory_count; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_count (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    number_series_id uuid NOT NULL,
    sequence_number bigint NOT NULL,
    designation text NOT NULL,
    count_date date NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.inventory_count FORCE ROW LEVEL SECURITY;

--
-- Name: inventory_count_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_count_line (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    inventory_count_id uuid NOT NULL,
    asset_id uuid,
    description text NOT NULL,
    book_value numeric(19,4) NOT NULL,
    actual_value numeric(19,4) NOT NULL,
    difference_kind public.inventory_difference NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_count_line_diff_chk CHECK ((((difference_kind = 'MATCH'::public.inventory_difference) AND (actual_value = book_value)) OR ((difference_kind = 'SHORTAGE'::public.inventory_difference) AND (actual_value < book_value)) OR ((difference_kind = 'SURPLUS'::public.inventory_difference) AND (actual_value > book_value))))
);

ALTER TABLE ONLY public.inventory_count_line FORCE ROW LEVEL SECURITY;

--
-- Name: legal_form; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_form (
    code text NOT NULL,
    name text NOT NULL,
    person_type public.person_type NOT NULL,
    mandatory_double_entry boolean DEFAULT false NOT NULL,
    audit_possible boolean DEFAULT true NOT NULL
);

--
-- Name: legal_form_allowed_regime; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.legal_form_allowed_regime (
    legal_form_code text NOT NULL,
    regime_code text NOT NULL
);

--
-- Name: monetary_period_summary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.monetary_period_summary (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    period_id uuid NOT NULL,
    category_id uuid,
    direction public.monetary_direction NOT NULL,
    is_tax_relevant boolean NOT NULL,
    is_clearing boolean NOT NULL,
    location public.monetary_location NOT NULL,
    total_amount numeric(19,4) DEFAULT 0 NOT NULL,
    total_tax_base numeric(19,4) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT monetary_period_summary_clearing_chk CHECK (((is_clearing = false) OR (total_tax_base = (0)::numeric)))
);

--
-- Name: number_series; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.number_series (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    entity_type public.number_series_entity NOT NULL,
    code text NOT NULL,
    pattern text NOT NULL,
    next_number bigint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.number_series FORCE ROW LEVEL SECURITY;

--
-- Name: ocr_extraction_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ocr_extraction_template (
    id uuid DEFAULT uuidv7() NOT NULL,
    workspace_id uuid NOT NULL,
    supplier_key text NOT NULL,
    doc_kind text NOT NULL,
    locators jsonb NOT NULL,
    layout_fingerprint text,
    human_confirmed_at timestamp with time zone,
    held_count integer DEFAULT 0 NOT NULL,
    last_reject_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    learned_at timestamp with time zone DEFAULT now() NOT NULL,
    provenance jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.ocr_extraction_template FORCE ROW LEVEL SECURITY;

--
-- Name: open_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.open_item (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    counterparty_id uuid NOT NULL,
    origin_posting_id uuid NOT NULL,
    account_number text NOT NULL,
    direction public.open_item_direction NOT NULL,
    variable_symbol text,
    original_amount numeric(19,4) NOT NULL,
    currency_code character(3) NOT NULL,
    issue_date date NOT NULL,
    due_date date,
    settled_amount numeric(19,4) DEFAULT 0 NOT NULL,
    remaining_amount numeric(19,4) GENERATED ALWAYS AS ((original_amount - settled_amount)) STORED,
    is_settled boolean GENERATED ALWAYS AS ((settled_amount >= original_amount)) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    inbox_id uuid,
    CONSTRAINT open_item_account_shape_chk CHECK ((account_number ~ '^[0-9]{2,}(\.[0-9A-Za-z]+)*$'::text)),
    CONSTRAINT open_item_amount_chk CHECK (((original_amount > (0)::numeric) AND (settled_amount >= (0)::numeric)))
);

ALTER TABLE ONLY public.open_item FORCE ROW LEVEL SECURITY;

--
-- Name: open_item_settlement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.open_item_settlement (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    open_item_id uuid NOT NULL,
    settling_posting_id uuid NOT NULL,
    amount numeric(19,4) NOT NULL,
    settlement_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    settlement_fx_rate numeric(18,6),
    amount_in_accounting_currency numeric(19,4),
    CONSTRAINT open_item_settlement_amount_chk CHECK ((amount <> (0)::numeric))
);

ALTER TABLE ONLY public.open_item_settlement FORCE ROW LEVEL SECURITY;

--
-- Name: organization; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    slug character varying(64) NOT NULL,
    legal_name text NOT NULL,
    person_kind text NOT NULL,
    legal_subject_kind text,
    fiscal_year_start_month smallint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    person_type public.person_type GENERATED ALWAYS AS (
CASE person_kind
    WHEN 'natural_person'::text THEN 'NATURAL'::public.person_type
    WHEN 'legal_entity'::text THEN 'LEGAL'::public.person_type
    ELSE NULL::public.person_type
END) STORED,
    legal_form_code text,
    ico character varying(8),
    registered_street text,
    registered_city text,
    registered_postal_code character varying(10),
    registered_country_code character(2),
    data_box_id character varying(7),
    contact_email text,
    contact_phone character varying(32),
    website text,
    registered_house_number character varying(16),
    registered_orientation_number character varying(16),
    registered_region text,
    delivery_address_line1 text,
    delivery_address_line2 text,
    delivery_address_line3 text,
    tax_office_code character varying(4),
    tax_office_workplace_code character varying(4),
    registry_file_number text,
    archived_at timestamp with time zone,
    responsible_user_id uuid,
    CONSTRAINT organization_data_box_format_chk CHECK (((data_box_id IS NULL) OR ((data_box_id)::text ~ '^[a-z0-9]{7}$'::text))),
    CONSTRAINT organization_ico_format_chk CHECK (((ico IS NULL) OR ((ico)::text ~ '^[0-9]{8}$'::text))),
    CONSTRAINT organization_legal_subject_kind_check CHECK ((legal_subject_kind = ANY (ARRAY['for_profit'::text, 'non_profit'::text]))),
    CONSTRAINT organization_person_kind_check CHECK ((person_kind = ANY (ARRAY['natural_person'::text, 'legal_entity'::text]))),
    CONSTRAINT organization_person_subject_consistency CHECK ((((person_kind = 'natural_person'::text) AND (legal_subject_kind IS NULL)) OR ((person_kind = 'legal_entity'::text) AND (legal_subject_kind IS NOT NULL)))),
    CONSTRAINT organization_slug_format CHECK ((((slug)::text ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'::text) AND ((slug)::text !~ '--'::text) AND ((length((slug)::text) >= 2) AND (length((slug)::text) <= 63))))
);

ALTER TABLE ONLY public.organization FORCE ROW LEVEL SECURITY;

--
-- Name: organization_authorized_person; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_authorized_person (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    given_name text NOT NULL,
    family_name text NOT NULL,
    "position" text,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.organization_authorized_person FORCE ROW LEVEL SECURITY;

--
-- Name: organization_business_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_business_activity (
    organization_id uuid NOT NULL,
    business_activity_code text NOT NULL
);

ALTER TABLE ONLY public.organization_business_activity FORCE ROW LEVEL SECURITY;

--
-- Name: organization_identity; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.organization_identity WITH (security_invoker='true') AS
 SELECT o.id,
    o.workspace_id,
    o.slug,
    o.person_type,
    c.id AS self_counterparty_id
   FROM (public.organization o
     LEFT JOIN public.counterparty c ON ((c.self_of_organization_id = o.id)));

--
-- Name: organization_membership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_membership (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    workspace_membership_id uuid NOT NULL,
    role public.organization_role NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.organization_membership FORCE ROW LEVEL SECURITY;

--
-- Name: organization_oss_registration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_oss_registration (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    scheme text NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_oss_dates_chk CHECK (((valid_to IS NULL) OR (valid_from <= valid_to))),
    CONSTRAINT organization_oss_registration_scheme_check CHECK ((scheme = ANY (ARRAY['UNION'::text, 'IMPORT'::text])))
);

ALTER TABLE ONLY public.organization_oss_registration FORCE ROW LEVEL SECURITY;

--
-- Name: organization_provisioning; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_provisioning (
    id uuid DEFAULT uuidv7() NOT NULL,
    workspace_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    input jsonb NOT NULL,
    ares_snapshot jsonb,
    dph_snapshot jsonb,
    organization_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.organization_provisioning FORCE ROW LEVEL SECURITY;

--
-- Name: organization_tax_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_tax_profile (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    has_employees boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    has_standard_employment boolean,
    has_dpp boolean,
    has_dpc boolean,
    social_insurance_participation boolean,
    health_insurance_participation boolean,
    payroll_tax_advance_due boolean,
    special_rate_withholding_due boolean,
    CONSTRAINT organization_tax_profile_dates_chk CHECK (((valid_to IS NULL) OR (valid_from <= valid_to)))
);

ALTER TABLE ONLY public.organization_tax_profile FORCE ROW LEVEL SECURITY;

--
-- Name: organization_tax_representative; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_tax_representative (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    representative_type text,
    legal_name text,
    given_name text,
    family_name text,
    ico character varying(8),
    dic character varying(14),
    advisor_registration_number text,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.organization_tax_representative FORCE ROW LEVEL SECURITY;

--
-- Name: partial_record; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partial_record (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    individual_record_id uuid NOT NULL,
    quantity numeric(19,4),
    measure_unit text,
    unit_price numeric(19,4),
    base_amount numeric(19,4) NOT NULL,
    vat_rate numeric(5,2),
    vat_mode public.vat_mode NOT NULL,
    vat_deductible boolean DEFAULT true NOT NULL,
    advance_settlement boolean DEFAULT false NOT NULL,
    vat_amount numeric(19,4) DEFAULT 0 NOT NULL,
    currency_code character(3) NOT NULL,
    fx_rate_kind public.fx_rate_kind,
    fx_rate numeric(18,6),
    vat_fx_rate numeric(18,6),
    base_in_accounting_currency numeric(19,4) NOT NULL,
    vat_in_accounting_currency numeric(19,4) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vat_jurisdiction text,
    supply_kind text,
    commodity_code text,
    inbox_id uuid,
    CONSTRAINT partial_record_commodity_code_chk CHECK (((commodity_code IS NULL) OR (commodity_code = ANY (ARRAY['1'::text, '3'::text, '4'::text, '5'::text])))),
    CONSTRAINT partial_record_commodity_code_rc_chk CHECK (((commodity_code IS NULL) OR ((vat_mode = 'REVERSE_CHARGE'::public.vat_mode) AND (vat_jurisdiction IS DISTINCT FROM 'EU'::text) AND (vat_jurisdiction IS DISTINCT FROM 'SECTION_108'::text)))),
    CONSTRAINT partial_record_fx_pair_chk CHECK (((fx_rate IS NULL) = (fx_rate_kind IS NULL))),
    CONSTRAINT partial_record_fx_positive_chk CHECK (((fx_rate IS NULL) OR (fx_rate > (0)::numeric))),
    CONSTRAINT partial_record_qty_price_chk CHECK (((quantity IS NULL) OR (unit_price IS NULL) OR (base_amount = round((quantity * unit_price), 4)))),
    CONSTRAINT partial_record_supply_kind_chk CHECK (((supply_kind IS NULL) OR (supply_kind = ANY (ARRAY['GOODS'::text, 'MATERIAL'::text, 'SERVICES'::text, 'UTILITY'::text, 'RENT'::text, 'INSURANCE'::text, 'ASSET'::text, 'ADVANCE'::text, 'CREDIT_NOTE'::text, 'OTHER'::text])))),
    CONSTRAINT partial_record_vat_fx_requires_fx_chk CHECK (((vat_fx_rate IS NULL) OR (fx_rate IS NOT NULL))),
    CONSTRAINT partial_record_vat_jurisdiction_chk CHECK (((vat_jurisdiction IS NULL) OR (vat_jurisdiction = ANY (ARRAY['DOMESTIC'::text, 'REVERSE_CHARGE'::text, 'EU'::text, 'IMPORT'::text, 'EXEMPT'::text, 'OUTSIDE_VAT'::text, 'SECTION_108'::text])))),
    CONSTRAINT partial_record_vat_tol_chk CHECK (((vat_mode <> 'STANDARD'::public.vat_mode) OR (vat_rate IS NULL) OR (abs((vat_amount - round(((base_amount * vat_rate) / (100)::numeric), 2))) <= 0.50))),
    CONSTRAINT partial_record_vat_zero_chk CHECK (((vat_mode <> ALL (ARRAY['EXEMPT'::public.vat_mode, 'OUTSIDE_VAT'::public.vat_mode, 'REVERSE_CHARGE'::public.vat_mode])) OR (vat_amount = (0)::numeric)))
);

ALTER TABLE ONLY public.partial_record FORCE ROW LEVEL SECURITY;

--
-- Name: period_output; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.period_output (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    period_id uuid NOT NULL,
    type public.period_output_type NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    generated_by uuid NOT NULL
);

ALTER TABLE ONLY public.period_output FORCE ROW LEVEL SECURITY;

--
-- Name: permission_rule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permission_rule (
    key text NOT NULL,
    label text,
    category text,
    resource_type text,
    action text NOT NULL,
    legacy boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT permission_rule_action_enum CHECK ((action = ANY (ARRAY['view'::text, 'edit'::text, 'delete'::text, 'run'::text]))),
    CONSTRAINT permission_rule_category_enum CHECK ((category = ANY (ARRAY['workspace'::text, 'organization'::text, 'ledger'::text, 'resource'::text, 'system'::text]))),
    CONSTRAINT permission_rule_key_dotted_lowercase CHECK ((key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'::text))
);

--
-- Name: permission_template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permission_template (
    id uuid DEFAULT uuidv7() NOT NULL,
    workspace_id uuid,
    name text NOT NULL,
    base_role public.workspace_role NOT NULL,
    granted_rules text[] DEFAULT '{}'::text[] NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT permission_template_system_scope CHECK ((((is_system = true) AND (workspace_id IS NULL)) OR (is_system = false)))
);

ALTER TABLE ONLY public.permission_template FORCE ROW LEVEL SECURITY;

--
-- Name: permissions_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions_outbox (
    id uuid DEFAULT uuidv7() NOT NULL,
    op_type text NOT NULL,
    payload jsonb NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    failed_at timestamp with time zone,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT permissions_outbox_op_type_check CHECK ((op_type = ANY (ARRAY['write'::text, 'delete'::text]))),
    CONSTRAINT permissions_outbox_payload_is_object CHECK ((jsonb_typeof(payload) = 'object'::text)),
    CONSTRAINT permissions_outbox_payload_user_valid CHECK ((((payload ->> 'user'::text) IS NOT NULL) AND ((payload ->> 'user'::text) ~ '^[a-z][a-z0-9_]*:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text))),
    CONSTRAINT permissions_outbox_payload_workspace_id_valid CHECK ((((payload ->> 'workspace_id'::text) IS NOT NULL) AND (((payload ->> 'workspace_id'::text))::uuid IS NOT NULL)))
);

--
-- Name: posting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posting (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    period_id uuid NOT NULL,
    regime_code text NOT NULL,
    summary_record_id uuid NOT NULL,
    accounting_event_id uuid NOT NULL,
    depreciation_plan_id uuid,
    inventory_count_id uuid,
    posting_date date NOT NULL,
    posting_kind public.posting_kind NOT NULL,
    responsible_user_id uuid NOT NULL,
    posted_at timestamp with time zone NOT NULL,
    corrects_posting_id uuid,
    correction_type public.correction_type,
    is_opening boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    inbox_id uuid,
    CONSTRAINT posting_correction_pair_chk CHECK (((corrects_posting_id IS NULL) = (correction_type IS NULL)))
);

ALTER TABLE ONLY public.posting FORCE ROW LEVEL SECURITY;

--
-- Name: posting_double_entry_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posting_double_entry_line (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    posting_id uuid NOT NULL,
    period_id uuid NOT NULL,
    regime_code text NOT NULL,
    account_id uuid NOT NULL,
    partial_record_id uuid,
    side public.debit_credit NOT NULL,
    amount numeric(19,4) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    inbox_id uuid,
    CONSTRAINT posting_de_line_regime_chk CHECK ((regime_code = 'DOUBLE_ENTRY'::text))
);

ALTER TABLE ONLY public.posting_double_entry_line FORCE ROW LEVEL SECURITY;

--
-- Name: posting_monetary_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posting_monetary_line (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    posting_id uuid NOT NULL,
    regime_code text NOT NULL,
    partial_record_id uuid,
    category_id uuid,
    location public.monetary_location NOT NULL,
    direction public.monetary_direction NOT NULL,
    is_tax_relevant boolean NOT NULL,
    is_clearing boolean DEFAULT false NOT NULL,
    tax_base numeric(19,4),
    amount numeric(19,4) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    inbox_id uuid,
    CONSTRAINT posting_monetary_line_clearing_chk CHECK (((is_clearing = false) OR (COALESCE(tax_base, (0)::numeric) = (0)::numeric))),
    CONSTRAINT posting_monetary_line_regime_chk CHECK ((regime_code = ANY (ARRAY['SINGLE_ENTRY'::text, 'TAX_RECORDS'::text])))
);

ALTER TABLE ONLY public.posting_monetary_line FORCE ROW LEVEL SECURITY;

--
-- Name: regime; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regime (
    code text NOT NULL,
    name text NOT NULL,
    requires_chart_of_accounts boolean NOT NULL,
    book_kind public.book_kind NOT NULL
);

--
-- Name: resource_grant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_grant (
    id uuid DEFAULT uuidv7() NOT NULL,
    membership_id uuid NOT NULL,
    organization_id uuid,
    resource_type text NOT NULL,
    resource_id uuid,
    can_view boolean DEFAULT false NOT NULL,
    can_edit boolean DEFAULT false NOT NULL,
    can_delete boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT resource_grant_resource_type_enum CHECK ((resource_type = ANY (ARRAY['account'::text, 'project'::text, 'bank_account'::text, 'counterparty'::text, 'category_income'::text, 'category_expense'::text, 'organization'::text])))
);

ALTER TABLE ONLY public.resource_grant FORCE ROW LEVEL SECURITY;

--
-- Name: signature; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signature (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    role public.signature_role NOT NULL,
    signer_id uuid NOT NULL,
    signed_at timestamp with time zone NOT NULL,
    event_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    posting_id uuid,
    CONSTRAINT signature_role_target_chk CHECK ((((role = 'FOR_EVENT'::public.signature_role) AND (event_id IS NOT NULL) AND (posting_id IS NULL)) OR ((role = 'FOR_POSTING'::public.signature_role) AND (posting_id IS NOT NULL) AND (event_id IS NULL))))
);

ALTER TABLE ONLY public.signature FORCE ROW LEVEL SECURITY;

--
-- Name: summary_record; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.summary_record (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    period_id uuid NOT NULL,
    number_series_id uuid NOT NULL,
    sequence_number bigint NOT NULL,
    designation text NOT NULL,
    type public.summary_record_type NOT NULL,
    issued_at timestamp with time zone NOT NULL,
    rounding_amount numeric(19,4) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tax_point_date date,
    received_date date,
    inbox_id uuid
);

ALTER TABLE ONLY public.summary_record FORCE ROW LEVEL SECURITY;

--
-- Name: tax_depreciation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_depreciation (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    depreciation_group_code smallint NOT NULL,
    method public.tax_depreciation_method NOT NULL,
    tax_base numeric(19,4) NOT NULL,
    tax_improvement_total numeric(19,4) DEFAULT 0 NOT NULL,
    accumulated_amount numeric(19,4) DEFAULT 0 NOT NULL,
    start_year smallint NOT NULL,
    is_suspended boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.tax_depreciation FORCE ROW LEVEL SECURITY;

--
-- Name: tool_call_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tool_call_log (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    tool_name text NOT NULL,
    idempotency_key text NOT NULL,
    actor_kind public.actor_kind NOT NULL,
    user_id uuid,
    conversation_id uuid,
    input_json jsonb NOT NULL,
    output_json jsonb,
    confidence numeric(5,2),
    rationale text,
    auto_applied boolean DEFAULT false NOT NULL,
    approved_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    period_id uuid
);

ALTER TABLE ONLY public.tool_call_log FORCE ROW LEVEL SECURITY;

--
-- Name: two_factor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.two_factor (
    id uuid DEFAULT uuidv7() NOT NULL,
    secret text NOT NULL,
    backup_codes text NOT NULL,
    user_id uuid NOT NULL,
    verified boolean DEFAULT true NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    enrolled_at timestamp with time zone,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: two_factor_policy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.two_factor_policy (
    workspace_id uuid NOT NULL,
    required_for_owners boolean DEFAULT false NOT NULL,
    required_for_admins boolean DEFAULT false NOT NULL,
    required_for_members boolean DEFAULT false NOT NULL,
    grace_period_days integer DEFAULT 30 NOT NULL,
    enforced_at timestamp with time zone,
    declared_by_user_id uuid,
    declared_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT two_factor_policy_grace_period_days_check CHECK (((grace_period_days >= 0) AND (grace_period_days <= 90)))
);

ALTER TABLE ONLY public.two_factor_policy FORCE ROW LEVEL SECURITY;

--
-- Name: vat_regime; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vat_regime (
    code text NOT NULL,
    name text NOT NULL
);

--
-- Name: vat_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vat_status (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    vat_regime_code text NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    filing_period public.vat_filing_period,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vat_status_dates_chk CHECK (((valid_to IS NULL) OR (valid_from <= valid_to))),
    CONSTRAINT vat_status_filing_period_regime_check CHECK (((vat_regime_code = 'PAYER'::text) OR (filing_period IS NULL)))
);

ALTER TABLE ONLY public.vat_status FORCE ROW LEVEL SECURITY;

--
-- Name: workspace; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace (
    id uuid DEFAULT uuidv7() NOT NULL,
    created_by_user_id uuid NOT NULL,
    display_name text NOT NULL,
    purpose text,
    contact_email text,
    contact_phone character varying(20),
    website text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    beta_plan_acknowledged_at timestamp with time zone,
    step_1_completed_at timestamp with time zone,
    step_2_completed_at timestamp with time zone,
    step_3_completed_at timestamp with time zone,
    step_4_completed_at timestamp with time zone,
    step_5_completed_at timestamp with time zone,
    onboarding_completed_at timestamp with time zone,
    use_case public.workspace_use_case,
    team_size public.workspace_team_size,
    plan public.billing_plan DEFAULT 'starter'::public.billing_plan NOT NULL
);

ALTER TABLE ONLY public.workspace FORCE ROW LEVEL SECURITY;

--
-- Name: workspace_billing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_billing (
    workspace_id uuid NOT NULL,
    legal_name text NOT NULL,
    tax_id text,
    vat_id text,
    address_street text NOT NULL,
    address_city text NOT NULL,
    address_zip character varying(20) NOT NULL,
    country character varying(2) NOT NULL,
    billing_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_billing_country_check CHECK (((country)::text ~ '^[A-Z]{2}$'::text))
);

ALTER TABLE ONLY public.workspace_billing FORCE ROW LEVEL SECURITY;

--
-- Name: workspace_membership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_membership (
    id uuid DEFAULT uuidv7() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.workspace_role NOT NULL,
    active boolean DEFAULT true NOT NULL,
    mfa_grace_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.workspace_membership FORCE ROW LEVEL SECURITY;

--
-- Name: account account_chart_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_chart_number_unique UNIQUE (chart_id, number);

--
-- Name: account_group account_group_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_group
    ADD CONSTRAINT account_group_pkey PRIMARY KEY (code);

--
-- Name: account account_id_chart_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_id_chart_unique UNIQUE (id, chart_id);

--
-- Name: account account_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_id_org_unique UNIQUE (id, organization_id);

--
-- Name: account account_id_period_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_id_period_unique UNIQUE (id, period_id);

--
-- Name: account_period_balance account_period_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_period_balance
    ADD CONSTRAINT account_period_balance_pkey PRIMARY KEY (organization_id, period_id, account_id);

--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);

--
-- Name: accounting_event accounting_event_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_event
    ADD CONSTRAINT accounting_event_id_org_unique UNIQUE (id, organization_id);

--
-- Name: accounting_event accounting_event_oznaceni_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_event
    ADD CONSTRAINT accounting_event_oznaceni_unique UNIQUE (number_series_id, sequence_number);

--
-- Name: accounting_event accounting_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_event
    ADD CONSTRAINT accounting_event_pkey PRIMARY KEY (id);

--
-- Name: accounting_period accounting_period_id_org_regime_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_period
    ADD CONSTRAINT accounting_period_id_org_regime_unique UNIQUE (id, organization_id, regime_code);

--
-- Name: accounting_period accounting_period_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_period
    ADD CONSTRAINT accounting_period_id_org_unique UNIQUE (id, organization_id);

--
-- Name: accounting_period accounting_period_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_period
    ADD CONSTRAINT accounting_period_pkey PRIMARY KEY (id);

--
-- Name: accounting_size accounting_size_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_size
    ADD CONSTRAINT accounting_size_pkey PRIMARY KEY (code);

--
-- Name: admin_staff_role admin_staff_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_staff_role
    ADD CONSTRAINT admin_staff_role_pkey PRIMARY KEY (user_id);

--
-- Name: admin_workspace_allowlist admin_workspace_allowlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_workspace_allowlist
    ADD CONSTRAINT admin_workspace_allowlist_pkey PRIMARY KEY (workspace_id);

--
-- Name: api_key api_key_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key
    ADD CONSTRAINT api_key_key_hash_key UNIQUE (key_hash);

--
-- Name: api_key api_key_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key
    ADD CONSTRAINT api_key_pkey PRIMARY KEY (id);

--
-- Name: app_user app_user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_email_key UNIQUE (email);

--
-- Name: app_user app_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (id);

--
-- Name: asset asset_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_id_org_unique UNIQUE (id, organization_id);

--
-- Name: asset asset_oznaceni_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_oznaceni_unique UNIQUE (number_series_id, sequence_number);

--
-- Name: asset asset_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_pkey PRIMARY KEY (id);

--
-- Name: audit_event audit_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_event
    ADD CONSTRAINT audit_event_pkey PRIMARY KEY (id);

--
-- Name: auth_account auth_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_account
    ADD CONSTRAINT auth_account_pkey PRIMARY KEY (id);

--
-- Name: auth_session auth_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_session
    ADD CONSTRAINT auth_session_pkey PRIMARY KEY (id);

--
-- Name: auth_session auth_session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_session
    ADD CONSTRAINT auth_session_token_key UNIQUE (token);

--
-- Name: auth_token auth_token_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_token
    ADD CONSTRAINT auth_token_pkey PRIMARY KEY (id);

--
-- Name: auth_token auth_token_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_token
    ADD CONSTRAINT auth_token_token_hash_key UNIQUE (token_hash);

--
-- Name: auth_verification auth_verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_verification
    ADD CONSTRAINT auth_verification_pkey PRIMARY KEY (id);

--
-- Name: booking_template booking_template_id_workspace_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_template
    ADD CONSTRAINT booking_template_id_workspace_unique UNIQUE (id, workspace_id);

--
-- Name: booking_template booking_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_template
    ADD CONSTRAINT booking_template_pkey PRIMARY KEY (id);

--
-- Name: brain_admission_slot brain_admission_slot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_admission_slot
    ADD CONSTRAINT brain_admission_slot_pkey PRIMARY KEY (id);

--
-- Name: brain_confident_wrong brain_confident_wrong_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_confident_wrong
    ADD CONSTRAINT brain_confident_wrong_pkey PRIMARY KEY (workspace_id);

--
-- Name: business_activity business_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_activity
    ADD CONSTRAINT business_activity_pkey PRIMARY KEY (code);

--
-- Name: category category_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_id_org_unique UNIQUE (id, organization_id);

--
-- Name: category category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_pkey PRIMARY KEY (id);

--
-- Name: chart_of_accounts chart_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_id_org_unique UNIQUE (id, organization_id);

--
-- Name: chart_of_accounts chart_id_period_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_id_period_unique UNIQUE (id, period_id);

--
-- Name: chart_of_accounts chart_of_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_pkey PRIMARY KEY (id);

--
-- Name: chart_of_accounts chart_one_per_period; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_one_per_period UNIQUE (period_id);

--
-- Name: counterparty counterparty_id_workspace_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty
    ADD CONSTRAINT counterparty_id_workspace_unique UNIQUE (id, workspace_id);

--
-- Name: counterparty counterparty_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty
    ADD CONSTRAINT counterparty_pkey PRIMARY KEY (id);

--
-- Name: counterparty counterparty_self_of_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty
    ADD CONSTRAINT counterparty_self_of_organization_id_key UNIQUE (self_of_organization_id);

--
-- Name: currency currency_code_functional_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency
    ADD CONSTRAINT currency_code_functional_unique UNIQUE (code, is_functional_currency);

--
-- Name: currency currency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currency
    ADD CONSTRAINT currency_pkey PRIMARY KEY (code);

--
-- Name: depreciation_group depreciation_group_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_group
    ADD CONSTRAINT depreciation_group_pkey PRIMARY KEY (code);

--
-- Name: depreciation_plan depreciation_plan_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_plan
    ADD CONSTRAINT depreciation_plan_id_org_unique UNIQUE (id, organization_id);

--
-- Name: depreciation_plan depreciation_plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_plan
    ADD CONSTRAINT depreciation_plan_pkey PRIMARY KEY (id);

--
-- Name: directive_account directive_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directive_account
    ADD CONSTRAINT directive_account_pkey PRIMARY KEY (code);

--
-- Name: dppo_annual_adjustment dppo_annual_adjustment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dppo_annual_adjustment
    ADD CONSTRAINT dppo_annual_adjustment_pkey PRIMARY KEY (organization_id, period_id, adjustment_key);

--
-- Name: dppo_annual_taxpayer_category dppo_annual_taxpayer_category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dppo_annual_taxpayer_category
    ADD CONSTRAINT dppo_annual_taxpayer_category_pkey PRIMARY KEY (organization_id, period_id);

--
-- Name: favorite_page favorite_page_org_user_route_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_page
    ADD CONSTRAINT favorite_page_org_user_route_unique UNIQUE (organization_id, user_id, page_route);

--
-- Name: favorite_page favorite_page_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_page
    ADD CONSTRAINT favorite_page_pkey PRIMARY KEY (id);

--
-- Name: feature_flag feature_flag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flag
    ADD CONSTRAINT feature_flag_pkey PRIMARY KEY (key);

--
-- Name: impersonation impersonation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impersonation
    ADD CONSTRAINT impersonation_pkey PRIMARY KEY (id);

--
-- Name: inbox_attachment inbox_attachment_id_workspace_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_attachment
    ADD CONSTRAINT inbox_attachment_id_workspace_unique UNIQUE (id, workspace_id);

--
-- Name: inbox_attachment inbox_attachment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_attachment
    ADD CONSTRAINT inbox_attachment_pkey PRIMARY KEY (id);

--
-- Name: inbox_attachment inbox_attachment_workspace_sha256_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_attachment
    ADD CONSTRAINT inbox_attachment_workspace_sha256_unique UNIQUE (workspace_id, sha256);

--
-- Name: inbox_item inbox_item_id_workspace_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_item
    ADD CONSTRAINT inbox_item_id_workspace_unique UNIQUE (id, workspace_id);

--
-- Name: inbox_item inbox_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_item
    ADD CONSTRAINT inbox_item_pkey PRIMARY KEY (id);

--
-- Name: inbox_item inbox_item_workspace_tool_call_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_item
    ADD CONSTRAINT inbox_item_workspace_tool_call_unique UNIQUE (workspace_id, tool_call_log_id);

--
-- Name: individual_record individual_record_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.individual_record
    ADD CONSTRAINT individual_record_id_org_unique UNIQUE (id, organization_id);

--
-- Name: individual_record individual_record_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.individual_record
    ADD CONSTRAINT individual_record_pkey PRIMARY KEY (id);

--
-- Name: inventory_count inventory_count_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count
    ADD CONSTRAINT inventory_count_id_org_unique UNIQUE (id, organization_id);

--
-- Name: inventory_count_line inventory_count_line_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count_line
    ADD CONSTRAINT inventory_count_line_id_org_unique UNIQUE (id, organization_id);

--
-- Name: inventory_count_line inventory_count_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count_line
    ADD CONSTRAINT inventory_count_line_pkey PRIMARY KEY (id);

--
-- Name: inventory_count inventory_count_oznaceni_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count
    ADD CONSTRAINT inventory_count_oznaceni_unique UNIQUE (number_series_id, sequence_number);

--
-- Name: inventory_count inventory_count_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count
    ADD CONSTRAINT inventory_count_pkey PRIMARY KEY (id);

--
-- Name: legal_form_allowed_regime legal_form_allowed_regime_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_form_allowed_regime
    ADD CONSTRAINT legal_form_allowed_regime_pkey PRIMARY KEY (legal_form_code, regime_code);

--
-- Name: legal_form legal_form_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_form
    ADD CONSTRAINT legal_form_pkey PRIMARY KEY (code);

--
-- Name: monetary_period_summary monetary_period_summary_grain_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monetary_period_summary
    ADD CONSTRAINT monetary_period_summary_grain_unique UNIQUE NULLS NOT DISTINCT (organization_id, period_id, category_id, direction, is_tax_relevant, is_clearing, location);

--
-- Name: monetary_period_summary monetary_period_summary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monetary_period_summary
    ADD CONSTRAINT monetary_period_summary_pkey PRIMARY KEY (id);

--
-- Name: number_series number_series_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.number_series
    ADD CONSTRAINT number_series_id_org_unique UNIQUE (id, organization_id);

--
-- Name: number_series number_series_org_entity_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.number_series
    ADD CONSTRAINT number_series_org_entity_code_unique UNIQUE (organization_id, entity_type, code);

--
-- Name: number_series number_series_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.number_series
    ADD CONSTRAINT number_series_pkey PRIMARY KEY (id);

--
-- Name: ocr_extraction_template ocr_extraction_template_id_workspace_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ocr_extraction_template
    ADD CONSTRAINT ocr_extraction_template_id_workspace_unique UNIQUE (id, workspace_id);

--
-- Name: ocr_extraction_template ocr_extraction_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ocr_extraction_template
    ADD CONSTRAINT ocr_extraction_template_pkey PRIMARY KEY (id);

--
-- Name: open_item open_item_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_item
    ADD CONSTRAINT open_item_id_org_unique UNIQUE (id, organization_id);

--
-- Name: open_item open_item_origin_posting_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_item
    ADD CONSTRAINT open_item_origin_posting_unique UNIQUE (origin_posting_id, organization_id);

--
-- Name: open_item open_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_item
    ADD CONSTRAINT open_item_pkey PRIMARY KEY (id);

--
-- Name: open_item_settlement open_item_settlement_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_item_settlement
    ADD CONSTRAINT open_item_settlement_id_org_unique UNIQUE (id, organization_id);

--
-- Name: open_item_settlement open_item_settlement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_item_settlement
    ADD CONSTRAINT open_item_settlement_pkey PRIMARY KEY (id);

--
-- Name: organization_authorized_person organization_authorized_person_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_authorized_person
    ADD CONSTRAINT organization_authorized_person_pkey PRIMARY KEY (id);

--
-- Name: organization_business_activity organization_business_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_business_activity
    ADD CONSTRAINT organization_business_activity_pkey PRIMARY KEY (organization_id, business_activity_code);

--
-- Name: organization organization_id_workspace_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_id_workspace_unique UNIQUE (id, workspace_id);

--
-- Name: organization_membership organization_membership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_membership
    ADD CONSTRAINT organization_membership_pkey PRIMARY KEY (id);

--
-- Name: organization_membership organization_membership_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_membership
    ADD CONSTRAINT organization_membership_unique UNIQUE (organization_id, user_id);

--
-- Name: organization_oss_registration organization_oss_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_oss_registration
    ADD CONSTRAINT organization_oss_no_overlap EXCLUDE USING gist (organization_id WITH =, scheme WITH =, daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]'::text) WITH &&);

--
-- Name: organization_oss_registration organization_oss_registration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_oss_registration
    ADD CONSTRAINT organization_oss_registration_pkey PRIMARY KEY (id);

--
-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);

--
-- Name: organization_provisioning organization_provisioning_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_provisioning
    ADD CONSTRAINT organization_provisioning_key_unique UNIQUE (workspace_id, idempotency_key);

--
-- Name: organization_provisioning organization_provisioning_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_provisioning
    ADD CONSTRAINT organization_provisioning_pkey PRIMARY KEY (id);

--
-- Name: organization organization_slug_not_reserved; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.organization
    ADD CONSTRAINT organization_slug_not_reserved CHECK ((NOT public.app_is_reserved_org_slug((slug)::text))) NOT VALID;

--
-- Name: organization_tax_profile organization_tax_profile_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_tax_profile
    ADD CONSTRAINT organization_tax_profile_no_overlap EXCLUDE USING gist (organization_id WITH =, daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]'::text) WITH &&);

--
-- Name: organization_tax_profile organization_tax_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_tax_profile
    ADD CONSTRAINT organization_tax_profile_pkey PRIMARY KEY (id);

--
-- Name: organization_tax_representative organization_tax_representative_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_tax_representative
    ADD CONSTRAINT organization_tax_representative_pkey PRIMARY KEY (id);

--
-- Name: partial_record partial_record_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partial_record
    ADD CONSTRAINT partial_record_id_org_unique UNIQUE (id, organization_id);

--
-- Name: partial_record partial_record_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partial_record
    ADD CONSTRAINT partial_record_pkey PRIMARY KEY (id);

--
-- Name: period_output period_output_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.period_output
    ADD CONSTRAINT period_output_id_org_unique UNIQUE (id, organization_id);

--
-- Name: period_output period_output_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.period_output
    ADD CONSTRAINT period_output_pkey PRIMARY KEY (id);

--
-- Name: permission_rule permission_rule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_rule
    ADD CONSTRAINT permission_rule_pkey PRIMARY KEY (key);

--
-- Name: permission_template permission_template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_template
    ADD CONSTRAINT permission_template_pkey PRIMARY KEY (id);

--
-- Name: permissions_outbox permissions_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions_outbox
    ADD CONSTRAINT permissions_outbox_pkey PRIMARY KEY (id);

--
-- Name: posting_double_entry_line posting_double_entry_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_double_entry_line
    ADD CONSTRAINT posting_double_entry_line_pkey PRIMARY KEY (id);

--
-- Name: posting posting_id_org_regime_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting
    ADD CONSTRAINT posting_id_org_regime_unique UNIQUE (id, organization_id, regime_code);

--
-- Name: posting posting_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting
    ADD CONSTRAINT posting_id_org_unique UNIQUE (id, organization_id);

--
-- Name: posting posting_id_period_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting
    ADD CONSTRAINT posting_id_period_unique UNIQUE (id, period_id);

--
-- Name: posting_monetary_line posting_monetary_line_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_monetary_line
    ADD CONSTRAINT posting_monetary_line_pkey PRIMARY KEY (id);

--
-- Name: posting posting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting
    ADD CONSTRAINT posting_pkey PRIMARY KEY (id);

--
-- Name: regime regime_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regime
    ADD CONSTRAINT regime_pkey PRIMARY KEY (code);

--
-- Name: resource_grant resource_grant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_grant
    ADD CONSTRAINT resource_grant_pkey PRIMARY KEY (id);

--
-- Name: signature signature_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signature
    ADD CONSTRAINT signature_id_org_unique UNIQUE (id, organization_id);

--
-- Name: signature signature_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signature
    ADD CONSTRAINT signature_pkey PRIMARY KEY (id);

--
-- Name: summary_record summary_record_cislena_rada_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.summary_record
    ADD CONSTRAINT summary_record_cislena_rada_unique UNIQUE (number_series_id, sequence_number);

--
-- Name: summary_record summary_record_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.summary_record
    ADD CONSTRAINT summary_record_id_org_unique UNIQUE (id, organization_id);

--
-- Name: summary_record summary_record_oznaceni_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.summary_record
    ADD CONSTRAINT summary_record_oznaceni_unique UNIQUE (organization_id, period_id, type, designation);

--
-- Name: summary_record summary_record_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.summary_record
    ADD CONSTRAINT summary_record_pkey PRIMARY KEY (id);

--
-- Name: tax_depreciation tax_depreciation_asset_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_depreciation
    ADD CONSTRAINT tax_depreciation_asset_unique UNIQUE (asset_id, organization_id);

--
-- Name: tax_depreciation tax_depreciation_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_depreciation
    ADD CONSTRAINT tax_depreciation_id_org_unique UNIQUE (id, organization_id);

--
-- Name: tax_depreciation tax_depreciation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_depreciation
    ADD CONSTRAINT tax_depreciation_pkey PRIMARY KEY (id);

--
-- Name: tool_call_log tool_call_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_call_log
    ADD CONSTRAINT tool_call_log_pkey PRIMARY KEY (id);

--
-- Name: two_factor two_factor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factor
    ADD CONSTRAINT two_factor_pkey PRIMARY KEY (id);

--
-- Name: two_factor_policy two_factor_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factor_policy
    ADD CONSTRAINT two_factor_policy_pkey PRIMARY KEY (workspace_id);

--
-- Name: vat_regime vat_regime_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_regime
    ADD CONSTRAINT vat_regime_pkey PRIMARY KEY (code);

--
-- Name: vat_status vat_status_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_status
    ADD CONSTRAINT vat_status_no_overlap EXCLUDE USING gist (organization_id WITH =, daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[]'::text) WITH &&);

--
-- Name: vat_status vat_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_status
    ADD CONSTRAINT vat_status_pkey PRIMARY KEY (id);

--
-- Name: workspace_billing workspace_billing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_billing
    ADD CONSTRAINT workspace_billing_pkey PRIMARY KEY (workspace_id);

--
-- Name: workspace_membership workspace_membership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_membership
    ADD CONSTRAINT workspace_membership_pkey PRIMARY KEY (id);

--
-- Name: workspace workspace_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace
    ADD CONSTRAINT workspace_pkey PRIMARY KEY (id);

--
-- Name: account_chart_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_chart_idx ON public.account USING btree (chart_id);

--
-- Name: account_group_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_group_code_idx ON public.account USING btree (group_code);

--
-- Name: account_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_parent_idx ON public.account USING btree (parent_id);

--
-- Name: account_period_balance_acct_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_period_balance_acct_idx ON public.account_period_balance USING btree (account_id);

--
-- Name: account_period_balance_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_period_balance_updated_idx ON public.account_period_balance USING btree (organization_id, period_id, updated_at);

--
-- Name: account_synthetic_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_synthetic_code_idx ON public.account USING btree (synthetic_code);

--
-- Name: accounting_event_org_occurred_on_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounting_event_org_occurred_on_idx ON public.accounting_event USING btree (organization_id, occurred_on);

--
-- Name: accounting_event_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounting_event_period_idx ON public.accounting_event USING btree (period_id);

--
-- Name: admin_staff_role_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_staff_role_role_idx ON public.admin_staff_role USING btree (role);

--
-- Name: api_key_key_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_key_key_hash_idx ON public.api_key USING btree (key_hash);

--
-- Name: api_key_organization_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_key_organization_idx ON public.api_key USING btree (organization_id);

--
-- Name: api_key_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_key_workspace_idx ON public.api_key USING btree (workspace_id);

--
-- Name: app_user_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_user_phone_idx ON public.app_user USING btree (phone) WHERE (phone IS NOT NULL);

--
-- Name: app_user_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX app_user_role_idx ON public.app_user USING btree (role) WHERE (role <> 'user'::text);

--
-- Name: audit_event_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_event_actor_idx ON public.audit_event USING btree (actor_user_id);

--
-- Name: audit_event_organization_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_event_organization_created_idx ON public.audit_event USING btree (organization_id, created_at);

--
-- Name: audit_event_workspace_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_event_workspace_action_idx ON public.audit_event USING btree (workspace_id, action);

--
-- Name: audit_event_workspace_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_event_workspace_created_idx ON public.audit_event USING btree (workspace_id, created_at);

--
-- Name: auth_account_provider_account_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_account_provider_account_unique ON public.auth_account USING btree (provider_id, account_id);

--
-- Name: auth_account_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_account_user_idx ON public.auth_account USING btree (user_id);

--
-- Name: auth_session_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_session_expires_idx ON public.auth_session USING btree (expires_at);

--
-- Name: auth_session_impersonated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_session_impersonated_idx ON public.auth_session USING btree (impersonated_by) WHERE (impersonated_by IS NOT NULL);

--
-- Name: auth_session_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_session_user_idx ON public.auth_session USING btree (user_id);

--
-- Name: auth_token_kind_issued_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_token_kind_issued_idx ON public.auth_token USING btree (kind, issued_at DESC);

--
-- Name: auth_token_pending_invite_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_token_pending_invite_unique ON public.auth_token USING btree (((payload ->> 'organizationId'::text)), lower((payload ->> 'email'::text))) WHERE ((kind = 'inv'::text) AND (status = 'pending'::text));

--
-- Name: auth_token_status_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_token_status_expires_idx ON public.auth_token USING btree (status, expires_at) WHERE (status = 'pending'::text);

--
-- Name: auth_verification_app_identifier_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_verification_app_identifier_unique ON public.auth_verification USING btree (identifier) WHERE (identifier ~~ 'app:%'::text);

--
-- Name: auth_verification_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_verification_expires_idx ON public.auth_verification USING btree (expires_at);

--
-- Name: auth_verification_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_verification_identifier_idx ON public.auth_verification USING btree (identifier);

--
-- Name: auth_verification_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_verification_workspace_idx ON public.auth_verification USING btree (workspace_id);

--
-- Name: booking_template_confirmed_signature_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX booking_template_confirmed_signature_unique ON public.booking_template USING btree (workspace_id, counterparty_key, direction, supply_kind, jurisdiction) WHERE (human_confirmed_at IS NOT NULL);

--
-- Name: brain_admission_slot_scope_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brain_admission_slot_scope_key_idx ON public.brain_admission_slot USING btree (scope, scope_key);

--
-- Name: counterparty_workspace_ico_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX counterparty_workspace_ico_unique ON public.counterparty USING btree (workspace_id, ico) WHERE ((ico IS NOT NULL) AND (self_of_organization_id IS NULL));

--
-- Name: counterparty_workspace_tax_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX counterparty_workspace_tax_id_unique ON public.counterparty USING btree (workspace_id, tax_id) WHERE ((tax_id IS NOT NULL) AND (self_of_organization_id IS NULL));

--
-- Name: depreciation_plan_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX depreciation_plan_asset_idx ON public.depreciation_plan USING btree (asset_id);

--
-- Name: favorite_page_org_user_module_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX favorite_page_org_user_module_idx ON public.favorite_page USING btree (organization_id, user_id, module_key, sort_order);

--
-- Name: impersonation_actor_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX impersonation_actor_started_idx ON public.impersonation USING btree (actor_user_id, started_at DESC);

--
-- Name: impersonation_auth_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX impersonation_auth_session_idx ON public.impersonation USING btree (auth_session_id);

--
-- Name: impersonation_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX impersonation_open_idx ON public.impersonation USING btree (workspace_id, started_at DESC) WHERE (ended_at IS NULL);

--
-- Name: impersonation_target_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX impersonation_target_started_idx ON public.impersonation USING btree (target_user_id, started_at DESC);

--
-- Name: impersonation_workspace_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX impersonation_workspace_started_idx ON public.impersonation USING btree (workspace_id, started_at DESC);

--
-- Name: inbox_item_workspace_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inbox_item_workspace_created_idx ON public.inbox_item USING btree (workspace_id, created_at DESC);

--
-- Name: individual_record_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX individual_record_doc_idx ON public.individual_record USING btree (summary_record_id);

--
-- Name: individual_record_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX individual_record_event_idx ON public.individual_record USING btree (accounting_event_id);

--
-- Name: inventory_count_line_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_count_line_asset_idx ON public.inventory_count_line USING btree (asset_id);

--
-- Name: inventory_count_line_count_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_count_line_count_idx ON public.inventory_count_line USING btree (inventory_count_id);

--
-- Name: open_item_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX open_item_account_idx ON public.open_item USING btree (organization_id, account_number);

--
-- Name: open_item_counterparty_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX open_item_counterparty_idx ON public.open_item USING btree (counterparty_id);

--
-- Name: open_item_origin_posting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX open_item_origin_posting_idx ON public.open_item USING btree (origin_posting_id);

--
-- Name: open_item_settlement_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX open_item_settlement_item_idx ON public.open_item_settlement USING btree (open_item_id);

--
-- Name: open_item_settlement_posting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX open_item_settlement_posting_idx ON public.open_item_settlement USING btree (settling_posting_id);

--
-- Name: open_item_unsettled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX open_item_unsettled_idx ON public.open_item USING btree (organization_id, due_date) WHERE (is_settled = false);

--
-- Name: organization_authorized_person_one_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_authorized_person_one_primary ON public.organization_authorized_person USING btree (organization_id) WHERE is_primary;

--
-- Name: organization_membership_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_membership_org_idx ON public.organization_membership USING btree (organization_id) WHERE (active = true);

--
-- Name: organization_membership_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_membership_user_idx ON public.organization_membership USING btree (user_id) WHERE (active = true);

--
-- Name: organization_membership_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_membership_workspace_idx ON public.organization_membership USING btree (workspace_id) WHERE (active = true);

--
-- Name: organization_membership_ws_membership_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_membership_ws_membership_idx ON public.organization_membership USING btree (workspace_membership_id);

--
-- Name: organization_responsible_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_responsible_user_idx ON public.organization USING btree (responsible_user_id) WHERE (responsible_user_id IS NOT NULL);

--
-- Name: organization_self_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_self_idx ON public.organization USING btree (organization_id, id);

--
-- Name: organization_tax_representative_one_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_tax_representative_one_primary ON public.organization_tax_representative USING btree (organization_id) WHERE is_primary;

--
-- Name: organization_workspace_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_workspace_active_idx ON public.organization USING btree (workspace_id) WHERE (archived_at IS NULL);

--
-- Name: organization_workspace_ico_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_workspace_ico_idx ON public.organization USING btree (workspace_id, ico) WHERE (ico IS NOT NULL);

--
-- Name: organization_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_workspace_idx ON public.organization USING btree (workspace_id);

--
-- Name: organization_workspace_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_workspace_slug_unique ON public.organization USING btree (workspace_id, slug);

--
-- Name: partial_record_line_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX partial_record_line_idx ON public.partial_record USING btree (individual_record_id);

--
-- Name: period_output_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX period_output_period_idx ON public.period_output USING btree (period_id, organization_id);

--
-- Name: permission_rule_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX permission_rule_category_idx ON public.permission_rule USING btree (category);

--
-- Name: permission_template_system_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permission_template_system_name_unique ON public.permission_template USING btree (name) WHERE ((workspace_id IS NULL) AND (is_system = true));

--
-- Name: permission_template_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX permission_template_workspace_idx ON public.permission_template USING btree (workspace_id);

--
-- Name: permission_template_workspace_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permission_template_workspace_name_unique ON public.permission_template USING btree (workspace_id, name) WHERE (workspace_id IS NOT NULL);

--
-- Name: permissions_outbox_unprocessed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX permissions_outbox_unprocessed_idx ON public.permissions_outbox USING btree (created_at) WHERE ((processed_at IS NULL) AND (failed_at IS NULL));

--
-- Name: posting_corrects_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posting_corrects_idx ON public.posting USING btree (corrects_posting_id);

--
-- Name: posting_de_line_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posting_de_line_account_idx ON public.posting_double_entry_line USING btree (account_id);

--
-- Name: posting_de_line_partial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posting_de_line_partial_idx ON public.posting_double_entry_line USING btree (partial_record_id);

--
-- Name: posting_de_line_posting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posting_de_line_posting_idx ON public.posting_double_entry_line USING btree (posting_id);

--
-- Name: posting_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posting_event_idx ON public.posting USING btree (accounting_event_id);

--
-- Name: posting_mon_line_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posting_mon_line_category_idx ON public.posting_monetary_line USING btree (category_id);

--
-- Name: posting_mon_line_partial_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posting_mon_line_partial_idx ON public.posting_monetary_line USING btree (partial_record_id);

--
-- Name: posting_mon_line_posting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posting_mon_line_posting_idx ON public.posting_monetary_line USING btree (posting_id);

--
-- Name: posting_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posting_period_idx ON public.posting USING btree (period_id);

--
-- Name: posting_summary_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX posting_summary_idx ON public.posting USING btree (summary_record_id);

--
-- Name: resource_grant_membership_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resource_grant_membership_idx ON public.resource_grant USING btree (membership_id);

--
-- Name: resource_grant_membership_scope_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX resource_grant_membership_scope_unique ON public.resource_grant USING btree (membership_id, organization_id, resource_type, resource_id);

--
-- Name: resource_grant_organization_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resource_grant_organization_type_idx ON public.resource_grant USING btree (organization_id, resource_type);

--
-- Name: signature_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signature_event_idx ON public.signature USING btree (event_id);

--
-- Name: signature_posting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signature_posting_idx ON public.signature USING btree (posting_id);

--
-- Name: summary_record_org_received_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX summary_record_org_received_date_idx ON public.summary_record USING btree (organization_id, received_date) WHERE (received_date IS NOT NULL);

--
-- Name: summary_record_org_tax_point_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX summary_record_org_tax_point_date_idx ON public.summary_record USING btree (organization_id, tax_point_date) WHERE (tax_point_date IS NOT NULL);

--
-- Name: summary_record_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX summary_record_period_idx ON public.summary_record USING btree (period_id);

--
-- Name: tax_depreciation_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_depreciation_group_idx ON public.tax_depreciation USING btree (depreciation_group_code);

--
-- Name: tool_call_log_idemp_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tool_call_log_idemp_unique ON public.tool_call_log USING btree (organization_id, tool_name, idempotency_key);

--
-- Name: tool_call_log_organization_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tool_call_log_organization_actor_idx ON public.tool_call_log USING btree (organization_id, actor_kind, created_at);

--
-- Name: tool_call_log_organization_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tool_call_log_organization_created_idx ON public.tool_call_log USING btree (organization_id, created_at);

--
-- Name: tool_call_log_organization_period_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tool_call_log_organization_period_pending_idx ON public.tool_call_log USING btree (organization_id, period_id, created_at) WHERE ((auto_applied = false) AND (approved_by_user_id IS NULL));

--
-- Name: tool_call_log_tool_name_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tool_call_log_tool_name_trgm_idx ON public.tool_call_log USING gin (tool_name public.gin_trgm_ops);

--
-- Name: two_factor_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX two_factor_user_id_idx ON public.two_factor USING btree (user_id);

--
-- Name: workspace_membership_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workspace_membership_active_unique ON public.workspace_membership USING btree (workspace_id, user_id) WHERE (active = true);

--
-- Name: workspace_membership_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_membership_user_idx ON public.workspace_membership USING btree (user_id);

--
-- Name: workspace_membership_workspace_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workspace_membership_workspace_role_idx ON public.workspace_membership USING btree (workspace_id, role);

--
-- Name: accounting_event accounting_event_period_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER accounting_event_period_guard BEFORE INSERT ON public.accounting_event FOR EACH ROW EXECUTE FUNCTION public.app_event_period_guard();

--
-- Name: accounting_period accounting_period_reopen_gate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER accounting_period_reopen_gate BEFORE UPDATE ON public.accounting_period FOR EACH ROW EXECUTE FUNCTION public.app_block_period_reopen();

--
-- Name: app_user app_user_email_normalize; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER app_user_email_normalize BEFORE INSERT OR UPDATE ON public.app_user FOR EACH ROW EXECUTE FUNCTION public.app_user_email_normalize();

--
-- Name: audit_event audit_event_block_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_event_block_delete BEFORE DELETE ON public.audit_event FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_audit_event();

--
-- Name: audit_event audit_event_block_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_event_block_update BEFORE UPDATE ON public.audit_event FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_audit_event();

--
-- Name: audit_event audit_event_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_event_no_truncate BEFORE TRUNCATE ON public.audit_event FOR EACH STATEMENT EXECUTE FUNCTION public.app_block_truncate_audit_event();

--
-- Name: audit_event audit_event_ws_org_consistent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_event_ws_org_consistent BEFORE INSERT ON public.audit_event FOR EACH ROW EXECUTE FUNCTION public.app_audit_event_ws_org_consistent();

--
-- Name: auth_token auth_token_guard_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auth_token_guard_delete BEFORE DELETE ON public.auth_token FOR EACH ROW EXECUTE FUNCTION public.app_guard_delete_auth_token();

--
-- Name: auth_token auth_token_limited_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auth_token_limited_update BEFORE UPDATE ON public.auth_token FOR EACH ROW EXECUTE FUNCTION public.app_auth_token_limited_update();

--
-- Name: auth_token auth_token_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auth_token_no_truncate BEFORE TRUNCATE ON public.auth_token FOR EACH STATEMENT EXECUTE FUNCTION public.app_block_truncate_auth_token();

--
-- Name: impersonation impersonation_ws_org_consistent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER impersonation_ws_org_consistent BEFORE INSERT OR UPDATE ON public.impersonation FOR EACH ROW EXECUTE FUNCTION public.app_impersonation_ws_org_consistent();

--
-- Name: individual_record individual_record_period_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER individual_record_period_guard BEFORE INSERT ON public.individual_record FOR EACH ROW EXECUTE FUNCTION public.app_individual_period_guard();

--
-- Name: open_item open_item_block_direct_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER open_item_block_direct_delete BEFORE DELETE ON public.open_item FOR EACH ROW EXECUTE FUNCTION public.app_block_open_item_direct_write();

--
-- Name: open_item open_item_block_direct_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER open_item_block_direct_update BEFORE UPDATE ON public.open_item FOR EACH ROW EXECUTE FUNCTION public.app_block_open_item_direct_write();

--
-- Name: open_item_settlement open_item_settlement_block_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER open_item_settlement_block_delete BEFORE DELETE ON public.open_item_settlement FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_accounting();

--
-- Name: open_item_settlement open_item_settlement_block_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER open_item_settlement_block_truncate BEFORE TRUNCATE ON public.open_item_settlement FOR EACH STATEMENT EXECUTE FUNCTION public.app_block_truncate_accounting();

--
-- Name: open_item_settlement open_item_settlement_block_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER open_item_settlement_block_update BEFORE UPDATE ON public.open_item_settlement FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_accounting();

--
-- Name: open_item_settlement open_item_settlement_maintain; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER open_item_settlement_maintain AFTER INSERT ON public.open_item_settlement FOR EACH ROW EXECUTE FUNCTION public.app_maintain_open_item_settled();

--
-- Name: open_item_settlement open_item_settlement_period_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER open_item_settlement_period_guard BEFORE INSERT ON public.open_item_settlement FOR EACH ROW EXECUTE FUNCTION public.app_open_item_settlement_period_guard();

--
-- Name: organization_membership organization_membership_ws_consistent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER organization_membership_ws_consistent BEFORE INSERT OR UPDATE ON public.organization_membership FOR EACH ROW EXECUTE FUNCTION public.app_organization_membership_ws_consistent();

--
-- Name: organization organization_responsible_assignee_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER organization_responsible_assignee_guard BEFORE INSERT OR UPDATE OF workspace_id, responsible_user_id ON public.organization FOR EACH ROW EXECUTE FUNCTION public.app_validate_responsible_assignee();

--
-- Name: organization organization_self_id_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER organization_self_id_sync BEFORE INSERT OR UPDATE ON public.organization FOR EACH ROW EXECUTE FUNCTION public.app_organization_self_id();

--
-- Name: organization organization_workspace_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER organization_workspace_immutable BEFORE UPDATE ON public.organization FOR EACH ROW EXECUTE FUNCTION public.app_organization_workspace_immutable();

--
-- Name: partial_record partial_record_period_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER partial_record_period_guard BEFORE INSERT ON public.partial_record FOR EACH ROW EXECUTE FUNCTION public.app_partial_period_guard();

--
-- Name: period_output period_output_block_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER period_output_block_delete BEFORE DELETE ON public.period_output FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_accounting();

--
-- Name: period_output period_output_block_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER period_output_block_truncate BEFORE TRUNCATE ON public.period_output FOR EACH STATEMENT EXECUTE FUNCTION public.app_block_truncate_accounting();

--
-- Name: period_output period_output_block_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER period_output_block_update BEFORE UPDATE ON public.period_output FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_accounting();

--
-- Name: period_output period_output_completeness_gate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER period_output_completeness_gate BEFORE INSERT ON public.period_output FOR EACH ROW EXECUTE FUNCTION public.app_assert_period_complete();

--
-- Name: posting posting_balanced; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER posting_balanced AFTER INSERT ON public.posting DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.app_posting_balance_from_posting();

--
-- Name: posting posting_block_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posting_block_delete BEFORE DELETE ON public.posting FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_accounting();

--
-- Name: posting posting_block_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posting_block_truncate BEFORE TRUNCATE ON public.posting FOR EACH STATEMENT EXECUTE FUNCTION public.app_block_truncate_accounting();

--
-- Name: posting posting_block_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posting_block_update BEFORE UPDATE ON public.posting FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_accounting();

--
-- Name: posting posting_cash_has_lines; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER posting_cash_has_lines AFTER INSERT ON public.posting DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.app_cash_posting_lines_from_posting();

--
-- Name: posting_double_entry_line posting_de_line_balanced; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER posting_de_line_balanced AFTER INSERT ON public.posting_double_entry_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.app_posting_balance_from_line();

--
-- Name: posting_double_entry_line posting_de_line_maintain_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posting_de_line_maintain_balance AFTER INSERT ON public.posting_double_entry_line FOR EACH ROW EXECUTE FUNCTION public.app_maintain_account_balance();

--
-- Name: posting_double_entry_line posting_de_line_no_parent_post; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posting_de_line_no_parent_post BEFORE INSERT ON public.posting_double_entry_line FOR EACH ROW EXECUTE FUNCTION public.app_block_post_to_parent_account();

--
-- Name: posting_double_entry_line posting_de_line_period_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posting_de_line_period_guard BEFORE INSERT ON public.posting_double_entry_line FOR EACH ROW EXECUTE FUNCTION public.app_de_line_period_guard();

--
-- Name: posting_double_entry_line posting_double_entry_line_block_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posting_double_entry_line_block_delete BEFORE DELETE ON public.posting_double_entry_line FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_accounting();

--
-- Name: posting_double_entry_line posting_double_entry_line_block_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posting_double_entry_line_block_truncate BEFORE TRUNCATE ON public.posting_double_entry_line FOR EACH STATEMENT EXECUTE FUNCTION public.app_block_truncate_accounting();

--
-- Name: posting_double_entry_line posting_double_entry_line_block_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posting_double_entry_line_block_update BEFORE UPDATE ON public.posting_double_entry_line FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_accounting();

--
-- Name: posting_monetary_line posting_mon_line_maintain_summary; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posting_mon_line_maintain_summary AFTER INSERT ON public.posting_monetary_line FOR EACH ROW EXECUTE FUNCTION public.app_maintain_monetary_summary();

--
-- Name: posting_monetary_line posting_mon_line_period_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posting_mon_line_period_guard BEFORE INSERT ON public.posting_monetary_line FOR EACH ROW EXECUTE FUNCTION public.app_mon_line_period_guard();

--
-- Name: posting_monetary_line posting_monetary_line_block_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posting_monetary_line_block_delete BEFORE DELETE ON public.posting_monetary_line FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_accounting();

--
-- Name: posting_monetary_line posting_monetary_line_block_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posting_monetary_line_block_truncate BEFORE TRUNCATE ON public.posting_monetary_line FOR EACH STATEMENT EXECUTE FUNCTION public.app_block_truncate_accounting();

--
-- Name: posting_monetary_line posting_monetary_line_block_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posting_monetary_line_block_update BEFORE UPDATE ON public.posting_monetary_line FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_accounting();

--
-- Name: posting posting_period_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER posting_period_guard BEFORE INSERT ON public.posting FOR EACH ROW EXECUTE FUNCTION public.app_posting_period_guard();

--
-- Name: resource_grant resource_grant_consistent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER resource_grant_consistent BEFORE INSERT OR UPDATE ON public.resource_grant FOR EACH ROW EXECUTE FUNCTION public.app_resource_grant_consistent();

--
-- Name: signature signature_block_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER signature_block_delete BEFORE DELETE ON public.signature FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_accounting();

--
-- Name: signature signature_block_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER signature_block_truncate BEFORE TRUNCATE ON public.signature FOR EACH STATEMENT EXECUTE FUNCTION public.app_block_truncate_accounting();

--
-- Name: signature signature_block_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER signature_block_update BEFORE UPDATE ON public.signature FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_accounting();

--
-- Name: summary_record summary_record_legal_dates_period_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER summary_record_legal_dates_period_guard BEFORE UPDATE OF tax_point_date, received_date ON public.summary_record FOR EACH ROW WHEN (((old.tax_point_date IS DISTINCT FROM new.tax_point_date) OR (old.received_date IS DISTINCT FROM new.received_date))) EXECUTE FUNCTION public.app_summary_legal_dates_period_guard();

--
-- Name: summary_record summary_record_period_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER summary_record_period_guard BEFORE INSERT ON public.summary_record FOR EACH ROW EXECUTE FUNCTION public.app_summary_period_guard();

--
-- Name: tool_call_log tool_call_log_limited_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tool_call_log_limited_update BEFORE UPDATE ON public.tool_call_log FOR EACH ROW EXECUTE FUNCTION public.app_tool_call_log_limited_update();

--
-- Name: tool_call_log tool_call_log_no_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tool_call_log_no_delete BEFORE DELETE ON public.tool_call_log FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_tool_call_log();

--
-- Name: tool_call_log tool_call_log_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tool_call_log_no_truncate BEFORE TRUNCATE ON public.tool_call_log FOR EACH STATEMENT EXECUTE FUNCTION public.app_block_truncate_tool_call_log();

--
-- Name: two_factor_policy two_factor_policy_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER two_factor_policy_set_updated_at BEFORE UPDATE ON public.two_factor_policy FOR EACH ROW EXECUTE FUNCTION public.app_two_factor_policy_set_updated_at();

--
-- Name: workspace_billing workspace_billing_email_normalize; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workspace_billing_email_normalize BEFORE INSERT OR UPDATE ON public.workspace_billing FOR EACH ROW EXECUTE FUNCTION public.app_workspace_billing_email_normalize();

--
-- Name: workspace_membership workspace_membership_prevent_last_owner_demotion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workspace_membership_prevent_last_owner_demotion BEFORE INSERT OR DELETE OR UPDATE ON public.workspace_membership FOR EACH ROW EXECUTE FUNCTION public.app_prevent_last_owner_demotion();

--
-- Name: workspace_membership workspace_membership_responsibility_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workspace_membership_responsibility_guard BEFORE DELETE OR UPDATE OF active, workspace_id, user_id ON public.workspace_membership FOR EACH ROW EXECUTE FUNCTION public.app_prevent_inactive_responsible_member();

--
-- Name: account account_chart_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_chart_fk FOREIGN KEY (chart_id, organization_id) REFERENCES public.chart_of_accounts(id, organization_id);

--
-- Name: account account_chart_period_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_chart_period_fk FOREIGN KEY (chart_id, period_id) REFERENCES public.chart_of_accounts(id, period_id);

--
-- Name: account account_directive_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_directive_fk FOREIGN KEY (specializes_directive_code) REFERENCES public.directive_account(code);

--
-- Name: account account_group_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_group_fk FOREIGN KEY (group_code) REFERENCES public.account_group(code);

--
-- Name: account account_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_parent_fk FOREIGN KEY (parent_id, chart_id) REFERENCES public.account(id, chart_id);

--
-- Name: account_period_balance account_period_balance_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_period_balance
    ADD CONSTRAINT account_period_balance_account_fk FOREIGN KEY (account_id, organization_id) REFERENCES public.account(id, organization_id);

--
-- Name: account_period_balance account_period_balance_acct_period_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_period_balance
    ADD CONSTRAINT account_period_balance_acct_period_fk FOREIGN KEY (account_id, period_id) REFERENCES public.account(id, period_id);

--
-- Name: account_period_balance account_period_balance_period_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_period_balance
    ADD CONSTRAINT account_period_balance_period_fk FOREIGN KEY (period_id, organization_id) REFERENCES public.accounting_period(id, organization_id);

--
-- Name: accounting_event accounting_event_counterparty_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_event
    ADD CONSTRAINT accounting_event_counterparty_fk FOREIGN KEY (counterparty_id, workspace_id) REFERENCES public.counterparty(id, workspace_id);

--
-- Name: accounting_event accounting_event_inbox_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_event
    ADD CONSTRAINT accounting_event_inbox_fk FOREIGN KEY (inbox_id, workspace_id) REFERENCES public.inbox_item(id, workspace_id);

--
-- Name: accounting_event accounting_event_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_event
    ADD CONSTRAINT accounting_event_org_fk FOREIGN KEY (organization_id, workspace_id) REFERENCES public.organization(id, workspace_id);

--
-- Name: accounting_event accounting_event_party_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_event
    ADD CONSTRAINT accounting_event_party_fk FOREIGN KEY (party_id, workspace_id) REFERENCES public.counterparty(id, workspace_id);

--
-- Name: accounting_event accounting_event_period_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_event
    ADD CONSTRAINT accounting_event_period_fk FOREIGN KEY (period_id, organization_id) REFERENCES public.accounting_period(id, organization_id);

--
-- Name: accounting_event accounting_event_responsible_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_event
    ADD CONSTRAINT accounting_event_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.app_user(id);

--
-- Name: accounting_event accounting_event_series_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_event
    ADD CONSTRAINT accounting_event_series_fk FOREIGN KEY (number_series_id, organization_id) REFERENCES public.number_series(id, organization_id);

--
-- Name: accounting_period accounting_period_accounting_currency_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_period
    ADD CONSTRAINT accounting_period_accounting_currency_fkey FOREIGN KEY (accounting_currency) REFERENCES public.currency(code);

--
-- Name: accounting_period accounting_period_accounting_size_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_period
    ADD CONSTRAINT accounting_period_accounting_size_code_fkey FOREIGN KEY (accounting_size_code) REFERENCES public.accounting_size(code);

--
-- Name: accounting_period accounting_period_functional_currency_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_period
    ADD CONSTRAINT accounting_period_functional_currency_fk FOREIGN KEY (accounting_currency, accounting_currency_is_functional) REFERENCES public.currency(code, is_functional_currency);

--
-- Name: accounting_period accounting_period_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_period
    ADD CONSTRAINT accounting_period_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: accounting_period accounting_period_regime_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_period
    ADD CONSTRAINT accounting_period_regime_code_fkey FOREIGN KEY (regime_code) REFERENCES public.regime(code);

--
-- Name: admin_staff_role admin_staff_role_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_staff_role
    ADD CONSTRAINT admin_staff_role_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.app_user(id) ON DELETE SET NULL;

--
-- Name: admin_staff_role admin_staff_role_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_staff_role
    ADD CONSTRAINT admin_staff_role_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

--
-- Name: admin_workspace_allowlist admin_workspace_allowlist_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_workspace_allowlist
    ADD CONSTRAINT admin_workspace_allowlist_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE;

--
-- Name: api_key api_key_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key
    ADD CONSTRAINT api_key_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.app_user(id);

--
-- Name: api_key api_key_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key
    ADD CONSTRAINT api_key_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: api_key api_key_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key
    ADD CONSTRAINT api_key_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE;

--
-- Name: asset asset_directive_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_directive_fk FOREIGN KEY (directive_code) REFERENCES public.directive_account(code);

--
-- Name: asset asset_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: asset asset_responsible_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.app_user(id);

--
-- Name: asset asset_series_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset
    ADD CONSTRAINT asset_series_fk FOREIGN KEY (number_series_id, organization_id) REFERENCES public.number_series(id, organization_id);

--
-- Name: audit_event audit_event_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_event
    ADD CONSTRAINT audit_event_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.app_user(id);

--
-- Name: audit_event audit_event_organization_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_event
    ADD CONSTRAINT audit_event_organization_fk FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: audit_event audit_event_workspace_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_event
    ADD CONSTRAINT audit_event_workspace_fk FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);

--
-- Name: auth_account auth_account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_account
    ADD CONSTRAINT auth_account_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

--
-- Name: auth_session auth_session_impersonated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_session
    ADD CONSTRAINT auth_session_impersonated_by_fkey FOREIGN KEY (impersonated_by) REFERENCES public.app_user(id);

--
-- Name: auth_session auth_session_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_session
    ADD CONSTRAINT auth_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

--
-- Name: auth_token auth_token_issued_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_token
    ADD CONSTRAINT auth_token_issued_to_user_id_fkey FOREIGN KEY (issued_to_user_id) REFERENCES public.app_user(id);

--
-- Name: auth_verification auth_verification_workspace_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_verification
    ADD CONSTRAINT auth_verification_workspace_fk FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE;

--
-- Name: booking_template booking_template_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_template
    ADD CONSTRAINT booking_template_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);

--
-- Name: brain_confident_wrong brain_confident_wrong_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_confident_wrong
    ADD CONSTRAINT brain_confident_wrong_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);

--
-- Name: business_activity business_activity_parent_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_activity
    ADD CONSTRAINT business_activity_parent_code_fkey FOREIGN KEY (parent_code) REFERENCES public.business_activity(code);

--
-- Name: category category_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: chart_of_accounts chart_period_regime_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_period_regime_fk FOREIGN KEY (period_id, organization_id, regime_code) REFERENCES public.accounting_period(id, organization_id, regime_code);

--
-- Name: counterparty counterparty_self_of_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty
    ADD CONSTRAINT counterparty_self_of_organization_id_fkey FOREIGN KEY (self_of_organization_id) REFERENCES public.organization(id) ON DELETE SET NULL;

--
-- Name: counterparty counterparty_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty
    ADD CONSTRAINT counterparty_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);

--
-- Name: depreciation_plan depreciation_plan_asset_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_plan
    ADD CONSTRAINT depreciation_plan_asset_fk FOREIGN KEY (asset_id, organization_id) REFERENCES public.asset(id, organization_id);

--
-- Name: depreciation_plan depreciation_plan_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_plan
    ADD CONSTRAINT depreciation_plan_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: depreciation_plan depreciation_plan_supersedes_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.depreciation_plan
    ADD CONSTRAINT depreciation_plan_supersedes_fk FOREIGN KEY (supersedes_plan_id, organization_id) REFERENCES public.depreciation_plan(id, organization_id);

--
-- Name: directive_account directive_account_group_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directive_account
    ADD CONSTRAINT directive_account_group_code_fkey FOREIGN KEY (group_code) REFERENCES public.account_group(code);

--
-- Name: dppo_annual_adjustment dppo_annual_adjustment_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dppo_annual_adjustment
    ADD CONSTRAINT dppo_annual_adjustment_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: dppo_annual_adjustment dppo_annual_adjustment_period_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dppo_annual_adjustment
    ADD CONSTRAINT dppo_annual_adjustment_period_fk FOREIGN KEY (period_id, organization_id) REFERENCES public.accounting_period(id, organization_id);

--
-- Name: dppo_annual_taxpayer_category dppo_annual_taxpayer_category_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dppo_annual_taxpayer_category
    ADD CONSTRAINT dppo_annual_taxpayer_category_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: dppo_annual_taxpayer_category dppo_annual_taxpayer_category_period_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dppo_annual_taxpayer_category
    ADD CONSTRAINT dppo_annual_taxpayer_category_period_fk FOREIGN KEY (period_id, organization_id) REFERENCES public.accounting_period(id, organization_id);

--
-- Name: favorite_page favorite_page_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_page
    ADD CONSTRAINT favorite_page_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: favorite_page favorite_page_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_page
    ADD CONSTRAINT favorite_page_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

--
-- Name: impersonation impersonation_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impersonation
    ADD CONSTRAINT impersonation_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.app_user(id) ON DELETE RESTRICT;

--
-- Name: impersonation impersonation_auth_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impersonation
    ADD CONSTRAINT impersonation_auth_session_id_fkey FOREIGN KEY (auth_session_id) REFERENCES public.auth_session(id) ON DELETE SET NULL;

--
-- Name: impersonation impersonation_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impersonation
    ADD CONSTRAINT impersonation_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE SET NULL;

--
-- Name: impersonation impersonation_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impersonation
    ADD CONSTRAINT impersonation_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.app_user(id) ON DELETE RESTRICT;

--
-- Name: impersonation impersonation_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impersonation
    ADD CONSTRAINT impersonation_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);

--
-- Name: inbox_attachment inbox_attachment_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_attachment
    ADD CONSTRAINT inbox_attachment_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);

--
-- Name: inbox_item inbox_item_attachment_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_item
    ADD CONSTRAINT inbox_item_attachment_fk FOREIGN KEY (inbox_attachment_id, workspace_id) REFERENCES public.inbox_attachment(id, workspace_id);

--
-- Name: inbox_item inbox_item_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_item
    ADD CONSTRAINT inbox_item_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);

--
-- Name: individual_record individual_record_doc_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.individual_record
    ADD CONSTRAINT individual_record_doc_fk FOREIGN KEY (summary_record_id, organization_id) REFERENCES public.summary_record(id, organization_id);

--
-- Name: individual_record individual_record_event_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.individual_record
    ADD CONSTRAINT individual_record_event_fk FOREIGN KEY (accounting_event_id, organization_id) REFERENCES public.accounting_event(id, organization_id);

--
-- Name: individual_record individual_record_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.individual_record
    ADD CONSTRAINT individual_record_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: inventory_count_line inventory_count_line_asset_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count_line
    ADD CONSTRAINT inventory_count_line_asset_fk FOREIGN KEY (asset_id, organization_id) REFERENCES public.asset(id, organization_id);

--
-- Name: inventory_count_line inventory_count_line_count_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count_line
    ADD CONSTRAINT inventory_count_line_count_fk FOREIGN KEY (inventory_count_id, organization_id) REFERENCES public.inventory_count(id, organization_id);

--
-- Name: inventory_count_line inventory_count_line_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count_line
    ADD CONSTRAINT inventory_count_line_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: inventory_count inventory_count_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count
    ADD CONSTRAINT inventory_count_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: inventory_count inventory_count_series_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_count
    ADD CONSTRAINT inventory_count_series_fk FOREIGN KEY (number_series_id, organization_id) REFERENCES public.number_series(id, organization_id);

--
-- Name: legal_form_allowed_regime legal_form_allowed_regime_legal_form_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_form_allowed_regime
    ADD CONSTRAINT legal_form_allowed_regime_legal_form_code_fkey FOREIGN KEY (legal_form_code) REFERENCES public.legal_form(code);

--
-- Name: legal_form_allowed_regime legal_form_allowed_regime_regime_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.legal_form_allowed_regime
    ADD CONSTRAINT legal_form_allowed_regime_regime_code_fkey FOREIGN KEY (regime_code) REFERENCES public.regime(code);

--
-- Name: monetary_period_summary monetary_period_summary_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monetary_period_summary
    ADD CONSTRAINT monetary_period_summary_category_fk FOREIGN KEY (category_id, organization_id) REFERENCES public.category(id, organization_id);

--
-- Name: monetary_period_summary monetary_period_summary_period_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monetary_period_summary
    ADD CONSTRAINT monetary_period_summary_period_fk FOREIGN KEY (period_id, organization_id) REFERENCES public.accounting_period(id, organization_id);

--
-- Name: number_series number_series_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.number_series
    ADD CONSTRAINT number_series_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: ocr_extraction_template ocr_extraction_template_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ocr_extraction_template
    ADD CONSTRAINT ocr_extraction_template_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);

--
-- Name: open_item open_item_counterparty_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_item
    ADD CONSTRAINT open_item_counterparty_fk FOREIGN KEY (counterparty_id, workspace_id) REFERENCES public.counterparty(id, workspace_id);

--
-- Name: open_item open_item_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_item
    ADD CONSTRAINT open_item_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES public.currency(code);

--
-- Name: open_item open_item_inbox_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_item
    ADD CONSTRAINT open_item_inbox_fk FOREIGN KEY (inbox_id, workspace_id) REFERENCES public.inbox_item(id, workspace_id);

--
-- Name: open_item open_item_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_item
    ADD CONSTRAINT open_item_org_fk FOREIGN KEY (organization_id, workspace_id) REFERENCES public.organization(id, workspace_id);

--
-- Name: open_item open_item_posting_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_item
    ADD CONSTRAINT open_item_posting_fk FOREIGN KEY (origin_posting_id, organization_id) REFERENCES public.posting(id, organization_id);

--
-- Name: open_item_settlement open_item_settlement_item_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_item_settlement
    ADD CONSTRAINT open_item_settlement_item_fk FOREIGN KEY (open_item_id, organization_id) REFERENCES public.open_item(id, organization_id);

--
-- Name: open_item_settlement open_item_settlement_posting_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.open_item_settlement
    ADD CONSTRAINT open_item_settlement_posting_fk FOREIGN KEY (settling_posting_id, organization_id) REFERENCES public.posting(id, organization_id);

--
-- Name: organization_authorized_person organization_authorized_person_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_authorized_person
    ADD CONSTRAINT organization_authorized_person_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: organization_business_activity organization_business_activity_business_activity_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_business_activity
    ADD CONSTRAINT organization_business_activity_business_activity_code_fkey FOREIGN KEY (business_activity_code) REFERENCES public.business_activity(code);

--
-- Name: organization_business_activity organization_business_activity_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_business_activity
    ADD CONSTRAINT organization_business_activity_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: organization organization_legal_form_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_legal_form_code_fkey FOREIGN KEY (legal_form_code) REFERENCES public.legal_form(code);

--
-- Name: organization_membership organization_membership_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_membership
    ADD CONSTRAINT organization_membership_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: organization_membership organization_membership_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_membership
    ADD CONSTRAINT organization_membership_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

--
-- Name: organization_membership organization_membership_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_membership
    ADD CONSTRAINT organization_membership_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE;

--
-- Name: organization_membership organization_membership_workspace_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_membership
    ADD CONSTRAINT organization_membership_workspace_membership_id_fkey FOREIGN KEY (workspace_membership_id) REFERENCES public.workspace_membership(id) ON DELETE CASCADE;

--
-- Name: organization_oss_registration organization_oss_registration_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_oss_registration
    ADD CONSTRAINT organization_oss_registration_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: organization_provisioning organization_provisioning_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_provisioning
    ADD CONSTRAINT organization_provisioning_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: organization_provisioning organization_provisioning_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_provisioning
    ADD CONSTRAINT organization_provisioning_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);

--
-- Name: organization organization_responsible_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.app_user(id);

--
-- Name: organization_tax_profile organization_tax_profile_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_tax_profile
    ADD CONSTRAINT organization_tax_profile_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: organization_tax_representative organization_tax_representative_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_tax_representative
    ADD CONSTRAINT organization_tax_representative_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: organization organization_workspace_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_workspace_fk FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);

--
-- Name: partial_record partial_record_currency_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partial_record
    ADD CONSTRAINT partial_record_currency_code_fkey FOREIGN KEY (currency_code) REFERENCES public.currency(code);

--
-- Name: partial_record partial_record_line_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partial_record
    ADD CONSTRAINT partial_record_line_fk FOREIGN KEY (individual_record_id, organization_id) REFERENCES public.individual_record(id, organization_id);

--
-- Name: partial_record partial_record_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partial_record
    ADD CONSTRAINT partial_record_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: period_output period_output_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.period_output
    ADD CONSTRAINT period_output_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.app_user(id);

--
-- Name: period_output period_output_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.period_output
    ADD CONSTRAINT period_output_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: period_output period_output_period_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.period_output
    ADD CONSTRAINT period_output_period_fk FOREIGN KEY (period_id, organization_id) REFERENCES public.accounting_period(id, organization_id);

--
-- Name: permission_template permission_template_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_template
    ADD CONSTRAINT permission_template_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE;

--
-- Name: posting posting_correction_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting
    ADD CONSTRAINT posting_correction_fk FOREIGN KEY (corrects_posting_id, organization_id, regime_code) REFERENCES public.posting(id, organization_id, regime_code);

--
-- Name: posting_double_entry_line posting_de_line_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_double_entry_line
    ADD CONSTRAINT posting_de_line_account_fk FOREIGN KEY (account_id, organization_id) REFERENCES public.account(id, organization_id);

--
-- Name: posting_double_entry_line posting_de_line_account_period_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_double_entry_line
    ADD CONSTRAINT posting_de_line_account_period_fk FOREIGN KEY (account_id, period_id) REFERENCES public.account(id, period_id);

--
-- Name: posting_double_entry_line posting_de_line_partial_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_double_entry_line
    ADD CONSTRAINT posting_de_line_partial_fk FOREIGN KEY (partial_record_id, organization_id) REFERENCES public.partial_record(id, organization_id);

--
-- Name: posting_double_entry_line posting_de_line_posting_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_double_entry_line
    ADD CONSTRAINT posting_de_line_posting_fk FOREIGN KEY (posting_id, organization_id, regime_code) REFERENCES public.posting(id, organization_id, regime_code);

--
-- Name: posting_double_entry_line posting_de_line_posting_period_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_double_entry_line
    ADD CONSTRAINT posting_de_line_posting_period_fk FOREIGN KEY (posting_id, period_id) REFERENCES public.posting(id, period_id);

--
-- Name: posting posting_depreciation_plan_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting
    ADD CONSTRAINT posting_depreciation_plan_fk FOREIGN KEY (depreciation_plan_id, organization_id) REFERENCES public.depreciation_plan(id, organization_id);

--
-- Name: posting posting_event_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting
    ADD CONSTRAINT posting_event_fk FOREIGN KEY (accounting_event_id, organization_id) REFERENCES public.accounting_event(id, organization_id);

--
-- Name: posting posting_inventory_count_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting
    ADD CONSTRAINT posting_inventory_count_fk FOREIGN KEY (inventory_count_id, organization_id) REFERENCES public.inventory_count(id, organization_id);

--
-- Name: posting_monetary_line posting_monetary_line_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_monetary_line
    ADD CONSTRAINT posting_monetary_line_category_fk FOREIGN KEY (category_id, organization_id) REFERENCES public.category(id, organization_id);

--
-- Name: posting_monetary_line posting_monetary_line_partial_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_monetary_line
    ADD CONSTRAINT posting_monetary_line_partial_fk FOREIGN KEY (partial_record_id, organization_id) REFERENCES public.partial_record(id, organization_id);

--
-- Name: posting_monetary_line posting_monetary_line_posting_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting_monetary_line
    ADD CONSTRAINT posting_monetary_line_posting_fk FOREIGN KEY (posting_id, organization_id, regime_code) REFERENCES public.posting(id, organization_id, regime_code);

--
-- Name: posting posting_period_regime_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting
    ADD CONSTRAINT posting_period_regime_fk FOREIGN KEY (period_id, organization_id, regime_code) REFERENCES public.accounting_period(id, organization_id, regime_code);

--
-- Name: posting posting_responsible_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting
    ADD CONSTRAINT posting_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.app_user(id);

--
-- Name: posting posting_summary_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posting
    ADD CONSTRAINT posting_summary_fk FOREIGN KEY (summary_record_id, organization_id) REFERENCES public.summary_record(id, organization_id);

--
-- Name: resource_grant resource_grant_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_grant
    ADD CONSTRAINT resource_grant_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.workspace_membership(id) ON DELETE CASCADE;

--
-- Name: resource_grant resource_grant_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_grant
    ADD CONSTRAINT resource_grant_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id) ON DELETE CASCADE;

--
-- Name: signature signature_event_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signature
    ADD CONSTRAINT signature_event_fk FOREIGN KEY (event_id, organization_id) REFERENCES public.accounting_event(id, organization_id);

--
-- Name: signature signature_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signature
    ADD CONSTRAINT signature_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: signature signature_posting_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signature
    ADD CONSTRAINT signature_posting_fk FOREIGN KEY (posting_id, organization_id) REFERENCES public.posting(id, organization_id);

--
-- Name: signature signature_signer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signature
    ADD CONSTRAINT signature_signer_id_fkey FOREIGN KEY (signer_id) REFERENCES public.app_user(id);

--
-- Name: summary_record summary_record_inbox_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.summary_record
    ADD CONSTRAINT summary_record_inbox_fk FOREIGN KEY (inbox_id, workspace_id) REFERENCES public.inbox_item(id, workspace_id);

--
-- Name: summary_record summary_record_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.summary_record
    ADD CONSTRAINT summary_record_org_fk FOREIGN KEY (organization_id, workspace_id) REFERENCES public.organization(id, workspace_id);

--
-- Name: summary_record summary_record_period_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.summary_record
    ADD CONSTRAINT summary_record_period_fk FOREIGN KEY (period_id, organization_id) REFERENCES public.accounting_period(id, organization_id);

--
-- Name: summary_record summary_record_series_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.summary_record
    ADD CONSTRAINT summary_record_series_fk FOREIGN KEY (number_series_id, organization_id) REFERENCES public.number_series(id, organization_id);

--
-- Name: tax_depreciation tax_depreciation_asset_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_depreciation
    ADD CONSTRAINT tax_depreciation_asset_fk FOREIGN KEY (asset_id, organization_id) REFERENCES public.asset(id, organization_id);

--
-- Name: tax_depreciation tax_depreciation_depreciation_group_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_depreciation
    ADD CONSTRAINT tax_depreciation_depreciation_group_code_fkey FOREIGN KEY (depreciation_group_code) REFERENCES public.depreciation_group(code);

--
-- Name: tax_depreciation tax_depreciation_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_depreciation
    ADD CONSTRAINT tax_depreciation_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: tool_call_log tool_call_log_approved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_call_log
    ADD CONSTRAINT tool_call_log_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.app_user(id);

--
-- Name: tool_call_log tool_call_log_period_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_call_log
    ADD CONSTRAINT tool_call_log_period_fk FOREIGN KEY (period_id, organization_id) REFERENCES public.accounting_period(id, organization_id);

--
-- Name: tool_call_log tool_call_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_call_log
    ADD CONSTRAINT tool_call_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id);

--
-- Name: two_factor_policy two_factor_policy_declared_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factor_policy
    ADD CONSTRAINT two_factor_policy_declared_by_user_id_fkey FOREIGN KEY (declared_by_user_id) REFERENCES public.app_user(id) ON DELETE SET NULL;

--
-- Name: two_factor_policy two_factor_policy_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factor_policy
    ADD CONSTRAINT two_factor_policy_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE;

--
-- Name: two_factor two_factor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factor
    ADD CONSTRAINT two_factor_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

--
-- Name: vat_status vat_status_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_status
    ADD CONSTRAINT vat_status_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: vat_status vat_status_vat_regime_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_status
    ADD CONSTRAINT vat_status_vat_regime_code_fkey FOREIGN KEY (vat_regime_code) REFERENCES public.vat_regime(code);

--
-- Name: workspace_billing workspace_billing_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_billing
    ADD CONSTRAINT workspace_billing_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE;

--
-- Name: workspace workspace_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace
    ADD CONSTRAINT workspace_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.app_user(id);

--
-- Name: workspace_membership workspace_membership_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_membership
    ADD CONSTRAINT workspace_membership_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;

--
-- Name: workspace_membership workspace_membership_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_membership
    ADD CONSTRAINT workspace_membership_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE;

--
-- Name: account; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account ENABLE ROW LEVEL SECURITY;

--
-- Name: account_period_balance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_period_balance ENABLE ROW LEVEL SECURITY;

--
-- Name: accounting_event; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounting_event ENABLE ROW LEVEL SECURITY;

--
-- Name: accounting_period; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounting_period ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_workspace_allowlist admin_allowlist_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_allowlist_read ON public.admin_workspace_allowlist FOR SELECT TO app_user USING (true);

--
-- Name: admin_staff_role; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_staff_role ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_workspace_allowlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_workspace_allowlist ENABLE ROW LEVEL SECURITY;

--
-- Name: api_key; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_key ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_billing app_workspace_billing_owner_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_workspace_billing_owner_admin ON public.workspace_billing USING (((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_admin(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid))) WITH CHECK (((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_admin(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)));

--
-- Name: asset; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asset ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_event; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_event ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_event audit_event_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_event_insert ON public.audit_event FOR INSERT WITH CHECK (((workspace_id IS NOT NULL) AND (workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_member(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)));

--
-- Name: audit_event audit_event_org_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_event_org_member_read ON public.audit_event FOR SELECT USING (((workspace_id IS NOT NULL) AND (workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND (organization_id IS NOT NULL) AND (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_member(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)));

--
-- Name: audit_event audit_event_ws_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_event_ws_admin_read ON public.audit_event FOR SELECT USING (((workspace_id IS NOT NULL) AND (workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_admin(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)));

--
-- Name: auth_token; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_token ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_token auth_token_deny_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_token_deny_all ON public.auth_token USING (false) WITH CHECK (false);

--
-- Name: booking_template; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_template ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_template booking_template_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_template_delete ON public.booking_template FOR DELETE USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: booking_template booking_template_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_template_insert ON public.booking_template FOR INSERT WITH CHECK ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: booking_template booking_template_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_template_select ON public.booking_template FOR SELECT USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: booking_template booking_template_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_template_update ON public.booking_template FOR UPDATE USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid)) WITH CHECK ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: brain_confident_wrong; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brain_confident_wrong ENABLE ROW LEVEL SECURITY;

--
-- Name: brain_confident_wrong brain_confident_wrong_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brain_confident_wrong_delete ON public.brain_confident_wrong FOR DELETE USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: brain_confident_wrong brain_confident_wrong_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brain_confident_wrong_insert ON public.brain_confident_wrong FOR INSERT WITH CHECK ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: brain_confident_wrong brain_confident_wrong_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brain_confident_wrong_select ON public.brain_confident_wrong FOR SELECT USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: brain_confident_wrong brain_confident_wrong_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brain_confident_wrong_update ON public.brain_confident_wrong FOR UPDATE USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid)) WITH CHECK ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: category; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.category ENABLE ROW LEVEL SECURITY;

--
-- Name: chart_of_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: counterparty; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.counterparty ENABLE ROW LEVEL SECURITY;

--
-- Name: counterparty counterparty_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY counterparty_delete ON public.counterparty FOR DELETE USING (((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND (self_of_organization_id IS NULL)));

--
-- Name: counterparty counterparty_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY counterparty_insert ON public.counterparty FOR INSERT WITH CHECK (((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND ((self_of_organization_id IS NULL) OR (self_of_organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))));

--
-- Name: counterparty counterparty_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY counterparty_select ON public.counterparty FOR SELECT USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: counterparty counterparty_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY counterparty_update ON public.counterparty FOR UPDATE USING (((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND ((self_of_organization_id IS NULL) OR (self_of_organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)))) WITH CHECK (((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND ((self_of_organization_id IS NULL) OR (self_of_organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))));

--
-- Name: depreciation_plan; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.depreciation_plan ENABLE ROW LEVEL SECURITY;

--
-- Name: dppo_annual_adjustment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dppo_annual_adjustment ENABLE ROW LEVEL SECURITY;

--
-- Name: dppo_annual_taxpayer_category; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dppo_annual_taxpayer_category ENABLE ROW LEVEL SECURITY;

--
-- Name: favorite_page; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.favorite_page ENABLE ROW LEVEL SECURITY;

--
-- Name: impersonation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.impersonation ENABLE ROW LEVEL SECURITY;

--
-- Name: impersonation impersonation_target_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY impersonation_target_self_read ON public.impersonation FOR SELECT TO app_user USING ((target_user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid));

--
-- Name: impersonation impersonation_ws_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY impersonation_ws_admin_read ON public.impersonation FOR SELECT TO app_user USING (((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_admin(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)));

--
-- Name: inbox_attachment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbox_attachment ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_attachment inbox_attachment_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inbox_attachment_delete ON public.inbox_attachment FOR DELETE USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: inbox_attachment inbox_attachment_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inbox_attachment_insert ON public.inbox_attachment FOR INSERT WITH CHECK ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: inbox_attachment inbox_attachment_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inbox_attachment_select ON public.inbox_attachment FOR SELECT USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: inbox_attachment inbox_attachment_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inbox_attachment_update ON public.inbox_attachment FOR UPDATE USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid)) WITH CHECK ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: inbox_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbox_item ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_item inbox_item_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inbox_item_delete ON public.inbox_item FOR DELETE USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: inbox_item inbox_item_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inbox_item_insert ON public.inbox_item FOR INSERT WITH CHECK ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: inbox_item inbox_item_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inbox_item_select ON public.inbox_item FOR SELECT USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: inbox_item inbox_item_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inbox_item_update ON public.inbox_item FOR UPDATE USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid)) WITH CHECK ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: individual_record; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.individual_record ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_count; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_count ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_count_line; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_count_line ENABLE ROW LEVEL SECURITY;

--
-- Name: monetary_period_summary; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.monetary_period_summary ENABLE ROW LEVEL SECURITY;

--
-- Name: number_series; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.number_series ENABLE ROW LEVEL SECURITY;

--
-- Name: ocr_extraction_template; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ocr_extraction_template ENABLE ROW LEVEL SECURITY;

--
-- Name: ocr_extraction_template ocr_extraction_template_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ocr_extraction_template_delete ON public.ocr_extraction_template FOR DELETE USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: ocr_extraction_template ocr_extraction_template_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ocr_extraction_template_insert ON public.ocr_extraction_template FOR INSERT WITH CHECK ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: ocr_extraction_template ocr_extraction_template_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ocr_extraction_template_select ON public.ocr_extraction_template FOR SELECT USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: ocr_extraction_template ocr_extraction_template_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ocr_extraction_template_update ON public.ocr_extraction_template FOR UPDATE USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid)) WITH CHECK ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: open_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.open_item ENABLE ROW LEVEL SECURITY;

--
-- Name: open_item_settlement; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.open_item_settlement ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_membership org_membership_org_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_membership_org_read ON public.organization_membership FOR SELECT USING (((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid) AND public.app_is_org_member(organization_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)));

--
-- Name: organization_membership org_membership_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_membership_self_read ON public.organization_membership FOR SELECT USING ((user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid));

--
-- Name: organization_membership org_membership_ws_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_membership_ws_admin_read ON public.organization_membership FOR SELECT USING (public.app_is_workspace_admin(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid));

--
-- Name: organization_membership org_membership_ws_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY org_membership_ws_admin_write ON public.organization_membership USING (public.app_is_workspace_admin(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)) WITH CHECK (public.app_is_workspace_admin(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid));

--
-- Name: organization; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_authorized_person; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_authorized_person ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_business_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_business_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: account organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.account USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: accounting_event organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.accounting_event USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: accounting_period organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.accounting_period USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: api_key organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.api_key USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: asset organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.asset USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: category organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.category USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: chart_of_accounts organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.chart_of_accounts USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: depreciation_plan organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.depreciation_plan USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: dppo_annual_adjustment organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.dppo_annual_adjustment USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: dppo_annual_taxpayer_category organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.dppo_annual_taxpayer_category USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: favorite_page organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.favorite_page USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: individual_record organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.individual_record USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: inventory_count organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.inventory_count USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: inventory_count_line organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.inventory_count_line USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: number_series organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.number_series USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: open_item organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.open_item USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: open_item_settlement organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.open_item_settlement USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: organization organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.organization USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: organization_authorized_person organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.organization_authorized_person USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: organization_business_activity organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.organization_business_activity USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: organization_oss_registration organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.organization_oss_registration USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: organization_tax_profile organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.organization_tax_profile USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: organization_tax_representative organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.organization_tax_representative USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: partial_record organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.partial_record USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: period_output organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.period_output USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: posting organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.posting USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: posting_double_entry_line organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.posting_double_entry_line USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: posting_monetary_line organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.posting_monetary_line USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: signature organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.signature USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: summary_record organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.summary_record USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: tax_depreciation organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.tax_depreciation USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: tool_call_log organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.tool_call_log USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: vat_status organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.vat_status USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: organization_membership; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_membership ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_oss_registration; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_oss_registration ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_provisioning; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_provisioning ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_provisioning organization_provisioning_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_provisioning_insert ON public.organization_provisioning FOR INSERT WITH CHECK ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: organization_provisioning organization_provisioning_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_provisioning_select ON public.organization_provisioning FOR SELECT USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: organization_provisioning organization_provisioning_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_provisioning_update ON public.organization_provisioning FOR UPDATE USING ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid)) WITH CHECK ((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: organization_tax_profile; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_tax_profile ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_tax_representative; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_tax_representative ENABLE ROW LEVEL SECURITY;

--
-- Name: partial_record; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partial_record ENABLE ROW LEVEL SECURITY;

--
-- Name: period_output; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.period_output ENABLE ROW LEVEL SECURITY;

--
-- Name: permission_template; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permission_template ENABLE ROW LEVEL SECURITY;

--
-- Name: permission_template permission_template_system_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY permission_template_system_read ON public.permission_template FOR SELECT USING ((is_system = true));

--
-- Name: permission_template permission_template_ws_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY permission_template_ws_read ON public.permission_template FOR SELECT USING (((workspace_id IS NOT NULL) AND (workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_member(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)));

--
-- Name: permission_template permission_template_ws_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY permission_template_ws_write ON public.permission_template USING (((workspace_id IS NOT NULL) AND (workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_admin(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid))) WITH CHECK (((workspace_id IS NOT NULL) AND (workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND (is_system = false)));

--
-- Name: posting; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.posting ENABLE ROW LEVEL SECURITY;

--
-- Name: posting_double_entry_line; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.posting_double_entry_line ENABLE ROW LEVEL SECURITY;

--
-- Name: posting_monetary_line; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.posting_monetary_line ENABLE ROW LEVEL SECURITY;

--
-- Name: account_period_balance read_model_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_model_isolation ON public.account_period_balance USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: monetary_period_summary read_model_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_model_isolation ON public.monetary_period_summary USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: resource_grant; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resource_grant ENABLE ROW LEVEL SECURITY;

--
-- Name: resource_grant resource_grant_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resource_grant_admin_read ON public.resource_grant FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.workspace_membership wm_target
  WHERE ((wm_target.id = resource_grant.membership_id) AND (wm_target.workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid)))) AND public.app_is_workspace_admin((NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)));

--
-- Name: resource_grant resource_grant_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resource_grant_admin_write ON public.resource_grant USING (((EXISTS ( SELECT 1
   FROM public.workspace_membership wm_target
  WHERE ((wm_target.id = resource_grant.membership_id) AND (wm_target.workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid)))) AND public.app_is_workspace_admin((NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspace_membership wm_target
  WHERE ((wm_target.id = resource_grant.membership_id) AND (wm_target.workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid)))));

--
-- Name: resource_grant resource_grant_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY resource_grant_self_read ON public.resource_grant FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.workspace_membership wm
  WHERE ((wm.id = resource_grant.membership_id) AND (wm.workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND (wm.user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)))));

--
-- Name: signature; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.signature ENABLE ROW LEVEL SECURITY;

--
-- Name: summary_record; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.summary_record ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_depreciation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_depreciation ENABLE ROW LEVEL SECURITY;

--
-- Name: tool_call_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tool_call_log ENABLE ROW LEVEL SECURITY;

--
-- Name: two_factor_policy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.two_factor_policy ENABLE ROW LEVEL SECURITY;

--
-- Name: two_factor_policy two_factor_policy_ws_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY two_factor_policy_ws_admin_all ON public.two_factor_policy TO app_user USING (((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_admin(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid))) WITH CHECK (((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_admin(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)));

--
-- Name: two_factor_policy two_factor_policy_ws_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY two_factor_policy_ws_member_read ON public.two_factor_policy FOR SELECT TO app_user USING (((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_member(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)));

--
-- Name: vat_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vat_status ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_billing; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_billing ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace workspace_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_member_read ON public.workspace FOR SELECT USING (((id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_member(id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)));

--
-- Name: workspace_membership; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_membership ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace workspace_owner_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_owner_write ON public.workspace USING (((id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_owner(id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid))) WITH CHECK ((id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid));

--
-- Name: workspace_membership ws_membership_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_membership_admin_read ON public.workspace_membership FOR SELECT USING (((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_admin(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)));

--
-- Name: workspace_membership ws_membership_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_membership_admin_write ON public.workspace_membership USING (((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_admin(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid))) WITH CHECK (((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND public.app_is_workspace_admin(workspace_id, (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)));

--
-- Name: workspace_membership ws_membership_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ws_membership_self_read ON public.workspace_membership FOR SELECT USING (((workspace_id = (NULLIF(current_setting('app.workspace_id'::text, true), ''::text))::uuid) AND (user_id = (NULLIF(current_setting('app.user_id'::text, true), ''::text))::uuid)));

--
--

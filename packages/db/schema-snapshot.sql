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
-- Name: accounting_regime; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.accounting_regime AS ENUM (
    'PODVOJNE',
    'JEDNODUCHE',
    'DANOVA_EVIDENCE'
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
-- Name: billing_plan; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.billing_plan AS ENUM (
    'starter',
    'growth',
    'scale'
);

--
-- Name: dilci_druh; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dilci_druh AS ENUM (
    'zaklad',
    'dph',
    'zaokr'
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
-- Name: kategorie_typ; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.kategorie_typ AS ENUM (
    'prijem',
    'vydaj'
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
-- Name: penezni_denik_misto; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.penezni_denik_misto AS ENUM (
    'hotovost',
    'banka'
);

--
-- Name: penezni_denik_smer; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.penezni_denik_smer AS ENUM (
    'prijem',
    'vydaj'
);

--
-- Name: podpis_typ; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.podpis_typ AS ENUM (
    'za_pripad',
    'za_zauctovani'
);

--
-- Name: ucet_typ; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ucet_typ AS ENUM (
    'A',
    'P',
    'N',
    'V',
    'podrozvahovy'
);

--
-- Name: ucetni_doklad_typ; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ucetni_doklad_typ AS ENUM (
    'FP',
    'FV',
    'BV',
    'ID',
    'pokladni',
    'sberny'
);

--
-- Name: ucetni_obdobi_stav; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ucetni_obdobi_stav AS ENUM (
    'otevreno',
    'uzavreno'
);

--
-- Name: ucetni_obdobi_typ; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ucetni_obdobi_typ AS ENUM (
    'kalendar',
    'hospodarsky'
);

--
-- Name: ucetni_zapis_druh; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ucetni_zapis_druh AS ENUM (
    'jednoduchy',
    'slozeny'
);

--
-- Name: ucetni_zapis_oprava_typ; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ucetni_zapis_oprava_typ AS ENUM (
    'storno',
    'doplnkovy'
);

--
-- Name: vystup_typ; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.vystup_typ AS ENUM (
    'ZAVERKA',
    'PREHLEDY',
    'DPFO'
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
-- Name: zapis_strana; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.zapis_strana AS ENUM (
    'MD',
    'D'
);

--
-- Name: app_assert_zapis_balanced(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_assert_zapis_balanced(p_zapis_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_regime accounting_regime;
  v_count  integer;
  v_md     numeric(19,4);
  v_d      numeric(19,4);
BEGIN
  SELECT regime INTO v_regime FROM ucetni_zapis WHERE id = p_zapis_id;
  IF NOT FOUND THEN
    -- zapis no longer exists (delete is blocked by R8 anyway); nothing to check.
    RETURN;
  END IF;
  IF v_regime <> 'PODVOJNE' THEN
    RETURN;
  END IF;

  SELECT count(*),
         COALESCE(SUM(castka) FILTER (WHERE strana = 'MD'), 0),
         COALESCE(SUM(castka) FILTER (WHERE strana = 'D'),  0)
    INTO v_count, v_md, v_d
    FROM zapis_radek
   WHERE zapis_id = p_zapis_id;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'ucetni_zapis % (PODVOJNE) has no zapis_radek lines (R3/R4 §13/2)', p_zapis_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_md <> v_d THEN
    RAISE EXCEPTION 'ucetni_zapis % is unbalanced: Σ(MD)=% Σ(Dal)=% (R4 §13/2)', p_zapis_id, v_md, v_d
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
-- Name: app_block_closed_period(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_block_closed_period() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_stav ucetni_obdobi_stav;
BEGIN
  SELECT stav INTO v_stav FROM ucetni_obdobi WHERE id = NEW.obdobi_id;
  IF v_stav = 'uzavreno' THEN
    RAISE EXCEPTION
      'ucetni_obdobi % is closed (uzavreno): no new % allowed (R12 §17). Post into an open period.',
      NEW.obdobi_id, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
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
-- Name: app_block_mutation_posting(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_block_mutation_posting() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only (R8 §35): % blocked. Post a storno / doplňkový correction (a new ucetni_zapis with opravuje_zapis_id).',
    TG_TABLE_NAME, TG_OP
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
-- Name: app_block_truncate_posting(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_block_truncate_posting() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (R8 §35); TRUNCATE is blocked.', TG_TABLE_NAME
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
-- Name: app_tool_call_log_limited_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_tool_call_log_limited_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (OLD.organization_id    <> NEW.organization_id
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

--
-- Name: app_zapis_balance_from_radek(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_zapis_balance_from_radek() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM app_assert_zapis_balanced(NEW.zapis_id);
  RETURN NULL;
END;
$$;

--
-- Name: app_zapis_balance_from_zapis(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_zapis_balance_from_zapis() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM app_assert_zapis_balanced(NEW.id);
  RETURN NULL;
END;
$$;

SET default_table_access_method = heap;

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
    updated_at timestamp with time zone DEFAULT now() NOT NULL
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
    CONSTRAINT app_user_phone_format CHECK (((phone IS NULL) OR (phone ~ '^\+[1-9][0-9]{7,14}$'::text))),
    CONSTRAINT app_user_system_role_valid CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text])))
);

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
-- Name: dilci_zaznam; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dilci_zaznam (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    doklad_radek_id uuid NOT NULL,
    druh public.dilci_druh NOT NULL,
    castka numeric(19,4) NOT NULL,
    dph_sazba numeric(5,2),
    dph_castka numeric(19,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.dilci_zaznam FORCE ROW LEVEL SECURITY;

--
-- Name: doklad_radek; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doklad_radek (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    doklad_id uuid NOT NULL,
    pripad_id uuid NOT NULL,
    popis text,
    castka numeric(19,4) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.doklad_radek FORCE ROW LEVEL SECURITY;

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
-- Name: inventurni_soupis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventurni_soupis (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    jednotka_id uuid NOT NULL,
    datum date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.inventurni_soupis FORCE ROW LEVEL SECURITY;

--
-- Name: kategorie; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kategorie (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    typ public.kategorie_typ NOT NULL,
    nazev text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.kategorie FORCE ROW LEVEL SECURITY;

--
-- Name: majetek; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.majetek (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    nazev text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.majetek FORCE ROW LEVEL SECURITY;

--
-- Name: odpisovy_plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.odpisovy_plan (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    jednotka_id uuid NOT NULL,
    majetek_id uuid NOT NULL,
    metoda text NOT NULL,
    mesicni_castka numeric(19,4) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.odpisovy_plan FORCE ROW LEVEL SECURITY;

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
    CONSTRAINT organization_legal_subject_kind_check CHECK ((legal_subject_kind = ANY (ARRAY['for_profit'::text, 'non_profit'::text]))),
    CONSTRAINT organization_person_kind_check CHECK ((person_kind = ANY (ARRAY['natural_person'::text, 'legal_entity'::text]))),
    CONSTRAINT organization_person_subject_consistency CHECK ((((person_kind = 'natural_person'::text) AND (legal_subject_kind IS NULL)) OR ((person_kind = 'legal_entity'::text) AND (legal_subject_kind IS NOT NULL)))),
    CONSTRAINT organization_slug_format CHECK ((((slug)::text ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'::text) AND ((slug)::text !~ '--'::text) AND ((length((slug)::text) >= 2) AND (length((slug)::text) <= 63))))
);

ALTER TABLE ONLY public.organization FORCE ROW LEVEL SECURITY;

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
-- Name: penezni_denik_radek; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.penezni_denik_radek (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    zapis_id uuid NOT NULL,
    regime public.accounting_regime NOT NULL,
    dilci_id uuid,
    kategorie_id uuid,
    misto public.penezni_denik_misto NOT NULL,
    smer public.penezni_denik_smer NOT NULL,
    danovy boolean NOT NULL,
    prubezny boolean DEFAULT false NOT NULL,
    zaklad_dane numeric(19,4),
    castka numeric(19,4) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT penezni_denik_radek_regime_chk CHECK ((regime = ANY (ARRAY['JEDNODUCHE'::public.accounting_regime, 'DANOVA_EVIDENCE'::public.accounting_regime])))
);

ALTER TABLE ONLY public.penezni_denik_radek FORCE ROW LEVEL SECURITY;

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
-- Name: podpis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.podpis (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    doklad_id uuid,
    zapis_id uuid,
    typ public.podpis_typ NOT NULL,
    podepsal uuid NOT NULL,
    okamzik timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT podpis_exactly_one_target CHECK (((doklad_id IS NOT NULL) <> (zapis_id IS NOT NULL)))
);

ALTER TABLE ONLY public.podpis FORCE ROW LEVEL SECURITY;

--
-- Name: protistrana; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.protistrana (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    nazev text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.protistrana FORCE ROW LEVEL SECURITY;

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
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
-- Name: ucet; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ucet (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    rozvrh_id uuid NOT NULL,
    parent_id uuid,
    cislo text NOT NULL,
    trida smallint NOT NULL,
    typ public.ucet_typ NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ucet_no_self_parent CHECK (((parent_id IS NULL) OR (parent_id <> id)))
);

ALTER TABLE ONLY public.ucet FORCE ROW LEVEL SECURITY;

--
-- Name: ucetni_doklad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ucetni_doklad (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    jednotka_id uuid NOT NULL,
    obdobi_id uuid NOT NULL,
    protistrana_id uuid,
    typ public.ucetni_doklad_typ NOT NULL,
    oznaceni text NOT NULL,
    okamzik_vyhotoveni timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.ucetni_doklad FORCE ROW LEVEL SECURITY;

--
-- Name: ucetni_jednotka; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ucetni_jednotka (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    regime public.accounting_regime NOT NULL,
    nazev text NOT NULL,
    ico character varying(16),
    platce_dph boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.ucetni_jednotka FORCE ROW LEVEL SECURITY;

--
-- Name: ucetni_obdobi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ucetni_obdobi (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    jednotka_id uuid NOT NULL,
    typ public.ucetni_obdobi_typ NOT NULL,
    od date NOT NULL,
    "do" date NOT NULL,
    stav public.ucetni_obdobi_stav DEFAULT 'otevreno'::public.ucetni_obdobi_stav NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ucetni_obdobi_dates_chk CHECK ((od <= "do"))
);

ALTER TABLE ONLY public.ucetni_obdobi FORCE ROW LEVEL SECURITY;

--
-- Name: ucetni_pripad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ucetni_pripad (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    jednotka_id uuid NOT NULL,
    protistrana_id uuid,
    popis text NOT NULL,
    datum_uskutecneni date NOT NULL,
    typ text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.ucetni_pripad FORCE ROW LEVEL SECURITY;

--
-- Name: ucetni_zapis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ucetni_zapis (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    jednotka_id uuid NOT NULL,
    obdobi_id uuid NOT NULL,
    doklad_id uuid NOT NULL,
    pripad_id uuid NOT NULL,
    odpisovy_plan_id uuid,
    inventura_id uuid,
    opravuje_zapis_id uuid,
    oprava_typ public.ucetni_zapis_oprava_typ,
    datum date NOT NULL,
    regime public.accounting_regime NOT NULL,
    druh public.ucetni_zapis_druh NOT NULL,
    odpovedna_osoba uuid NOT NULL,
    okamzik_zauctovani timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ucetni_zapis_oprava_consistency CHECK (((opravuje_zapis_id IS NULL) = (oprava_typ IS NULL)))
);

ALTER TABLE ONLY public.ucetni_zapis FORCE ROW LEVEL SECURITY;

--
-- Name: uctovy_rozvrh; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uctovy_rozvrh (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    jednotka_id uuid NOT NULL,
    rok smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.uctovy_rozvrh FORCE ROW LEVEL SECURITY;

--
-- Name: zapis_radek; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zapis_radek (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    zapis_id uuid NOT NULL,
    regime public.accounting_regime NOT NULL,
    ucet_id uuid NOT NULL,
    dilci_id uuid,
    strana public.zapis_strana NOT NULL,
    castka numeric(19,4) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT zapis_radek_regime_chk CHECK ((regime = 'PODVOJNE'::public.accounting_regime))
);

ALTER TABLE ONLY public.zapis_radek FORCE ROW LEVEL SECURITY;

--
-- Name: v_denik; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_denik WITH (security_invoker='on') AS
 SELECT zr.organization_id,
    z.id AS zapis_id,
    z.datum,
    z.doklad_id,
    d.typ AS doklad_typ,
    d.oznaceni AS doklad_oznaceni,
    z.pripad_id,
    zr.id AS zapis_radek_id,
    zr.ucet_id,
    u.cislo AS ucet_cislo,
    zr.strana,
    zr.castka
   FROM (((public.zapis_radek zr
     JOIN public.ucetni_zapis z ON ((zr.zapis_id = z.id)))
     JOIN public.ucet u ON ((zr.ucet_id = u.id)))
     JOIN public.ucetni_doklad d ON ((z.doklad_id = d.id)))
  WHERE (z.regime = 'PODVOJNE'::public.accounting_regime);

--
-- Name: v_hlavni_kniha; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_hlavni_kniha WITH (security_invoker='on') AS
 SELECT u.organization_id,
    u.id AS ucet_id,
    u.cislo AS ucet_cislo,
    u.typ AS ucet_typ,
    u.parent_id,
    COALESCE(sum(zr.castka) FILTER (WHERE (zr.strana = 'MD'::public.zapis_strana)), (0)::numeric) AS md_total,
    COALESCE(sum(zr.castka) FILTER (WHERE (zr.strana = 'D'::public.zapis_strana)), (0)::numeric) AS d_total,
    (COALESCE(sum(zr.castka) FILTER (WHERE (zr.strana = 'MD'::public.zapis_strana)), (0)::numeric) - COALESCE(sum(zr.castka) FILTER (WHERE (zr.strana = 'D'::public.zapis_strana)), (0)::numeric)) AS zustatek
   FROM ((public.ucet u
     JOIN public.zapis_radek zr ON ((zr.ucet_id = u.id)))
     JOIN public.ucetni_zapis z ON ((zr.zapis_id = z.id)))
  WHERE (z.regime = 'PODVOJNE'::public.accounting_regime)
  GROUP BY u.id, u.organization_id, u.cislo, u.typ, u.parent_id;

--
-- Name: v_kniha_analytickych_uctu; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_kniha_analytickych_uctu WITH (security_invoker='on') AS
 SELECT u.organization_id,
    u.id AS ucet_id,
    u.cislo AS ucet_cislo,
    u.parent_id AS synteticky_ucet_id,
    COALESCE(sum(zr.castka) FILTER (WHERE (zr.strana = 'MD'::public.zapis_strana)), (0)::numeric) AS md_total,
    COALESCE(sum(zr.castka) FILTER (WHERE (zr.strana = 'D'::public.zapis_strana)), (0)::numeric) AS d_total,
    (COALESCE(sum(zr.castka) FILTER (WHERE (zr.strana = 'MD'::public.zapis_strana)), (0)::numeric) - COALESCE(sum(zr.castka) FILTER (WHERE (zr.strana = 'D'::public.zapis_strana)), (0)::numeric)) AS zustatek
   FROM ((public.ucet u
     JOIN public.zapis_radek zr ON ((zr.ucet_id = u.id)))
     JOIN public.ucetni_zapis z ON ((zr.zapis_id = z.id)))
  WHERE ((z.regime = 'PODVOJNE'::public.accounting_regime) AND (u.parent_id IS NOT NULL))
  GROUP BY u.id, u.organization_id, u.cislo, u.parent_id;

--
-- Name: v_kniha_podrozvahovych_uctu; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_kniha_podrozvahovych_uctu WITH (security_invoker='on') AS
 SELECT u.organization_id,
    u.id AS ucet_id,
    u.cislo AS ucet_cislo,
    COALESCE(sum(zr.castka) FILTER (WHERE (zr.strana = 'MD'::public.zapis_strana)), (0)::numeric) AS md_total,
    COALESCE(sum(zr.castka) FILTER (WHERE (zr.strana = 'D'::public.zapis_strana)), (0)::numeric) AS d_total
   FROM ((public.ucet u
     JOIN public.zapis_radek zr ON ((zr.ucet_id = u.id)))
     JOIN public.ucetni_zapis z ON ((zr.zapis_id = z.id)))
  WHERE ((z.regime = 'PODVOJNE'::public.accounting_regime) AND (u.typ = 'podrozvahovy'::public.ucet_typ))
  GROUP BY u.id, u.organization_id, u.cislo;

--
-- Name: v_penezni_denik; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_penezni_denik WITH (security_invoker='on') AS
 SELECT pdr.organization_id,
    z.id AS zapis_id,
    z.datum,
    z.regime,
    z.doklad_id,
    pdr.id AS radek_id,
    pdr.misto,
    pdr.smer,
    pdr.danovy,
    pdr.prubezny,
    pdr.kategorie_id,
    k.typ AS kategorie_typ,
    k.nazev AS kategorie_nazev,
    pdr.zaklad_dane,
    pdr.castka
   FROM ((public.penezni_denik_radek pdr
     JOIN public.ucetni_zapis z ON ((pdr.zapis_id = z.id)))
     LEFT JOIN public.kategorie k ON ((pdr.kategorie_id = k.id)))
  WHERE (z.regime = ANY (ARRAY['JEDNODUCHE'::public.accounting_regime, 'DANOVA_EVIDENCE'::public.accounting_regime]));

--
-- Name: vystup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vystup (
    id uuid DEFAULT uuidv7() NOT NULL,
    organization_id uuid NOT NULL,
    jednotka_id uuid NOT NULL,
    obdobi_id uuid NOT NULL,
    typ public.vystup_typ NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.vystup FORCE ROW LEVEL SECURITY;

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
-- Name: dilci_zaznam dilci_zaznam_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dilci_zaznam
    ADD CONSTRAINT dilci_zaznam_id_org_unique UNIQUE (id, organization_id);

--
-- Name: dilci_zaznam dilci_zaznam_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dilci_zaznam
    ADD CONSTRAINT dilci_zaznam_pkey PRIMARY KEY (id);

--
-- Name: doklad_radek doklad_radek_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doklad_radek
    ADD CONSTRAINT doklad_radek_id_org_unique UNIQUE (id, organization_id);

--
-- Name: doklad_radek doklad_radek_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doklad_radek
    ADD CONSTRAINT doklad_radek_pkey PRIMARY KEY (id);

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
-- Name: inventurni_soupis inventurni_soupis_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventurni_soupis
    ADD CONSTRAINT inventurni_soupis_id_org_unique UNIQUE (id, organization_id);

--
-- Name: inventurni_soupis inventurni_soupis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventurni_soupis
    ADD CONSTRAINT inventurni_soupis_pkey PRIMARY KEY (id);

--
-- Name: kategorie kategorie_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kategorie
    ADD CONSTRAINT kategorie_id_org_unique UNIQUE (id, organization_id);

--
-- Name: kategorie kategorie_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kategorie
    ADD CONSTRAINT kategorie_pkey PRIMARY KEY (id);

--
-- Name: majetek majetek_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.majetek
    ADD CONSTRAINT majetek_id_org_unique UNIQUE (id, organization_id);

--
-- Name: majetek majetek_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.majetek
    ADD CONSTRAINT majetek_pkey PRIMARY KEY (id);

--
-- Name: odpisovy_plan odpisovy_plan_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odpisovy_plan
    ADD CONSTRAINT odpisovy_plan_id_org_unique UNIQUE (id, organization_id);

--
-- Name: odpisovy_plan odpisovy_plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odpisovy_plan
    ADD CONSTRAINT odpisovy_plan_pkey PRIMARY KEY (id);

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
-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);

--
-- Name: organization organization_slug_not_reserved; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.organization
    ADD CONSTRAINT organization_slug_not_reserved CHECK ((NOT public.app_is_reserved_org_slug((slug)::text))) NOT VALID;

--
-- Name: penezni_denik_radek penezni_denik_radek_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.penezni_denik_radek
    ADD CONSTRAINT penezni_denik_radek_pkey PRIMARY KEY (id);

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
-- Name: podpis podpis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.podpis
    ADD CONSTRAINT podpis_pkey PRIMARY KEY (id);

--
-- Name: protistrana protistrana_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protistrana
    ADD CONSTRAINT protistrana_id_org_unique UNIQUE (id, organization_id);

--
-- Name: protistrana protistrana_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protistrana
    ADD CONSTRAINT protistrana_pkey PRIMARY KEY (id);

--
-- Name: resource_grant resource_grant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_grant
    ADD CONSTRAINT resource_grant_pkey PRIMARY KEY (id);

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
-- Name: ucet ucet_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucet
    ADD CONSTRAINT ucet_id_org_unique UNIQUE (id, organization_id);

--
-- Name: ucet ucet_id_rozvrh_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucet
    ADD CONSTRAINT ucet_id_rozvrh_unique UNIQUE (id, rozvrh_id);

--
-- Name: ucet ucet_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucet
    ADD CONSTRAINT ucet_pkey PRIMARY KEY (id);

--
-- Name: ucet ucet_rozvrh_cislo_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucet
    ADD CONSTRAINT ucet_rozvrh_cislo_unique UNIQUE (rozvrh_id, cislo);

--
-- Name: ucetni_doklad ucetni_doklad_cislo_rada_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_doklad
    ADD CONSTRAINT ucetni_doklad_cislo_rada_unique UNIQUE (organization_id, obdobi_id, typ, oznaceni);

--
-- Name: ucetni_doklad ucetni_doklad_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_doklad
    ADD CONSTRAINT ucetni_doklad_id_org_unique UNIQUE (id, organization_id);

--
-- Name: ucetni_doklad ucetni_doklad_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_doklad
    ADD CONSTRAINT ucetni_doklad_pkey PRIMARY KEY (id);

--
-- Name: ucetni_jednotka ucetni_jednotka_id_org_regime_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_jednotka
    ADD CONSTRAINT ucetni_jednotka_id_org_regime_unique UNIQUE (id, organization_id, regime);

--
-- Name: ucetni_jednotka ucetni_jednotka_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_jednotka
    ADD CONSTRAINT ucetni_jednotka_id_org_unique UNIQUE (id, organization_id);

--
-- Name: ucetni_jednotka ucetni_jednotka_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_jednotka
    ADD CONSTRAINT ucetni_jednotka_organization_id_key UNIQUE (organization_id);

--
-- Name: ucetni_jednotka ucetni_jednotka_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_jednotka
    ADD CONSTRAINT ucetni_jednotka_pkey PRIMARY KEY (id);

--
-- Name: ucetni_obdobi ucetni_obdobi_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_obdobi
    ADD CONSTRAINT ucetni_obdobi_id_org_unique UNIQUE (id, organization_id);

--
-- Name: ucetni_obdobi ucetni_obdobi_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_obdobi
    ADD CONSTRAINT ucetni_obdobi_pkey PRIMARY KEY (id);

--
-- Name: ucetni_pripad ucetni_pripad_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_pripad
    ADD CONSTRAINT ucetni_pripad_id_org_unique UNIQUE (id, organization_id);

--
-- Name: ucetni_pripad ucetni_pripad_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_pripad
    ADD CONSTRAINT ucetni_pripad_pkey PRIMARY KEY (id);

--
-- Name: ucetni_zapis ucetni_zapis_id_org_regime_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_zapis
    ADD CONSTRAINT ucetni_zapis_id_org_regime_unique UNIQUE (id, organization_id, regime);

--
-- Name: ucetni_zapis ucetni_zapis_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_zapis
    ADD CONSTRAINT ucetni_zapis_id_org_unique UNIQUE (id, organization_id);

--
-- Name: ucetni_zapis ucetni_zapis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_zapis
    ADD CONSTRAINT ucetni_zapis_pkey PRIMARY KEY (id);

--
-- Name: uctovy_rozvrh uctovy_rozvrh_id_org_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uctovy_rozvrh
    ADD CONSTRAINT uctovy_rozvrh_id_org_unique UNIQUE (id, organization_id);

--
-- Name: uctovy_rozvrh uctovy_rozvrh_org_rok_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uctovy_rozvrh
    ADD CONSTRAINT uctovy_rozvrh_org_rok_unique UNIQUE (organization_id, rok);

--
-- Name: uctovy_rozvrh uctovy_rozvrh_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uctovy_rozvrh
    ADD CONSTRAINT uctovy_rozvrh_pkey PRIMARY KEY (id);

--
-- Name: vystup vystup_period_type_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vystup
    ADD CONSTRAINT vystup_period_type_unique UNIQUE (organization_id, obdobi_id, typ);

--
-- Name: vystup vystup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vystup
    ADD CONSTRAINT vystup_pkey PRIMARY KEY (id);

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
-- Name: zapis_radek zapis_radek_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zapis_radek
    ADD CONSTRAINT zapis_radek_pkey PRIMARY KEY (id);

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
-- Name: dilci_zaznam_doklad_radek_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dilci_zaznam_doklad_radek_idx ON public.dilci_zaznam USING btree (doklad_radek_id);

--
-- Name: dilci_zaznam_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dilci_zaznam_org_idx ON public.dilci_zaznam USING btree (organization_id);

--
-- Name: doklad_radek_doklad_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doklad_radek_doklad_idx ON public.doklad_radek USING btree (doklad_id);

--
-- Name: doklad_radek_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doklad_radek_org_idx ON public.doklad_radek USING btree (organization_id);

--
-- Name: doklad_radek_pripad_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doklad_radek_pripad_idx ON public.doklad_radek USING btree (pripad_id);

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
-- Name: inventurni_soupis_jednotka_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventurni_soupis_jednotka_idx ON public.inventurni_soupis USING btree (jednotka_id);

--
-- Name: odpisovy_plan_jednotka_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX odpisovy_plan_jednotka_idx ON public.odpisovy_plan USING btree (jednotka_id);

--
-- Name: odpisovy_plan_majetek_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX odpisovy_plan_majetek_idx ON public.odpisovy_plan USING btree (majetek_id);

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
-- Name: organization_self_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_self_idx ON public.organization USING btree (organization_id, id);

--
-- Name: organization_workspace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_workspace_idx ON public.organization USING btree (workspace_id);

--
-- Name: organization_workspace_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organization_workspace_slug_unique ON public.organization USING btree (workspace_id, slug);

--
-- Name: penezni_denik_radek_dilci_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX penezni_denik_radek_dilci_idx ON public.penezni_denik_radek USING btree (dilci_id);

--
-- Name: penezni_denik_radek_kategorie_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX penezni_denik_radek_kategorie_idx ON public.penezni_denik_radek USING btree (kategorie_id);

--
-- Name: penezni_denik_radek_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX penezni_denik_radek_org_idx ON public.penezni_denik_radek USING btree (organization_id);

--
-- Name: penezni_denik_radek_zapis_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX penezni_denik_radek_zapis_idx ON public.penezni_denik_radek USING btree (zapis_id);

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
-- Name: podpis_doklad_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX podpis_doklad_idx ON public.podpis USING btree (doklad_id);

--
-- Name: podpis_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX podpis_org_idx ON public.podpis USING btree (organization_id);

--
-- Name: podpis_zapis_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX podpis_zapis_idx ON public.podpis USING btree (zapis_id);

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
-- Name: tool_call_log_tool_name_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tool_call_log_tool_name_trgm_idx ON public.tool_call_log USING gin (tool_name public.gin_trgm_ops);

--
-- Name: two_factor_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX two_factor_user_id_idx ON public.two_factor USING btree (user_id);

--
-- Name: ucet_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucet_org_idx ON public.ucet USING btree (organization_id);

--
-- Name: ucet_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucet_parent_idx ON public.ucet USING btree (parent_id);

--
-- Name: ucet_rozvrh_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucet_rozvrh_idx ON public.ucet USING btree (rozvrh_id);

--
-- Name: ucetni_doklad_jednotka_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucetni_doklad_jednotka_idx ON public.ucetni_doklad USING btree (jednotka_id);

--
-- Name: ucetni_doklad_obdobi_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucetni_doklad_obdobi_idx ON public.ucetni_doklad USING btree (obdobi_id);

--
-- Name: ucetni_doklad_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucetni_doklad_org_idx ON public.ucetni_doklad USING btree (organization_id);

--
-- Name: ucetni_doklad_protistrana_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucetni_doklad_protistrana_idx ON public.ucetni_doklad USING btree (protistrana_id);

--
-- Name: ucetni_obdobi_jednotka_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucetni_obdobi_jednotka_idx ON public.ucetni_obdobi USING btree (jednotka_id);

--
-- Name: ucetni_obdobi_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucetni_obdobi_org_idx ON public.ucetni_obdobi USING btree (organization_id);

--
-- Name: ucetni_pripad_jednotka_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucetni_pripad_jednotka_idx ON public.ucetni_pripad USING btree (jednotka_id);

--
-- Name: ucetni_pripad_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucetni_pripad_org_idx ON public.ucetni_pripad USING btree (organization_id);

--
-- Name: ucetni_pripad_protistrana_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucetni_pripad_protistrana_idx ON public.ucetni_pripad USING btree (protistrana_id);

--
-- Name: ucetni_zapis_doklad_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucetni_zapis_doklad_idx ON public.ucetni_zapis USING btree (doklad_id);

--
-- Name: ucetni_zapis_jednotka_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucetni_zapis_jednotka_idx ON public.ucetni_zapis USING btree (jednotka_id);

--
-- Name: ucetni_zapis_obdobi_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucetni_zapis_obdobi_idx ON public.ucetni_zapis USING btree (obdobi_id);

--
-- Name: ucetni_zapis_opravuje_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucetni_zapis_opravuje_idx ON public.ucetni_zapis USING btree (opravuje_zapis_id);

--
-- Name: ucetni_zapis_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucetni_zapis_org_idx ON public.ucetni_zapis USING btree (organization_id);

--
-- Name: ucetni_zapis_pripad_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ucetni_zapis_pripad_idx ON public.ucetni_zapis USING btree (pripad_id);

--
-- Name: uctovy_rozvrh_jednotka_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uctovy_rozvrh_jednotka_idx ON public.uctovy_rozvrh USING btree (jednotka_id);

--
-- Name: vystup_jednotka_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vystup_jednotka_idx ON public.vystup USING btree (jednotka_id);

--
-- Name: vystup_obdobi_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vystup_obdobi_idx ON public.vystup USING btree (obdobi_id);

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
-- Name: zapis_radek_dilci_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zapis_radek_dilci_idx ON public.zapis_radek USING btree (dilci_id);

--
-- Name: zapis_radek_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zapis_radek_org_idx ON public.zapis_radek USING btree (organization_id);

--
-- Name: zapis_radek_ucet_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zapis_radek_ucet_idx ON public.zapis_radek USING btree (ucet_id);

--
-- Name: zapis_radek_zapis_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX zapis_radek_zapis_idx ON public.zapis_radek USING btree (zapis_id);

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
-- Name: organization_membership organization_membership_ws_consistent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER organization_membership_ws_consistent BEFORE INSERT OR UPDATE ON public.organization_membership FOR EACH ROW EXECUTE FUNCTION public.app_organization_membership_ws_consistent();

--
-- Name: organization organization_self_id_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER organization_self_id_sync BEFORE INSERT OR UPDATE ON public.organization FOR EACH ROW EXECUTE FUNCTION public.app_organization_self_id();

--
-- Name: organization organization_workspace_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER organization_workspace_immutable BEFORE UPDATE ON public.organization FOR EACH ROW EXECUTE FUNCTION public.app_organization_workspace_immutable();

--
-- Name: penezni_denik_radek penezni_denik_radek_block_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER penezni_denik_radek_block_delete BEFORE DELETE ON public.penezni_denik_radek FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_posting();

--
-- Name: penezni_denik_radek penezni_denik_radek_block_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER penezni_denik_radek_block_truncate BEFORE TRUNCATE ON public.penezni_denik_radek FOR EACH STATEMENT EXECUTE FUNCTION public.app_block_truncate_posting();

--
-- Name: penezni_denik_radek penezni_denik_radek_block_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER penezni_denik_radek_block_update BEFORE UPDATE ON public.penezni_denik_radek FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_posting();

--
-- Name: resource_grant resource_grant_consistent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER resource_grant_consistent BEFORE INSERT OR UPDATE ON public.resource_grant FOR EACH ROW EXECUTE FUNCTION public.app_resource_grant_consistent();

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
-- Name: ucetni_doklad ucetni_doklad_reject_closed_period; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ucetni_doklad_reject_closed_period BEFORE INSERT ON public.ucetni_doklad FOR EACH ROW EXECUTE FUNCTION public.app_block_closed_period();

--
-- Name: ucetni_zapis ucetni_zapis_balanced; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER ucetni_zapis_balanced AFTER INSERT ON public.ucetni_zapis DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.app_zapis_balance_from_zapis();

--
-- Name: ucetni_zapis ucetni_zapis_block_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ucetni_zapis_block_delete BEFORE DELETE ON public.ucetni_zapis FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_posting();

--
-- Name: ucetni_zapis ucetni_zapis_block_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ucetni_zapis_block_truncate BEFORE TRUNCATE ON public.ucetni_zapis FOR EACH STATEMENT EXECUTE FUNCTION public.app_block_truncate_posting();

--
-- Name: ucetni_zapis ucetni_zapis_block_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ucetni_zapis_block_update BEFORE UPDATE ON public.ucetni_zapis FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_posting();

--
-- Name: ucetni_zapis ucetni_zapis_reject_closed_period; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ucetni_zapis_reject_closed_period BEFORE INSERT ON public.ucetni_zapis FOR EACH ROW EXECUTE FUNCTION public.app_block_closed_period();

--
-- Name: workspace_billing workspace_billing_email_normalize; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workspace_billing_email_normalize BEFORE INSERT OR UPDATE ON public.workspace_billing FOR EACH ROW EXECUTE FUNCTION public.app_workspace_billing_email_normalize();

--
-- Name: workspace_membership workspace_membership_prevent_last_owner_demotion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workspace_membership_prevent_last_owner_demotion BEFORE INSERT OR DELETE OR UPDATE ON public.workspace_membership FOR EACH ROW EXECUTE FUNCTION public.app_prevent_last_owner_demotion();

--
-- Name: zapis_radek zapis_radek_balanced; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER zapis_radek_balanced AFTER INSERT ON public.zapis_radek DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.app_zapis_balance_from_radek();

--
-- Name: zapis_radek zapis_radek_block_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zapis_radek_block_delete BEFORE DELETE ON public.zapis_radek FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_posting();

--
-- Name: zapis_radek zapis_radek_block_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zapis_radek_block_truncate BEFORE TRUNCATE ON public.zapis_radek FOR EACH STATEMENT EXECUTE FUNCTION public.app_block_truncate_posting();

--
-- Name: zapis_radek zapis_radek_block_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER zapis_radek_block_update BEFORE UPDATE ON public.zapis_radek FOR EACH ROW EXECUTE FUNCTION public.app_block_mutation_posting();

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
-- Name: dilci_zaznam dilci_zaznam_doklad_radek_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dilci_zaznam
    ADD CONSTRAINT dilci_zaznam_doklad_radek_fk FOREIGN KEY (doklad_radek_id, organization_id) REFERENCES public.doklad_radek(id, organization_id);

--
-- Name: doklad_radek doklad_radek_doklad_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doklad_radek
    ADD CONSTRAINT doklad_radek_doklad_fk FOREIGN KEY (doklad_id, organization_id) REFERENCES public.ucetni_doklad(id, organization_id);

--
-- Name: doklad_radek doklad_radek_pripad_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doklad_radek
    ADD CONSTRAINT doklad_radek_pripad_fk FOREIGN KEY (pripad_id, organization_id) REFERENCES public.ucetni_pripad(id, organization_id);

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
-- Name: inventurni_soupis inventurni_soupis_jednotka_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventurni_soupis
    ADD CONSTRAINT inventurni_soupis_jednotka_fk FOREIGN KEY (jednotka_id, organization_id) REFERENCES public.ucetni_jednotka(id, organization_id);

--
-- Name: kategorie kategorie_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kategorie
    ADD CONSTRAINT kategorie_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: majetek majetek_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.majetek
    ADD CONSTRAINT majetek_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: odpisovy_plan odpisovy_plan_jednotka_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odpisovy_plan
    ADD CONSTRAINT odpisovy_plan_jednotka_fk FOREIGN KEY (jednotka_id, organization_id) REFERENCES public.ucetni_jednotka(id, organization_id);

--
-- Name: odpisovy_plan odpisovy_plan_majetek_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.odpisovy_plan
    ADD CONSTRAINT odpisovy_plan_majetek_fk FOREIGN KEY (majetek_id, organization_id) REFERENCES public.majetek(id, organization_id);

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
-- Name: organization organization_workspace_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization
    ADD CONSTRAINT organization_workspace_fk FOREIGN KEY (workspace_id) REFERENCES public.workspace(id);

--
-- Name: penezni_denik_radek penezni_denik_radek_dilci_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.penezni_denik_radek
    ADD CONSTRAINT penezni_denik_radek_dilci_fk FOREIGN KEY (dilci_id, organization_id) REFERENCES public.dilci_zaznam(id, organization_id);

--
-- Name: penezni_denik_radek penezni_denik_radek_kategorie_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.penezni_denik_radek
    ADD CONSTRAINT penezni_denik_radek_kategorie_fk FOREIGN KEY (kategorie_id, organization_id) REFERENCES public.kategorie(id, organization_id);

--
-- Name: penezni_denik_radek penezni_denik_radek_zapis_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.penezni_denik_radek
    ADD CONSTRAINT penezni_denik_radek_zapis_fk FOREIGN KEY (zapis_id, organization_id, regime) REFERENCES public.ucetni_zapis(id, organization_id, regime);

--
-- Name: permission_template permission_template_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_template
    ADD CONSTRAINT permission_template_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE;

--
-- Name: podpis podpis_doklad_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.podpis
    ADD CONSTRAINT podpis_doklad_fk FOREIGN KEY (doklad_id, organization_id) REFERENCES public.ucetni_doklad(id, organization_id);

--
-- Name: podpis podpis_podepsal_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.podpis
    ADD CONSTRAINT podpis_podepsal_fkey FOREIGN KEY (podepsal) REFERENCES public.app_user(id);

--
-- Name: podpis podpis_zapis_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.podpis
    ADD CONSTRAINT podpis_zapis_fk FOREIGN KEY (zapis_id, organization_id) REFERENCES public.ucetni_zapis(id, organization_id);

--
-- Name: protistrana protistrana_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protistrana
    ADD CONSTRAINT protistrana_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

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
-- Name: tool_call_log tool_call_log_approved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tool_call_log
    ADD CONSTRAINT tool_call_log_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.app_user(id);

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
-- Name: ucet ucet_parent_same_chart_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucet
    ADD CONSTRAINT ucet_parent_same_chart_fk FOREIGN KEY (parent_id, rozvrh_id) REFERENCES public.ucet(id, rozvrh_id);

--
-- Name: ucet ucet_rozvrh_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucet
    ADD CONSTRAINT ucet_rozvrh_fk FOREIGN KEY (rozvrh_id, organization_id) REFERENCES public.uctovy_rozvrh(id, organization_id);

--
-- Name: ucetni_doklad ucetni_doklad_jednotka_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_doklad
    ADD CONSTRAINT ucetni_doklad_jednotka_fk FOREIGN KEY (jednotka_id, organization_id) REFERENCES public.ucetni_jednotka(id, organization_id);

--
-- Name: ucetni_doklad ucetni_doklad_obdobi_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_doklad
    ADD CONSTRAINT ucetni_doklad_obdobi_fk FOREIGN KEY (obdobi_id, organization_id) REFERENCES public.ucetni_obdobi(id, organization_id);

--
-- Name: ucetni_doklad ucetni_doklad_protistrana_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_doklad
    ADD CONSTRAINT ucetni_doklad_protistrana_fk FOREIGN KEY (protistrana_id, organization_id) REFERENCES public.protistrana(id, organization_id);

--
-- Name: ucetni_jednotka ucetni_jednotka_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_jednotka
    ADD CONSTRAINT ucetni_jednotka_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organization(id);

--
-- Name: ucetni_obdobi ucetni_obdobi_jednotka_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_obdobi
    ADD CONSTRAINT ucetni_obdobi_jednotka_fk FOREIGN KEY (jednotka_id, organization_id) REFERENCES public.ucetni_jednotka(id, organization_id);

--
-- Name: ucetni_pripad ucetni_pripad_jednotka_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_pripad
    ADD CONSTRAINT ucetni_pripad_jednotka_fk FOREIGN KEY (jednotka_id, organization_id) REFERENCES public.ucetni_jednotka(id, organization_id);

--
-- Name: ucetni_pripad ucetni_pripad_protistrana_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_pripad
    ADD CONSTRAINT ucetni_pripad_protistrana_fk FOREIGN KEY (protistrana_id, organization_id) REFERENCES public.protistrana(id, organization_id);

--
-- Name: ucetni_zapis ucetni_zapis_doklad_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_zapis
    ADD CONSTRAINT ucetni_zapis_doklad_fk FOREIGN KEY (doklad_id, organization_id) REFERENCES public.ucetni_doklad(id, organization_id);

--
-- Name: ucetni_zapis ucetni_zapis_inventura_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_zapis
    ADD CONSTRAINT ucetni_zapis_inventura_fk FOREIGN KEY (inventura_id, organization_id) REFERENCES public.inventurni_soupis(id, organization_id);

--
-- Name: ucetni_zapis ucetni_zapis_jednotka_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_zapis
    ADD CONSTRAINT ucetni_zapis_jednotka_fk FOREIGN KEY (jednotka_id, organization_id, regime) REFERENCES public.ucetni_jednotka(id, organization_id, regime);

--
-- Name: ucetni_zapis ucetni_zapis_obdobi_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_zapis
    ADD CONSTRAINT ucetni_zapis_obdobi_fk FOREIGN KEY (obdobi_id, organization_id) REFERENCES public.ucetni_obdobi(id, organization_id);

--
-- Name: ucetni_zapis ucetni_zapis_odpisovy_plan_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_zapis
    ADD CONSTRAINT ucetni_zapis_odpisovy_plan_fk FOREIGN KEY (odpisovy_plan_id, organization_id) REFERENCES public.odpisovy_plan(id, organization_id);

--
-- Name: ucetni_zapis ucetni_zapis_odpovedna_osoba_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_zapis
    ADD CONSTRAINT ucetni_zapis_odpovedna_osoba_fkey FOREIGN KEY (odpovedna_osoba) REFERENCES public.app_user(id);

--
-- Name: ucetni_zapis ucetni_zapis_opravuje_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_zapis
    ADD CONSTRAINT ucetni_zapis_opravuje_fk FOREIGN KEY (opravuje_zapis_id, organization_id) REFERENCES public.ucetni_zapis(id, organization_id);

--
-- Name: ucetni_zapis ucetni_zapis_pripad_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ucetni_zapis
    ADD CONSTRAINT ucetni_zapis_pripad_fk FOREIGN KEY (pripad_id, organization_id) REFERENCES public.ucetni_pripad(id, organization_id);

--
-- Name: uctovy_rozvrh uctovy_rozvrh_jednotka_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uctovy_rozvrh
    ADD CONSTRAINT uctovy_rozvrh_jednotka_fk FOREIGN KEY (jednotka_id, organization_id) REFERENCES public.ucetni_jednotka(id, organization_id);

--
-- Name: vystup vystup_jednotka_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vystup
    ADD CONSTRAINT vystup_jednotka_fk FOREIGN KEY (jednotka_id, organization_id) REFERENCES public.ucetni_jednotka(id, organization_id);

--
-- Name: vystup vystup_obdobi_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vystup
    ADD CONSTRAINT vystup_obdobi_fk FOREIGN KEY (obdobi_id, organization_id) REFERENCES public.ucetni_obdobi(id, organization_id);

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
-- Name: zapis_radek zapis_radek_dilci_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zapis_radek
    ADD CONSTRAINT zapis_radek_dilci_fk FOREIGN KEY (dilci_id, organization_id) REFERENCES public.dilci_zaznam(id, organization_id);

--
-- Name: zapis_radek zapis_radek_ucet_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zapis_radek
    ADD CONSTRAINT zapis_radek_ucet_fk FOREIGN KEY (ucet_id, organization_id) REFERENCES public.ucet(id, organization_id);

--
-- Name: zapis_radek zapis_radek_zapis_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zapis_radek
    ADD CONSTRAINT zapis_radek_zapis_fk FOREIGN KEY (zapis_id, organization_id, regime) REFERENCES public.ucetni_zapis(id, organization_id, regime);

--
-- Name: admin_workspace_allowlist admin_allowlist_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_allowlist_read ON public.admin_workspace_allowlist FOR SELECT TO app_user USING (true);

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
-- Name: dilci_zaznam; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dilci_zaznam ENABLE ROW LEVEL SECURITY;

--
-- Name: doklad_radek; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.doklad_radek ENABLE ROW LEVEL SECURITY;

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
-- Name: inventurni_soupis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventurni_soupis ENABLE ROW LEVEL SECURITY;

--
-- Name: kategorie; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kategorie ENABLE ROW LEVEL SECURITY;

--
-- Name: majetek; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.majetek ENABLE ROW LEVEL SECURITY;

--
-- Name: odpisovy_plan; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.odpisovy_plan ENABLE ROW LEVEL SECURITY;

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
-- Name: api_key organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.api_key USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: dilci_zaznam organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.dilci_zaznam USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: doklad_radek organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.doklad_radek USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: inventurni_soupis organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.inventurni_soupis USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: kategorie organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.kategorie USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: majetek organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.majetek USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: odpisovy_plan organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.odpisovy_plan USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: organization organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.organization USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: penezni_denik_radek organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.penezni_denik_radek USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: podpis organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.podpis USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: protistrana organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.protistrana USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: tool_call_log organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.tool_call_log USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: ucet organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.ucet USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: ucetni_doklad organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.ucetni_doklad USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: ucetni_jednotka organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.ucetni_jednotka USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: ucetni_obdobi organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.ucetni_obdobi USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: ucetni_pripad organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.ucetni_pripad USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: ucetni_zapis organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.ucetni_zapis USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: uctovy_rozvrh organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.uctovy_rozvrh USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: vystup organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.vystup USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: zapis_radek organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.zapis_radek USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: organization_membership; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_membership ENABLE ROW LEVEL SECURITY;

--
-- Name: penezni_denik_radek; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.penezni_denik_radek ENABLE ROW LEVEL SECURITY;

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
-- Name: podpis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.podpis ENABLE ROW LEVEL SECURITY;

--
-- Name: protistrana; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.protistrana ENABLE ROW LEVEL SECURITY;

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
-- Name: ucet; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ucet ENABLE ROW LEVEL SECURITY;

--
-- Name: ucetni_doklad; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ucetni_doklad ENABLE ROW LEVEL SECURITY;

--
-- Name: ucetni_jednotka; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ucetni_jednotka ENABLE ROW LEVEL SECURITY;

--
-- Name: ucetni_obdobi; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ucetni_obdobi ENABLE ROW LEVEL SECURITY;

--
-- Name: ucetni_pripad; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ucetni_pripad ENABLE ROW LEVEL SECURITY;

--
-- Name: ucetni_zapis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ucetni_zapis ENABLE ROW LEVEL SECURITY;

--
-- Name: uctovy_rozvrh; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.uctovy_rozvrh ENABLE ROW LEVEL SECURITY;

--
-- Name: vystup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vystup ENABLE ROW LEVEL SECURITY;

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
-- Name: zapis_radek; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zapis_radek ENABLE ROW LEVEL SECURITY;

--
--

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
-- Name: invite_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invite_status AS ENUM (
    'pending',
    'accepted',
    'revoked',
    'expired'
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
-- Name: workspace_billing workspace_billing_email_normalize; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workspace_billing_email_normalize BEFORE INSERT OR UPDATE ON public.workspace_billing FOR EACH ROW EXECUTE FUNCTION public.app_workspace_billing_email_normalize();

--
-- Name: workspace_membership workspace_membership_prevent_last_owner_demotion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workspace_membership_prevent_last_owner_demotion BEFORE INSERT OR DELETE OR UPDATE ON public.workspace_membership FOR EACH ROW EXECUTE FUNCTION public.app_prevent_last_owner_demotion();

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
-- Name: permission_template permission_template_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission_template
    ADD CONSTRAINT permission_template_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE;

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
-- Name: organization organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.organization USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: tool_call_log organization_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organization_isolation ON public.tool_call_log USING ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)) WITH CHECK ((organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid));

--
-- Name: organization_membership; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_membership ENABLE ROW LEVEL SECURITY;

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

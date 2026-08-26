-- Migration 0000: beta portal core schema (identity, tenancy, setup links).
--
-- Scope of this migration (spec `.context/beta-afframe/40-beta-structure.md` §4,
-- `30-plan-v3-beta-env.md` Part 4, `32-advisor-part4.md` blockers B4-1..B4-8):
--
--   app_user             global identity + the non-user-writable `is_staff` flag
--   auth_session         Better Auth session store
--   auth_account         Better Auth credential/OAuth accounts (password hash)
--   auth_verification    Better Auth token store
--   two_factor           Better Auth twoFactor plugin (TOTP + backup codes)
--   organization         the client book (identity card, VAT regime, sídlo, bank)
--   organization_membership  user ⇄ org, one role per pair
--   user_setup_token     one-time setup / invite / password-reset links
--
-- Deliberate divergences from the main app's `packages/db` schema:
--
--   * NO row-level security. Beta's outer wall is the dedicated `beta` database
--     on its own RDS instance (plan Part 1); the inner wall is the application
--     scope seam that lands in PR 07. There is no app_user/app_admin Postgres
--     role split here, so the RLS-era GUC plumbing (and the INSERT arm of the
--     main app's last-owner trigger, which keys on `app.app_user_role_name`)
--     has no counterpart.
--   * Enum names are `beta_`-prefixed for greppability. Runtime collision with
--     the main app is impossible (separate database), but a bare `org_role`
--     would read as the main app's `organization_role` in review.
--   * `numeric(14,2)` is the money precision for this database (spec §0.7).
--     No money column appears in this migration.
--
-- Requires PostgreSQL 18+: every primary key defaults to the native `uuidv7()`.

BEGIN;

-- 0. Server guard --------------------------------------------------------------

DO $$
BEGIN
  IF current_setting('server_version_num')::int < 180000 THEN
    RAISE EXCEPTION 'PostgreSQL 18+ required (uuidv7 is native from PG18; server_version_num=% is below 180000)',
      current_setting('server_version_num');
  END IF;
END
$$;

-- 1. Enums ---------------------------------------------------------------------

-- Single role axis, 4 values (plan Part 4, Hleb decision 2026-08-25 — supersedes
-- the Advisor's three-axis role/user_kind matrix):
--   owner  = Účetní (accountant; the only role that types accounting facts and
--            sees the office-internal layer). Requires app_user.is_staff.
--   admin  = Majitel společnosti (company owner; invites admin|member|guest).
--   member = Pracovník firmy (vedení) — uploads + views, no invites.
--   guest  = Host — read-only; also the employee seat once linked to a payroll
--            employee row (PR 29+).
CREATE TYPE beta_org_role AS ENUM ('owner', 'admin', 'member', 'guest');

-- Two-state per spec 40 v4 §4 + plan Part 5 ("s.r.o. only, vat_regime
-- platce|neplatce"). The Advisor's 3-state proposal (identifikovaná osoba) is
-- superseded by the operative spec; adding a value later is an ALTER TYPE.
CREATE TYPE beta_vat_regime AS ENUM ('platce', 'neplatce');

-- Setup-link purpose split (Advisor blocker B4-4). Each purpose has different
-- issuance rules; see the CHECK constraints and triggers on user_setup_token.
CREATE TYPE beta_setup_token_purpose AS ENUM (
  'account_setup',
  'org_invite',
  'password_reset'
);

-- 2. Shared trigger helpers ----------------------------------------------------

CREATE OR REPLACE FUNCTION beta_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION beta_lowercase_email()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.email := lower(NEW.email);
  RETURN NEW;
END;
$$;

-- 3. app_user ------------------------------------------------------------------
--
-- `is_staff` is the office-staff flag (plan Part 4). It is NOT a fifth role and
-- has no UI surface outside /admin: it gates the cross-org /admin area (Advisor
-- blocker B4-6) and is the precondition for holding an `owner` membership, so
-- owner-ness can only ever originate from office staff. It must never be
-- writable through a user-facing form — the only write paths are /admin (PR 08)
-- and the bootstrap seed.
--
-- `disabled_at` is the deactivation path (spec §2.6.1, §3.5). Deactivation never
-- deletes a row: a leaver still needs their last payslip.
CREATE TABLE app_user (
  id                  uuid         PRIMARY KEY DEFAULT uuidv7(),
  -- Lowercased by trigger app_user_lowercase_email on INSERT and UPDATE.
  email               varchar(320) NOT NULL UNIQUE,
  email_verified      boolean      NOT NULL DEFAULT false,
  name                text         NOT NULL DEFAULT '',
  image               text,
  is_staff            boolean      NOT NULL DEFAULT false,
  two_factor_enabled  boolean      NOT NULL DEFAULT false,
  locale              varchar(10)  NOT NULL DEFAULT 'cs',
  disabled_at         timestamptz,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX app_user_is_staff_idx ON app_user (id) WHERE is_staff;

CREATE TRIGGER app_user_lowercase_email
  BEFORE INSERT OR UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION beta_lowercase_email();

CREATE TRIGGER app_user_touch_updated_at
  BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- 4. Better Auth tables --------------------------------------------------------
--
-- Shaped for better-auth 1.6.13 (the version pinned repo-wide in
-- pnpm-workspace.yaml `overrides`). The runtime instance lands in PR 06; this
-- migration only creates the storage. Column names are snake_case, so the PR 06
-- drizzleAdapter config must carry the same explicit `fields` remap the main app
-- uses (packages/auth/src/server.ts:291-360) — see apps/beta/db/schema/auth.ts
-- for the exact map.

CREATE TABLE auth_session (
  id          uuid         PRIMARY KEY DEFAULT uuidv7(),
  user_id     uuid         NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token       text         NOT NULL UNIQUE,
  expires_at  timestamptz  NOT NULL,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX auth_session_user_idx    ON auth_session (user_id);
CREATE INDEX auth_session_expires_idx ON auth_session (expires_at);

CREATE TRIGGER auth_session_touch_updated_at
  BEFORE UPDATE ON auth_session
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

CREATE TABLE auth_account (
  id                        uuid         PRIMARY KEY DEFAULT uuidv7(),
  user_id                   uuid         NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  account_id                text         NOT NULL,
  provider_id               text         NOT NULL,
  access_token              text,
  refresh_token             text,
  id_token                  text,
  access_token_expires_at   timestamptz,
  refresh_token_expires_at  timestamptz,
  scope                     text,
  -- Credential hash written by Better Auth's own hasher. Beta has no OAuth
  -- provider; `provider_id` is 'credential' for every row today.
  password                  text,
  created_at                timestamptz  NOT NULL DEFAULT now(),
  updated_at                timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX auth_account_user_idx ON auth_account (user_id);
CREATE UNIQUE INDEX auth_account_provider_account_unique
  ON auth_account (provider_id, account_id);

CREATE TRIGGER auth_account_touch_updated_at
  BEFORE UPDATE ON auth_account
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

CREATE TABLE auth_verification (
  id          uuid         PRIMARY KEY DEFAULT uuidv7(),
  identifier  text         NOT NULL,
  value       text         NOT NULL,
  expires_at  timestamptz  NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX auth_verification_identifier_idx ON auth_verification (identifier);
CREATE INDEX auth_verification_expires_idx    ON auth_verification (expires_at);

CREATE TRIGGER auth_verification_touch_updated_at
  BEFORE UPDATE ON auth_verification
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- TOTP enrollment for the office (plan Part 4: twoFactor() is enrollment only;
-- the "accountant without 2FA -> forced enrollment" gate is layout-level).
CREATE TABLE two_factor (
  id            uuid         PRIMARY KEY DEFAULT uuidv7(),
  user_id       uuid         NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  secret        text         NOT NULL,
  backup_codes  text         NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX two_factor_user_idx ON two_factor (user_id);

-- 5. organization --------------------------------------------------------------
--
-- The identity card of spec §2.1.5 / §2.10, decomposed per Advisor: sídlo split
-- into parts (a single free-text line cannot feed a form or ARES reconciliation),
-- bank account split into prefix / number / bank code / IBAN / BIC,
-- `ico` CHECK-constrained to 8 digits (ARES pads short IČO with leading zeros,
-- so the column is a fixed-width digit string), `dic` deliberately NOT
-- regex-constrained (foreign DIČ are legitimately non-CZ-shaped).
CREATE TABLE organization (
  id                             uuid         PRIMARY KEY DEFAULT uuidv7(),
  -- URL segment: /[orgSlug]/...
  slug                           varchar(64)  NOT NULL UNIQUE,
  legal_name                     text         NOT NULL,
  ico                            varchar(8),
  dic                            varchar(14),
  vat_regime                     beta_vat_regime NOT NULL DEFAULT 'neplatce',
  -- Registration date; nullable because the office may know the regime before
  -- the date. Kept after a regime change (spec §2.3: DPH history survives).
  vat_registered_from            date,
  -- Sídlo.
  registered_street              text,
  registered_house_number        varchar(16),
  registered_orientation_number  varchar(16),
  registered_city                text,
  registered_postal_code         varchar(10),
  registered_country_code        char(2)      NOT NULL DEFAULT 'CZ',
  -- Datová schránka (7 chars, lowercase alphanumeric).
  data_box_id                    varchar(7),
  -- Spisová značka (§435 NOZ) + finanční úřad (ÚFO číselník, spec §2.10).
  court_file_number              text,
  tax_office_code                varchar(4),
  -- Bank account as parts; IBAN/BIC for foreign transfers.
  bank_account_prefix            varchar(6),
  bank_account_number            varchar(10),
  bank_code                      varchar(4),
  iban                           varchar(34),
  bic                            varchar(11),
  contact_email                  text,
  contact_phone                  varchar(32),
  -- Demo safety (Advisor blocker B4-7): demos run from a dedicated account whose
  -- memberships are ALL is_demo orgs.
  is_demo                        boolean      NOT NULL DEFAULT false,
  -- 24h ARES cache stamp (spec §2.10).
  ares_fetched_at                timestamptz,
  archived_at                    timestamptz,
  created_at                     timestamptz  NOT NULL DEFAULT now(),
  updated_at                     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT organization_slug_format
    CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'),
  CONSTRAINT organization_ico_digits
    CHECK (ico IS NULL OR ico ~ '^[0-9]{8}$'),
  CONSTRAINT organization_data_box_id_format
    CHECK (data_box_id IS NULL OR data_box_id ~ '^[a-z0-9]{7}$')
);

-- No index on slug: the UNIQUE constraint already provides one, and the
-- archived/active split is a filter on a lookup that is already single-row.
CREATE INDEX organization_ico_idx ON organization (ico) WHERE ico IS NOT NULL;

CREATE TRIGGER organization_touch_updated_at
  BEFORE UPDATE ON organization
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- 6. organization_membership ---------------------------------------------------
--
-- Membership rows are the ONLY thing that decides which orgs a user sees — there
-- is no bypass, accountants included (Advisor Part 4: an implicit accountant
-- bypass multiplies the offboarding surface). /admin gets a one-click "grant
-- owner in all active orgs" instead (PR 08).
CREATE TABLE organization_membership (
  id                  uuid         PRIMARY KEY DEFAULT uuidv7(),
  organization_id     uuid         NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id             uuid         NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role                beta_org_role NOT NULL,
  active              boolean      NOT NULL DEFAULT true,
  invited_by_user_id  uuid         REFERENCES app_user(id) ON DELETE SET NULL,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT organization_membership_user_organization_unique
    UNIQUE (user_id, organization_id)
);

CREATE INDEX organization_membership_organization_idx
  ON organization_membership (organization_id);
CREATE INDEX organization_membership_invited_by_idx
  ON organization_membership (invited_by_user_id)
  WHERE invited_by_user_id IS NOT NULL;
-- Serves both the last-owner guard and the /admin owner-coverage grid.
CREATE INDEX organization_membership_active_owner_idx
  ON organization_membership (organization_id)
  WHERE role = 'owner' AND active;

CREATE TRIGGER organization_membership_touch_updated_at
  BEFORE UPDATE ON organization_membership
  FOR EACH ROW EXECUTE FUNCTION beta_touch_updated_at();

-- 7. user_setup_token ----------------------------------------------------------
--
-- One-time links for the three flows of Advisor blocker B4-4. Public signup is
-- disabled (`disableSignUp`), so this table is the ONLY way an account comes
-- into existence.
--
-- Only the sha256 hash of the link secret is stored. The raw token exists once,
-- in the email that carries it; a database read can never reconstruct a usable
-- link.
--
-- CONSUME CONTRACT (implemented in PR 06 — do not spread it over two
-- statements): a consume is one atomic UPDATE that both claims and reads the
-- row, so two concurrent clicks cannot both win:
--
--   UPDATE user_setup_token
--      SET consumed_at = now(), consumed_ip = $2, consumed_user_agent = $3
--    WHERE token_hash = $1
--      AND consumed_at IS NULL
--      AND revoked_at IS NULL
--      AND expires_at > now()
--   RETURNING id, purpose, email, organization_id, granted_role;
--
-- Zero rows returned = expired / revoked / already consumed / unknown, and the
-- route must answer all four with the SAME uniform error (B4-4). Immediately
-- after a successful consume, in the same transaction, revoke the siblings:
--
--   UPDATE user_setup_token
--      SET revoked_at = now()
--    WHERE purpose = $purpose AND email = $email
--      AND organization_id IS NOT DISTINCT FROM $organization_id
--      AND id <> $consumedId
--      AND consumed_at IS NULL AND revoked_at IS NULL;
--
-- (user_setup_token_live_sibling_idx below is the index for exactly that
-- predicate.)
CREATE TABLE user_setup_token (
  id                   uuid         PRIMARY KEY DEFAULT uuidv7(),
  purpose              beta_setup_token_purpose NOT NULL,
  -- sha256 hex of the raw link secret. NEVER store the raw token.
  token_hash           char(64)     NOT NULL UNIQUE,
  -- Lowercased by trigger user_setup_token_lowercase_email.
  email                varchar(320) NOT NULL,
  -- NULL for password_reset and for a staff account_setup with no org yet.
  organization_id      uuid         REFERENCES organization(id) ON DELETE CASCADE,
  granted_role         beta_org_role,
  issued_by_user_id    uuid         REFERENCES app_user(id) ON DELETE SET NULL,
  issued_ip            inet,
  issued_user_agent    text,
  expires_at           timestamptz  NOT NULL,
  consumed_at          timestamptz,
  consumed_ip          inet,
  consumed_user_agent  text,
  consumed_user_id     uuid         REFERENCES app_user(id) ON DELETE SET NULL,
  revoked_at           timestamptz,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT user_setup_token_hash_format
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  -- 72h TTL ceiling (plan Part 4). Enforced against created_at, not now(), so
  -- the constraint stays immutable and re-checkable.
  CONSTRAINT user_setup_token_ttl_max_72h
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '72 hours'),
  -- An org-scoped token always grants a role; an unscoped one never does.
  CONSTRAINT user_setup_token_scope_pairing
    CHECK ((organization_id IS NULL) = (granted_role IS NULL)),
  -- A password reset is never org-scoped (and therefore never grants a role).
  CONSTRAINT user_setup_token_password_reset_unscoped
    CHECK (purpose <> 'password_reset' OR organization_id IS NULL)
);

CREATE INDEX user_setup_token_email_idx ON user_setup_token (email);
CREATE INDEX user_setup_token_organization_idx
  ON user_setup_token (organization_id)
  WHERE organization_id IS NOT NULL;
CREATE INDEX user_setup_token_issued_by_idx
  ON user_setup_token (issued_by_user_id)
  WHERE issued_by_user_id IS NOT NULL;
CREATE INDEX user_setup_token_consumed_user_idx
  ON user_setup_token (consumed_user_id)
  WHERE consumed_user_id IS NOT NULL;
CREATE INDEX user_setup_token_live_sibling_idx
  ON user_setup_token (purpose, email, organization_id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE TRIGGER user_setup_token_lowercase_email
  BEFORE INSERT OR UPDATE ON user_setup_token
  FOR EACH ROW EXECUTE FUNCTION beta_lowercase_email();

-- 8. Invariant triggers --------------------------------------------------------

-- How many owners does this org still have, ignoring one membership row?
-- "Owner" here means the whole live chain: an active owner membership held by a
-- user who is not deactivated. Both the membership guard and the user-disable
-- guard call this so the two can never drift apart.
CREATE OR REPLACE FUNCTION beta_active_owner_count(
  p_organization_id uuid,
  p_exclude_membership_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::integer
    FROM organization_membership m
    JOIN app_user u ON u.id = m.user_id
   WHERE m.organization_id = p_organization_id
     AND m.role = 'owner'
     AND m.active
     AND u.disabled_at IS NULL
     AND (p_exclude_membership_id IS NULL OR m.id <> p_exclude_membership_id);
$$;

-- Last-owner protection (Advisor blocker B4-8).
--
-- Adapted from the main app's `app_prevent_last_owner_demotion`
-- (packages/db/migrations/0005_workspace.sql:440-515). Two deliberate changes:
--
--   * The INSERT arm is dropped. Its whole job there was to stop the RLS-era
--     `app_user` Postgres role from minting owner rows outside withAdminBypass,
--     keyed on the `app.app_user_role_name` GUC. Beta has one database role and
--     no GUC, so the arm would be dead code; the owner-INSERT path is guarded
--     instead by beta_membership_owner_requires_staff() below.
--   * "Owner still present" is evaluated through beta_active_owner_count(),
--     which also excludes deactivated users — the main app has no
--     app_user.disabled_at, so its count keys on membership.active alone.
--
-- Invariant: every organization keeps at least one active owner held by an
-- enabled user.
CREATE OR REPLACE FUNCTION beta_prevent_last_owner_removal()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'owner'
       AND (NEW.role <> 'owner' OR NEW.active = false)
       AND beta_active_owner_count(OLD.organization_id, OLD.id) = 0 THEN
      RAISE EXCEPTION
        'cannot demote or deactivate the last owner of organization %', OLD.organization_id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE arm. A cascading delete of the parent organization must not trip the
  -- guard: PostgreSQL applies the parent DELETE before firing the RI cascade,
  -- so an absent organization row means "the whole org is going away".
  -- A cascade from app_user does NOT get that escape — hard-deleting a user is
  -- not a supported path (deactivation is), and it must not silently strip a
  -- live org of its last owner.
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner'
       AND OLD.active
       AND EXISTS (SELECT 1 FROM organization WHERE id = OLD.organization_id)
       AND beta_active_owner_count(OLD.organization_id, OLD.id) = 0 THEN
      RAISE EXCEPTION
        'cannot delete the last owner of organization %', OLD.organization_id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_membership_prevent_last_owner_removal
  BEFORE UPDATE OR DELETE ON organization_membership
  FOR EACH ROW EXECUTE FUNCTION beta_prevent_last_owner_removal();

-- owner ⇒ office staff (plan Part 4: "owner requires is_staff ... guarantees
-- owner-ness can only originate from office staff"). A company admin inviting
-- into their own org therefore cannot mint an owner even if the server-side
-- check is ever bypassed.
CREATE OR REPLACE FUNCTION beta_membership_owner_requires_staff()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role = 'owner'
     AND NOT EXISTS (SELECT 1 FROM app_user WHERE id = NEW.user_id AND is_staff) THEN
    RAISE EXCEPTION
      'organization_membership.role = owner requires app_user.is_staff (user %)', NEW.user_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_membership_owner_requires_staff
  BEFORE INSERT OR UPDATE ON organization_membership
  FOR EACH ROW EXECUTE FUNCTION beta_membership_owner_requires_staff();

-- app_user guards: deactivating a user, or revoking their staff flag, must not
-- strip an organization of its last owner.
CREATE OR REPLACE FUNCTION beta_app_user_owner_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  orphaned_org uuid;
BEGIN
  IF OLD.disabled_at IS NULL AND NEW.disabled_at IS NOT NULL THEN
    SELECT m.organization_id INTO orphaned_org
      FROM organization_membership m
     WHERE m.user_id = OLD.id
       AND m.role = 'owner'
       AND m.active
       AND beta_active_owner_count(m.organization_id, m.id) = 0
     LIMIT 1;
    IF orphaned_org IS NOT NULL THEN
      RAISE EXCEPTION
        'cannot deactivate the last owner of organization %', orphaned_org
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF OLD.is_staff AND NOT NEW.is_staff
     AND EXISTS (
       SELECT 1 FROM organization_membership m
        WHERE m.user_id = OLD.id AND m.role = 'owner' AND m.active
     ) THEN
    RAISE EXCEPTION
      'cannot clear is_staff while user % holds an active owner membership', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER app_user_owner_guard
  BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION beta_app_user_owner_guard();

-- Setup-link issuance guard (Advisor blockers B4-3 + B4-4).
--
--   * Only office staff may issue an owner grant or a password reset.
--   * A non-staff issuer must hold an active owner|admin membership in the very
--     organization the token is scoped to — an admin cannot mint an invite into
--     someone else's book.
--
-- The server-side check in PR 06 is the primary gate; this trigger is the floor
-- that a route-level mistake cannot fall through.
CREATE OR REPLACE FUNCTION beta_setup_token_issuer_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  issuer_is_staff boolean;
BEGIN
  SELECT is_staff INTO issuer_is_staff
    FROM app_user WHERE id = NEW.issued_by_user_id;

  IF NEW.granted_role = 'owner' AND COALESCE(issuer_is_staff, false) = false THEN
    RAISE EXCEPTION
      'only office staff may issue an owner grant (token purpose %)', NEW.purpose
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.purpose = 'password_reset' AND COALESCE(issuer_is_staff, false) = false THEN
    RAISE EXCEPTION 'only office staff may issue a password_reset link'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.organization_id IS NOT NULL
     AND COALESCE(issuer_is_staff, false) = false
     AND NOT EXISTS (
       SELECT 1 FROM organization_membership m
        WHERE m.user_id = NEW.issued_by_user_id
          AND m.organization_id = NEW.organization_id
          AND m.active
          AND m.role IN ('owner', 'admin')
     ) THEN
    RAISE EXCEPTION
      'issuer % may not invite into organization %', NEW.issued_by_user_id, NEW.organization_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER user_setup_token_issuer_guard
  BEFORE INSERT ON user_setup_token
  FOR EACH ROW EXECUTE FUNCTION beta_setup_token_issuer_guard();

COMMIT;

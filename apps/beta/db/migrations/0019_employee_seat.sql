-- Migration 0019: the employee seat's binding — `user_setup_token.payroll_employee_id`.
--
-- Scope (spec `.context/beta-afframe/40-beta-structure.md` §2.6.1 "Employee seat
-- (self-service — resolved design)"): *"Lifecycle: invite from employee row →
-- token pre-bound (`user_setup_token.payroll_employee_id`) → consume creates
-- user + guest membership + link in one transaction."*
--
-- ONE COLUMN, AND NO NEW ROLE. The seat is `guest` membership + a non-null
-- `payroll_employee.app_user_id`, exactly as §2.6.1 resolves it. `beta_org_role`
-- is NOT widened, deliberately, and the reason is a security property rather
-- than a preference for small diffs:
--
--   A ROLE IS A GRANT; THIS LINK IS AN IDENTITY. Role is writable by anyone the
--   invite matrix admits — a company `admin` may set a membership's role
--   (`changeMemberRole`, migration 0000's issuer guard admits them). If "is an
--   employee seat" were a ROLE, then the act of changing a role would be the act
--   of deciding WHOSE payslips an account reads, and the two would share one
--   authorization check. They must not: whose payroll row an account is is
--   settled once, by consuming a link the office pre-bound to a specific
--   `payroll_employee`, and no role-write path in this application can touch
--   `payroll_employee.app_user_id` at all (`lib/data/payroll.ts` —
--   `updatePayrollEmployee` has no arm for it; the agent ingestion API cannot
--   state it either).
--
--   FAIL-CLOSED DIRECTION. A fifth enum value would make every existing role
--   test (`role = 'guest'`, `role <> 'owner'`, `ROLE_RANK`, the four-way invite
--   matrix, `beta_prevent_last_owner_removal`, `organization_membership_owner_
--   requires_staff`) silently incomplete on the new value — the classic widening
--   bug, where the new case falls into whichever `else` was written first. The
--   link instead NARROWS an existing, already-tested role: an unlinked guest
--   sees nothing payroll today and still sees nothing after this migration; a
--   linked one sees exactly one employee's rows. Nothing widens.
--
-- WHAT THIS FILE ADDS
--
--   1. `user_setup_token.payroll_employee_id`, with a COMPOSITE, tenancy-carrying
--      foreign key and a shape CHECK that pins the seat invite to exactly one
--      form: purpose `org_invite`, an organization, `granted_role = 'guest'`.
--   2. `payroll_employee_id` folded into the immutability trigger of migration
--      0001 (SF-2), so a pre-bound link cannot be re-pointed at a different
--      person after issuance.
--
-- NO `BEGIN;` / `COMMIT;` in this file — see the header of 0000_init.sql.

-- 1. The binding column ---------------------------------------------------------
--
-- WHY THE FOREIGN KEY IS COMPOSITE. `payroll_employee` is org-scoped and there
-- is no RLS behind this seam (plan Part 4), so a single-column FK to
-- `payroll_employee (id)` would happily accept an employee id from ANOTHER book
-- — a company admin issuing an invite into their own organization could bind it
-- to a stranger's payroll row, and the consume would then link an account they
-- control to a person in a book they cannot see. The composite FK against
-- `payroll_employee_id_organization_unique` (migration 0016) makes the pair the
-- key, so the employee row must belong to the very organization the token
-- grants membership in. It is the same reasoning `payroll_employee_line` and
-- `document.payslip_employee_id` already use, applied to the one table where the
-- FK crosses from the auth side into the payroll side.
--
-- MATCH SIMPLE IS WHY THE CHECK BELOW IS NOT OPTIONAL. A composite FK in
-- PostgreSQL is satisfied whenever ANY of its columns is NULL, and
-- `user_setup_token.organization_id` IS nullable (an org-less `account_setup`
-- link). Without `user_setup_token_employee_seat_shape`, a row with
-- `payroll_employee_id` set and `organization_id` NULL would pass the FK
-- unchecked — i.e. the FK alone proves nothing. The CHECK is what makes the pair
-- always-present, and therefore always-verified.
--
-- ON DELETE CASCADE, not SET NULL. SET NULL on a composite FK nulls EVERY
-- referencing column, which would clear `organization_id` too and leave a token
-- that violates the shape CHECK. Deleting an employee row is not a path any code
-- in this application takes (the register is soft-managed through `active` /
-- `ended_on`); the only real reaper is `organization` cascade, which deletes the
-- token rows anyway through their own organization FK. So this arm is a floor:
-- if a person is ever erased, the outstanding invitation that names them dies
-- with them rather than becoming an unbound grant.
ALTER TABLE user_setup_token
  ADD COLUMN payroll_employee_id uuid;

ALTER TABLE user_setup_token
  ADD CONSTRAINT user_setup_token_payroll_employee_fk
    FOREIGN KEY (payroll_employee_id, organization_id)
    REFERENCES payroll_employee (id, organization_id)
    ON DELETE CASCADE;

-- The seat invite has exactly one legal shape, and the database is where that is
-- true rather than only in `lib/auth/setup-token.ts`:
--
--   purpose = 'org_invite'  — an employee seat is a membership grant into an
--                             existing book. `account_setup` (org-less) and
--                             `password_reset` (never org-scoped) cannot carry a
--                             binding, so a pre-bound link can never be the shape
--                             that creates an unattached portal identity.
--   organization_id present — required by the FK above to mean anything at all.
--   granted_role = 'guest'  — §2.6.1's seat IS a guest membership. Pinning it
--                             here means a pre-bound link can never also hand out
--                             `member` (which would see every colleague's
--                             payroll) or `admin`. The interesting direction is
--                             the one this forbids: not "an employee escalating",
--                             but "an escalated seat that is ALSO narrowed",
--                             whose visibility would then depend on which of two
--                             rules a future read consulted first.
ALTER TABLE user_setup_token
  ADD CONSTRAINT user_setup_token_employee_seat_shape
    CHECK (
      payroll_employee_id IS NULL
      OR (
        purpose = 'org_invite'
        AND organization_id IS NOT NULL
        AND granted_role = 'guest'
      )
    );

-- The consume path claims the token and then links the employee row in the same
-- transaction, so it reads this column back on a row it has already locked. No
-- index: the only lookup is by `token_hash` (unique) and by `payroll_employee_id`
-- when the issuer revokes an earlier outstanding invite for the same person,
-- which touches a handful of rows per book.

-- 2. The binding is part of the immutable grant (SF-2, migration 0001) ---------
--
-- `beta_setup_token_immutable_grant` freezes every field that decides WHAT a link
-- grants. `payroll_employee_id` is now one of them — arguably the sharpest one,
-- since it decides whose salary the resulting account reads — so it joins the
-- frozen list. Without this the trigger's own premise ("a single stray UPDATE
-- turns a used guest invite into a fresh owner grant") reappears in a new form: a
-- stray UPDATE would re-point an already-issued, already-emailed link at a
-- different colleague, and every issuance check in 0000/0001 is BEFORE INSERT
-- only.
--
-- The body is otherwise byte-identical to 0001's. It is restated in full rather
-- than patched because `CREATE OR REPLACE FUNCTION` has no partial form, and
-- because a reader auditing what the trigger enforces should find the whole
-- answer in the newest file that touches it.
CREATE OR REPLACE FUNCTION beta_setup_token_immutable_grant()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- What the link grants, and who issued it: frozen for the row's lifetime.
  IF NEW.id                IS DISTINCT FROM OLD.id
     OR NEW.purpose             IS DISTINCT FROM OLD.purpose
     OR NEW.token_hash          IS DISTINCT FROM OLD.token_hash
     OR NEW.email               IS DISTINCT FROM OLD.email
     OR NEW.organization_id     IS DISTINCT FROM OLD.organization_id
     OR NEW.granted_role        IS DISTINCT FROM OLD.granted_role
     OR NEW.payroll_employee_id IS DISTINCT FROM OLD.payroll_employee_id
     OR NEW.expires_at          IS DISTINCT FROM OLD.expires_at
     OR NEW.issued_by_user_id   IS DISTINCT FROM OLD.issued_by_user_id
     OR NEW.issued_ip           IS DISTINCT FROM OLD.issued_ip
     OR NEW.issued_user_agent   IS DISTINCT FROM OLD.issued_user_agent
     OR NEW.created_at          IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION
      'user_setup_token % is an immutable grant: issuance fields cannot be updated', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Replay guard. Every consume/revoke column is WRITE-ONCE: NULL -> value is
  -- the one legal transition, so a spent link can neither be un-spent
  -- (value -> NULL) nor re-stamped for a second consumer (value -> other
  -- value). Write-once rather than a whole-row freeze because the consume is
  -- legitimately two writes inside one transaction: the atomic claim stamps
  -- `consumed_at` + IP + UA, and `consumed_user_id` is filled in once the
  -- account it created exists.
  IF OLD.consumed_at IS NOT NULL
     AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at THEN
    RAISE EXCEPTION
      'user_setup_token % is already consumed: consumed_at is write-once', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.consumed_ip IS NOT NULL
     AND NEW.consumed_ip IS DISTINCT FROM OLD.consumed_ip THEN
    RAISE EXCEPTION
      'user_setup_token % is already consumed: consumed_ip is write-once', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.consumed_user_agent IS NOT NULL
     AND NEW.consumed_user_agent IS DISTINCT FROM OLD.consumed_user_agent THEN
    RAISE EXCEPTION
      'user_setup_token % is already consumed: consumed_user_agent is write-once', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.consumed_user_id IS NOT NULL
     AND NEW.consumed_user_id IS DISTINCT FROM OLD.consumed_user_id THEN
    RAISE EXCEPTION
      'user_setup_token % is already consumed: consumed_user_id is write-once', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.revoked_at IS NOT NULL
     AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION
      'user_setup_token % is already revoked: revoked_at is write-once', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

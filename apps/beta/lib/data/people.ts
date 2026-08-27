import "server-only"

import { and, asc, eq } from "drizzle-orm"
import { notFound } from "next/navigation"

import { betaDb } from "@/db/client"
import {
  app_user,
  organization_membership,
  payroll_employee,
  type BetaOrgRole,
} from "@/db/schema"
import {
  invitableRoles,
  managesPeople,
  mayChangeRole,
  mayDeactivate,
  type InviteIssuer,
} from "@/lib/auth/invite-policy"

import {
  writeMembership,
  type MembershipWriteResult,
} from "./membership-writes"
import { orgMemberSummary, type OrgMemberSummary } from "./projections"
import type { OrgScope } from "./scope"

/**
 * Nastavení › Lidé — people management from INSIDE an organization (spec §2.10,
 * §5). The organization-door twin of `lib/data/office/memberships.ts`.
 *
 * WHY A SECOND MODULE AND NOT A PARAMETER ON THE FIRST. The two doors differ in
 * the only way that matters: /admin is `OfficeScope`-gated and cross-org, so its
 * queries carry no tenant filter at all and its issuer is always `{kind:
 * "office"}`. This one is `OrgScope`-gated, so every statement filters on
 * `scope.organizationId` and the issuer is a company role whose ceiling is the
 * whole point. Folding them into one function would mean a runtime branch
 * deciding whether to apply a tenant filter, which is precisely the shape of
 * bug the branded scope exists to make unrepresentable.
 *
 * WHAT IS SHARED IS THE PART THAT MUST NOT DRIFT: the invite matrix
 * (`lib/auth/invite-policy.ts` — who may invite, change and deactivate whom) and
 * the refusal translation (`./membership-writes.ts`). Underneath both, the
 * database is the floor and answers to neither:
 *
 *   - `beta_setup_token_issuer_guard` (0001) refuses an org-scoped link from
 *     anyone without an active owner|admin membership in that very organization,
 *     and refuses an owner grant from a non-staff issuer;
 *   - `organization_membership_owner_requires_staff` (0000/0002) refuses an
 *     owner membership for a non-staff account whatever the link said;
 *   - `beta_prevent_last_owner_removal` (0002) refuses the demotion OR the
 *     deactivation that would leave a book with no active owner.
 *
 * THE CAPABILITIES ARE COMPUTED SERVER-SIDE AND SHIPPED AS BOOLEANS. `PeopleRow`
 * carries `assignableRoles` / `deactivatable` rather than a role the page
 * re-runs the matrix on. A client component that decided for itself which
 * options to render would be a second implementation of the ceiling, reachable
 * by anyone with devtools — and the difference between the two would be
 * invisible until a company admin found `owner` in a select. The page renders
 * what it is told; the actions re-derive it from scratch anyway.
 */

/** The issuer shape the matrix wants, built from a resolved scope and nothing else. */
function issuerFor(scope: OrgScope): InviteIssuer {
  return { kind: "organization", role: scope.role }
}

type PeopleRow = OrgMemberSummary & {
  /** The viewer's own seat. Rendered as "vy" and never self-deactivatable. */
  self: boolean
  /**
   * This is the organization's ONLY active owner (spec §2.10: "last-owner
   * protection surfaced"). The database refuses the write either way; this is
   * what lets the page say WHY before the click instead of after it.
   */
  lastOwner: boolean
  /** Roles the viewer may move this row to. Empty ⇒ render no role control. */
  assignableRoles: readonly BetaOrgRole[]
  /** Whether the viewer may flip this row's `active`. */
  deactivatable: boolean
  /**
   * This membership is an EMPLOYEE SEAT — a `guest` linked to a
   * `payroll_employee` row of this book (spec §2.6.1, PR 33). Drives the
   * "Zaměstnanec" label, which §2.6.1 asks for so a company admin can tell a
   * seat apart from an ordinary Host before deactivating one of them.
   *
   * A BOOLEAN, NOT THE EMPLOYEE ROW. Which person it is would be a second,
   * staler copy of a fact Mzdy › Zaměstnanci already renders (and
   * `payroll_employee_id` / `app_user_id` are both on
   * `CLIENT_FORBIDDEN_COLUMNS`). The name is not needed to make the decision
   * this page exists for.
   *
   * NOT A LEAK TO THE VIEWER. `peopleForScope` is owner/admin-only, and both
   * already see the whole employee register including its `hasPortalAccount`
   * column — this states the same fact from the membership side.
   */
  employeeSeat: boolean
}

export type PeopleView = {
  members: PeopleRow[]
  /** Roles the viewer may put on a new invite. Empty ⇒ render no invite form. */
  invitableRoles: readonly BetaOrgRole[]
}

/**
 * The Lidé page's whole dataset.
 *
 * 404 FOR A VIEWER WHO DOES NOT MANAGE PEOPLE, not an empty page. `member` and
 * `guest` have no business on this surface (§5), and the seam's doctrine is that
 * a surface someone may not use does not exist for them — a rendered-but-empty
 * Lidé tab tells a site foreman that people management is a thing here and that
 * somebody else has it.
 *
 * IT LISTS INACTIVE MEMBERSHIPS TOO, unlike `activeMembershipsForViewer`. A
 * deactivated seat is the main thing an admin comes here to see: it is the
 * evidence that an offboarding happened, and the row you reactivate from.
 */
export async function peopleForScope(scope: OrgScope): Promise<PeopleView> {
  const issuer = issuerFor(scope)
  if (!managesPeople(issuer)) notFound()

  const rows = await betaDb()
    .select({
      user_id: organization_membership.user_id,
      name: app_user.name,
      email: app_user.email,
      role: organization_membership.role,
      active: organization_membership.active,
      payroll_employee_id: payroll_employee.id,
    })
    .from(organization_membership)
    .innerJoin(app_user, eq(app_user.id, organization_membership.user_id))
    /**
     * The employee-seat link (spec §2.6.1, PR 33) — the SAME join
     * `resolveScopeOutcome` runs, with the membership's user in place of the
     * session's. Both halves carry tenancy, and
     * `payroll_employee_app_user_idx` (unique on `(organization_id,
     * app_user_id)`) means it cannot multiply a membership row.
     *
     * `scope.organizationId` rather than `organization_membership.
     * organization_id`: identical here (the WHERE pins it), and stating the
     * literal tenant makes the join correct on its own if the filter below is
     * ever refactored.
     */
    .leftJoin(
      payroll_employee,
      and(
        eq(payroll_employee.app_user_id, organization_membership.user_id),
        eq(payroll_employee.organization_id, scope.organizationId),
      ),
    )
    // The tenant filter. Every statement in this module has one; there is no
    // arm that reads a membership by id alone.
    .where(eq(organization_membership.organization_id, scope.organizationId))
    .orderBy(asc(app_user.email))

  // Counted from the rows already fetched rather than with a second query: the
  // list is the complete membership set for this organization, so "how many
  // active owners" is a property of it. A COUNT(*) would be a second read of the
  // same rows that could disagree with the list being rendered.
  const activeOwners = rows.filter(
    (row) => row.role === "owner" && row.active,
  ).length

  const members = rows.map((row) => {
    const self = row.user_id === scope.userId
    const lastOwner = row.role === "owner" && row.active && activeOwners === 1

    return {
      ...orgMemberSummary(row),
      self,
      lastOwner,
      // The seat is the CONJUNCTION, exactly as `isEmployeeSeat` defines it for
      // the viewer's own scope: a linked `member` or `admin` is a manager who
      // draws a salary, not an employee seat, and must not read "Zaměstnanec".
      employeeSeat: row.role === "guest" && row.payroll_employee_id !== null,
      assignableRoles: invitableRoles(issuer).filter((next) =>
        mayChangeRole(issuer, {
          issuerUserId: scope.userId,
          targetUserId: row.user_id,
          currentRole: row.role,
          nextRole: next,
        }),
      ),
      // The database refusal is mirrored, not replaced: `lastOwner` suppresses
      // the control, and `beta_prevent_last_owner_removal` still refuses the
      // request if two admins race the last two owner seats.
      deactivatable:
        !lastOwner &&
        mayDeactivate(issuer, {
          issuerUserId: scope.userId,
          targetUserId: row.user_id,
          targetRole: row.role,
        }),
    }
  })

  return { members, invitableRoles: invitableRoles(issuer) }
}

/**
 * Change one member's role from inside the organization.
 *
 * THE CEILING IS CHECKED AGAINST THE ROLE AS STORED, re-read here in the same
 * request as the write. The page told the browser which options to render, and
 * the browser may say anything at all — including a `role` for a row whose
 * current role has changed since the page was drawn. `mayChangeRole` applies the
 * ceiling to BOTH ends (see its own header), so an admin can neither reach up to
 * an owner nor demote one.
 */
export async function changeMemberRole(
  scope: OrgScope,
  input: { targetUserId: string; nextRole: BetaOrgRole },
): Promise<MembershipWriteResult> {
  const issuer = issuerFor(scope)
  if (!managesPeople(issuer)) return { ok: false, reason: "role_not_allowed" }

  const db = betaDb()
  const [current] = await db
    .select({ role: organization_membership.role })
    .from(organization_membership)
    .where(
      and(
        eq(organization_membership.organization_id, scope.organizationId),
        eq(organization_membership.user_id, input.targetUserId),
      ),
    )
    .limit(1)

  if (!current) return { ok: false, reason: "not_found" }
  if (current.role === input.nextRole) return { ok: true }

  if (
    !mayChangeRole(issuer, {
      issuerUserId: scope.userId,
      targetUserId: input.targetUserId,
      currentRole: current.role,
      nextRole: input.nextRole,
    })
  ) {
    return { ok: false, reason: "role_not_allowed" }
  }

  return writeMembership(() =>
    db
      .update(organization_membership)
      .set({ role: input.nextRole })
      .where(
        and(
          eq(organization_membership.organization_id, scope.organizationId),
          eq(organization_membership.user_id, input.targetUserId),
        ),
      ),
  )
}

/**
 * Deactivate or reactivate one seat from inside the organization.
 *
 * REACTIVATION KEEPS THE STORED ROLE — this write never touches `role`, and the
 * link-consume path that used to is now floored by `resolveReactivationRole`
 * (`lib/auth/setup-token.ts`). So there is exactly one way a role changes in
 * this application from the organization door, and it is `changeMemberRole`
 * above, with the ceiling on it.
 *
 * Deactivating also revokes that person's outstanding invitations into THIS
 * organization, in the trigger
 * `organization_membership_deactivation_revokes_setup_tokens` (migration 0002) —
 * not here, because /admin deactivates too and a revocation one door could
 * forget is a revocation that will eventually be forgotten.
 */
export async function setMemberActive(
  scope: OrgScope,
  input: { targetUserId: string; active: boolean },
): Promise<MembershipWriteResult> {
  const issuer = issuerFor(scope)
  if (!managesPeople(issuer)) return { ok: false, reason: "role_not_allowed" }

  const db = betaDb()
  const [current] = await db
    .select({
      active: organization_membership.active,
      role: organization_membership.role,
    })
    .from(organization_membership)
    .where(
      and(
        eq(organization_membership.organization_id, scope.organizationId),
        eq(organization_membership.user_id, input.targetUserId),
      ),
    )
    .limit(1)

  if (!current) return { ok: false, reason: "not_found" }
  if (current.active === input.active) return { ok: true }

  if (
    !mayDeactivate(issuer, {
      issuerUserId: scope.userId,
      targetUserId: input.targetUserId,
      targetRole: current.role,
    })
  ) {
    return { ok: false, reason: "role_not_allowed" }
  }

  return writeMembership(() =>
    db
      .update(organization_membership)
      .set({ active: input.active })
      .where(
        and(
          eq(organization_membership.organization_id, scope.organizationId),
          eq(organization_membership.user_id, input.targetUserId),
        ),
      ),
  )
}

import type { BetaOrgRole, BetaSetupTokenPurpose } from "@/db/schema"

/**
 * WHO MAY HAND OUT WHICH LINK — the server-side half of the invite matrix.
 *
 * The rule this module encodes is one sentence from the structure spec (§2.10,
 * §5): *owner invites any role; admin invites admin | member | guest and NEVER
 * owner; member and guest never invite at all.* It is written here as data
 * rather than as an `if` inside a Server Action because it has TWO callers with
 * two different doors:
 *
 *   - /admin (PR 08) — the office, gated by `requireOffice()`;
 *   - Nastavení › Lidé (PR 22) — the organization, gated by `requireScope()`.
 *
 * One of them shipping a subtly different matrix is exactly how a company admin
 * ends up able to mint an owner. So the matrix lives once, both doors read it,
 * and the database floors it independently: `beta_setup_token_issuer_guard`
 * (0000/0001) refuses an owner grant or a password reset from a non-staff
 * issuer and refuses any org-scoped issuance from someone without an active
 * owner|admin membership in that very organization, and
 * `beta_membership_owner_requires_staff` refuses an owner membership for a
 * non-staff account whatever the link said.
 *
 * THIS MODULE IS PURE. No database, no `server-only`, no request. It takes the
 * facts a resolved scope already carries and answers yes or no, so it can be
 * asserted directly and cannot drift into doing I/O.
 *
 * WHY `owner` CAN INVITE AN OWNER AND IT IS NOT AN ESCALATION. An `owner`
 * membership is only ever held by office staff — the DB trigger makes that
 * unconditional — so "an org owner grants owner" is one office account handing
 * the book to another, and the grant still dies at the trigger unless the
 * TARGET is staff too. A company `admin` is never staff, which is why the same
 * sentence reads as a hard refusal for them.
 */

/**
 * The issuer as the calling door already knows them. `office` is a resolved
 * `OfficeScope` (is_staff proven); `organization` is a resolved `OrgScope`
 * (membership proven, role resolved). No third shape: an issuer that arrived
 * some other way has not been authenticated.
 */
export type InviteIssuer =
  | { readonly kind: "office" }
  | { readonly kind: "organization"; readonly role: BetaOrgRole }

/** Office staff may grant anything, including owner. */
export const OFFICE_INVITABLE_ROLES: readonly BetaOrgRole[] = Object.freeze([
  "owner",
  "admin",
  "member",
  "guest",
])

/**
 * A company admin's ceiling. `owner` is absent and must stay absent: it is the
 * accountant seat, the internal layer and every accounting write (§5).
 */
export const ADMIN_INVITABLE_ROLES: readonly BetaOrgRole[] = Object.freeze([
  "admin",
  "member",
  "guest",
])

const NO_ROLES: readonly BetaOrgRole[] = Object.freeze([])

/** Which roles this issuer may put on an invite. Empty means "cannot invite". */
export function invitableRoles(issuer: InviteIssuer): readonly BetaOrgRole[] {
  if (issuer.kind === "office") return OFFICE_INVITABLE_ROLES
  // An org owner IS office staff (DB trigger), so "owner invites any role" is
  // the same permission as the office's, reached through the organization door.
  if (issuer.role === "owner") return OFFICE_INVITABLE_ROLES
  if (issuer.role === "admin") return ADMIN_INVITABLE_ROLES
  return NO_ROLES
}

export function mayGrantRole(issuer: InviteIssuer, role: BetaOrgRole): boolean {
  return invitableRoles(issuer).includes(role)
}

/**
 * Whether this issuer administers people AT ALL — spec §5's visibility rule for
 * Nastavení › Lidé, expressed as the predicate that already decides every
 * individual act rather than as a second list of roles.
 *
 * "Who may see the tab" and "who may do anything on it" are the same question,
 * and answering them from two places is how a tab ends up rendering an invite
 * form whose every submission is refused (or, worse, the reverse). `member` and
 * `guest` invite nothing, so `invitableRoles` is empty for them, so the tab is
 * not theirs — one fact, one derivation.
 */
export function managesPeople(issuer: InviteIssuer): boolean {
  return invitableRoles(issuer).length > 0
}

/**
 * Which link purposes this issuer may mint.
 *
 * `password_reset` and an org-less `account_setup` are office-staff acts and
 * nothing else: a reset drops every session of the target account, and an
 * org-less account_setup creates a portal identity no organization owner can
 * see or revoke (migration 0001, SF-5). The organization door issues invites
 * into its own book, full stop.
 */
export function mayIssuePurpose(
  issuer: InviteIssuer,
  purpose: BetaSetupTokenPurpose,
): boolean {
  if (issuer.kind === "office") return true
  return purpose === "org_invite" && managesPeople(issuer)
}

/**
 * The role-change ceiling.
 *
 * It is the invite ceiling applied TWICE — to the role being taken away as well
 * as to the role being given. Demoting an owner is as consequential as granting
 * one, and a matrix that only checked the destination would let a company admin
 * demote the accountant out of the book they keep.
 *
 * Plus one asymmetry, and only on the organization door: a company admin may
 * not change their OWN role upward. Self-DEMOTION stays legal there because it
 * is half of the documented "transfer rights" primitive (plan Part 4:
 * grant-owner, then self-demote) and the last-owner trigger refuses the
 * demotion that would empty the organization. Self-PROMOTION has no such floor
 * above `owner ⇒ is_staff`, so it is refused outright.
 *
 * Office staff are exempt from that asymmetry, deliberately. /admin IS the
 * break-glass: staff can already grant owner to any staff account, so refusing
 * them their own promotion would buy nothing and would break the one-click
 * "owner ve všech" the spec asks for (§3.5). The floor that still applies to
 * them is the one that matters — `owner ⇒ is_staff`, in the database.
 */
export function mayChangeRole(
  issuer: InviteIssuer,
  input: {
    readonly issuerUserId: string
    readonly targetUserId: string
    readonly currentRole: BetaOrgRole
    readonly nextRole: BetaOrgRole
  },
): boolean {
  const allowed = invitableRoles(issuer)
  if (!allowed.includes(input.currentRole)) return false
  if (!allowed.includes(input.nextRole)) return false
  if (
    issuer.kind === "organization" &&
    input.issuerUserId === input.targetUserId
  ) {
    return isDemotion(input.currentRole, input.nextRole)
  }
  return true
}

/**
 * The DEACTIVATION ceiling.
 *
 * WHY IT IS IN THIS FILE AND NOT AN `if` IN THE WRITE. Deactivating a seat and
 * demoting it are the same act measured by outcome: both take an organization's
 * accountant out of the book they keep. `mayChangeRole` already refuses a
 * company admin who reaches for an owner, and until this function existed
 * `setMembershipActive` had no ceiling at all — so the rule the invite matrix
 * spells out ("admin: admin | member | guest, NEVER owner") held on one verb and
 * not on the other, which is the drift the matrix lives in one module to
 * prevent. The ceiling is therefore the SAME one: an issuer may deactivate only
 * a role they could have granted.
 *
 * THE DATABASE IS NOT A SUBSTITUTE HERE. `beta_prevent_last_owner_removal`
 * refuses the deactivation that would empty an organization of owners
 * (migration 0002 — its UPDATE arm fires on `NEW.active = false`), but an
 * organization with two accountants has a spare, so the trigger permits
 * deactivating either one. That floor answers "does the book still have an
 * owner", never "was this issuer allowed to ask" — the second question has no
 * database expression, and this is it.
 *
 * SELF-DEACTIVATION IS REFUSED ON THE ORGANIZATION DOOR, and permitted on the
 * office one. It is the same asymmetry `mayChangeRole` documents, for a
 * narrower reason: a client-side admin who deactivates their own seat is
 * instantly outside the organization (`requireScope` reads `active`), so the
 * one person who could undo it no longer can — the recovery is a phone call to
 * the accounting office. There is no act it enables that "invite a replacement,
 * then have them do it" does not, so refusing it removes a self-lockout without
 * removing a capability. Office staff keep it: /admin is the break-glass, and
 * an accountant tidying up their own membership in a book they no longer keep
 * is the ordinary case.
 */
export function mayDeactivate(
  issuer: InviteIssuer,
  input: {
    readonly issuerUserId: string
    readonly targetUserId: string
    /** The role the target holds RIGHT NOW — the thing being taken away. */
    readonly targetRole: BetaOrgRole
  },
): boolean {
  if (!invitableRoles(issuer).includes(input.targetRole)) return false
  if (
    issuer.kind === "organization" &&
    input.issuerUserId === input.targetUserId
  ) {
    return false
  }
  return true
}

/**
 * May this issuer hand out an EMPLOYEE SEAT invite (spec §2.6.1, §2.10
 * "employee-seat invites from Mzdy")?
 *
 * IT IS `managesPeople`, NOT A NEW CEILING, and stating that as its own function
 * is the point: a seat invite IS an org invite (`org_invite`, granting `guest`,
 * migration 0019 pins it to exactly that shape), so anyone who may invite a
 * `guest` may invite a seat. Owner and admin qualify; `member` does not, even
 * though a member is a management seat that reads all payroll — reading the
 * register and handing out access to it are different acts, and only the second
 * one is people management.
 *
 * WHY THE EXTRA POWER IS NOT AN ESCALATION. A company `admin` can bind an
 * address they control to any employee row in their own book, and thereby read
 * that employee's payslips. That is not a privilege gain: an admin is a
 * management seat and ALREADY sees every payslip in the book (spec §5,
 * `payrollScope` → `all`). The act is visible in `user_setup_token`'s issuance
 * forensics, and the DB floors it independently — `beta_setup_token_issuer_guard`
 * refuses any org-scoped issuance from someone without an active owner|admin
 * membership in that very organization, and migration 0019's composite FK
 * refuses an employee row from a different book.
 *
 * WHAT IT WOULD BE IF THE SEAT WERE A ROLE. Then this same act would be
 * reachable through `changeMemberRole` — an admin could re-point an EXISTING
 * account (a colleague's, not one they control) at a chosen payroll row without
 * anyone consuming a link. The link is the only writer of
 * `payroll_employee.app_user_id` precisely so that binding an account to a person
 * always costs a fresh, forensically-stamped, one-time credential delivered to a
 * named address.
 */
export function mayInviteEmployeeSeat(issuer: InviteIssuer): boolean {
  return managesPeople(issuer)
}

/**
 * REACTIVATION never raises a role, so it needs no separate ceiling beyond
 * `mayDeactivate`'s: the row keeps whatever role it was deactivated with, and
 * `resolveReactivationRole` (`setup-token.ts`) is what stops a link from
 * lowering it. The symmetric question — may this issuer switch the seat back on
 * — is the same ceiling as switching it off, so both verbs call the function
 * above.
 */

/** owner > admin > member > guest, for the self-demotion test only. */
const ROLE_RANK: Record<BetaOrgRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
  guest: 0,
}

function isDemotion(current: BetaOrgRole, next: BetaOrgRole): boolean {
  return ROLE_RANK[next] < ROLE_RANK[current]
}

/**
 * The role a REACTIVATED membership ends up holding, given the role it was
 * deactivated with and the role a consumed link grants.
 *
 * THE BUG THIS EXISTS TO CLOSE. `grantMembership` used to write the link's role
 * straight onto a reactivated row. A company admin may issue `guest` invites,
 * and a deactivated OWNER's row is still an owner row — so re-inviting a
 * deactivated accountant at `guest` silently demoted them on the way back in,
 * handing a lower privilege level a demotion primitive it is refused everywhere
 * else (`mayChangeRole` exists precisely to refuse it). The membership was
 * inactive, so `beta_prevent_last_owner_removal` had nothing to catch either:
 * the row was never an *active* owner during the write.
 *
 * THE RULE IS `max(stored, granted)`, not "refuse". A refusal would break the
 * ordinary case the reactivation path is FOR — an office re-inviting somebody
 * who left at a lower seat than they held before is a legitimate, common act,
 * and answering it with an error the invitee sees (the link they were sent is
 * "invalid") is a worse failure than the one being fixed. Taking the maximum
 * keeps the invariant that matters — a link can never LOWER a role — while
 * still letting a link raise one, which is exactly what an invite is for and
 * what the issuance-side ceiling has already authorized.
 */
export function resolveReactivationRole(
  storedRole: BetaOrgRole,
  grantedRole: BetaOrgRole,
): BetaOrgRole {
  return ROLE_RANK[grantedRole] > ROLE_RANK[storedRole]
    ? grantedRole
    : storedRole
}
